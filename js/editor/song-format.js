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

  function normalizeFullChordSheet(value) {
    if (!value || typeof value !== "object") return null;
    const content = String(value.content || "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").slice(0, 50000).trim();
    if (!content) return null;
    return {
      visibility: "private",
      source: value.source === "user_text" ? "user_text" : "user_upload",
      content,
      sections: Array.isArray(value.sections) ? value.sections.map((section) => ({
        nome: cleanText(section && section.nome || "", 80) || null,
        linhas: Array.isArray(section && section.linhas) ? section.linhas.map((line) => ({
          letra: cleanText(line && line.letra || "", 2000),
          acordes: Array.isArray(line && line.acordes) ? line.acordes.map((item) => ({
            acorde: cleanText(item && item.acorde || "", 40).replace(/\s+/g, ""),
            posicao: Math.max(0, Math.min(500, Number(item && item.posicao) || 0))
          })).filter((item) => item.acorde) : []
        })) : []
      })) : []
    };
  }

  function normalizeAccessContext(value) {
    const context = value && typeof value === "object" ? value : {};
    const scope = context.scope === "team" ? "team" : "personal";
    const optionalId = (idValue) => {
      const result = cleanText(idValue || "", 160).trim();
      return result || null;
    };
    return {
      scope,
      ownerId: optionalId(context.ownerId),
      teamId: scope === "team" ? optionalId(context.teamId) : null
    };
  }

  function normalizeSourceInfo(value) {
    const source = value && typeof value === "object" ? value : {};
    const type = ["upload", "text", "online", "manual"].includes(source.type) ? source.type : "manual";
    const name = cleanText(source.name || "", 255).trim() || null;
    const url = cleanText(source.url || "", 1000).trim() || null;
    return { type, name, url };
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
      const candidate = repeatFromText(raw);
      if (chordLine(candidate.text)) {
        if (pending) lines.push(pending);
        pending = { id: id("line"), lyrics: "", repeticoes: candidate.repeticoes, chords: chordsFromText(candidate.text) };
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
    const repeatValue = Number(line && line.repeticoes);
    return {
      id: cleanText(line && line.id || id("line"), 100),
      lyrics: cleanText(line && line.lyrics || ""),
      repeticoes: Number.isInteger(repeatValue) && repeatValue >= 1 && repeatValue <= 99 ? repeatValue : null,
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
      sourceInfo: normalizeSourceInfo(value.sourceInfo || fallback.sourceInfo),
      accessContext: normalizeAccessContext(value.accessContext || fallback.accessContext),
      aiGenerated: Boolean(value.aiGenerated), reviewedByUser: Boolean(value.reviewedByUser),
      aiConfidence: ["alta", "media", "baixa"].includes(value.aiConfidence) ? value.aiConfidence : null,
      sections: Array.isArray(value.sections) && value.sections.length ? value.sections.map(normalizeSection) : [normalizeSection({}, 0)],
      fullChordSheet: normalizeFullChordSheet(value.fullChordSheet || fallback.fullChordSheet),
      notes: cleanText(value.notes || ""), createdAt: value.createdAt || now, updatedAt: now
    };
  }

  function fromLegacy(song) {
    if (song && song.editorData && Array.isArray(song.editorData.sections)) return normalize({ ...song.editorData, id: song.id, title: song.title, artist: song.artist, accessContext: song.accessContext || song.editorData.accessContext, fullChordSheet: song.fullChordSheet || song.editorData.fullChordSheet });
    return normalize({
      id: song && song.id, title: song && song.title, artist: song && song.artist,
      originalKey: song && song.key, currentKey: song && song.key, capo: parseCapo(song && song.capo),
      instrument: song && song.instrumento, status: "draft", source: "existing",
      sections: Array.isArray(song && song.blocos) ? song.blocos.map(legacyBlockToSection) : undefined,
      accessContext: song && song.accessContext, sourceInfo: song && song.sourceInfo,
      fullChordSheet: song && song.fullChordSheet,
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

  function repeatFromText(value) {
    const match = String(value || "").match(/\s*\((\d{1,2})x\)\s*$/i);
    if (!match) return { text: String(value || "").trim(), repeticoes: null };
    const repeticoes = Number(match[1]);
    return { text: String(value || "").slice(0, match.index).trim(), repeticoes: repeticoes >= 1 && repeticoes <= 99 ? repeticoes : null };
  }

  function simpleText(model) {
    const normalized = normalize(model);
    return normalized.sections.map((section, index) => {
      const rows = [];
      const label = cleanText(section.label, 120);
      if (label && !new RegExp(`^(Trecho|Seção)\\s+${index + 1}$`, "i").test(label)) rows.push(label);
      section.lines.forEach((line) => {
        if (line.lyrics) rows.push(line.lyrics);
        if (line.chords.length) rows.push(renderChordLine(line.chords) + (line.repeticoes ? `  (${line.repeticoes}x)` : ""));
      });
      return rows.join("\n").trim();
    }).filter(Boolean).join("\n\n");
  }

  function sectionTypeFromLabel(label, fallback) {
    const normalizedLabel = cleanText(label, 120).toLocaleLowerCase("pt-BR");
    const found = TYPES.find(([key, title]) => normalizedLabel === key || normalizedLabel === title.toLocaleLowerCase("pt-BR"));
    return found ? found[0] : (fallback || "custom");
  }

  function sectionsFromSimpleText(value, baseModel) {
    const base = normalize(baseModel || {});
    const groups = String(value || "").replace(/\r\n?/g, "\n").trim().split(/\n\s*\n+/).map((group) => group.split("\n").map((line) => line.trim()).filter(Boolean)).filter((group) => group.length);
    return groups.map((sourceLines, index) => {
      const baseSection = base.sections[index];
      const lines = sourceLines.slice();
      let label = baseSection?.label || `Trecho ${index + 1}`;
      const first = lines[0] || "";
      const bracketed = first.match(/^\[(.+)]$/) || first.match(/^\*(.+)\*$/);
      const knownLabel = TYPES.some(([key, title]) => first.toLocaleLowerCase("pt-BR") === key || first.toLocaleLowerCase("pt-BR") === title.toLocaleLowerCase("pt-BR"));
      const sameLabel = baseSection && first.toLocaleLowerCase("pt-BR") === String(baseSection.label || "").toLocaleLowerCase("pt-BR");
      if (bracketed || knownLabel || sameLabel) {
        label = cleanText(bracketed ? bracketed[1] : first, 120);
        lines.shift();
      }
      const parsedLines = [];
      let pendingLyrics = "";
      lines.forEach((rawLine) => {
        const candidate = repeatFromText(rawLine);
        if (chordLine(candidate.text)) {
          parsedLines.push({ id: id("line"), lyrics: cleanText(pendingLyrics), repeticoes: candidate.repeticoes, chords: chordsFromText(candidate.text) });
          pendingLyrics = "";
        } else if (pendingLyrics) {
          parsedLines.push({ id: id("line"), lyrics: cleanText(pendingLyrics), repeticoes: null, chords: [] });
          pendingLyrics = rawLine;
        } else pendingLyrics = rawLine;
      });
      if (pendingLyrics) parsedLines.push({ id: id("line"), lyrics: cleanText(pendingLyrics), repeticoes: null, chords: [] });
      if (!parsedLines.length) parsedLines.push(normalizeLine({}));
      return { id: baseSection?.id || id("section"), type: sectionTypeFromLabel(label, baseSection?.type), label, lines: parsedLines };
    });
  }

  function harmonicSummary(song) {
    const normalized = fromLegacy(song || {});
    const hasStructuredSource = Boolean(song && song.editorData && Array.isArray(song.editorData.sections));
    return {
      id: normalized.id,
      title: normalized.title,
      artist: normalized.artist,
      originalKey: normalized.originalKey,
      currentKey: normalized.currentKey,
      capo: normalized.capo,
      instrument: normalized.instrument,
      accessContext: normalized.accessContext,
      sections: normalized.sections.map((section, sectionIndex) => ({
        type: section.type,
        label: section.label,
        showLabel: hasStructuredSource || Boolean(song && song.blocos && song.blocos[sectionIndex] && song.blocos[sectionIndex].l),
        lines: section.lines.map((line) => ({
          lyrics: line.lyrics,
          repeticoes: line.repeticoes,
          chords: line.chords.map((item) => ({ chord: item.chord, position: item.position }))
        }))
      }))
    };
  }

  function toLegacy(model, existing) {
    const normalized = normalize(model);
    const blocos = normalized.sections.map((section) => {
      const rows = [];
      section.lines.forEach((line) => {
        if (line.chords.length) {
          const repeatLabel = line.repeticoes ? `  (${line.repeticoes}x)` : "";
          rows.push(renderChordLine(line.chords) + repeatLabel);
        }
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
      reviewedByUser: normalized.reviewedByUser, aiConfidence: normalized.aiConfidence,
      accessContext: normalized.accessContext, sourceInfo: normalized.sourceInfo,
      createdAt: normalized.createdAt, updatedAt: normalized.updatedAt,
      fullChordSheet: normalized.fullChordSheet,
      editorData: normalized
    };
  }

  global.songFormat = Object.freeze({ types: TYPES, typeLabels: TYPE_LABELS, id, cleanText, parseCapo, normalizeAccessContext, normalizeSourceInfo, normalizeFullChordSheet, normalize, fromLegacy, toLegacy, renderChordLine, simpleText, sectionsFromSimpleText, harmonicSummary });
})(window);
