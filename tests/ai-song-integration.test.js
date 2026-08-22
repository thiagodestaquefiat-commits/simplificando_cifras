const assert = require("node:assert/strict");
global.window = global;
global.location = { hostname: "simplificandocifras.netlify.app" };
global.document = { querySelector: () => ({ content: "https://simplificandocifras-production.up.railway.app" }) };
global.instrumentDefinitions = { defaultId: "guitar", normalizeId: value => value || "guitar" };
global.multiInstrumentChordLibrary = { parseChord: value => typeof value === "string" && /^[A-G]/.test(value) ? {} : null };
require("../js/song-model.js");
require("../js/ai/api-config.js");
require("../js/editor/song-format.js");
require("../js/ai/harmonic-summary-client.js");

assert.equal(window.apiConfig.harmonicSummaryEndpoint(), "https://simplificandocifras-production.up.railway.app/api/resumo-harmonico");
const spotify = window.songModel.create({ id: "spotify-local", title: "O Tempo Não Para", artist: "Cazuza", album: "Ideologia", spotifyTrackId: "track-1", spotifyUri: "spotify:track:track-1", coverUrl: "https://image.test/cover.jpg", blocos: [] });
const model = window.harmonicSummaryClient.responseToEditorModel({ schemaVersion: 1, titulo: spotify.title, artista: spotify.artist, tom: "G", confianca: "media", observacoes: ["Revise antes de salvar."], trechos: [{ secao: "Refrão", acordes: ["G", "D/F#", "Em", "C"], fraseGuia: "Primeira frase", repeticoes: 2 }] }, "guitar");
assert.equal(model.aiGenerated, true); assert.equal(model.reviewedByUser, false); assert.equal(model.status, "draft"); assert.equal(model.currentKey, "G"); assert.equal(model.sections[0].lines[0].repeticoes, 2);
const summaryText = window.songFormat.simpleText(model);
const reviewed = window.songFormat.normalize({ ...model, title: "O Tempo Não Para — revisada", capo: 2, sections: window.songFormat.sectionsFromSimpleText(summaryText.replace("Primeira frase", "Frase revisada"), model), reviewedByUser: true });
const saved = { ...window.songFormat.toLegacy(reviewed, spotify), id: spotify.id }; assert.equal(saved.spotifyTrackId, "track-1"); assert.equal(saved.spotifyUri, "spotify:track:track-1"); assert.equal(saved.album, "Ideologia"); assert.equal(saved.coverUrl, "https://image.test/cover.jpg"); assert.equal(saved.id, "spotify-local"); assert.equal(saved.capo, "Capotraste casa 2"); assert.equal(saved.blocos[0].l, "Refrão"); assert.match(saved.blocos[0].c, /Frase revisada/);
console.log("ai-song-integration.test.js: OK (API central, revisão simples, Song Spotify e metadados preservados)");
