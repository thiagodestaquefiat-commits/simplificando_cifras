const assert = require("node:assert/strict");

global.window = {};
require("../js/chord-library.js");
require("../js/chord-utils.js");

const { normalizeChordName, normalizeForLookup, splitChord, lookupCandidates, findEquivalent } = window.chordUtils;

assert.equal(normalizeChordName("  c♯m7  "), "C#m7");
assert.equal(normalizeChordName(" f♭ "), "Fb");
assert.equal(normalizeForLookup("B4"), "Bsus4");
assert.equal(normalizeForLookup("Db"), "C#");
assert.equal(normalizeForLookup("C7m"), "Cmaj7");
assert.deepEqual(splitChord(" G / b "), {
  displayName: "G/B",
  shapeName: "G",
  bassNote: "B"
});
assert.deepEqual(lookupCandidates("F#m7/A"), ["F#m7", "Gbm7"]);
assert.equal(findEquivalent({ "F#m7": { id: 1 } }, " f#m7 / a ").value.id, 1);
assert.equal(findEquivalent({ Db: { id: 2 } }, "C#").value.id, 2);
assert.equal(findEquivalent({ A9: { id: 3 } }, "a9").value.id, 3);
assert.equal(findEquivalent({ Bsus4: { id: 4 } }, "B4").value.id, 4);
assert.equal(findEquivalent({}, "C#m7"), null);

console.log("chord-utils.test.js: OK");
