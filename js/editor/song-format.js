(function (global) {
  "use strict";

  const TYPES = Object.freeze([
    ["intro", "Introdução"], ["verse", "Verso"], ["pre-chorus", "Pré-refrão"],
    ["chorus", "Refrão"], ["bridge", "Ponte"], ["solo", "Solo"],
    ["interlude", "Interlúdio"], ["outro", "Final"], ["custom", "Seção"]
  ]);
  const TYPE_LABELS = Object.freeze(Object.fromEntries(TYPES));

  function id(prefix) {
    if (global.crypto && typeof global.crypto.randomUUID === "function") return global.crypto.randomUUID();
    return `${prefix || "id"}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function cleanText(value, maxLength) {
    return String(value == null ? "" : value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/[<>]/g, "").slice(0, maxLength || 20000);
  }

  function parseCapo(value) {
    if (Number.isInteger(value)) return Math.max(0, Math.min(12, value));
    const match = String(value || "").match(/(\d+)/);
    return match ? Math.max(0, Math.min(12, Number(match[1]))) : 0;
  }

  function chordLine(value) {
    const tokens = String(value || "").trim().split(/\s+/).filter(Boolean);
    return tokens.length > 0 && tokens.every((token) => global.multiInstrumentChordLibrary.parseChord(token));
  }

  function chordsFromText(value) {
    const result = [];
    const matcher = /\S+/g;
    let match;
    while ((match = matcher.exec(String(value || "")))) {
      if (global.multiInstrumentChordLibrary.parseChord(match[0])) result.push({ id: id("chord"), chord: match[0], position: match.index });
    }
    return result;
  }

  function legacyBlockToSection(block, index) {
    const rawLines = String(block && block.c || "").split("\n");
    const lines = [];
    let pending = null;
    rawLines.forEach((raw) => {
      if (chordLine(raw)) {
        if (pending) lines.push(pending);
        pending = { id: id("line"), lyrics: "", chords: chordsFromText(raw) };
      } else if (pending && !pending.lyrics) {
        pending.lyrics = cleanText(raw);
        lines.push(pending);
        pending = null;
      } else {
        lines.push({ id: id("line"), lyrics: cleanText(raw), chords: [] });
      }
    });
    if (pending) lines.push(pending);
    if (!lines.length) lines.push({ id: id("line"), lyrics: "", chords: [] });
    const label = cleanText(block && block.l || `Seção ${index + 1}`, 120);
    return { id: id("section"), type: "custom", label, lines };
  }

  function normalizeLine(line) {
    return {
      id: cleanText(line && line.id || id("line"), 100),
      lyrics: cleanText(line && line.lyrics || ""),
      chords: Array.isArray(line && line.chords) ? line.chords.map((item) => ({
        id: cleanText(item && item.id || id("chord"), 100),
        chord: cleanText(item && item.chord || "", 40).replace(/\s+/g, ""),
        position: Math.max(0, Math.min(500, Number(item && item.position) || 0))
      })) : []
    };
  }

  function normalizeSection(section, index) {
    const type = TYPES.some(([key]) => key === section?.type) ? section.type : "custom";
    const lines = Array.isArray(section?.lines) && section.lines.length ? section.lines.map(normalizeLine) : [normalizeLine({})];
    return { id: cleanText(section?.id || id("section"), 100), type, label: cleanText(section?.label || TYPE_LABELS[type] || `Seção ${index + 1}`, 120), lines };
  }

  function normalize(input, defaults) {
    const now = new Date().toISOString();
    const value = input || {};
    const fallback = defaults || {};
    const originalKey = cleanText(value.originalKey || value.key || fallback.originalKey || "C", 12);
    return {
      id: value.id == null ? id("song") : value.id,
      title: cleanText(value.title || "", 160), artist: cleanText(value.artist || "", 160),
      originalKey, currentKey: cleanText(value.currentKey || originalKey, 12),
      capo: parseCapo(value.capo), instrument: global.instrumentDefinitions.normalizeId(value.instrument || value.instrumento || fallback.instrument || "guitar"),
      bpm: value.bpm === null || value.bpm === "" || value.bpm === undefined ? null : Math.max(20, Math.min(300, Number(value.bpm) || 0)),
      status: value.status === "published" ? "published" : "draft",
      source: ["manual", "imported", "ai", "existing"].includes(value.source) ? value.source : (fallback.source || "manual"),
      aiGenerated: Boolean(value.aiGenerated), reviewedByUser: Boolean(value.reviewedByUser),
      sections: Array.isArray(value.sections) && value.sections.length ? value.sections.map(normalizeSection) : [normalizeSection({}, 0)],
      notes: cleanText(value.notes || ""), createdAt: value.createdAt || now, updatedAt: now
    };
  }

  function fromLegacy(song) {
    if (song && song.editorData && Array.isArray(song.editorData.sections)) return normalize({ ...song.editorData, id: song.id, title: song.title, artist: song.artist });
    return normalize({
      id: song && song.id, title: song && song.title, artist: song && song.artist,
      originalKey: song && song.key, currentKey: song && song.key, capo: parseCapo(song && song.capo),
      instrument: song && song.instrumento, status: "draft", source: "existing",
      sections: Array.isArray(song && song.blocos) ? song.blocos.map(legacyBlockToSection) : undefined,
      notes: song && song.notes, bpm: song && song.bpm, createdAt: song && song.createdAt
    });
  }

  function renderChordLine(chords) {
    const ordered = [...chords].sort((a, b) => a.position - b.position);
    let output = "";
    ordered.forEach((item) => {
      const position = Math.max(output.length, item.position);
      output += " ".repeat(position - output.length) + item.chord;
    });
    return output.trimEnd();
  }

  function toLegacy(model, existing) {
    const normalized = normalize(model);
    const blocos = normalized.sections.map((section) => {
      const rows = [];
      section.lines.forEach((line) => {
        if (line.chords.length) rows.push(renderChordLine(line.chords));
        if (line.lyrics) rows.push(line.lyrics);
      });
      return { l: section.label, c: rows.join("\n") };
    });
    return {
      ...(existing || {}), id: normalized.id, title: normalized.title, artist: normalized.artist,
      key: normalized.currentKey, capo: normalized.capo ? `Capotraste casa ${normalized.capo}` : "",
      instrumento: normalized.instrument, bpm: normalized.bpm, notes: normalized.notes, blocos,
      songFormatVersion: 3, originalKey: normalized.originalKey, currentKey: normalized.currentKey,
      status: normalized.status, source: normalized.source, aiGenerated: normalized.aiGenerated,
      reviewedByUser: normalized.reviewedByUser, createdAt: normalized.createdAt, updatedAt: normalized.updatedAt,
      editorData: normalized
    };
  }

  global.songFormat = Object.freeze({ types: TYPES, typeLabels: TYPE_LABELS, id, cleanText, parseCapo, normalize, fromLegacy, toLegacy, renderChordLine });
})(window);
