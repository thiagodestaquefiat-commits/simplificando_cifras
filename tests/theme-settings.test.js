const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('index.html','utf8');
const source=html.slice(html.indexOf('function loadAppSettings(){'),html.indexOf('function applyProfileRuntime('));
const classes=new Set(),meta={content:'#050505'},saved={};
const properties={};const root={dataset:{},style:{setProperty(name,value){properties[name]=value;}},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}};
const document={documentElement:root,body:{style:{removeProperty(){}}},
  querySelector(selector){return selector==='meta[name="theme-color"]'?{setAttribute(_name,value){meta.content=value;}}:null;},
  querySelectorAll(){return [];},getElementById(){return null;}};
const context={document,window:{matchMedia(){return {matches:false,addEventListener(){}};}},
  storage:{get(_key,fallback){return saved.value||fallback;}},APP_SETTINGS_KEY:'test',CHORD_COLOR_OPTIONS:{coral:'#E8896B',blue:'#3B82F6'},APP_SETTINGS_DEFAULT:{language:'pt-BR',theme:'dark',highContrast:false,colorBlind:false,scale:100,chordColor:'coral'},
  APP_TRANSLATIONS:{'pt-BR':{}},settingsFromForm(){return saved.value;}};
vm.createContext(context);
vm.runInContext(`${source}\nthis.load=loadAppSettings;this.apply=applyAppSettings;`,context);
assert.equal(context.load().theme,'default','a aparência escura antiga migra para o padrão atual');
context.apply(context.load());
assert.equal(root.dataset.theme,'default');
context.apply({...context.load(),theme:'light'});
assert.equal(root.dataset.theme,'light');
assert.equal(meta.content,'#f5f7fb');
context.apply({...context.load(),theme:'dark',themeVersion:2});
assert.equal(root.dataset.theme,'dark');
context.apply({...context.load(),chordColor:'blue'});
assert.equal(properties['--chord-color'],'#3B82F6','a cor escolhida deve ser aplicada imediatamente às cifras');
saved.value={theme:'dark',themeVersion:2,language:'pt-BR',scale:100};
assert.equal(context.load().theme,'dark','o novo tema escuro permanece selecionado');
context.apply({...context.load(),theme:'light',highContrast:true});
assert.ok(classes.has('a11y-high-contrast'),'alto contraste continua independente do tema');
assert.match(html,/Aparência e Acessibilidade/);
assert.match(html,/id="setting-theme"/);
assert.match(html,/id="setting-chord-color"/);
assert.match(html,/Cor da cifra/);
assert.match(html,/\['blue','Azul','#0789E7'\]/);
assert.match(html,/>Claro — Beta<\/option>/);
assert.match(html,/>Escuro<\/option>/);
assert.match(html,/>Padrão<\/option>/);
assert.match(html,/<option value="light" disabled>Claro — Beta<\/option>/);
assert.match(html,/\['light','Claro',true\]/);
assert.match(html,/value==='light'\|\|button\?\.disabled/);
assert.match(fs.readFileSync('css/light-theme.css','utf8'),/html\[data-theme="light"\]/);
assert.match(fs.readFileSync('css/dark-theme.css','utf8'),/roudy-dark-theme-background\.svg/);
console.log('theme-settings.test.js: OK');
