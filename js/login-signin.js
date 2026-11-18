(function(global){
  'use strict';
  const KEY='sc_remembered_login_v1',el=id=>document.getElementById(id);
  const developerPreview=/^(localhost|127\.0\.0\.1|deploy-preview-\d+--simplificandocifras\.netlify\.app)$/.test(global.location?.hostname||'');
  el('login-signin-passwordless').hidden=!developerPreview;
  let mode='password',pending=false,generation=0;
  const safeAvatar=value=>typeof value==='string'&&(/^(data:image\/(png|jpeg|webp|gif|avif);base64,)/i.test(value)||/^https:\/\//i.test(value))?value:null;
  function read(){try{const value=JSON.parse(localStorage.getItem(KEY)||'null');return value&&value.id&&typeof value.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)?value:null;}catch(_){return null;}}
  function remember(state){
    if(!state?.authenticated||!state.user?.id||!state.user.email)return;
    const profile=typeof global.accountProfile==='function'?global.accountProfile():state.user;
    const value={id:String(state.user.id),email:String(state.user.email),name:String(profile.name||state.user.name||'Sua conta').slice(0,120),avatarUrl:safeAvatar(profile.avatarUrl)};
    try{localStorage.setItem(KEY,JSON.stringify(value));}catch(_){}
  }
  function savedAccount(value){
    el('login-saved-account').hidden=!value;el('login-signin-other').hidden=!value;
    const avatar=el('login-saved-avatar');avatar.replaceChildren();
    if(!value)return;
    el('login-saved-name').textContent=value.name||'Sua conta';el('login-saved-email').textContent=value.email;
    const fallback=()=>{avatar.textContent=String(value.name||value.email).trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();};
    fallback();const source=safeAvatar(value.avatarUrl);
    if(source){const image=document.createElement('img');image.alt='';image.src=source;image.addEventListener('error',fallback,{once:true});avatar.replaceChildren(image);}
    el('login-signin-email').value=value.email;
  }
  function update(){
    const email=el('login-signin-email'),password=el('login-signin-password'),button=el('login-signin-submit');
    button.disabled=pending||!email.value.trim()||!email.validity.valid||(mode==='password'&&!password.value);
    el('login-signin-passwordless').disabled=pending;
  }
  function setMode(value){
    mode=value;const password=el('login-signin-password');password.value='';password.type='password';password.required=mode==='password';password.disabled=mode!=='password';
    el('login-signin-password-field').hidden=mode!=='password';
    const eye=document.querySelector('.login-signin-eye');eye.setAttribute('aria-pressed','false');eye.setAttribute('aria-label','Mostrar senha');
    el('login-signin-title').textContent=mode==='password'?'Entrar no ROUDY':'Entrar sem senha';
    el('login-signin-submit').textContent=mode==='password'?'Entrar':'Enviar link de acesso';
    el('login-signin-passwordless').textContent=mode==='password'?'Entrar sem senha':'Usar minha senha';
    el('login-signin-feedback').textContent='';update();
  }
  function open(){
    generation++;pending=false;el('login-signin-form').reset();setMode('password');savedAccount(read());update();
    document.querySelector('.login-gate-card').hidden=true;el('login-signin-page').hidden=false;
    el('login-gate').dataset.page='signin';el('login-gate').scrollTop=0;el('login-signin-title').focus({preventScroll:true});
  }
  function back(){
    generation++;pending=false;el('login-signin-form').reset();setMode('password');
    el('login-signin-page').hidden=true;document.querySelector('.login-gate-card').hidden=false;delete el('login-gate').dataset.page;
    document.querySelector('.login-enter-button').focus({preventScroll:true});
  }
  function other(){savedAccount(null);el('login-signin-email').value='';el('login-signin-password').value='';el('login-signin-feedback').textContent='';update();el('login-signin-email').focus();}
  function togglePassword(){const password=el('login-signin-password'),show=password.type==='password';password.type=show?'text':'password';const button=document.querySelector('.login-signin-eye');button.setAttribute('aria-pressed',String(show));button.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');}
  async function submit(event){
    event.preventDefault();const form=event.currentTarget;if(pending||!form.reportValidity())return;
    const current=++generation,usedMode=mode,email=el('login-signin-email').value.trim();pending=true;update();el('login-signin-submit').textContent=usedMode==='password'?'Entrando…':'Enviando…';el('login-signin-feedback').textContent='';
    try{
      if(usedMode==='password'){await global.appAuth.signInWithPassword(email,el('login-signin-password').value);if(typeof global.continueWithoutLogin==='function')global.continueWithoutLogin();}
      else await global.appAuth.signInWithEmail(email,{shouldCreateUser:false});
      if(current!==generation)return;
      el('login-signin-password').value='';
      if(usedMode!=='password')el('login-signin-feedback').textContent='Se o e-mail estiver cadastrado, você receberá um link para entrar no ROUDY.';
    }catch(error){if(current===generation)el('login-signin-feedback').textContent=error.message||'Não foi possível entrar. Tente novamente.';}
    finally{if(current===generation){pending=false;el('login-signin-submit').textContent=usedMode==='password'?'Entrar':'Enviar link de acesso';update();}}
  }
  el('login-signin-form').addEventListener('input',update);
  el('login-signin-form').addEventListener('change',update);
  global.roudySignIn=Object.freeze({open,back,other,togglePassword,submit,passwordless(){if(developerPreview&&!pending)setMode(mode==='password'?'email':'password');}});
  global.appAuth.subscribe(state=>{remember(state);if(state.authenticated)el('login-signin-password').value='';});
})(window);
