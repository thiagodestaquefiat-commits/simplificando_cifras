const assert = require("node:assert/strict");

global.window = {};
require("../js/chord-library.js");
require("../js/chord-utils.js");

const library = window.chordLibrary;

assert.equal(library.count, 2016);
assert.equal(Object.keys(library.diagrams).length, 2016);
assert.equal(library.roots.length, 12);
assert.equal(library.requestedRoots.length, 17);
assert.ok(library.categories.includes("Maiores"));
assert.ok(library.categories.includes("Menores"));
assert.ok(library.categories.includes("Dominante"));
assert.ok(library.categories.includes("Inversões"));
assert.ok(library.categories.includes("Acordes com baixo"));

const normalizationCases = {
  B4: "Bsus4",
  A4: "Asus4",
  B2: "Bsus2",
  Db: "C#",
  Gb: "F#",
  C7m: "Cmaj7",
  "BbM7/D": "A#maj7/D",
  "G/A": "G/A"
};

for (const [input, canonicalName] of Object.entries(normalizationCases)) {
  const resolved = library.resolve(input);
  assert.ok(resolved, `${input} deveria ser resolvido`);
  assert.equal(resolved.canonicalName, canonicalName, input);
  assert.equal(resolved.displayName, input, `${input} deve preservar o nome exibido`);
}

for (const root of library.requestedRoots) {
  for (const quality of library.qualities) {
    assert.ok(library.resolve(root + quality.suffix), `${root}${quality.suffix} ausente`);
  }
}

const validationErrors = [];
for (const [name, diagram] of Object.entries(library.diagrams)) {
  validationErrors.push(...library.validateDiagram(name, diagram));
}
assert.deepEqual(validationErrors, []);

assert.ok(library.resolve("C"));
assert.ok(library.resolve("C#m7"));
assert.ok(library.resolve("F#11"));
assert.ok(library.resolve("G/B"));
assert.ok(library.resolve("G/A"));
assert.equal(library.resolve("H7"), null);

console.log(`chord-library.test.js: OK (${library.count} diagramas)`);
