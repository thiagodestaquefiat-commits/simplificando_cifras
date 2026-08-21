const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync(require("node:path").resolve(__dirname, "..", "index.html"), "utf8");
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1]).filter((source) => source.trim());
assert.ok(scripts.length > 0, "index.html deve possuir scripts inline");
scripts.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index + 1}.js` }));
console.log(`index-syntax.test.js: OK (${scripts.length} scripts)`);
