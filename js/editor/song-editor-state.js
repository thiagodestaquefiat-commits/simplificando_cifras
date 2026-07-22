(function (global) {
  "use strict";
  const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const FLATS = { Db: "C#", Eb: "D#", Gb: "F#", Ab: "G#", Bb: "A#" };
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function noteRoot(value) { const match=String(value||"").trim().match(/^([A-Ga-g])([#b]?)/);return match?match[1].toUpperCase()+match[2]:""; }
  function noteIndex(value) { const root=noteRoot(value);return NOTES.indexOf(FLATS[root] || root); }
  function shiftRoot(root, delta) { const index = noteIndex(root); return index < 0 ? root : NOTES[(index + delta + 120) % 12]; }
  function transposeChord(value, delta) {
    const compact=String(value||"").trim().replace(/♯/g,"#").replace(/♭/g,"b").replace(/\s+/g,"");
    const match=compact.match(/^([A-Ga-g][#b]?)(.*?)(?:\/([A-Ga-g][#b]?))?$/);
    if (!match || !global.multiInstrumentChordLibrary.parseChord(compact) || !delta) return value;
    const root=shiftRoot(match[1][0].toUpperCase()+match[1].slice(1),delta);
    const bass=match[3]?`/${shiftRoot(match[3][0].toUpperCase()+match[3].slice(1),delta)}`:"";
    return root+match[2]+bass;
  }
  function keyDelta(from, to) { const left = noteIndex(from), right = noteIndex(to); return left < 0 || right < 0 ? null : (right - left + 12) % 12; }

  function create(initial) {
    let model = global.songFormat.normalize(initial);
    const baseline = copy(model);
    const history = global.songEditorHistory.create(model);
    let dirty = false;
    function commit(mutator) { const next = copy(model); mutator(next); next.updatedAt = new Date().toISOString(); model = global.songFormat.normalize(next); history.push(model); dirty = true; return copy(model); }
    function replace(value, changed) { model = global.songFormat.normalize(value); dirty = changed !== false; return copy(model); }
    return Object.freeze({
      get: () => copy(model), isDirty: () => dirty,
      markSaved() { dirty = false; },
      updateMeta(field, value) { return commit((draft) => { draft[field] = value; if (field === "source") draft.aiGenerated = value === "ai"; }); },
      addSection(type) { return commit((draft) => draft.sections.push({ id: global.songFormat.id("section"), type: type || "verse", label: global.songFormat.typeLabels[type] || "Verso", lines: [{ id: global.songFormat.id("line"), lyrics: "", chords: [] }] })); },
      removeSection(sectionId) { return commit((draft) => { draft.sections = draft.sections.filter((section) => section.id !== sectionId); }); },
      duplicateSection(sectionId) { return commit((draft) => { const index = draft.sections.findIndex((section) => section.id === sectionId); if (index < 0) return; const clone = copy(draft.sections[index]); clone.id = global.songFormat.id("section"); clone.label += " (cópia)"; clone.lines.forEach((line) => { line.id = global.songFormat.id("line"); line.chords.forEach((item) => { item.id = global.songFormat.id("chord"); }); }); draft.sections.splice(index + 1, 0, clone); }); },
      moveSection(sectionId, direction) { return commit((draft) => { const from = draft.sections.findIndex((section) => section.id === sectionId); const to = from + direction; if (from < 0 || to < 0 || to >= draft.sections.length) return; [draft.sections[from], draft.sections[to]] = [draft.sections[to], draft.sections[from]]; }); },
      updateSection(sectionId, field, value) { return commit((draft) => { const section = draft.sections.find((item) => item.id === sectionId); if (section) section[field] = value; }); },
      addLine(sectionId) { return commit((draft) => { const section = draft.sections.find((item) => item.id === sectionId); if (section) section.lines.push({ id: global.songFormat.id("line"), lyrics: "", chords: [] }); }); },
      removeLine(sectionId, lineId) { return commit((draft) => { const section = draft.sections.find((item) => item.id === sectionId); if (section) section.lines = section.lines.filter((line) => line.id !== lineId); }); },
      updateLine(sectionId, lineId, lyrics) { return commit((draft) => { const line = draft.sections.find((item) => item.id === sectionId)?.lines.find((item) => item.id === lineId); if (line) line.lyrics = lyrics; }); },
      addChord(sectionId, lineId, chord, position) { return commit((draft) => { const line = draft.sections.find((item) => item.id === sectionId)?.lines.find((item) => item.id === lineId); if (line) line.chords.push({ id: global.songFormat.id("chord"), chord: chord || "C", position: Math.max(0, Number(position) || 0) }); }); },
      updateChord(sectionId, lineId, chordId, field, value) { return commit((draft) => { const item = draft.sections.find((section) => section.id === sectionId)?.lines.find((line) => line.id === lineId)?.chords.find((chord) => chord.id === chordId); if (item) item[field] = field === "position" ? Math.max(0, Number(value) || 0) : value; }); },
      removeChord(sectionId, lineId, chordId) { return commit((draft) => { const line = draft.sections.find((section) => section.id === sectionId)?.lines.find((item) => item.id === lineId); if (line) line.chords = line.chords.filter((item) => item.id !== chordId); }); },
      transposeSingle(sectionId, lineId, chordId, delta) { return commit((draft) => { const item = draft.sections.find((section) => section.id === sectionId)?.lines.find((line) => line.id === lineId)?.chords.find((chord) => chord.id === chordId); if (item) item.chord = transposeChord(item.chord, delta); }); },
      transposeSong(targetKey) { const delta = keyDelta(model.currentKey, targetKey); if (delta === null) return copy(model); return commit((draft) => { draft.sections.forEach((section) => section.lines.forEach((line) => line.chords.forEach((item) => { item.chord = transposeChord(item.chord, delta); }))); draft.currentKey = targetKey; }); },
      restoreOriginal() { const delta = keyDelta(model.currentKey, model.originalKey); if (delta === null) return copy(model); return commit((draft) => { draft.sections.forEach((section) => section.lines.forEach((line) => line.chords.forEach((item) => { item.chord = transposeChord(item.chord, delta); }))); draft.currentKey = draft.originalKey; }); },
      undo() { return replace(history.undo()); }, redo() { return replace(history.redo()); }, restoreInitial() { return replace(history.initial()); },
      canUndo: history.canUndo, canRedo: history.canRedo, baseline: () => copy(baseline), transposeChord
    });
  }
  global.songEditorState = Object.freeze({ create, transposeChord, keyDelta });
})(window);
