// Diagnóstico da rolagem automática (só liga com ?diag=1 no endereço; fica ligado na aba).
// Mede no aparelho de verdade os quadros que travam durante a rolagem e o motivo:
// código pesado (Long Animation Frames, com arquivo e função) ou desenho na tela (sem código pesado).
// Ao parar a rolagem, mostra um resumo para tirar print. Não envia nada para lugar nenhum.
(function (global) {
  "use strict";
  const KEY = "roudy_scroll_diag";
  let enabled = false;
  try {
    const param = new URLSearchParams(global.location.search).get("diag");
    if (param === "1") global.sessionStorage.setItem(KEY, "1");
    if (param === "0") global.sessionStorage.removeItem(KEY);
    enabled = global.sessionStorage.getItem(KEY) === "1";
  } catch (_) { enabled = false; }

  let running = false, frames = 0, gaps = [], loafs = [], longTasks = 0, last = 0, startedAt = 0, raf = 0, observer = null;

  function tick(now) {
    if (!running) return;
    if (last) { const gap = now - last; frames++; if (gap > 50) gaps.push({ at: Math.round(now - startedAt), ms: Math.round(gap) }); }
    last = now;
    raf = global.requestAnimationFrame(tick);
  }

  function observe() {
    try {
      const types = global.PerformanceObserver?.supportedEntryTypes || [];
      if (types.includes("long-animation-frame")) {
        observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.duration < 50) continue;
            const scripts = (entry.scripts || []).slice().sort((a, b) => b.duration - a.duration).slice(0, 2).map((s) => {
              const file = String(s.sourceURL || "").split("/").pop().split("?")[0] || "página";
              return `${s.sourceFunctionName || s.invoker || "?"} (${file}) ${Math.round(s.duration)}ms`;
            });
            loafs.push({ at: Math.round(entry.startTime - startedAt), ms: Math.round(entry.duration), estilo: Math.round(entry.styleAndLayoutDuration || 0), scripts });
          }
        });
        observer.observe({ type: "long-animation-frame", buffered: false });
      } else if (types.includes("longtask")) {
        observer = new PerformanceObserver((list) => { longTasks += list.getEntries().filter((e) => e.duration >= 50).length; });
        observer.observe({ type: "longtask", buffered: false });
      }
    } catch (_) { observer = null; }
  }

  function report() {
    const seconds = Math.max(1, Math.round((performance.now() - startedAt) / 1000));
    const lines = [];
    lines.push(`Rolagem: ${seconds}s · ${frames} quadros · ${gaps.length} travadas (>50ms)`);
    if (gaps.length) lines.push(`Piores: ${gaps.slice().sort((a, b) => b.ms - a.ms).slice(0, 5).map((g) => `${g.ms}ms@${(g.at / 1000).toFixed(1)}s`).join(", ")}`);
    const covered = gaps.filter((g) => loafs.some((l) => Math.abs(l.at - g.at) < 250)).length;
    if (loafs.length || longTasks) lines.push(`Com código pesado: ${loafs.length || longTasks} · Travadas sem código (desenho): ${Math.max(0, gaps.length - covered)}`);
    else lines.push(`Travadas sem código pesado (desenho na tela): ${gaps.length}`);
    loafs.slice().sort((a, b) => b.ms - a.ms).slice(0, 4).forEach((l) => lines.push(`• ${l.ms}ms (estilo/layout ${l.estilo}ms) ${l.scripts.join(" | ") || "sem script"}`));
    const vd = document.getElementById("view-detail");
    const mode = vd?.classList.contains("stage-clean") ? "palco" : "estudo";
    const video = Boolean(document.querySelector("#youtube-song-player iframe"));
    lines.push(`Tela: ${mode}${video ? " · com vídeo" : ""} · ${global.innerWidth}x${global.innerHeight} @${global.devicePixelRatio}x · ${navigator.hardwareConcurrency || "?"} núcleos · ${navigator.deviceMemory || "?"}GB`);
    return lines.join("\n");
  }

  function show(text) {
    document.getElementById("roudy-scroll-diag")?.remove();
    const panel = document.createElement("div");
    panel.id = "roudy-scroll-diag";
    panel.style.cssText = "position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;padding:12px;border-radius:12px;background:#111;color:#f1f1f1;border:1px solid #555;font:12px/1.45 monospace;white-space:pre-wrap;max-height:55vh;overflow:auto";
    const body = document.createElement("div"); body.textContent = "DIAGNÓSTICO DA ROLAGEM\n" + text;
    const close = document.createElement("button"); close.type = "button"; close.textContent = "Fechar";
    close.style.cssText = "margin-top:10px;padding:8px 14px;border-radius:8px;border:1px solid #777;background:#222;color:#fff";
    close.onclick = () => panel.remove();
    panel.append(body, close);
    document.body.appendChild(panel);
  }

  function toggle(active) {
    if (!enabled) return;
    if (active && !running) {
      running = true; frames = 0; gaps = []; loafs = []; longTasks = 0; last = 0; startedAt = performance.now();
      observe(); raf = global.requestAnimationFrame(tick);
    } else if (!active && running) {
      running = false; global.cancelAnimationFrame(raf); try { observer?.disconnect(); } catch (_) {}
      observer = null;
      show(report());
    }
  }

  global.roudyScrollDiag = Object.freeze({ toggle, get enabled() { return enabled; } });
})(window);
