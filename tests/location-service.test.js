const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

let requestedUrl = "";
const window = {
  location: { hostname: "localhost" },
  document: { querySelector: () => null },
  fetch: async (url) => {
    requestedUrl = url;
    return { ok: true, json: async () => ({ results: [{ formattedAddress: "Rua XV, 10, Blumenau, SC", latitude: -26.9, longitude: -49.06, placeId: "abc", provider: "geoapify" }] }) };
  },
  eventModel: {
    create: ({ eventLocation }) => ({ eventLocation: eventLocation && Number.isFinite(Number(eventLocation.latitude)) && Number.isFinite(Number(eventLocation.longitude)) ? { ...eventLocation, latitude: Number(eventLocation.latitude), longitude: Number(eventLocation.longitude) } : null })
  }
};
const context = vm.createContext({ window, URLSearchParams, encodeURIComponent, Error });
for (const file of ["js/ai/api-config.js", "js/location-service.js"]) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"), context, { filename: file });
}

(async () => {
  assert.equal((await window.locationService.search("abc")).length, 0);
  const results = await window.locationService.search("Rua XV");
  assert.equal(results[0].placeId, "abc");
  assert.match(requestedUrl, /api\/locations\/search\?q=Rua%20XV/);
  assert.match(window.locationService.mapUrl(results[0]), /latitude=-26.9/);
  assert.match(window.locationService.externalMapUrl(results[0]), /google\.com\/maps\/search/);
  console.log("location-service.test.js: OK");
})().catch((error) => { console.error(error); process.exitCode = 1; });
