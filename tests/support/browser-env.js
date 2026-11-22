// Suítes de tela fora do Windows (22/11): muitos testes apontam para o Chrome em "C:\Program Files".
// Carregado com `node -r ./tests/support/browser-env.js`, troca esse caminho pelo navegador da máquina
// (variável BROWSER_EXECUTABLE ou o Chromium do Playwright) quando o caminho do teste não existe.
const fs = require("node:fs");
const Module = require("node:module");
const original = Module.prototype.require;
let patched = false;
Module.prototype.require = function patchedRequire(id) {
  const exported = original.apply(this, arguments);
  if (id === "playwright" && !patched && exported?.chromium) {
    patched = true;
    const launch = exported.chromium.launch.bind(exported.chromium);
    exported.chromium.launch = (options = {}) => {
      const wanted = options.executablePath;
      const usable = wanted && fs.existsSync(wanted) ? wanted : process.env.BROWSER_EXECUTABLE || undefined;
      return launch({ ...options, executablePath: usable });
    };
  }
  return exported;
};
