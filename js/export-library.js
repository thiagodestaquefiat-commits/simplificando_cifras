(function (global) {
  "use strict";

  // Never read browser-wide snapshots: they can contain sessions and other accounts.
  const PRIVATE_KEYS = /^(?:__proto__|prototype|constructor|token|id_?token|access_?token|refresh_?token|authorization|password|secret|api_?key|service_?role_?key|client_?secret|session|auth|pkce|code_?verifier)$/i;
  function sanitize(value) {
    if (Array.isArray(value)) return value.map(sanitize);
    if (!value || typeof value !== "object") return value;
    const result = {};
    Object.entries(value).forEach(([key, item]) => {
      if (!PRIVATE_KEYS.test(key)) result[key] = sanitize(item);
    });
    return result;
  }

  function buildExport(context) {
    if (!context || !Array.isArray(context.musicas)) throw new Error("Aguarde sua biblioteca carregar antes de exportar.");
    const ownerId = String(context.ownerId || "guest");
    const songs = sanitize(context.musicas);
    const ids = new Set(songs.map(song => String(song.id)));

    return {
      formato: "simplificando-cifras-exportacao",
      versao: 3,
      exportadoEm: new Date().toISOString(),
      escopo: { tipo: context.authenticated ? "conta" : "visitante", ownerId },
      restauracaoDisponivel: ["musicas", "perfil", "medleys", "favoritos", "configuracoes"],
      origens: {
        sessaoAtual: {
          descricao: "Dados da identidade ativa. Não inclui credenciais nem armazenamento bruto.",
          musicas: songs,
          perfil: sanitize({name:context.perfil?.name||'',avatarUrl:context.perfil?.avatarUrl||null}),
          medleys: sanitize(context.medleys || []),
          favoritos: sanitize((context.favoritos || []).filter(id => ids.has(String(id)))),
          configuracoes: sanitize(context.configuracoes || {})
        }
      }
    };
  }

  function downloadExport(payload) {
    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `roudy-biblioteca-${date}.json`;
    try { document.body.appendChild(link); link.click(); }
    finally { link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  }

  global.libraryExporter = Object.freeze({
    sanitize,
    export(context) {
      const payload = buildExport(context);
      downloadExport(payload);
      const standardCount = 0;
      const storedCount = Array.isArray(context.musicas) ? context.musicas.length : 0;
      return { standardCount, storedCount, payload };
    },
    buildExport
  });
})(window);
