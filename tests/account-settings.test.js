const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");
const sync = fs.readFileSync("js/library-sync.js", "utf8");
const auth = fs.readFileSync("js/app-auth.js", "utf8");

assert.doesNotMatch(html, /id="library-sync-btn"/, "o botão manual de sincronização deve sair do topo");
assert.match(sync, /global\.storage\.set\(CONSENT_KEY,true\)/, "o login deve ativar a sincronização automática");
assert.match(sync, /pull\(\)\.then\(result=>\{if\(hasConsent\(\)&&result\.status\?\.localPending\)schedule\(\);\}\)/, "a conciliação inicial deve agendar o envio automático somente para uma conta já confirmada");
assert.match(html, /openProfileSettings\(\)/);
assert.match(html, /openAppSettings\(\)/);
assert.match(html, /profilePhotoSelected\(this\)/);
assert.match(html, /openProfilePhotoEditor\(image\)/);
assert.match(html, /loadProfilePhotoEditorSource\(reader\.result\)/);
assert.match(html, /id="profile-crop-canvas"/);
assert.match(html, /profileEditorZoom/);
assert.match(html, /profileEditorRotate/);
assert.match(html, /profileEditorFlip/);
assert.match(html, /applyProfilePhotoEdit/);
assert.match(html, /profile-photo-change/);
assert.match(html, /id="profile-name"/);
assert.match(html, /id="profile-phone"/);
assert.match(html, /id="profile-email"/);
assert.match(html, /Português Brasileiro/);
assert.match(html, />English</);
assert.match(html, />Español</);
assert.match(html, /id="setting-high-contrast"/);
assert.match(html, /id="setting-color-blind"/);
assert.match(html, /\[100,110,120,130,140\]/);
assert.doesNotMatch(html, /document\.body\.style\.zoom\s*=/, "o tamanho acessível não pode usar zoom global");
assert.match(html, /root\.dataset\.uiScale=String\(scale\)/, "o nível deve ser aplicado como token responsivo");
assert.match(html, /--a11y-text-add/, "a tipografia deve possuir token próprio");
assert.match(html, /--a11y-touch-add/, "as áreas de toque devem possuir token próprio");
assert.match(html, /class="btn account-logout"/);
assert.match(auth, /async function updateProfile/);
assert.match(auth, /client\.auth\.updateUser/);

console.log("account-settings.test.js: OK (perfil, idioma, acessibilidade, logout e sincronização automática)");
