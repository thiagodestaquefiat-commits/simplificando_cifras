(function (global) {
  "use strict";
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function create(initial, limit) {
    let entries = [copy(initial)], index = 0;
    return Object.freeze({
      push(value) { entries = entries.slice(0, index + 1); entries.push(copy(value)); if (entries.length > (limit || 80)) entries.shift(); index = entries.length - 1; return copy(entries[index]); },
      undo() { if (index > 0) index -= 1; return copy(entries[index]); },
      redo() { if (index < entries.length - 1) index += 1; return copy(entries[index]); },
      initial() { index = 0; return copy(entries[0]); },
      current() { return copy(entries[index]); }, canUndo() { return index > 0; }, canRedo() { return index < entries.length - 1; }
    });
  }
  global.songEditorHistory = Object.freeze({ create });
})(window);
