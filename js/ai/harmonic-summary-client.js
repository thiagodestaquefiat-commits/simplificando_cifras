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
      const payload = { tipo: "pesquisa", titulo, ...(clean(data.artista, 160).trim() ? { artista: clean(data.artista, 160).trim() } : {}) };
      const sourceProvider = clean(data.sourceProvider, 80).trim();
      const sourceId = clean(data.sourceId, 300).trim();
      if (Boolean(sourceProvider) !== Boolean(sourceId)) throw new HarmonicSummaryError("invalid_input", "Escolha uma versão válida da fonte.");
      if (sourceProvider) Object.assign(payload, { sourceProvider, sourceId });
      return payload;
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
    const normalized = data && data.schemaVersion === 1
      ? { ...data, schemaVersion: 2, capotraste: null, harmonicSummary: { blocos: data.trechos } }
      : data;
    const blocks = normalized?.harmonicSummary?.blocos;
    if (!normalized || normalized.schemaVersion !== 2 || typeof normalized.titulo !== "string" || !Array.isArray(blocks) || !["alta", "media", "baixa"].includes(normalized.confianca)) {
      throw new HarmonicSummaryError("invalid_data", "O servidor retornou dados inválidos.");
    }
    blocks.forEach((trecho) => {
      if (!trecho || !Array.isArray(trecho.acordes) || (trecho.fraseGuia != null && typeof trecho.fraseGuia !== "string")) throw new HarmonicSummaryError("invalid_data", "O servidor retornou um trecho inválido.");
      trecho.acordes.forEach((chord) => {
        if (typeof chord !== "string" || !global.multiInstrumentChordLibrary.parseChord(chord)) throw new HarmonicSummaryError("invalid_data", "O servidor retornou um acorde inválido.");
      });
      if (trecho.repeticoes != null && (!Number.isInteger(trecho.repeticoes) || trecho.repeticoes < 1 || trecho.repeticoes > 99)) throw new HarmonicSummaryError("invalid_data", "O servidor retornou repetições inválidas.");
    });
    if (normalized.fullChordSheet != null) {
      const sheet = normalized.fullChordSheet;
      if (!sheet || sheet.visibility !== "private" || !["user_upload", "user_text"].includes(sheet.source) || typeof sheet.content !== "string" || !sheet.content.trim()) {
        throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma cifra completa inválida.");
      }
      if (sheet.sections != null && !Array.isArray(sheet.sections)) throw new HarmonicSummaryError("invalid_data", "A cifra estruturada é inválida.");
      (sheet.sections || []).forEach((section) => {
        if (!section || !Array.isArray(section.linhas)) throw new HarmonicSummaryError("invalid_data", "Uma seção da cifra é inválida.");
        section.linhas.forEach((line) => {
          if (!line || typeof line.letra !== "string" || !Array.isArray(line.acordes)) throw new HarmonicSummaryError("invalid_data", "Uma linha da cifra é inválida.");
          line.acordes.forEach((item) => {
            if (!item || typeof item.acorde !== "string" || !global.multiInstrumentChordLibrary.parseChord(item.acorde) || !Number.isInteger(item.posicao) || item.posicao < 0 || item.posicao > 500) {
              throw new HarmonicSummaryError("invalid_data", "A relação entre acorde e letra é inválida.");
            }
          });
        });
      });
    }
    return normalized;
  }

  function assertCandidates(data) {
    if (!data || !Array.isArray(data.candidates)) throw new HarmonicSummaryError("invalid_data", "O servidor retornou fontes inválidas.");
    return data.candidates.map((item) => {
      if (!item || typeof item.providerId !== "string" || typeof item.sourceId !== "string" || typeof item.sourceName !== "string" || typeof item.title !== "string" || typeof item.sourceUrl !== "string" || !item.sourceUrl.startsWith("https://")) {
        throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma fonte inválida.");
      }
      return {
        providerId: clean(item.providerId, 80), sourceId: clean(item.sourceId, 300),
        sourceName: clean(item.sourceName, 120), sourceUrl: item.sourceUrl,
        title: clean(item.title, 160), artist: clean(item.artist, 160),
        format: clean(item.format, 40), score: Number(item.score) || 0
      };
    });
  }

  async function searchSources(values, options) {
    const settings = options || {};
    const payload = validatePayload("pesquisa", values);
    delete payload.sourceProvider;
    delete payload.sourceId;
    const accessToken = settings.accessToken || (global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken());
    if (!accessToken) throw new HarmonicSummaryError("authentication", "Entre com Google para pesquisar fontes musicais.", 401);
    let response;
    try {
      response = await (settings.fetch || global.fetch)(global.apiConfig.musicSourceEndpoint("/search"), {
        method: "POST",
        headers: { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${accessToken}` },
        body: JSON.stringify(payload), signal: settings.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") throw new HarmonicSummaryError("source_timeout", "A busca demorou mais que o esperado. Tente novamente.");
      throw new HarmonicSummaryError("network", "Não foi possível consultar as fontes musicais.");
    }
    let data;
    try { data = await response.json(); }
    catch (_) { throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma resposta inválida.", response.status); }
    if (!response.ok) {
      const code = data?.erro?.codigo;
      if (response.status === 401) throw new HarmonicSummaryError("authentication", "Sua sessão expirou. Entre novamente.", response.status);
      if (code === "fonte_timeout" || response.status === 504) throw new HarmonicSummaryError("source_timeout", "A busca demorou mais que o esperado. Tente novamente.", response.status);
      if (code === "fonte_indisponivel" || response.status >= 500) throw new HarmonicSummaryError("source_unavailable", "As fontes musicais estão temporariamente indisponíveis.", response.status);
      throw new HarmonicSummaryError("invalid_input", "Revise o título e o artista.", response.status);
    }
    return { payload, candidates: assertCandidates(data) };
  }

  function responseToEditorModel(raw, instrument, source) {
    const data = assertResponse(raw);
    const sections = data.harmonicSummary.blocos.map((trecho, index) => {
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
      capo: Number.isInteger(data.capotraste) ? data.capotraste : 0,
      instrument: instrument || "guitar",
      source: "ai",
      sourceInfo: source && typeof source === "object" ? source : { type: "online", name: null, url: null },
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
    const accessToken = settings.accessToken || (global.appAuth && global.appAuth.getAccessToken && global.appAuth.getAccessToken());
    if (!accessToken) throw new HarmonicSummaryError("authentication", "Entre com Google para usar a IA musical.", 401);
    try {
      response = await (settings.fetch || global.fetch)(global.apiConfig.harmonicSummaryEndpoint(), {
        method: "POST",
        headers: isFile
          ? { "Accept": "application/json", "Authorization": `Bearer ${accessToken}` }
          : { "Content-Type": "application/json", "Accept": "application/json", "Authorization": `Bearer ${accessToken}` },
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
      if (response.status === 401 || ["autenticacao_necessaria", "token_invalido", "usuario_invalido"].includes(code)) {
        throw new HarmonicSummaryError("authentication", "Sua sessão expirou. Entre novamente para usar a IA musical.", response.status);
      }
      if (response.status === 413 || code === "requisicao_muito_grande" || code === "arquivo_muito_grande") {
        throw new HarmonicSummaryError("file_too_large", "Este arquivo é maior que o limite permitido de 10 MB.", response.status);
      }
      if (["arquivo_invalido", "tipo_arquivo_invalido", "pdf_paginas_invalidas"].includes(code)) {
        throw new HarmonicSummaryError("invalid_file", "Não foi possível ler este arquivo. Tente outro PDF, imagem ou TXT.", response.status);
      }
      if (code === "fonte_nao_selecionada") throw new HarmonicSummaryError("source_required", "Escolha uma fonte antes de gerar com IA.", response.status);
      if (code === "fonte_timeout") throw new HarmonicSummaryError("source_timeout", "A fonte demorou mais que o esperado. Tente novamente.", response.status);
      if (code === "fonte_indisponivel") throw new HarmonicSummaryError("source_unavailable", "A fonte musical está temporariamente indisponível.", response.status);
      if (code === "fonte_invalida") throw new HarmonicSummaryError("source_invalid", "Não foi possível processar esta versão. Escolha outra fonte.", response.status);
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

  global.harmonicSummaryClient = Object.freeze({ HarmonicSummaryError, validatePayload, assertCandidates, searchSources, assertResponse, responseToEditorModel, generate });
})(window);
