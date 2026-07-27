(function (global) {
  "use strict";
  let panel = null;
  let mode = "pesquisa";
  let busy = false;

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
    panel.querySelector("[data-ai-submit]").textContent = mode === "pesquisa" ? "Gerar resumo" : "Analisar texto";
    setStatus("initial", "");
  }

  function values() {
    const form = panel.querySelector(`[data-ai-form=${mode}]`);
    return Object.fromEntries([...form.querySelectorAll("input, textarea")].map((input) => [input.name, input.value]));
  }

  function setBusy(value) {
    busy = value;
    if (!panel) return;
    panel.querySelectorAll("button, input, textarea").forEach((control) => { control.disabled = value; });
    const submit = panel.querySelector("[data-ai-submit]");
    submit.textContent = value ? "Analisando…" : (mode === "pesquisa" ? "Gerar resumo" : "Analisar texto");
  }

  async function submit() {
    if (busy) return;
    const help = panel.querySelector("[data-ai-help]");
    help.hidden = true;
    help.textContent = "";
    setBusy(true);
    setStatus("loading", "Analisando a estrutura harmônica…");
    try {
      const result = await global.harmonicSummaryClient.generate(mode, values());
      const model = global.harmonicSummaryClient.responseToEditorModel(result.data, global.currentInstrument || "guitar");
      setStatus("success", "Resumo gerado. Revise o rascunho antes de salvar.");
      setBusy(false);
      close();
      global.openAiDraft(model);
    } catch (error) {
      const kind = error instanceof global.harmonicSummaryClient.HarmonicSummaryError ? error.kind : "server";
      setStatus(kind, error.message || "Não foi possível concluir a análise.");
      if (kind === "untrusted") {
        help.hidden = false;
        help.textContent = "Corrija o título ou artista, cole uma cifra ou texto e tente novamente.";
      }
    } finally { setBusy(false); }
  }

  function close() {
    if (busy || !panel) return;
    panel.remove();
    panel = null;
  }

  function open() {
    if (panel) return;
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
    [["pesquisa", "Pesquisa"], ["texto", "Texto"]].forEach(([key, label]) => {
      const button = element("button", "ai-summary-tab", label); button.type = "button"; button.dataset.aiMode = key; button.setAttribute("role", "tab"); button.addEventListener("click", () => updateMode(key)); tabs.appendChild(button);
    });
    const research = element("div", "ai-summary-form"); research.dataset.aiForm = "pesquisa";
    research.append(field("Título da música", "titulo", "text", true), field("Artista (opcional)", "artista", "text", false));
    const textForm = element("div", "ai-summary-form"); textForm.dataset.aiForm = "texto";
    textForm.append(field("Título (opcional)", "titulo", "text", false), field("Artista (opcional)", "artista", "text", false), field("Cifra, letra com acordes, anotações ou estrutura musical", "conteudo", "textarea", true));
    const status = element("div", "ai-summary-status"); status.dataset.aiStatus = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.hidden = true;
    const help = element("p", "ai-summary-help"); help.dataset.aiHelp = ""; help.hidden = true;
    const submitButton = element("button", "ai-summary-submit", "Gerar resumo"); submitButton.type = "button"; submitButton.dataset.aiSubmit = ""; submitButton.addEventListener("click", submit);
    dialog.append(header, intro, tabs, research, textForm, status, help, submitButton);
    panel.appendChild(dialog);
    panel.addEventListener("click", (event) => { if (event.target === panel) close(); });
    document.body.appendChild(panel);
    updateMode("pesquisa");
    research.querySelector("input").focus();
  }

  global.aiHarmonicSummary = Object.freeze({ open, close, get busy() { return busy; } });
})(window);
