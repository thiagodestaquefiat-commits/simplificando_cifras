// MANUTENÇÃO: Estados visuais compartilhados para listas assíncronas e capas de músicas.
(function (global) {
  "use strict";

  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function noteIcon(kind = "song", {standalone = false} = {}) {
    const dimensions = standalone ? "position:static;width:40px;height:48px" : "width:36%;height:44%";
    if (kind !== "playlist") return '<svg class="roudy-artwork-note" style="' + dimensions + '" viewBox="26 27 42 64" aria-hidden="true"><path style="fill:var(--icon-placeholder,#505156);stroke:none" d="M 47 34 L 61 31 C 62.5 30.7 63.5 31.4 63.5 33 L 63.5 43 C 63.5 44.5 62.5 45 61 45.4 L 49 48 C 47.7 48.3 47.5 49 47.5 50.5 L 47.5 74 C 47.5 82 42.2 86.2 36.5 86.2 C 31.3 86.2 28.8 82.4 29.9 77.3 C 31 72.6 36.3 70.5 42.3 68.5 C 43.5 68.1 44 67.2 44 65.6 L 44 38 C 44 35.5 44.9 34.5 47 34 Z"/></svg>';
    return '<svg class="roudy-artwork-note" style="width:36%;height:44%;color:var(--icon-placeholder,#505156)" viewBox="60 36 231 276" aria-hidden="true"><path style="fill:currentColor;stroke:none" d="M 139 71 C 135 72 132 76 132 82 L 132 224 C 132 231 123 233 113 236 C 89 241 70 253 69 271 C 67 290 81 304 99 305 C 119 307 138 294 145 276 C 148 269 149 264 149 256 L 149 140 C 149 133 152 132 158 130 L 260 110 C 264 109 266 112 266 117 L 266 194 C 266 201 264 205 255 207 C 224 211 203 226 202 245 C 200 264 214 278 237 278 C 259 278 277 261 281 241 C 282 236 282 230 282 223 L 282 50 C 282 44 278 42 272 43 Z"/></svg>';
  }

  function artwork(song, options = {}) {
    const source = global.songArtwork?.resolveReal?.(song);
    const frameClass = ["roudy-artwork-placeholder", source ? "is-loading" : "", options.frameClass].filter(Boolean).join(" ");
    const imageClass = ["roudy-artwork-image", options.imageClass].filter(Boolean).join(" ");
    const image = source
      ? `<img class="${escapeHtml(imageClass)}" src="${escapeHtml(source)}" alt="" loading="lazy" decoding="async" data-roudy-artwork-image onload="window.roudyListLoading.settle(this,true)" onerror="window.roudyListLoading.settle(this,false)">`
      : "";
    return `<span class="${escapeHtml(frameClass)}" aria-hidden="true" data-roudy-artwork-frame>${noteIcon(options.kind)}${image}</span>`;
  }

  function skeleton(count = 6, options = {}) {
    const rows = Math.max(1, Math.min(12, Number(count) || 6));
    const className = ["roudy-list-skeleton", options.className].filter(Boolean).join(" ");
    return `<div class="${escapeHtml(className)}" role="status" aria-label="Carregando lista" aria-busy="true">${Array.from({ length: rows }, () => '<div class="roudy-list-skeleton-row" aria-hidden="true"><span class="roudy-list-skeleton-art"></span><span class="roudy-list-skeleton-copy"><i></i><i></i></span></div>').join("")}</div>`;
  }

  function settle(image, loaded) {
    const frame = image?.closest?.("[data-roudy-artwork-frame]");
    if (!frame) return;
    frame.classList.remove("is-loading");
    frame.classList.toggle("is-loaded", Boolean(loaded));
    frame.classList.toggle("is-unavailable", !loaded);
    if (!loaded) image.remove();
  }

  global.document?.addEventListener("load", event => {
    if (event.target?.matches?.("[data-roudy-artwork-image]")) settle(event.target, true);
  }, true);
  global.document?.addEventListener("error", event => {
    if (event.target?.matches?.("[data-roudy-artwork-image]")) settle(event.target, false);
  }, true);

  global.roudyListLoading = Object.freeze({ artwork, skeleton, settle, noteIcon });
})(window);
