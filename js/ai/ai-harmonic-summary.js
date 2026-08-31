(function (global) {
  "use strict";
  let panel = null;
  let mode = "pesquisa";
  let busy = false;
  let sourceSong = null;
  let sourceCandidates = [];

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function field(labelText, name, type, required) {
    const wrap = element("label", "ai-summary-field");
    wrap.appendChild(element("span", "ai-summary-label", labelText));
    const input = element(type === "textarea" ? "textarea" : "input", "ai-summary-input");
    if (type !== "textarea") input.type = type || "text";
    input.name = name;
    input.required = Boolean(required);
    input.autocomplete = "off";
    wrap.appendChild(input);
    return wrap;
  }

  function setStatus(kind, message) {
    const status = panel?.querySelector("[data-ai-status]");
    if (!status) return;
    status.dataset.kind = kind;
    status.textContent = message || "";
    status.hidden = !message;
  }

  function clearSourceResults() {
    sourceCandidates = [];
    const results = panel?.querySelector("[data-ai-results]");
    if (results) { results.replaceChildren(); results.hidden = true; }
  }

  function renderSourceResults(candidates) {
    const results = panel.querySelector("[data-ai-results]");
    results.replaceChildren();
    sourceCandidates = candidates;
    if (!candidates.length) {
      results.appendChild(element("p", "ai-source-empty", "Nenhuma fonte autorizada encontrada. Envie um PDF, imagem ou TXT."));
    } else {
      results.appendChild(element("h3", "ai-source-heading", candidates.length > 1 ? "Escolha a versão" : "Fonte encontrada"));
      candidates.forEach((candidate, index) => {
        const card = element("article", "ai-source-card");
        const copy = element("div", "ai-source-copy");
        copy.append(element("strong", "", candidate.title), element("span", "", candidate.artist || "Artista não informado"), element("small", "", candidate.sourceName));
        const choose = element("button", "ai-source-choose", "Usar esta versão");
        choose.type = "button";
        choose.addEventListener("click", () => generateFromSource(sourceCandidates[index]));
        card.append(copy, choose);
        results.appendChild(card);
      });
    }
    results.hidden = false;
  }

  function updateMode(nextMode) {
    if (busy) return;
    mode = nextMode;
    panel.querySelectorAll("[data-ai-mode]").forEach((button) => {
      const active = button.dataset.aiMode === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    panel.querySelector("[data-ai-form=pesquisa]").hidden = mode !== "pesquisa";
    panel.querySelector("[data-ai-form=texto]").hidden = mode !== "texto";
    panel.querySelector("[data-ai-form=arquivo]").hidden = mode !== "arquivo";
    panel.querySelector("[data-ai-submit]").textContent = mode === "pesquisa" ? "Buscar fontes" : mode === "texto" ? "Analisar texto" : "Gerar resumo";
    clearSourceResults();
    setStatus("initial", "");
  }

  function values() {
    const form = panel.querySelector(`[data-ai-form=${mode}]`);
    return Object.fromEntries([...form.querySelectorAll("input, textarea")].map((input) => [input.name, input.type === "file" ? input.files[0] : input.value]));
  }

  function setBusy(value) {
    busy = value;
    if (!panel) return;
    panel.querySelectorAll("button, input, textarea").forEach((control) => { control.disabled = value; });
    const submit = panel.querySelector("[data-ai-submit]");
    submit.textContent = value ? (mode === "pesquisa" ? "Buscando…" : mode === "arquivo" ? "Analisando cifra..." : "Analisando…") : (mode === "pesquisa" ? "Buscar fontes" : mode === "texto" ? "Analisar texto" : "Gerar resumo");
  }

  async function submit() {
    if (busy) return;
    const help = panel.querySelector("[data-ai-help]");
    help.hidden = true;
    help.textContent = "";
    setBusy(true);
    setStatus("loading", mode === "pesquisa" ? "Consultando fontes musicais autorizadas…" : mode === "arquivo" ? "Analisando cifra..." : "Analisando a estrutura harmônica…");
    try {
      if (mode === "pesquisa") {
        const result = await global.harmonicSummaryClient.searchSources(values());
        renderSourceResults(result.candidates);
        setStatus(result.candidates.length ? "success" : "initial", result.candidates.length ? "Escolha uma versão para gerar com IA." : "Nenhuma fonte autorizada foi encontrada.");
        return;
      }
      const result = await global.harmonicSummaryClient.generate(mode, values());
      const sourceInfo = mode === "arquivo"
        ? { type: "upload", name: result.payload.arquivo?.name || null, url: null }
        : mode === "texto"
          ? { type: "text", name: null, url: null }
          : { type: "online", name: null, url: null };
      const model = global.harmonicSummaryClient.responseToEditorModel(result.data, global.currentInstrument || "guitar", sourceInfo);
      setStatus("success", "Resumo gerado. Revise o rascunho antes de salvar.");
      setBusy(false);
      close();
      global.openAiDraft(model, sourceSong);
    } catch (error) {
      const kind = error instanceof global.harmonicSummaryClient.HarmonicSummaryError ? error.kind : "server";
      setStatus(kind, error.message || "Não foi possível concluir a análise.");
      if (kind === "untrusted") {
        help.hidden = false;
        help.textContent = "Corrija o título ou artista, cole uma cifra ou texto e tente novamente.";
      }
    } finally { setBusy(false); }
  }

  async function generateFromSource(candidate) {
    if (busy || !candidate) return;
    setBusy(true);
    setStatus("loading", "Analisando a versão escolhida…");
    try {
      const result = await global.harmonicSummaryClient.generate("pesquisa", { ...values(), sourceProvider: candidate.providerId, sourceId: candidate.sourceId });
      const model = global.harmonicSummaryClient.responseToEditorModel(result.data, global.currentInstrument || "guitar", { type: "online", name: candidate.sourceName, url: candidate.sourceUrl });
      setStatus("success", "Cifra e resumo gerados. Revise o rascunho antes de salvar.");
      setBusy(false);
      close();
      global.openAiDraft(model, sourceSong);
    } catch (error) {
      setStatus(error?.kind || "server", error?.message || "Não foi possível concluir a análise.");
    } finally { setBusy(false); }
  }

  function close() {
    if (busy || !panel) return;
    panel.remove();
    panel = null;
  }

  function open(options) {
    if (panel) return;
    sourceSong = options?.song || null;
    panel = element("div", "ai-summary-overlay");
    panel.id = "ai-summary-overlay";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "ai-summary-title");
    const dialog = element("section", "ai-summary-dialog");
    const header = element("header", "ai-summary-header");
    const title = element("h2", "", "Gerar com IA"); title.id = "ai-summary-title";
    const closeButton = element("button", "ai-summary-close", "Fechar"); closeButton.type = "button"; closeButton.addEventListener("click", close);
    header.append(title, closeButton);
    const intro = element("p", "ai-summary-intro", "O resultado será aberto como rascunho editável e nunca será salvo automaticamente.");
    const tabs = element("div", "ai-summary-tabs"); tabs.setAttribute("role", "tablist");
    [["pesquisa", "Pesquisa"], ["texto", "Texto"], ["arquivo", "Arquivo"]].forEach(([key, label]) => {
      const button = element("button", "ai-summary-tab", label); button.type = "button"; button.dataset.aiMode = key; button.setAttribute("role", "tab"); button.addEventListener("click", () => updateMode(key)); tabs.appendChild(button);
    });
    const research = element("div", "ai-summary-form"); research.dataset.aiForm = "pesquisa";
    research.append(field("Título da música", "titulo", "text", true), field("Artista (opcional)", "artista", "text", false));
    const textForm = element("div", "ai-summary-form"); textForm.dataset.aiForm = "texto";
    textForm.append(field("Título (opcional)", "titulo", "text", false), field("Artista (opcional)", "artista", "text", false), field("Cifra, letra com acordes, anotações ou estrutura musical", "conteudo", "textarea", true));
    const fileForm = element("div", "ai-summary-form ai-summary-file-form"); fileForm.dataset.aiForm = "arquivo";
    const fileField = field("PDF, PNG, JPG, WebP ou TXT (até 10 MB)", "arquivo", "file", true);
    const fileInput = fileField.querySelector("input");
    fileInput.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain";
    const dropHint = element("p", "ai-summary-drop-hint", "Selecione um arquivo ou arraste e solte aqui.");
    fileForm.append(field("Título (opcional)", "titulo", "text", false), field("Artista (opcional)", "artista", "text", false), fileField, dropHint);
    ["dragenter", "dragover"].forEach((eventName) => fileForm.addEventListener(eventName, (event) => { event.preventDefault(); fileForm.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((eventName) => fileForm.addEventListener(eventName, (event) => { event.preventDefault(); fileForm.classList.remove("is-dragging"); }));
    fileForm.addEventListener("drop", (event) => { if (event.dataTransfer?.files?.length) fileInput.files = event.dataTransfer.files; });
    const status = element("div", "ai-summary-status"); status.dataset.aiStatus = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.hidden = true;
    const help = element("p", "ai-summary-help"); help.dataset.aiHelp = ""; help.hidden = true;
    const results = element("div", "ai-source-results"); results.dataset.aiResults = ""; results.hidden = true;
    const submitButton = element("button", "ai-summary-submit", "Gerar resumo"); submitButton.type = "button"; submitButton.dataset.aiSubmit = ""; submitButton.addEventListener("click", submit);
    dialog.append(header, intro, tabs, research, textForm, fileForm, status, help, results, submitButton);
    panel.appendChild(dialog);
    panel.addEventListener("click", (event) => { if (event.target === panel) close(); });
    document.body.appendChild(panel);
    updateMode("pesquisa");
    if (sourceSong) {
      research.querySelector('[name="titulo"]').value = sourceSong.title || "";
      research.querySelector('[name="artista"]').value = sourceSong.artist || "";
    }
    research.querySelectorAll("input").forEach((input) => input.addEventListener("input", clearSourceResults));
    research.querySelector("input").focus();
  }

  global.aiHarmonicSummary = Object.freeze({ open, close, get busy() { return busy; } });
})(window);
