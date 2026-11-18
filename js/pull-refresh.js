// Puxar para atualizar: no topo da tela, puxar para baixo mostra a bolinha girando e atualiza.
// - Home e demais abas: recarrega o ROUDY, já pegando versão nova (sem fechar e abrir o app).
// - Dentro do evento e na aba Eventos: busca no servidor o que o líder e os membros mudaram e
//   redesenha ali mesmo, sem recarregar (você continua no evento).
// Não vale dentro da música, do Modo Palco nem de menus, para não atrapalhar a rolagem.
(function pullToRefresh(global) {
  "use strict";
  const THRESHOLD = 78;  // quanto puxar (px) para soltar e atualizar
  const MAX_PULL = 120;

  const byId = (id) => document.getElementById(id);
  const shown = (element) => Boolean(element) && getComputedStyle(element).display !== "none";

  const style = document.createElement("style");
  style.textContent = `
.roudy-ptr{position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);z-index:400;width:38px;height:38px;margin-left:-19px;border-radius:50%;
  background:#15181d;border:1px solid rgba(255,255,255,.12);box-shadow:0 6px 18px rgba(0,0,0,.45);display:grid;place-items:center;
  opacity:0;transform:translateY(-60px);pointer-events:none;transition:opacity .15s ease}
.roudy-ptr svg{width:22px;height:22px;color:#4c8dff}
.roudy-ptr.is-ready svg{color:#fff}
.roudy-ptr.is-loading svg{animation:roudy-ptr-spin .8s linear infinite;color:#fff}
.roudy-ptr.is-settling{transition:transform .2s ease,opacity .2s ease}
@keyframes roudy-ptr-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.roudy-ptr.is-loading svg{animation-duration:2s}}`;
  document.head.appendChild(style);

  const indicator = document.createElement("div");
  indicator.className = "roudy-ptr";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-live", "polite");
  indicator.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg><span hidden>Atualizar</span>';
  const label = indicator.querySelector("span");
  const ready = () => document.body.appendChild(indicator);
  if (document.body) ready(); else document.addEventListener("DOMContentLoaded", ready, { once: true });

  let startY = 0, startX = 0, pull = 0, tracking = false, loading = false, mode = null, scroller = null;

  // Onde o puxão começou: "event" (dentro do evento), "events" (aba Eventos), "app" (Home e outras
  // abas) ou null (não atualiza).
  function modeFor(target) {
    if (loading) return null;
    if (shown(byId("view-detail")) || shown(byId("modal-overlay"))) return null;
    if (document.querySelector(".is-open[class*='sheet'],.is-open[class*='layer'],.is-open[class*='backdrop']")) return null;
    const active = document.activeElement;
    if (active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))) return null;
    const eventView = byId("view-sd");
    let root, found;
    if (shown(eventView)) {
      if (!eventView.contains(target) || eventView.scrollTop > 0) return null;
      root = eventView; found = "event";
    } else {
      const main = byId("view-main");
      if (!main || !main.contains(target)) return null;
      if ((global.scrollY || document.documentElement.scrollTop || 0) > 0) return null;
      root = main; found = main.dataset.activeTab === "setlists" ? "events" : "app";
    }
    // dentro de uma lista que tem rolagem própria e não está no topo: é rolagem, não atualizar
    for (let node = target; node && node !== root; node = node.parentElement) {
      if (node.scrollTop > 0) return null;
    }
    scroller = root;
    return found;
  }

  function scrolled() {
    return scroller === byId("view-sd") ? scroller.scrollTop > 0 : (global.scrollY || 0) > 0;
  }

  // Evento: busca as mudanças no servidor e redesenha sem sair da tela.
  async function refreshEvents(inEvent) {
    const timeout = new Promise((resolve) => setTimeout(resolve, 15000));
    try {
      if (typeof global.syncEventsNow === "function") await Promise.race([global.syncEventsNow(true), timeout]);
    } catch (error) { console.warn("[ROUDY] atualizar evento", error); }
    try {
      const eventId = typeof currentSdId !== "undefined" ? currentSdId : null;
      if (inEvent && eventId != null && shown(byId("view-sd"))) {
        global.openSD?.(eventId, { preserveScroll: true, refreshChat: false });
        if (typeof eventChat !== "undefined") eventChat?.refresh?.(eventId);
      } else if (!inEvent) {
        global.renderSetlists?.();
      }
    } catch (error) { console.warn("[ROUDY] redesenhar evento", error); }
    loading = false;
    indicator.classList.remove("is-loading");
    label.textContent = "Atualizar";
    render(0, true);
  }

  function render(distance, settling) {
    const progress = Math.min(distance / THRESHOLD, 1);
    indicator.classList.toggle("is-settling", Boolean(settling));
    indicator.classList.toggle("is-ready", distance >= THRESHOLD);
    indicator.style.opacity = distance > 4 ? String(Math.max(progress, 0.35)) : "0";
    indicator.style.transform = `translateY(${Math.min(distance, MAX_PULL) - 46}px)`;
    const svg = indicator.querySelector("svg");
    if (!loading) svg.style.transform = `rotate(${progress * 300}deg)`;
  }

  async function refresh(currentMode) {
    loading = true;
    indicator.classList.add("is-loading");
    indicator.querySelector("svg").style.transform = "";
    label.textContent = "Atualizando";
    render(THRESHOLD, true);
    if (currentMode === "event" || currentMode === "events") return refreshEvents(currentMode === "event");
    try { if (typeof global.flushDetailAutoSave === "function") global.flushDetailAutoSave(); } catch (error) { /* segue */ }
    try {
      const registration = await navigator.serviceWorker?.getRegistration?.();
      await Promise.race([registration?.update?.(), new Promise((resolve) => setTimeout(resolve, 1500))]);
    } catch (error) { /* sem service worker: só recarrega */ }
    global.location.reload();
  }

  document.addEventListener("touchstart", (event) => {
    mode = event.touches.length === 1 ? modeFor(event.target) : null;
    if (!mode) { tracking = false; return; }
    tracking = true;
    pull = 0;
    startY = event.touches[0].clientY;
    startX = event.touches[0].clientX;
  }, { passive: true });

  document.addEventListener("touchmove", (event) => {
    if (!tracking) return;
    const dy = event.touches[0].clientY - startY, dx = event.touches[0].clientX - startX;
    if (pull === 0 && (dy <= 0 || Math.abs(dx) > Math.abs(dy))) { tracking = false; return; } // rolando ou deslizando de lado
    if (scrolled()) { tracking = false; render(0, true); return; }
    pull = Math.max(0, dy * 0.55); // resistência, como nos apps
    render(pull, false);
  }, { passive: true });

  function end() {
    if (!tracking) return;
    tracking = false;
    if (pull >= THRESHOLD) refresh(mode);
    else render(0, true);
    pull = 0;
  }
  document.addEventListener("touchend", end, { passive: true });
  document.addEventListener("touchcancel", end, { passive: true });
})(window);
