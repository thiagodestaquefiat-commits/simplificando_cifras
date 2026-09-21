const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function loadAppSettings(){'),html.indexOf('function applyProfileRuntime('));
const classes=new Set(),meta={content:'#050505'},saved={};
let systemLight=false,systemChange;
const root={dataset:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
const document={documentElement:root,body:{style:{removeProperty(){}}},
  querySelector(selector){return selector==='meta[name="theme-color"]'?{setAttribute(_name,value){meta.content=value;}}:null;},
  querySelectorAll(){return [];},getElementById(){return null;}};
const context={document,window:{matchMedia(){return {get matches(){return systemLight;},addEventListener(_event,listener){systemChange=listener;}};}},
  storage:{get(_key,fallback){return saved.value||fallback;}},APP_SETTINGS_KEY:'test',APP_SETTINGS_DEFAULT:{language:'pt-BR',theme:'dark',highContrast:false,colorBlind:false,scale:100},
  APP_TRANSLATIONS:{'pt-BR':{}},settingsFromForm(){return saved.value;}};
vm.createContext(context);
vm.runInContext(`${source}\nthis.load=loadAppSettings;this.apply=applyAppSettings;`,context);
assert.equal(context.load().theme,'dark','a preferência anterior permanece escura');
context.apply(context.load());
assert.equal(root.dataset.theme,'dark');
context.apply({...context.load(),theme:'light'});
assert.equal(root.dataset.theme,'light');
assert.equal(meta.content,'#f5f7fb');
context.apply({...context.load(),theme:'dark'});
assert.equal(root.dataset.theme,'dark');
context.apply({...context.load(),theme:'system'});
assert.equal(root.dataset.theme,'dark');
saved.value={theme:'system',language:'pt-BR',scale:100};
systemLight=true;systemChange();
assert.equal(root.dataset.theme,'light','o tema automático acompanha a alteração do sistema');
systemChange();
assert.equal(root.dataset.theme,'light');
context.apply({...context.load(),theme:'light',highContrast:true});
assert.ok(classes.has('a11y-high-contrast'),'alto contraste continua independente do tema');
assert.match(html,/Aparência e Acessibilidade/);
assert.match(html,/id="setting-theme"/);
assert.match(html,/>Claro<\/option>/);
assert.match(html,/>Escuro<\/option>/);
assert.match(html,/>Sincronizar com o Sistema<\/option>/);
assert.match(html,/html\[data-theme="light"\]/);
console.log('theme-settings.test.js: OK');
