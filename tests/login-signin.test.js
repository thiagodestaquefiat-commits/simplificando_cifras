const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/login-signin.js','utf8');
const saved=new Map(),nodes=new Map();let listener;
const localStorage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};
const window={accountProfile:()=>({name:'Nome local',avatarUrl:'https://example.test/avatar.png'}),appAuth:{subscribe(fn){listener=fn;fn({authenticated:false});}}};
const document={getElementById(id){if(!nodes.has(id))nodes.set(id,{value:'',addEventListener(){}});return nodes.get(id);}};
vm.runInNewContext(source,{window,document,localStorage});
assert.equal(saved.size,0,'não inventa conta lembrada para convidado');
listener({authenticated:true,user:{id:'a',name:'Nome',email:'a@example.com',access_token:'never-store'}});
const first=JSON.parse(saved.get('sc_remembered_login_v1'));
assert.deepEqual(Object.keys(first).sort(),['avatarUrl','email','id','name']);
assert.equal(first.name,'Nome local');assert.equal(first.email,'a@example.com');
listener({authenticated:false});assert.equal(JSON.parse(saved.get('sc_remembered_login_v1')).id,'a','logout preserva somente a identificação');
listener({authenticated:true,user:{id:'b',email:'b@example.com'}});
assert.equal(JSON.parse(saved.get('sc_remembered_login_v1')).id,'b','troca de conta substitui a identificação lembrada');
console.log('login-signin.test.js: OK');

for(const [host,allowed] of [['simplificandocifras.netlify.app',false],['roudysite.com',false],['deploy-preview-127--simplificandocifras.netlify.app',true],['localhost',true],['127.0.0.1',true],['deploy-preview-1--other.netlify.app',false]]){
  const elements=new Map();
  const doc={getElementById(id){if(!elements.has(id))elements.set(id,{value:'',validity:{valid:true},addEventListener(){},setAttribute(){}});return elements.get(id);},querySelector(){return {setAttribute(){}}}};
  const win={location:{hostname:host,search:'?preview=1'},appAuth:{subscribe(){}}};
  vm.runInNewContext(source,{window:win,document:doc,localStorage});
  assert.equal(elements.get('login-signin-passwordless').hidden,!allowed,host);
  win.roudySignIn.passwordless();
  assert.equal(elements.get('login-signin-title')?.textContent,allowed?'Entrar sem senha':undefined,'somente hosts de desenvolvimento ativam a ação');
}
