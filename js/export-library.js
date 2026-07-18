(function (global) {
  "use strict";

  const KNOWN_KEYS = Object.freeze({
    musicas: ["cifras_musicas_v1", "sc_musicas_v2"],
    playlists: ["cifras_setlists_v1", "sc_playlists_v2"],
    medleys: ["cifras_medleys_v1", "sc_medleys_v2", "cifras_medley_v1"],
    favoritos: ["cifras_favoritos_v1", "sc_favorites_v2"],
    configuracoes: ["cifras_configuracoes_v1", "sc_settings_v2", "cifras_settings_v1"]
  });

  function parseRawValue(rawValue) {
    if (rawValue === null || rawValue === undefined) return null;
    try {
      return JSON.parse(rawValue);
    } catch {
      return rawValue;
    }
  }

  function selectKnownData(rawSnapshot, keys) {
    const selected = {};
    keys.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(rawSnapshot, key)) {
        selected[key] = parseRawValue(rawSnapshot[key]);
      }
    });
    return selected;
  }

  function countSongs(collections) {
    return Object.values(collections).reduce((total, value) => {
      return total + (Array.isArray(value) ? value.length : 0);
    }, 0);
  }

  function buildExport(context) {
    const rawSnapshot = global.storage.snapshotRaw();
    const persisted = {};
    Object.entries(KNOWN_KEYS).forEach(([group, keys]) => {
      persisted[group] = selectKnownData(rawSnapshot, keys);
    });

    return {
      formato: "simplificando-cifras-exportacao",
      versao: 1,
      exportadoEm: new Date().toISOString(),
      origens: {
        catalogoPadrao: {
          descricao: "Catálogo incluído no aplicativo",
          musicas: context.catalogoPadrao
        },
        armazenamentoUsuario: {
          descricao: "Valores persistidos no navegador, preservados por chave e formato",
          dadosConhecidos: persisted,
          armazenamentoBruto: rawSnapshot
        },
        sessaoAtual: {
          descricao: "Estado em memória no momento da exportação",
          musicas: context.musicas,
          playlists: context.playlists,
          medleys: context.medleys,
          favoritos: context.favoritos,
          configuracoes: context.configuracoes
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
    link.download = `simplificando-cifras-biblioteca-${date}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.libraryExporter = Object.freeze({
    export(context) {
      const payload = buildExport(context);
      downloadExport(payload);
      const standardCount = Array.isArray(context.catalogoPadrao) ? context.catalogoPadrao.length : 0;
      const storedCount = countSongs(payload.origens.armazenamentoUsuario.dadosConhecidos.musicas);
      return { standardCount, storedCount, payload };
    },
    buildExport
  });
})(window);
