const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
function fn(name){
  const start=html.lastIndexOf('function '+name+'(');
  assert.ok(start>=0,name+' exists');
  const tail=html.slice(start),end=tail.search(/\r?\n(?:function |const |EVENT_CHAT_)/);
  return end<0?tail:tail.slice(0,end);
}
const stored=new Map(),chat={dataset:{},style:{setProperty(name,value){this[name]=value;}}};
let applyCount=0;
const context=vm.createContext({
  currentSdId:'first',storage:{get:(key,fallback)=>stored.has(key)?stored.get(key):fallback,set:(key,value)=>stored.set(key,value)},
  document:{getElementById:()=>chat,querySelectorAll:()=>[]},eventEsc:value=>String(value),
  openChatAppearance:()=>{},eventChatCustomBackground:()=>'',
  EVENT_CHAT_BACKGROUND_KEY:'background',EVENT_CHAT_BUBBLE_COLOR_KEY:'bubble',
  EVENT_CHAT_BACKGROUNDS:['pattern','black','blue','warm','graphite','custom']
});
const palettes=html.match(/const EVENT_CHAT_BUBBLE_COLORS=([^;]+);/)[0];
const start=html.indexOf('const EVENT_CHAT_WALLPAPERS='),end=html.indexOf('function eventChatBackgroundHistory()',start);
vm.runInContext(palettes+'\n'+html.slice(start,end)+'\n'+[
  'eventChatBackground','eventChatBubbleColor','selectEventChatBackground','applyEventChatBackground'
].map(fn).join('\n'),context);
const presets=vm.runInContext('EVENT_CHAT_STYLE_PRESETS',context);
assert.equal(presets.length,8);
assert.equal(new Set(presets.map(p=>p.id)).size,8);
context.rememberEventChatBackground=()=>{};
const apply=context.applyEventChatBackground;
context.applyEventChatBackground=()=>{applyCount++;apply();};
stored.set('background',{second:'roudy-sky'});
stored.set('bubble',{second:'#04488F'});
for(const preset of presets){
  const before=applyCount;
  context.selectEventChatStylePreset(preset.id);
  assert.equal(applyCount,before+1,'one background application per choice');
  assert.equal(context.eventChatBackground(),preset.background);
  assert.equal(context.eventChatBubbleColor(),preset.bubble);
  assert.equal(chat.style['--event-chat-own-bubble'],preset.bubble);
  assert.equal(chat.style.backgroundImage,context.eventChatBackgroundImage(preset.background),'preview and chat use same background');
  const markup=context.eventChatStylePresetsMarkup();
  assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,1);
  assert.ok(markup.includes(`data-style-preset="${preset.id}" aria-label="${preset.label}" aria-pressed="true"`));
}
assert.equal(stored.get('background').second,'roudy-sky','other conversation untouched');
assert.equal(stored.get('bubble').second,'#04488F');
// A manual color change stops matching the preset; reopening keeps persisted choices.
stored.set('bubble',{...stored.get('bubble'),first:'#04488F'});
assert.equal((context.eventChatStylePresetsMarkup().match(/aria-pressed="true"/g)||[]).length,0);
context.currentSdId='second';
assert.equal(context.eventChatBackground(),'roudy-sky');
context.currentSdId='first';
assert.equal(context.eventChatBackground(),'blue');
const snapshot=JSON.stringify([...stored]);
context.selectEventChatStylePreset('missing');context.currentSdId=null;context.selectEventChatStylePreset(presets[0].id);
assert.equal(JSON.stringify([...stored]),snapshot,'invalid selection and no conversation do not write');
console.log('chat-style-presets.test.js: OK (8 combinations, persistence, preview parity, isolation, manual changes)');
