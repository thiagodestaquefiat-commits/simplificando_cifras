// MANUTENÇÃO: Compartilhar uma música por link (estilo Spotify).
// Quem envia gera uma cópia fixa (tom e capo do momento) guardada em /api/shared-playlists
// como uma "playlist" de 1 item — a mesma tabela das playlists compartilhadas, sem mudança no banco.
// Quem recebe abre ?musica=<id>, vê a música mesmo sem conta e salva uma cópia só dele.
// Depois de salva, a música é da pessoa: quem enviou não tem mais vínculo com ela.
(function (global) {
  "use strict";

  const PARAM = "musica";
  let received = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const toast = (message) => global.showToast && global.showToast(message);
  const endpoint = (path = "") => global.apiConfig.API_BASE_URL + "/api/shared-playlists" + path;

  // Cópia independente da música, com o tom e o capo atuais de quem envia.
  function snapshot(song, playback) {
    const state = playback || song.playbackSettings || {};
    const copy = JSON.parse(JSON.stringify(global.eventSongCopy ? global.eventSongCopy(song, state) : song));
    delete copy.librarySync;
    delete copy.playbackSettings;
    delete copy.id;
    return copy;
  }

  function shareText(song) {
    return [song.title, song.artist, song.key ? "Tom: " + song.key : ""].filter(Boolean).join(" · ");
  }

  async function shareTextOnly(song) {
    const text = shareText(song);
    if (global.navigator.share) {
      try { await global.navigator.share({ title: song.title, text }); return; } catch (error) { if (error && error.name === "AbortError") return; }
    }
    try { await global.navigator.clipboard.writeText(text); toast("Música copiada para compartilhar."); }
    catch (_error) { (global.appPrompt || global.prompt)("Copie e compartilhe:", text); }
  }

  async function share(song, playback) {
    if (!song) return;
    const token = global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken();
    if (!token || global.navigator.onLine === false) {
      toast(token ? "Sem internet: compartilhando só o nome da música." : "Entre com sua conta para enviar a música por link.");
      return shareTextOnly(song);
    }
    const copy = snapshot(song, playback);
    toast("Preparando o link…");
    let url;
    try {
      const response = await global.fetch(endpoint(), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ name: copy.title || "Música", description: "musica", items: [{ song: copy, playback: {}, notes: "" }] })
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body || !body.id) throw new Error(body?.erro?.mensagem || "Não foi possível compartilhar agora.");
      const target = new URL(global.location.href);
      const api = target.searchParams.get("api"); // previews do Netlify usam ?api=producao
      target.search = "";
      if (api === "producao") target.searchParams.set("api", api);
      target.hash = "";
      target.searchParams.set(PARAM, body.id);
      url = target.toString();
    } catch (error) {
      toast("⚠️ " + (error.message || "Não foi possível compartilhar agora."));
      return;
    }
    const text = `🎵 ${copy.title}${copy.artist ? " — " + copy.artist : ""} no ROUDY. Abra e salve na sua biblioteca:`;
    if (global.navigator.share) {
      try { await global.navigator.share({ title: copy.title, text, url }); return; } catch (error) { if (error && error.name === "AbortError") return; }
    }
    try { await global.navigator.clipboard.writeText(text + " " + url); toast("Link da música copiado."); }
    catch (_error) { (global.appPrompt || global.prompt)("Copie e compartilhe:", text + " " + url); }
  }

  function previewText(song) {
    try {
      const model = global.songFormat.fromLegacy(song);
      return model.fullChordSheet?.content || global.songFormat.simpleText(model) || "";
    } catch (_error) {
      return "";
    }
  }

  async function open(sharedId) {
    try {
      const response = await global.fetch(endpoint("/" + encodeURIComponent(sharedId)));
      const body = await response.json().catch(() => null);
      const song = body?.playlist?.items?.[0]?.song;
      if (!response.ok || !song) throw new Error(body?.erro?.mensagem || "Música não encontrada.");
      received = { id: body.id, song };
      const key = song.key || song.currentKey || song.originalKey || "";
      const capo = Number(song.capo) || 0;
      const meta = [song.artist, key ? "Tom " + key : "", capo ? "Capo " + capo : ""].filter(Boolean).join(" · ");
      const text = previewText(song);
      eventAdminSheetState = { type: "field" }; // eslint-disable-line no-undef -- `let` global do index.html
      global.showEventAdminSheet(
        `${global.eventAdminHeader("Música recebida", "songShare.save()")}` +
        `<div class="home-playlist-received song-share-received"><h3>${esc(song.title)}</h3><p>${esc(meta)}</p>` +
        `<p>Toque em <strong>Guardar</strong> para salvar na sua biblioteca. Depois de salva, a música é só sua.</p></div>` +
        (text ? `<pre class="song-share-preview" style="white-space:pre-wrap;font:inherit;font-size:14px;line-height:1.5;max-height:50vh;overflow:auto;margin:0 16px 16px;padding:12px;border-radius:12px;background:rgba(127,127,127,.12)">${esc(text)}</pre>` : ""),
        "Música recebida"
      );
    } catch (error) {
      toast("⚠️ " + (error.message || "Não foi possível abrir a música."));
    }
  }

  function save() {
    const data = received;
    if (!data) return;
    const candidate = global.songModel.create({ ...data.song, id: "shared_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8), librarySync: undefined, playbackSettings: undefined });
    const existing = global.songModel.findDuplicate(musicas, candidate); // eslint-disable-line no-undef
    global.closeEventAdminSheet();
    received = null;
    if (existing) {
      toast("Você já tem esta música na sua biblioteca.");
      global.openDetail && global.openDetail(existing.id);
      return;
    }
    if (!global.commitSongs([...musicas, candidate])) return; // eslint-disable-line no-undef
    global.renderMusicas && global.renderMusicas();
    toast("✅ Música salva na sua biblioteca.");
    global.openDetail && global.openDetail(candidate.id);
  }

  // Link recebido: abre para qualquer pessoa, com ou sem conta.
  function checkLink() {
    try {
      const url = new URL(global.location.href);
      const sharedId = url.searchParams.get(PARAM);
      if (!sharedId) return;
      url.searchParams.delete(PARAM);
      global.history.replaceState(global.history.state, "", url.toString());
      if (typeof global.continueWithoutLogin === "function") global.continueWithoutLogin();
      open(sharedId);
    } catch (_error) {}
  }

  global.songShare = Object.freeze({ share, open, save, checkLink, snapshot });
})(window);
