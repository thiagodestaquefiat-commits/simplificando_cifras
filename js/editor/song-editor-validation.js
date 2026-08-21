(function (global) {
  "use strict";
  function chord(value, instrumentId) {
    const parsed = global.multiInstrumentChordLibrary.parseChord(value);
    if (!parsed) return { valid: false, message: `Acorde “${value}” não reconhecido.` };
    const resolved = global.multiInstrumentChordLibrary.resolve(instrumentId, value);
    if (!resolved) return { valid: false, message: `Não há diagrama válido para “${value}” neste instrumento.` };
    return { valid: true, parsed, resolved };
  }
  function song(model) {
    const errors = [];
    let chordCount = 0;
    if (!String(model.title || "").trim()) errors.push({ field: "title", message: "Informe o título." });
    if (!Array.isArray(model.sections) || !model.sections.length) errors.push({ field: "sections", message: "Adicione pelo menos uma seção." });
    (model.sections || []).forEach((section, sectionIndex) => {
      if (!section.lines || !section.lines.length) errors.push({ field: `section-${section.id}`, message: `A seção ${sectionIndex + 1} precisa de uma linha.` });
      (section.lines || []).forEach((line) => (line.chords || []).forEach((item) => {
        chordCount += 1;
        const result = chord(item.chord, model.instrument);
        if (!result.valid) errors.push({ field: `chord-${item.id}`, message: result.message });
      }));
    });
    if (chordCount === 0) errors.push({ field: "sections", message: "Adicione pelo menos um acorde." });
    return { valid: errors.length === 0, errors };
  }
  global.songEditorValidation = Object.freeze({ chord, song });
})(window);
