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
      const arquivos = Array.isArray(data.arquivos) ? data.arquivos : (data.arquivo ? [data.arquivo] : []);
      const arquivo = arquivos[0];
      if (arquivos.length > 8) throw new HarmonicSummaryError("invalid_input", "Selecione no máximo 8 arquivos por música.");
      if (!arquivo || typeof arquivo.name !== "string") throw new HarmonicSummaryError("invalid_input", "Selecione um arquivo para analisar.");
      if (arquivos.some(file => !file || typeof file.name !== 'string' || !Number.isFinite(file.size))) throw new HarmonicSummaryError("invalid_input", "Selecione arquivos válidos.");
      if (arquivos.reduce((total,file)=>total+file.size,0) > 10 * 1024 * 1024) throw new HarmonicSummaryError("invalid_input", "Os arquivos devem somar no máximo 10 MB.");
      return { tipo: "arquivo", arquivo, arquivos, titulo: clean(data.titulo, 160).trim(), artista: clean(data.artista, 160).trim() };
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
        label: clean(trecho.secao || "", 120),
        hideLabel: Boolean(trecho.fraseGuia) || !trecho.secao,
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
      sections: sections.length ? sections : [{ type: "custom", label: "", hideLabel: true, lines: [{ lyrics: "", chords: [] }] }]
    }, { source: "ai" });
  }

  async function generate(mode, values, options) {
    const settings = options || {};
    const payload = validatePayload(mode, values);
    let response;
    const isFile = mode === "arquivo";
    const body = isFile ? new FormData() : JSON.stringify(payload);
    if (isFile) {
      payload.arquivos.forEach(file => body.append("arquivo", file));
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
        throw new HarmonicSummaryError("file_too_large", "Use até 10 MB e 50.000 caracteres de texto no total.", response.status);
      }
      throw new HarmonicSummaryError("invalid_data", "O servidor retornou uma resposta inválida.", response.status);
    }
    if (!response.ok) {
      const code = data?.erro?.codigo;
      if (code === "arquivos_demais") throw new HarmonicSummaryError("invalid_input", "Selecione no máximo 8 arquivos por música.", response.status);
      if (code === "pdf_paginas_invalidas") throw new HarmonicSummaryError("invalid_file", "Use no máximo 20 páginas de PDF/imagens no total.", response.status);
      if (response.status === 401 || ["autenticacao_necessaria", "token_invalido", "usuario_invalido"].includes(code)) {
        throw new HarmonicSummaryError("authentication", "Sua sessão expirou. Entre novamente para usar a IA musical.", response.status);
      }
      if (response.status === 413 || code === "requisicao_muito_grande" || code === "arquivo_muito_grande") {
        throw new HarmonicSummaryError("file_too_large", "Use até 10 MB e 50.000 caracteres de texto no total.", response.status);
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

  global.harmonicSummaryClient = Object.freeze({ HarmonicSummaryError, validatePayload, assertResponse, responseToEditorModel, generate });
})(window);
