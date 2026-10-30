// MANUTENÇÃO: Estados visuais compartilhados para listas assíncronas e capas de músicas.
(function (global) {
  "use strict";

  const escapeHtml = value => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  function noteIcon() {
    return '<svg class="roudy-artwork-note" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V6l10-2v12"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>';
  }

  function artwork(song, options = {}) {
    const source = global.songArtwork?.resolveReal?.(song);
    const frameClass = ["roudy-artwork-placeholder", options.frameClass].filter(Boolean).join(" ");
    const imageClass = ["roudy-artwork-image", options.imageClass].filter(Boolean).join(" ");
    const image = source
      ? `<img class="${escapeHtml(imageClass)}" src="${escapeHtml(source)}" alt="" loading="lazy" decoding="async" data-roudy-artwork-image onload="window.roudyListLoading.settle(this,true)" onerror="window.roudyListLoading.settle(this,false)">`
      : "";
    return `<span class="${escapeHtml(frameClass)}" aria-hidden="true" data-roudy-artwork-frame>${noteIcon()}${image}</span>`;
  }

  function skeleton(count = 6, options = {}) {
    const rows = Math.max(1, Math.min(12, Number(count) || 6));
    const className = ["roudy-list-skeleton", options.className].filter(Boolean).join(" ");
    return `<div class="${escapeHtml(className)}" role="status" aria-label="Carregando lista" aria-busy="true">${Array.from({ length: rows }, () => '<div class="roudy-list-skeleton-row" aria-hidden="true"><span class="roudy-list-skeleton-art"></span><span class="roudy-list-skeleton-copy"><i></i><i></i></span></div>').join("")}</div>`;
  }

  function settle(image, loaded) {
    const frame = image?.closest?.("[data-roudy-artwork-frame]");
    if (!frame) return;
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

  global.roudyListLoading = Object.freeze({ artwork, skeleton, settle });
})(window);
