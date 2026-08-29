(function (global) {
  "use strict";

  class HarmonicSummaryError extends Error {
    constructor(kind, message, status) {
      super(message);
      this.name = "HarmonicSummaryError";
      this.kind = kind;
      this.status = status || 0;
    }
  }

  function clean(value, maxLength) {
    return global.songFormat.cleanText(value == null ? "" : value, maxLength);
  }

  function validatePayload(mode, values) {
    const data = values || {};
    if (mode === "pesquisa") {
      const titulo = clean(data.titulo, 160).trim();
      if (!titulo) throw new HarmonicSummaryError("invalid_input", "Informe o título da música.");
      return { tipo: "pesquisa", titulo, ...(clean(data.artista, 160).trim() ? { artista: clean(data.artista, 160).trim() } : {}) };
    }
    if (mode === "texto") {
      const conteudo = clean(data.conteudo, 50000).trim();
      if (!conteudo) throw new HarmonicSummaryError("invalid_input", "Cole uma cifra, letra com acordes ou anotações.");
      const payload = { tipo: "texto", conteudo };
      const titulo = clean(data.titulo, 160).trim();
      const artista = clean(data.artista, 160).trim();
      if (titulo) payload.titulo = titulo;
      if (artista) payload.artista = artista;
      return payload;
    }
    if (mode === "arquivo") {
      const arquivo = data.arquivo;
      if (!arquivo || typeof arquivo.name !== "string") throw new HarmonicSummaryError("invalid_input", "Selecione um arquivo para analisar.");
      if (arquivo.size > 10 * 1024 * 1024) throw new HarmonicSummaryError("invalid_input", "O arquivo deve ter no máximo 10 MB.");
      return { tipo: "arquivo", arquivo, titulo: clean(data.titulo, 160).trim(), artista: clean(data.artista, 160).trim() };
    }
    throw new HarmonicSummaryError("invalid_input", "Modo de análise inválido.");
  }

  function assertResponse(data) {
    if (!data || data.schemaVersion !== 1 || typeof data.titulo !== "string" || !Array.isArray(data.trechos) || !["alta", "media", "baixa"].includes(data.confianca)) {
      throw new HarmonicSummaryError("invalid_data", "O servidor retornou dados inválidos.");
    }
    data.trechos.forEach((trecho) => {
      if (!trecho || !Array.isArray(trecho.acordes) || (trecho.fraseGuia != null && typeof trecho.fraseGuia !== "string")) throw new HarmonicSummaryError("invalid_data", "O servidor retornou um trecho inválido.");
      trecho.acordes.forEach((chord) => {
        if (typeof chord !== "string" || !global.multiInstrumentChordLibrary.parseChord(chord)) throw new HarmonicSummaryError("invalid_data", "O servidor retornou um acorde inválido.");
      });
      if (trecho.repeticoes != null && (!Number.isInteger(trecho.repeticoes) || trecho.repeticoes < 1 || trecho.repeticoes > 99)) throw new HarmonicSummaryError("invalid_data", "O servidor retornou repetições inválidas.");
    });
    if (data.fullChordSheet != null) {
      const sheet = data.fullChordSheet;
      if (!sheet || sheet.visibility !== "private" || !["user_upload", "user_text"].includes(sheet.source) || typeof sheet.content !== "string" || !sheet.content.trim()) {
        throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma cifra completa inválida.");
      }
    }
    return data;
  }

  function responseToEditorModel(raw, instrument) {
    const data = assertResponse(raw);
    const sections = data.trechos.map((trecho, index) => {
      let position = 0;
      const chords = trecho.acordes.map((chord) => {
        const item = { chord, position };
        position += chord.length + 2;
        return item;
      });
      return {
        type: "custom",
        label: clean(trecho.secao || `Trecho ${index + 1}`, 120),
        lines: [{ lyrics: clean(trecho.fraseGuia, 80), repeticoes: trecho.repeticoes, chords }]
      };
    });
    const confidenceLabel = { alta: "alta", media: "média", baixa: "baixa" }[data.confianca];
    const observations = Array.isArray(data.observacoes) ? data.observacoes.map((item) => clean(item, 500)).filter(Boolean) : [];
    return global.songFormat.normalize({
      id: `ai-${Date.now()}`,
      title: clean(data.titulo, 160),
      artist: clean(data.artista, 160),
      originalKey: clean(data.tom || "C", 12),
      currentKey: clean(data.tom || "C", 12),
      instrument: instrument || "guitar",
      source: "ai",
      status: "draft",
      aiGenerated: true,
      reviewedByUser: false,
      aiConfidence: data.confianca,
      notes: [`Confiança da IA: ${confidenceLabel}.`, ...observations].join("\n"),
      fullChordSheet: data.fullChordSheet || null,
      sections: sections.length ? sections : [{ type: "custom", label: "Trecho 1", lines: [{ lyrics: "", chords: [] }] }]
    }, { source: "ai" });
  }

  async function generate(mode, values, options) {
    const settings = options || {};
    const payload = validatePayload(mode, values);
    let response;
    const isFile = mode === "arquivo";
    const body = isFile ? new FormData() : JSON.stringify(payload);
    if (isFile) {
      body.append("arquivo", payload.arquivo);
      if (payload.titulo) body.append("titulo", payload.titulo);
      if (payload.artista) body.append("artista", payload.artista);
    }
    try {
      response = await (settings.fetch || global.fetch)(global.apiConfig.harmonicSummaryEndpoint(), {
        method: "POST",
        headers: isFile ? { "Accept": "application/json" } : { "Content-Type": "application/json", "Accept": "application/json" },
        body,
        signal: settings.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new HarmonicSummaryError("network", "A solicitação demorou demais. Tente novamente.");
      throw new HarmonicSummaryError("network", "Não foi possível conectar ao servidor.");
    }
    let data;
    try {
      data = await response.json();
    } catch (_) {
      if (response.status === 413) {
        throw new HarmonicSummaryError("file_too_large", "Este arquivo é maior que o limite permitido de 10 MB.", response.status);
      }
      throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma resposta inválida.", response.status);
    }
    if (!response.ok) {
      const code = data?.erro?.codigo;
      if (response.status === 413 || code === "requisicao_muito_grande" || code === "arquivo_muito_grande") {
        throw new HarmonicSummaryError("file_too_large", "Este arquivo é maior que o limite permitido de 10 MB.", response.status);
      }
      if (["arquivo_invalido", "tipo_arquivo_invalido", "pdf_paginas_invalidas"].includes(code)) {
        throw new HarmonicSummaryError("invalid_file", "Não foi possível ler este arquivo. Tente outro PDF, imagem ou TXT.", response.status);
      }
      if (code === "provedor_timeout" || response.status === 504) throw new HarmonicSummaryError("provider_timeout", "A análise demorou mais que o esperado. Tente novamente.", response.status);
      if (code === "provedor_rate_limit") throw new HarmonicSummaryError("provider_rate_limit", "O serviço de IA está temporariamente ocupado. Tente novamente em alguns instantes.", response.status);
      if (code === "provedor_rejeitou_requisicao") throw new HarmonicSummaryError("provider_rejected", "Não foi possível processar este arquivo. Tente outro PDF ou imagem.", response.status);
      if (code === "resposta_estruturada_invalida") throw new HarmonicSummaryError("structured_response", "A IA não conseguiu organizar esta cifra corretamente. Tente novamente.", response.status);
      if (code === "resposta_provedor_invalida") throw new HarmonicSummaryError("provider_invalid_response", "O serviço de IA retornou uma resposta inválida. Tente novamente.", response.status);
      if (["provedor_indisponivel", "provedor_erro_inesperado"].includes(code)) throw new HarmonicSummaryError("provider_unavailable", "O serviço de IA está temporariamente indisponível.", response.status);
      if (response.status === 422 || code === "resultado_nao_confiavel") throw new HarmonicSummaryError("untrusted", "Não foi possível gerar um resumo harmônico confiável apenas com essas informações.", response.status);
      if (response.status === 429) throw new HarmonicSummaryError("rate_limit", "O limite de solicitações foi atingido. Aguarde um pouco e tente novamente.", response.status);
      if (response.status >= 500) throw new HarmonicSummaryError("server", "O servidor não conseguiu concluir a análise. Tente novamente mais tarde.", response.status);
      throw new HarmonicSummaryError("invalid_input", "Revise os dados informados e tente novamente.", response.status);
    }
    return { payload, data: assertResponse(data) };
  }

  global.harmonicSummaryClient = Object.freeze({ HarmonicSummaryError, validatePayload, assertResponse, responseToEditorModel, generate });
})(window);
