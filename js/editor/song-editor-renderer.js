(function (global) {
  "use strict";
  function el(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
  function button(text, action, className) { const node = el("button", `se-btn ${className || ""}`, text); node.type = "button"; if (action) node.dataset.action = action; return node; }
  function field(label, value, name, type, options) {
    const wrap = el("div", `se-field ${options?.wide ? "se-field-wide" : ""}`); const lab = el("label", "", label); wrap.appendChild(lab);
    let input;
    if (type === "select") { input = el("select", "se-select"); (options.items || []).forEach(([key, title]) => { const option = el("option", "", title); option.value = key; option.selected = String(key) === String(value); input.appendChild(option); }); }
    else if (type === "textarea") { input = el("textarea", "se-textarea"); input.value = value || ""; }
    else { input = el("input", "se-input"); input.type = type || "text"; input.value = value == null ? "" : value; if (options?.min) input.min = options.min; if (options?.max) input.max = options.max; }
    input.dataset.meta = name; input.setAttribute("aria-label", label); wrap.appendChild(input); return wrap;
  }
  function action(node, data) { Object.entries(data).forEach(([key, value]) => { node.dataset[key] = value; }); return node; }

  function renderMetadata(model) {
    const panel = el("section", "se-panel"); panel.appendChild(el("h3", "", "Dados da música")); const grid = el("div", "se-grid");
    grid.append(field("Título", model.title, "title", "text", {wide:true}), field("Artista", model.artist, "artist", "text", {wide:true}), field("Tom original", model.originalKey, "originalKey"), field("Tom atual", model.currentKey, "currentKey"), field("Capotraste", model.capo, "capo", "number", {min:0,max:12}), field("BPM", model.bpm, "bpm", "number", {min:20,max:300}), field("Instrumento", model.instrument, "instrument", "select", {items:global.instrumentDefinitions.all.map((item)=>[item.id,item.name]),wide:true}), field("Origem", model.source, "source", "select", {items:[["manual","Manual"],["imported","Importada"],["ai","IA"],["existing","Existente"]]}), field("Status", model.status, "status", "select", {items:[["draft","Rascunho"],["published","Música salva"]]}), field("Observações", model.notes, "notes", "textarea", {wide:true}));
    panel.appendChild(grid); return panel;
  }

  function renderChord(model, section, line, item) {
    const wrap = action(el("div", "se-chord"), {section:section.id,line:line.id,chord:item.id});
    const input = el("input", "se-input se-chord-name"); input.value = item.chord; input.dataset.chordField = "chord"; input.setAttribute("aria-label", "Acorde"); input.setAttribute("list", "song-editor-chord-suggestions");
    const validation = global.songEditorValidation.chord(item.chord, model.instrument); if (!validation.valid) { input.classList.add("se-invalid"); input.title = validation.message; }
    const position = el("input", "se-input"); position.type = "number"; position.min = "0"; position.max = "500"; position.value = item.position; position.dataset.chordField = "position"; position.setAttribute("aria-label", "Posição do acorde");
    wrap.append(input, position, button("−", "chord-down"), button("+", "chord-up"), button("▦", "chord-diagram"), button("×", "chord-remove", "se-btn-danger"));
    const suggestion = global.chordSimplifier.suggest(item.chord);
    if (suggestion) { const suggestionBox = el("div", "se-simplify"); suggestionBox.style.gridColumn = "1 / -1"; suggestionBox.appendChild(el("span", "", `Sugestão: ${item.chord} → ${suggestion}`)); const controls = el("div", "se-simplify-actions"); controls.append(action(button("Aplicar", "simplify-apply"), {suggestion}), button("Manter original", "simplify-dismiss")); suggestionBox.appendChild(controls); wrap.appendChild(suggestionBox); }
    if (!validation.valid) { const error = el("div", "se-error", validation.message); error.style.gridColumn = "1 / -1"; wrap.appendChild(error); }
    return wrap;
  }

  function renderSection(model, section) {
    const card = action(el("section", "se-section"), {section:section.id}); const head = el("div", "se-section-head");
    const type = field("Tipo", section.type, "", "select", {items:global.songFormat.types}); type.querySelector("select").removeAttribute("data-meta"); type.querySelector("select").dataset.sectionField="type";
    const label = field("Nome da seção", section.label, "", "text", {wide:true}); label.querySelector("input").removeAttribute("data-meta"); label.querySelector("input").dataset.sectionField="label";
    const actions = el("div", "se-section-actions"); actions.append(button("↑","section-up"),button("↓","section-down"),button("Duplicar","section-duplicate"),button("Excluir","section-remove","se-btn-danger")); head.append(type,label,actions); card.appendChild(head);
    const lines = el("div", "se-lines"); section.lines.forEach((line) => { const row = action(el("div", "se-line"), {line:line.id}); const top = el("div", "se-line-top"); const lyrics=el("textarea","se-textarea"); lyrics.value=line.lyrics; lyrics.placeholder="Letra desta linha"; lyrics.dataset.lineField="lyrics"; lyrics.setAttribute("aria-label","Letra"); top.append(lyrics,button("Remover linha","line-remove","se-btn-danger")); row.appendChild(top); const chords=el("div","se-chords"); line.chords.forEach((item)=>chords.appendChild(renderChord(model,section,line,item))); row.appendChild(chords); row.appendChild(button("+ Adicionar acorde","chord-add")); lines.appendChild(row); }); lines.appendChild(button("+ Adicionar linha","line-add","se-add-line")); card.appendChild(lines); return card;
  }

  function renderEdit(model) {
    const fragment = document.createDocumentFragment(); fragment.appendChild(renderMetadata(model));
    const panel = el("section","se-panel"); const toolbar=el("div","se-toolbar"); toolbar.append(button("+ Introdução","section-add"),button("+ Verso","section-add"),button("+ Refrão","section-add"),button("Simplificar acordes","simplify-all"),button("Restaurar tom original","restore-key"),button("Restaurar versão inicial","restore-initial")); ["intro","verse","chorus"].forEach((type,index)=>toolbar.children[index].dataset.type=type); panel.appendChild(toolbar); model.sections.forEach((section)=>panel.appendChild(renderSection(model,section))); fragment.appendChild(panel); return fragment;
  }

  function appendDiagram(container, model, chordName) {
    const parsed = global.multiInstrumentChordLibrary.parseChord(chordName); const result = parsed && global.multiInstrumentChordLibrary.resolve(model.instrument,chordName); if (!result) return;
    const card=el("div","se-diagram"); card.appendChild(el("div","se-diagram-title",chordName));
    try { const safeName=result.displayName; const html=result.diagram.renderer==="keyboard"?global.drawValidatedKeyboardSVG(result.diagram,safeName):global.drawValidatedFrettedSVG(result.diagram,safeName); const doc=new DOMParser().parseFromString(html,"text/html"); const source=doc.querySelector("svg"); if(source) card.appendChild(document.importNode(source,true)); } catch (_) { card.appendChild(el("div","se-error","Diagrama indisponível")); }
    container.appendChild(card);
  }

  function renderPreview(model) {
    const panel=el("section","se-panel"); panel.append(el("h2","se-preview-title",model.title||"Sem título"),el("div","se-preview-artist",`${model.artist||"Artista não informado"} · Tom ${model.currentKey} · ${global.instrumentDefinitions.get(model.instrument).name}`));
    const unique=[]; model.sections.forEach((section)=>{const block=el("section","se-preview-section");block.appendChild(el("h3","",section.label));section.lines.forEach((line)=>{if(line.chords.length){const text=global.songFormat.renderChordLine(line.chords);block.appendChild(el("div","se-preview-chords",text));line.chords.forEach((item)=>{if(!unique.includes(item.chord))unique.push(item.chord);});}if(line.lyrics)block.appendChild(el("div","se-preview-lyrics",line.lyrics));});panel.appendChild(block);});
    const diagrams=el("div","se-diagrams"); unique.forEach((name)=>appendDiagram(diagrams,model,name)); panel.appendChild(diagrams); if(model.notes)panel.appendChild(el("div","se-preview-lyrics",`Observações: ${model.notes}`)); return panel;
  }
  function renderSummary(model) { const panel=el("section","se-panel");panel.appendChild(el("h3","","Resumo harmônico"));model.sections.forEach((section)=>{const row=el("div","se-summary-row");row.appendChild(el("strong","",`${section.label}:`));const sequence=[];section.lines.forEach((line)=>line.chords.forEach((item)=>sequence.push(item.chord)));row.appendChild(el("div","se-summary-chords",sequence.join("  ")||"Sem acordes"));panel.appendChild(row);});return panel; }

  function shell(model, mode) {
    const overlay=el("div","song-editor-overlay");overlay.id="song-editor";overlay.dataset.mode=mode;const header=el("header","song-editor-header");header.append(button("←","close","song-editor-close"),el("h2","",model.title?`Editor · ${model.title}`:"Nova cifra"),button("Desfazer","undo"),button("Refazer","redo"));overlay.appendChild(header);
    const tabs=el("nav","song-editor-tabs");[["edit","Editar"],["preview","Visualizar"],["summary","Resumo"]].forEach(([key,title])=>{const item=button(title,"mode");item.dataset.mode=key;if(mode===key)item.classList.add("active");tabs.appendChild(item);});overlay.appendChild(tabs);
    const suggestions=el("datalist");suggestions.id="song-editor-chord-suggestions";["G","Am","C7M","F#m7","B4","A9","D/F#","F#m7(11)"].forEach((name)=>{const option=el("option");option.value=name;suggestions.appendChild(option);});overlay.appendChild(suggestions);
    const main=el("main","song-editor-main");if(model.aiGenerated)main.appendChild(el("div","se-ai-notice","Rascunho gerado por IA — revise antes de salvar."));main.appendChild(mode==="edit"?renderEdit(model):mode==="preview"?renderPreview(model):renderSummary(model));overlay.appendChild(main);
    const footer=el("footer","song-editor-actions");footer.append(el("div","se-status",model.status==="draft"?"Rascunho":"Música pronta"),button("Salvar rascunho","save-draft"),button("Salvar música","save-song","se-btn-primary"),button("Descartar","discard","se-btn-danger"),button("Cancelar edição","close"));overlay.appendChild(footer);return overlay;
  }
  global.songEditorRenderer=Object.freeze({shell,renderPreview,renderSummary});
})(window);
