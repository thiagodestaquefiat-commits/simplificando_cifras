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
assert.equal(context.load().theme,'dark','a aparência antiga migra para o Escuro');
context.apply(context.load());
assert.equal(root.dataset.theme,'default','Escuro usa o visual padrão leve');
context.apply({...context.load(),theme:'light'});
assert.equal(root.dataset.theme,'light');
assert.equal(meta.content,'#f5f7fb');
context.apply({...context.load(),theme:'dark',themeVersion:2});
assert.equal(root.dataset.theme,'default');
assert.equal(root.dataset.themeChoice,'dark');
context.apply({...context.load(),chordColor:'blue'});
assert.equal(properties['--chord-color'],'#3B82F6','a cor escolhida deve ser aplicada imediatamente às cifras');
saved.value={theme:'dark',themeVersion:2,language:'pt-BR',scale:100};
assert.equal(context.load().theme,'dark','o tema Escuro continua selecionado');
context.apply({...context.load(),theme:'light',highContrast:true});
assert.ok(classes.has('a11y-high-contrast'),'alto contraste continua independente do tema');
assert.match(html,/Aparência e Acessibilidade/);
assert.match(html,/id="setting-theme"/);
assert.match(html,/id="setting-chord-color"/);
assert.match(html,/Cor da cifra/);
assert.match(html,/\['purple','Roxo'\]/);assert.match(html,/\['orange','Laranja \(padrão\)'\]/);
assert.match(html,/>Claro<\/option>/);
assert.match(html,/>Escuro<\/option>/);
assert.match(html,/>Sistema<\/option>/);
assert.match(html,/\['dark','Escuro',true\]/);
assert.match(html,/\['light','Claro',true\]/);
assert.match(html,/\['system','Sistema',false\]/);
assert.match(html,/\$\{beta\?'<small>Beta<\/small>':''\}\$\{label\}/);

assert.match(fs.readFileSync('css/light-theme.css','utf8'),/html\[data-theme="light"\]/);
assert.equal(fs.existsSync('css/dark-theme.css'),false,'tema escuro pesado removido');
console.log('theme-settings.test.js: OK');
