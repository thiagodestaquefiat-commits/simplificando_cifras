(function (global) {
  "use strict";
  let panel = null;
  let mode = "pesquisa";
  let busy = false;
  let sourceSong = null;
  let selectedFiles = [];

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

  // Microfone guiado: 1) fala o nome da música -> Título; 2) fala o artista -> Artista;
  // 3) busca sozinho. Separar título e artista numa frase só não é confiável ("Casa de Deus"),
  // por isso cada um é ditado na sua vez. Reconhecimento de voz do navegador (sem custo).
  function listenOnce(Recognition, onText, onDone) {
    const recognition = new Recognition();
    let heard = "";
    recognition.lang = (global.document && global.document.documentElement.lang) || "pt-BR";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (result) => {
      heard = result.results && result.results[0] && result.results[0][0] ? String(result.results[0][0].transcript || "").trim() : "";
      if (heard) onText(heard);
    };
    recognition.onerror = (error) => { recognition.lastError = error && error.error; };
    recognition.onend = () => onDone(heard, recognition.lastError || null);
    recognition.start();
    return recognition;
  }

  function capitalize(text) { return text ? text.charAt(0).toUpperCase() + text.slice(1) : text; }
  // Nome de artista: cada palavra com inicial maiúscula, exceto conectores ("Ministério de Louvor").
  function titleCase(text) {
    const small = new Set(["de", "da", "do", "das", "dos", "e"]);
    return String(text || "").split(/\s+/).map((word, index) => index && small.has(word.toLowerCase()) ? word.toLowerCase() : capitalize(word)).join(" ");
  }

  function attachVoiceInput(fieldWrap) {
    const input = fieldWrap.querySelector("input");
    const Recognition = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!input) return;
    const box = element("span", "ai-summary-voice-box");
    input.replaceWith(box);
    box.appendChild(input);
    const button = element("button", "ai-summary-voice", "🎙️");
    button.type = "button";
    button.setAttribute("aria-label", "Buscar por voz: fale a música e depois o artista");
    button.title = "Buscar por voz";
    button.setAttribute("aria-pressed", "false");
    box.appendChild(button);
    let active = null;
    const setListening = (value) => {
      button.classList.toggle("listening", value);
      button.setAttribute("aria-pressed", String(value));
    };
    const stop = () => { const current = active; active = null; setListening(false); if (current) current.abort ? current.abort() : current.stop(); };
    const denied = (error) => error === "not-allowed" || error === "service-not-allowed";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      if (busy) return;
      if (active) { stop(); setStatus("initial", ""); return; }
      if (!Recognition) { setStatus("invalid_input", "Seu navegador não permite busca por voz. Digite o título."); return; }
      const artistInput = panel.querySelector("[data-ai-form=pesquisa] input[name=artista]");
      setListening(true);
      setStatus("loading", "🎙️ Fale o nome da música…");
      try {
        active = listenOnce(Recognition, (text) => { input.value = capitalize(text); }, (title, error) => {
          if (!active) return;
          if (!title) {
            active = null; setListening(false);
            setStatus("invalid_input", denied(error) ? "Permita o uso do microfone para buscar por voz." : "Não ouvi o nome da música. Toque no microfone e tente de novo.");
            return;
          }
          setStatus("loading", `🎙️ "${capitalize(title)}" — agora fale o nome do artista (ou aguarde para buscar só pelo título)…`);
          try {
            active = listenOnce(Recognition, (artist) => { if (artistInput) artistInput.value = titleCase(artist); }, () => {
              if (!active) return;
              active = null; setListening(false);
              setStatus("initial", "");
              submit();
            });
          } catch (_error) { active = null; setListening(false); submit(); }
        });
      } catch (_error) { active = null; setListening(false); setStatus("invalid_input", "Não foi possível usar o microfone. Digite o título."); }
    });
  }

  function capoSelector() {
    const wrap = element("div", "ai-summary-field ai-summary-capo-field");
    wrap.appendChild(element("span", "ai-summary-label", "Capotraste"));
    const input = element("input");
    input.type = "hidden";
    input.name = "capotraste";
    const choices = element("div", "ai-summary-capo-options");
    choices.setAttribute("role", "group");
    choices.setAttribute("aria-label", "Casa do capotraste");
    const select = (value) => {
      input.value = value;
      choices.querySelectorAll("button").forEach((button) => {
        const active = button.dataset.capo === value;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
    };
    for (let fret = 1; fret <= 12; fret += 1) {
      const button = element("button", "ai-summary-capo-option", String(fret));
      button.type = "button";
      button.dataset.capo = String(fret);
      button.setAttribute("aria-label", `Capotraste na casa ${fret}`);
      button.setAttribute("aria-pressed", "false");
      button.addEventListener("click", () => select(input.value === String(fret) ? "" : String(fret)));
      choices.appendChild(button);
    }
    wrap.append(input, choices);
    wrap.setValue = (value) => select(Number(value) >= 1 && Number(value) <= 12 ? String(Number(value)) : "");
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
    panel.querySelector("[data-ai-form=arquivo]").hidden = mode !== "arquivo";
    panel.querySelector("[data-ai-form=texto]").hidden = mode !== "texto";
    panel.querySelector("[data-ai-submit]").textContent = mode === "pesquisa" ? "Gerar com IA" : "Gerar Resumo/Letra e Cifra";
    panel.querySelector("[data-ai-candidates]").replaceChildren();
    setStatus("initial", "");
  }

  function values() {
    const form = panel.querySelector(`[data-ai-form=${mode}]`);
    const data={...Object.fromEntries([...form.querySelectorAll("input, textarea")].filter(input=>input.type !== 'file').map((input) => [input.name, input.value])), arquivos: selectedFiles.slice()};
    if(mode==='texto'){
      const metadata=[];
      if(data.tom?.trim())metadata.push(`Tom: ${data.tom.trim()}`);
      if(data.capotraste?.trim())metadata.push(`Capotraste: ${data.capotraste.trim()}`);
      data.conteudo=[...metadata,data.conteudo].filter(Boolean).join('\n');
    }
    return data;
  }

  function renderFiles() {
    const list = panel.querySelector('[data-ai-files]');
    list.replaceChildren();
    panel.querySelector('[data-ai-file-count]').textContent = `${selectedFiles.length} arquivo(s) selecionado(s)`;
    selectedFiles.forEach((file,index)=>{
      const row=element('li','ai-summary-file-row');
      row.appendChild(element('span','',`Arquivo ${index+1} — ${file.name}`));
      const remove=element('button','ai-summary-close','Remover');remove.type='button';
      remove.setAttribute('aria-label',`Remover arquivo ${index+1}: ${file.name}`);
      remove.addEventListener('click',()=>{if(busy)return;selectedFiles.splice(index,1);renderFiles();});
      row.appendChild(remove);list.appendChild(row);
    });
  }

  function addFiles(files) {
    if(busy)return;
    const next=selectedFiles.concat(Array.from(files||[]));
    try{global.harmonicSummaryClient.validatePayload('arquivo',{arquivos:next});}
    catch(error){setStatus('invalid_input',error.message);return;}
    selectedFiles=next;renderFiles();setStatus('initial','');
  }

  function setBusy(value) {
    busy = value;
    if (!panel) return;
    panel.querySelectorAll("button, input, textarea").forEach((control) => { control.disabled = value; });
    const submit = panel.querySelector("[data-ai-submit]");
    submit.textContent = value ? (mode === "arquivo" ? "Analisando cifra..." : mode === "texto" ? "Analisando a estrutura harmônica…" : "Buscando...") : (mode === "pesquisa" ? "Gerar com IA" : "Gerar Resumo/Letra e Cifra");
  }

  // Falhas que o modo conhecimento do modelo também teria: não adianta tentar de novo.
  const NO_FALLBACK_KINDS = ["authentication", "invalid_input", "rate_limit", "network"];

  function errorKind(error) {
    return error instanceof global.harmonicSummaryClient.HarmonicSummaryError ? error.kind : "server";
  }

  function sourceInfo(candidate) {
    return { type: "online", name: candidate.sourceName || null, url: candidate.sourceUrl || null };
  }

  async function generateFromCandidate(searchPayload, candidate) {
    setBusy(true);
    setStatus("loading", "Analisando a fonte selecionada…");
    try {
      const result = await global.harmonicSummaryClient.generate("pesquisa", {
        titulo: searchPayload.titulo,
        artista: searchPayload.artista,
        sourceProvider: candidate.providerId,
        sourceId: candidate.sourceId
      });
      const model = global.harmonicSummaryClient.responseToEditorModel(result.data, global.currentInstrument || "guitar", sourceInfo(candidate));
      setStatus("success", mode === "texto"
        ? "Letra, cifra e resumo harmônico organizados. Revise o rascunho antes de salvar."
        : "Resumo gerado. Revise o rascunho antes de salvar.");
      setBusy(false);
      close();
      global.openAiDraft(model, sourceSong);
    } catch (error) {
      const kind = errorKind(error);
      if (!NO_FALLBACK_KINDS.includes(kind)) {
        setBusy(false);
        await generateFromModelKnowledge(searchPayload);
        return;
      }
      setStatus(kind, error.message || "Não foi possível concluir a análise.");
    } finally { setBusy(false); }
  }

  // Fluxo da busca: 1) catálogo do ROUDY 2) cifra na web (scraper) 3) arquivo/foto do usuário.
  // O backend nunca inventa a música: sem fonte real ele responde "cifra_nao_encontrada".
  function resultSourceInfo(data) {
    const notes = Array.isArray(data?.observacoes) ? data.observacoes.join("\n") : "";
    const match = notes.match(/(?:Cifra obtida de|Fonte:)\s*(https:\/\/[^\s;]+)/);
    if (match) {
      let host = null;
      try { host = new URL(match[1]).hostname.replace(/^www\./, ""); } catch (_) {}
      return { type: "online", name: host === "cifraclub.com.br" ? "Cifra Club" : host, url: match[1] };
    }
    return { type: "online", name: "Catálogo ROUDY", url: null };
  }

  function askForFile(searchPayload, message) {
    updateMode("arquivo");
    const fileForm = panel.querySelector("[data-ai-form=arquivo]");
    const titleInput = fileForm?.querySelector("input[name=titulo]");
    const artistInput = fileForm?.querySelector("input[name=artista]");
    if (titleInput && !titleInput.value) titleInput.value = searchPayload.titulo || "";
    if (artistInput && !artistInput.value) artistInput.value = searchPayload.artista || "";
    setStatus("not_found", message);
  }

  async function generateFromModelKnowledge(searchPayload) {
    setBusy(true);
    setStatus("loading", "Procurando a cifra no ROUDY e na web…");
    try {
      const result = await global.harmonicSummaryClient.generate("pesquisa", {
        titulo: searchPayload.titulo,
        artista: searchPayload.artista,
        modoGeracao: "conhecimento_modelo"
      });
      const model = global.harmonicSummaryClient.responseToEditorModel(result.data, global.currentInstrument || "guitar", resultSourceInfo(result.data));
      setBusy(false);
      close();
      global.openAiDraft(model, sourceSong);
    } catch (error) {
      const kind = error instanceof global.harmonicSummaryClient.HarmonicSummaryError ? error.kind : "server";
      if (kind === "not_found") {
        setBusy(false);
        askForFile(searchPayload, error.message || "Não encontramos esta cifra. Envie um arquivo (PDF, foto ou TXT) da cifra para continuar.");
        return;
      }
      setStatus(kind, error.message || "Não foi possível buscar esta música.");
    } finally { setBusy(false); }
  }

  function renderCandidates(searchPayload, candidates) {
    const list = panel.querySelector("[data-ai-candidates]");
    list.replaceChildren(element("p", "ai-summary-help", "Encontramos mais de uma versão. Escolha a fonte que deseja usar:"));
    candidates.forEach((candidate) => {
      const button = element("button", "ai-summary-candidate");
      button.type = "button";
      const copy = element("span", "ai-summary-candidate-copy");
      copy.append(
        element("strong", "", candidate.title || searchPayload.titulo),
        element("span", "", candidate.artist || "Artista não informado"),
        element("small", "", candidate.sourceName || "Fonte autorizada")
      );
      button.append(copy, element("span", "ai-summary-candidate-action", "Selecionar"));
      button.addEventListener("click", () => generateFromCandidate(searchPayload, candidate));
      list.appendChild(button);
    });
    setStatus("success", "Escolha uma das fontes encontradas para continuar.");
  }

  async function search() {
    setBusy(true);
    setStatus("loading", "Buscando fontes autorizadas…");
    try {
      const result = await global.harmonicSummaryClient.searchSources(values());
      if (!result.candidates.length) {
        setBusy(false);
        await generateFromModelKnowledge(result.payload);
        return;
      }
      if (result.candidates.length === 1) {
        setBusy(false);
        await generateFromCandidate(result.payload, result.candidates[0]);
        return;
      }
      renderCandidates(result.payload, result.candidates);
    } catch (error) {
      const kind = errorKind(error);
      if (!NO_FALLBACK_KINDS.includes(kind) && kind !== "source_required") {
        setBusy(false);
        await generateFromModelKnowledge(global.harmonicSummaryClient.validatePayload("pesquisa", values()));
        return;
      }
      setStatus(kind, error.message || "Não foi possível buscar esta música.");
    } finally { setBusy(false); }
  }

  async function submit() {
    if (busy) return;
    if (mode === "pesquisa") return search();
    const help = panel.querySelector("[data-ai-help]");
    help.hidden = true;
    help.textContent = "";
    setBusy(true);
    setStatus("loading", mode === "arquivo" ? "Analisando cifra..." : "Analisando a estrutura harmônica…");
    try {
      const result = await global.harmonicSummaryClient.generate(mode, values());
      const sourceInfo = mode === "arquivo"
        ? { type: "upload", name: result.payload.arquivos.map(file=>file.name).join(' + ').slice(0,255), url: null }
        : { type: "manual", name: null, url: null };
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
        help.textContent = "Corrija o título ou artista, ou envie uma cifra, PDF ou foto.";
      }
    } finally { setBusy(false); }
  }

  function close() {
    if (busy || !panel) return;
    panel.remove();
    panel = null;
    selectedFiles = [];
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
    [["pesquisa", "🔎 Busca por IA"], ["arquivo", "📁 Arquivo ou foto"], ["texto", "📝 Texto"]].forEach(([key, label]) => {
      const button = element("button", "ai-summary-tab", label); button.type = "button"; button.dataset.aiMode = key; button.setAttribute("role", "tab"); button.addEventListener("click", () => updateMode(key)); tabs.appendChild(button);
    });
    const searchForm = element("div", "ai-summary-form ai-summary-search-form"); searchForm.dataset.aiForm = "pesquisa";
    const titleField = field("Título da música", "titulo", "text", true);
    titleField.querySelector("input").placeholder = "Ex: Oceans";
    attachVoiceInput(titleField);
    const artistField = field("Artista", "artista", "text", false);
    artistField.querySelector("input").placeholder = "Ex: Hillsong UNITED";
    searchForm.append(titleField, artistField);
    const fileForm = element("div", "ai-summary-form ai-summary-file-form"); fileForm.dataset.aiForm = "arquivo";
    const fileField = field("Adicionar arquivos — PDF, PNG, JPG, WebP ou TXT", "arquivo", "file", true);
    const fileInput = fileField.querySelector("input");
    fileInput.accept = ".pdf,.png,.jpg,.jpeg,.webp,.txt,application/pdf,image/png,image/jpeg,image/webp,text/plain";
    fileInput.multiple = true;
    fileInput.addEventListener('change',()=>{if(fileInput.files.length)addFiles(fileInput.files);fileInput.value='';});
    const dropHint = element("p", "ai-summary-drop-hint", "Uma música: até 8 arquivos, 10 MB no total e 20 páginas/imagens. A ordem abaixo será usada na análise. Adicione um por vez para definir a ordem exata.");
    const count=element('p','ai-summary-drop-hint','0 arquivo(s) selecionado(s)');count.dataset.aiFileCount='';count.setAttribute('aria-live','polite');
    const filesList=element('ol','ai-summary-files');filesList.dataset.aiFiles='';
    fileForm.append(field("Título (opcional)", "titulo", "text", false), field("Artista (opcional)", "artista", "text", false), fileField, dropHint, count, filesList);
    ["dragenter", "dragover"].forEach((eventName) => fileForm.addEventListener(eventName, (event) => { event.preventDefault(); fileForm.classList.add("is-dragging"); }));
    ["dragleave", "drop"].forEach((eventName) => fileForm.addEventListener(eventName, (event) => { event.preventDefault(); fileForm.classList.remove("is-dragging"); }));
    fileForm.addEventListener("drop", (event) => { if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files); });
    const textForm = element("div", "ai-summary-form ai-summary-text-form"); textForm.dataset.aiForm = "texto";
    const textTitle=field("Título", "titulo", "text", false);textTitle.querySelector("input").placeholder="Nome da música";
    const textArtist=field("Artista / Compositor", "artista", "text", false);textArtist.querySelector("input").placeholder="ex: Fernandinho, Aline Barros...";
    const textKey=field("Tom", "tom", "text", false);textKey.querySelector("input").placeholder="ex: G, Am, C#m";
    const textCapo=capoSelector();
    const textContent=field("Cifras", "conteudo", "textarea", true);
    textContent.querySelector("textarea").placeholder="G9  Em7  C9  Am7\nAo que está assentado\n\nC9  D9  Bm7  Em\nQuem já pisou";
    const textHint=element("div","ai-summary-text-hint");
    textHint.append(element("span","","Digite a cifra e a letra alternadas. Linha em branco separa estrofes."),element("strong","","Ex:\nG9  Em7  C9  Am7\nAo que está assentado\n\nC9  D9  Bm7  Em\nQuem já pisou"));
    textForm.append(textTitle,textArtist,textKey,textCapo,textHint,textContent);
    const status = element("div", "ai-summary-status"); status.dataset.aiStatus = ""; status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite"); status.hidden = true;
    const help = element("p", "ai-summary-help"); help.dataset.aiHelp = ""; help.hidden = true;
    const candidates = element("div", "ai-summary-candidates"); candidates.dataset.aiCandidates = "";
    const submitButton = element("button", "ai-summary-submit", "Gerar Resumo/Letra e Cifra"); submitButton.type = "button"; submitButton.dataset.aiSubmit = ""; submitButton.addEventListener("click", submit);
    dialog.append(header, intro, tabs, searchForm, fileForm, textForm, status, help, candidates, submitButton);
    panel.appendChild(dialog);
    panel.addEventListener("click", (event) => { if (event.target === panel) close(); });
    document.body.appendChild(panel);
    updateMode("pesquisa");
    if (sourceSong) {
      searchForm.querySelector('[name="titulo"]').value = sourceSong.title || "";
      searchForm.querySelector('[name="artista"]').value = sourceSong.artist || "";
      fileForm.querySelector('[name="titulo"]').value = sourceSong.title || "";
      fileForm.querySelector('[name="artista"]').value = sourceSong.artist || "";
      textForm.querySelector('[name="titulo"]').value = sourceSong.title || "";
      textForm.querySelector('[name="artista"]').value = sourceSong.artist || "";
      textForm.querySelector('[name="tom"]').value = sourceSong.key || sourceSong.currentKey || "";
      textCapo.setValue(sourceSong.capo || "");
      textForm.querySelector('[name="conteudo"]').value = global.songFormat?.simpleText(sourceSong.editorData||sourceSong) || "";
    }
    searchForm.querySelector('[name="titulo"]').focus();
  }

  global.aiHarmonicSummary = Object.freeze({ open, close, get busy() { return busy; } });
})(window);
