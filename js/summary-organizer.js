// MANUTENÇÃO: "Organizar resumos" — deixa os resumos da biblioteca no padrão ROUDY
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

  // Mesmo critério do servidor (summary_off_standard): sem nenhuma frase-guia, nome de seção no
  // lugar da frase ou linha com acordes demais. Só manda ao servidor quem pode melhorar.
  function offStandard(song) {
    const lines = summaryLines(song);
    if (!lines.length) return hasSheet(song);
    const sectionAsHook = lines.some((line) => global.songFormat.isSectionName(String(line.lyrics || "").trim()));
    const tooLong = lines.some((line) => chordsOf(line).length > MAX_CHORDS_PER_LINE);
    const noHook = !lines.some((line) => hook(line));
    return (sectionAsHook || tooLong || noHook) && (hasSheet(song) || tooLong);
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
    return { checked: candidates.length, changes };
  }

  global.summaryOrganizer = Object.freeze({ offStandard, payload, apply, analyze, preview, currentPreview });
})(window);
