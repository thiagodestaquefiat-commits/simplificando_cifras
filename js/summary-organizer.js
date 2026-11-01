// MANUTENÇÃO: TEMPORÁRIO (força-tarefa de out/2026, como o botão "Completar cifra"): remover este
// arquivo, o item "Organizar resumos" do menu da conta e o endpoint /api/resumo-harmonico/organizar
// quando todas as músicas estiverem completas e no padrão.
// "Organizar resumos" — deixa os resumos da biblioteca no padrão ROUDY
// (frase-guia + uma volta dos acordes + repetições), remontando pela Letra + Cifras salva.
// O servidor só calcula (sem IA, sem ScraperAPI, sem limite de busca); quem salva é o app,
// depois que o usuário confere. Nada muda sem confirmação (sem migração automática).
(function (global) {
  "use strict";

  const BATCH = 40;
  const MAX_CHORDS_PER_LINE = 16;

  function chordsOf(line) {
    return (line.chords || []).map((item) => String(item.chord || "").trim()).filter(Boolean);
  }

  function hook(line) {
    const lyrics = String(line.lyrics || "").trim();
    if (!lyrics || global.songFormat.chordLine(lyrics) || global.songFormat.isSectionName(lyrics)) return null;
    return lyrics.slice(0, 80);
  }

  function summaryLines(song) {
    const model = global.songFormat.fromLegacy(song);
    return model.sections.flatMap((section) => section.lines).filter((line) => chordsOf(line).length);
  }

  function hasSheet(song) {
    return Boolean(String(song?.fullChordSheet?.content || "").trim());
  }

  // Laço espalhado em linhas: "C" | "Bm" | "C" | "Bm" em vez de "C Bm (2x)". Mesmo critério do
  // has_repeated_block_loop do servidor (só laços curtos, até 4 acordes, contam aqui).
  function hasBlockLoop(lines) {
    const signature = (line) => chordsOf(line).join(" ") + "|" + (Number.isInteger(line.repeticoes) ? line.repeticoes : 1);
    const signatures = lines.map(signature);
    for (let start = 0; start < lines.length; start += 1) {
      for (let size = 1; size <= 4 && start + size * 2 <= lines.length; size += 1) {
        const unit = lines.slice(start, start + size);
        if (unit.reduce((total, line) => total + chordsOf(line).length, 0) > 4) continue;
        if (size > 1 && unit.some((line) => Number.isInteger(line.repeticoes) && line.repeticoes > 1)) continue;
        if (!hook(unit[0]) && lines.slice(start + size, start + size * 2).some((line) => hook(line))) continue;
        if (signatures.slice(start, start + size).join("\n") === signatures.slice(start + size, start + size * 2).join("\n")) return true;
      }
    }
    return false;
  }

  // Mesmo critério do servidor (summary_off_standard): sem nenhuma frase-guia, nome de seção no
  // lugar da frase, linha com acordes demais ou laço espalhado em linhas. Só manda ao servidor quem pode melhorar.
  function offStandard(song) {
    const lines = summaryLines(song);
    if (!lines.length) return hasSheet(song);
    if (hasBlockLoop(lines)) return true;
    const sectionAsHook = lines.some((line) => global.songFormat.isSectionName(String(line.lyrics || "").trim()));
    const tooLong = lines.some((line) => chordsOf(line).length > MAX_CHORDS_PER_LINE);
    const noHook = !lines.some((line) => hook(line));
    return (sectionAsHook || tooLong || noHook) && (hasSheet(song) || tooLong);
  }

  // Fora do padrão, mas sem Letra + Cifras salva: precisa completar a cifra antes de organizar.
  function needsSheet(song) {
    if (hasSheet(song)) return false;
    const lines = summaryLines(song);
    if (!lines.length) return false;
    const sectionAsHook = lines.some((line) => global.songFormat.isSectionName(String(line.lyrics || "").trim()));
    return sectionAsHook || !lines.some((line) => hook(line));
  }

  function payload(song) {
    return {
      id: String(song.id),
      titulo: String(song.title || "Música").slice(0, 160),
      artista: String(song.artist || "").slice(0, 160),
      tom: String(song.originalKey || song.key || "").slice(0, 20),
      blocos: summaryLines(song).slice(0, 80).map((line) => ({
        acordes: chordsOf(line).slice(0, 64),
        repeticoes: Number.isInteger(line.repeticoes) ? line.repeticoes : null,
        fraseGuia: hook(line)
      })),
      letraCifra: String(song?.fullChordSheet?.content || "").slice(0, 50000)
    };
  }

  function sectionsFrom(blocos) {
    return blocos.map((block) => {
      let position = 0;
      const chords = (block.acordes || []).map((chord) => {
        const item = { chord: String(chord), position };
        position += String(chord).length + 2;
        return item;
      });
      return { type: "custom", label: "", hideLabel: true,
        lines: [{ lyrics: String(block.fraseGuia || "").slice(0, 80), repeticoes: block.repeticoes || null, chords }] };
    });
  }

  // Troca só o resumo: tom, capo, Letra + Cifras, vídeo e o resto da música ficam iguais.
  function apply(song, blocos) {
    const model = global.songFormat.fromLegacy(song);
    const updated = global.songFormat.toLegacy(global.songFormat.normalize({ ...model, sections: sectionsFrom(blocos) }), song);
    updated.updatedAt = new Date().toISOString();
    return updated;
  }

  function preview(blocos, limit) {
    return blocos.slice(0, limit).map((block) => {
      const chords = (block.acordes || []).join(" ") + (block.repeticoes ? ` (${block.repeticoes}x)` : "");
      return block.fraseGuia ? `${block.fraseGuia}\n${chords}` : chords;
    });
  }

  function currentPreview(song, limit) {
    return preview(payload(song).blocos, limit);
  }

  async function request(songs, options) {
    const settings = options || {};
    const token = settings.accessToken || global.appAuth?.getAccessToken?.();
    if (!token) throw new Error("Entre com a sua conta para organizar os resumos.");
    const response = await (settings.fetch || global.fetch)(global.apiConfig.harmonicSummaryEndpoint() + "/organizar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ musicas: songs.map(payload) })
    });
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) throw new Error(data?.erro?.mensagem || "Não foi possível organizar os resumos agora.");
    return Array.isArray(data?.resultados) ? data.resultados : [];
  }

  // Devolve só as músicas que mudariam: [{ song, blocos }]. onProgress(feitas, total).
  async function analyze(songs, options) {
    const settings = options || {};
    const candidates = (songs || []).filter(offStandard);
    const changes = [];
    for (let start = 0; start < candidates.length; start += BATCH) {
      const batch = candidates.slice(start, start + BATCH);
      const results = await request(batch, settings);
      for (const result of results) {
        if (!result?.changed || !Array.isArray(result.blocos) || !result.blocos.length) continue;
        const song = batch.find((item) => String(item.id) === String(result.id));
        if (song) changes.push({ song, blocos: result.blocos });
      }
      settings.onProgress?.(Math.min(start + BATCH, candidates.length), candidates.length);
    }
    return { checked: candidates.length, changes, missingSheet: (songs || []).filter(needsSheet) };
  }

  // ---- Catálogo compartilhado (só equipe de revisão). TEMPORÁRIO como o resto deste arquivo. ----
  async function adminRequest(path, init, options) {
    const settings = options || {};
    const token = settings.accessToken || global.appAuth?.getAccessToken?.();
    if (!token) throw new Error("Entre com a sua conta.");
    const response = await (settings.fetch || global.fetch)(global.apiConfig.sharedSongsEndpoint(path), {
      ...(init || {}), headers: { "Accept": "application/json", "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
    });
    let data = null;
    try { data = await response.json(); } catch (_) { data = null; }
    if (!response.ok) { const error = new Error(data?.erro?.mensagem || "Não foi possível falar com o servidor."); error.status = response.status; throw error; }
    return data || {};
  }

  async function canOrganizeCatalog(options) {
    try { return Boolean((await adminRequest("review-capability", { method: "GET" }, options)).canReview); } catch (_) { return false; }
  }

  // Simulação do catálogo inteiro (não grava nada). onProgress(feitas, total).
  async function catalogPreview(options) {
    const settings = options || {};
    const items = [];
    let offset = 0, total = 0;
    for (let guard = 0; guard < 200; guard++) {
      const page = await adminRequest(`admin/organizar?offset=${offset}`, { method: "GET" }, settings);
      total = page.total || 0;
      items.push(...(page.items || []));
      offset += (page.items || []).length;
      settings.onProgress?.(Math.min(offset, total), total);
      if (!page.hasMore || !(page.items || []).length) break;
    }
    return { total, items };
  }

  // Aplica em lotes de 100; o servidor recalcula cada uma. onProgress(feitas, total).
  async function catalogApply(ids, options) {
    const settings = options || {};
    const applied = [];
    for (let start = 0; start < ids.length; start += 100) {
      const batch = ids.slice(start, start + 100);
      const result = await adminRequest("admin/organizar", { method: "POST", body: JSON.stringify({ ids: batch }) }, settings);
      applied.push(...(result.aplicadas || []));
      settings.onProgress?.(Math.min(start + 100, ids.length), ids.length);
    }
    return applied;
  }

  global.summaryOrganizer = Object.freeze({ canOrganizeCatalog, catalogPreview, catalogApply, offStandard, needsSheet, payload, apply, analyze, preview, currentPreview });
})(window);
