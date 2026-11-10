// Botão "voltar" do Android (e gesto de voltar): faz o mesmo que a seta ← do app.
// O ROUDY troca de tela sem mudar de página, então o Android achava que não havia para onde voltar
// e fechava o app. Mantemos algumas entradas "guarda" no histórico: cada voltar consome uma e fecha
// a camada de cima (menu, painel, Modo Palco, música, playlist, evento, aba). Só na Home o voltar
// sai do app.
//
// O Chrome do Android PULA entradas de histórico criadas sem toque do usuário. Por isso as guardas
// só são criadas dentro de um toque/tecla (uma por toque, até MAX), nunca no carregamento nem
// dentro do próprio voltar.
(function androidBack(global) {
  "use strict";
  const history = global.history;
  if (!history || typeof history.pushState !== "function") return;

  const MAX = 4;
  const byId = (id) => document.getElementById(id);
  const shown = (element) => Boolean(element) && element.style.display !== "none" && getComputedStyle(element).display !== "none";
  const level = () => (history.state && history.state.roudyBackGuard) ? Number(history.state.level) || 0 : 0;

  // Modo Palco aberto direto (do evento ou da playlist, sem a música aberta antes): voltar sai do
  // Palco e da música juntos, de volta para onde estava.
  let detailOpenedAt = 0;
  let stageOpenedDirectly = false;
  const wrap = (name, before) => {
    const original = global[name];
    if (typeof original !== "function") return;
    global[name] = function wrapped(...args) { before(); return original.apply(this, args); };
  };
  wrap("openDetail", () => { detailOpenedAt = Date.now(); });
  wrap("enterStageMode", () => { stageOpenedDirectly = Date.now() - detailOpenedAt < 1500; });

  function closeTopLayer() {
    if (byId("song-options-sheet")?.classList.contains("is-open")) { global.closeSongOptions?.(); return true; }
    if (byId("home-playlist-action-layer")?.classList.contains("is-open")) { global.homePlaylists?.closeActionSheet(); return true; }
    const picker = byId("song-quick-picker");
    if (picker && !picker.hidden) { global.closeSongQuickPicker?.(); return true; }
    const stagePanel = byId("stage-quick-panel");
    if (stagePanel && !stagePanel.hidden) { stagePanel.hidden = true; return true; }
    if (shown(byId("modal-overlay"))) { global.closeModal?.(); return true; }
    if (shown(byId("view-detail"))) {
      const inStage = typeof stageMode !== "undefined" && stageMode;
      if (inStage && !stageOpenedDirectly) global.exitStageMode?.(); // Palco -> a música que estava aberta
      else global.closeStudyView?.(); // música (ou Palco aberto direto) -> playlist / evento
      stageOpenedDirectly = false;
      return true;
    }
    if (shown(byId("view-sd"))) { global.closeSD?.(); return true; }
    const tab = byId("view-main")?.dataset.activeTab || "musicas";
    if (tab === "musicas" && global.homePlaylists && global.homePlaylists.view !== "home") { global.homePlaylists.back(); return true; }
    if (tab !== "musicas") { global.switchTab?.("musicas"); return true; }
    return false; // já está na Home: deixa o Android sair do app
  }

  // Dentro de um toque: cria mais uma guarda (até MAX), para o voltar ter onde parar.
  function topUp() {
    const current = level();
    if (current >= MAX) return;
    history.pushState({ roudyBackGuard: true, level: current + 1 }, "", global.location.href);
  }

  global.addEventListener("popstate", () => {
    let handled = false;
    try { handled = closeTopLayer(); } catch (error) { console.warn("[ROUDY] voltar", error); handled = true; }
    // Na Home sem nada para fechar: segue voltando (passa pelas guardas que sobraram) até sair do app.
    if (!handled) history.go(-(level() + 1));
  });

  for (const type of ["pointerdown", "keydown"]) global.addEventListener(type, topUp, { capture: true, passive: true });
})(window);
