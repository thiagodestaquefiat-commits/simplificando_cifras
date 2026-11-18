// Link de playlist aberto sem login: a playlist fica guardada e abre depois do login.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const src = fs.readFileSync("js/home-playlists.js", "utf8");
assert.match(src, /localStorage\.setItem\(PENDING_SHARED_KEY/, "guarda a playlist do link");
assert.match(src, /if \(loginGateVisible\(\)\) return false;/, "não abre escondida atrás da tela de login");
assert.match(src, /24 \* 60 \* 60 \* 1000/, "a playlist pendente vale por 1 dia");
const html = fs.readFileSync("index.html", "utf8");
assert.match(html, /function continueWithoutLogin\(\)\{loginGatePassed=true;renderLoginGate\(\);window\.homePlaylists\?\.openPendingSharedPlaylist\?\.\(\);\}/, "abre ao continuar sem login");
assert.match(html, /homePlaylists\.renderHome\(\);try\{homePlaylists\.openPendingSharedPlaylist\?\.\(\);\}catch/, "abre depois que a conta é confirmada");
console.log("pending-shared-playlist.test.js: OK");
