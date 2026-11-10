// Botão "voltar" do Android (e gesto de voltar): faz o mesmo que a seta ← do app.
// O ROUDY troca de tela sem mudar de página, então o Android achava que não havia para onde voltar
// e fechava o app. Mantemos uma entrada "guarda" no histórico: cada voltar fecha a camada de cima
// (menu, painel, música, Modo Palco, playlist, evento, aba) e arma a guarda de novo. Só na Home
// o voltar sai do app, como antes.
(function androidBack(global) {
  "use strict";
  const history = global.history;
  if (!history || typeof history.pushState !== "function") return;

  const byId = (id) => document.getElementById(id);
  const shown = (element) => Boolean(element) && element.style.display !== "none" && getComputedStyle(element).display !== "none";

  function closeTopLayer() {
    if (byId("song-options-sheet")?.classList.contains("is-open")) { global.closeSongOptions?.(); return true; }
    if (byId("home-playlist-action-layer")?.classList.contains("is-open")) { global.homePlaylists?.closeActionSheet(); return true; }
    const picker = byId("song-quick-picker");
    if (picker && !picker.hidden) { global.closeSongQuickPicker?.(); return true; }
    const stagePanel = byId("stage-quick-panel");
    if (stagePanel && !stagePanel.hidden) { stagePanel.hidden = true; return true; }
    if (shown(byId("modal-overlay"))) { global.closeModal?.(); return true; }
    if (shown(byId("view-detail"))) {
      // Modo Palco volta para a música; da música volta para onde estava (playlist, evento...).
      if (typeof stageMode !== "undefined" && stageMode) global.exitStageMode?.();
      else global.closeStudyView?.();
      return true;
    }
    if (shown(byId("view-sd"))) { global.closeSD?.(); return true; }
    const tab = byId("view-main")?.dataset.activeTab || "musicas";
    if (tab === "musicas" && global.homePlaylists && global.homePlaylists.view !== "home") { global.homePlaylists.back(); return true; }
    if (tab !== "musicas") { global.switchTab?.("musicas"); return true; }
    return false; // já está na Home: deixa o Android sair do app
  }

  function arm() {
    if (!history.state || !history.state.roudyBackGuard) history.pushState({ roudyBackGuard: true }, "", global.location.href);
  }

  global.addEventListener("popstate", () => {
    let handled = false;
    try { handled = closeTopLayer(); } catch (error) { console.warn("[ROUDY] voltar", error); handled = true; }
    if (handled) arm();
    else history.back();
  });

  // Arma depois do primeiro toque/carregamento (alguns navegadores ignoram pushState sem interação).
  if (document.readyState === "complete") arm();
  else global.addEventListener("load", arm, { once: true });
  global.addEventListener("pointerdown", arm, { once: true, capture: true });
})(window);
