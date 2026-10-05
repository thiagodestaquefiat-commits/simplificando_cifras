(function(global){
  'use strict';
  let sequence=0,timer;
  const owner=()=>global.appAuth?.getState?.().user?.id;
  function attach(){
    clearTimeout(timer);const seq=++sequence,account=owner(),label=document.querySelector('label[for="profile-name"]');if(!label)return;
    const box=document.getElementById('profile-username')?.closest('.profile-username');if(!box)return;
    const input=box.querySelector('input'),status=box.querySelector('#username-status'),indicator=box.querySelector('.username-indicator'),button=box.querySelector('button');
    const active=()=>account===owner()&&box.isConnected&&seq===sequence;
    let fixed=null,checkSequence=0,available=null;
    function paint(state,text){box.dataset.status=state;indicator.textContent=state==='available'?'✓':state==='unavailable'?'✕':'…';status.textContent=text;}
    function lock(value){fixed=value;input.value=value;input.disabled=false;input.readOnly=true;button.hidden=true;paint('available','Nome confirmado e fixo. Não poderá ser alterado.');}
    if(!global.appAuth?.getState?.().authenticated){button.hidden=true;paint('neutral','Entre com Google para escolher um nome único e fixo.');return;}
    global.eventCollaboration.getUsername().then(data=>{if(!active())return;if(data.username)lock(data.username);else{input.disabled=false;paint('neutral','Use 3 a 24 letras sem acento, números ou _. Após confirmar, será fixo.');}}).catch(error=>{if(active()){button.hidden=true;paint('neutral',error.status===404?'A escolha do nome de usuário ainda precisa ser disponibilizada no servidor.':'Não foi possível consultar sua conta. Reabra o perfil para tentar novamente.');}});
    input.addEventListener('input',()=>{
      clearTimeout(timer);const check=++checkSequence;available=null;button.disabled=true;
      const value=input.value.trim().toLowerCase();
      if(!/^[a-z0-9_]{3,24}$/.test(value)){paint('unavailable','Use de 3 a 24 letras sem acento, números ou _.');return;}
      paint('neutral','Verificando disponibilidade…');
      timer=setTimeout(async()=>{try{
        const result=await global.eventCollaboration.checkUsername(value);
        if(!active()||check!==checkSequence||fixed)return;
        available=result.available===true?value:null;button.disabled=!available;
        paint(available?'available':'unavailable',available?'Nome disponível. Confirme para reservá-lo definitivamente.':'Este nome já está em uso. Escolha outro.');
      }catch(error){if(active()&&check===checkSequence){paint(error.status===400?'unavailable':'neutral',error.message||'Não foi possível verificar. Tente novamente.');}}},350);
    });
    button.addEventListener('click',async()=>{
      const value=input.value.trim().toLowerCase();if(!active()||fixed||available!==value)return;
      if(!global.appConfirm('Definir @'+value+' como seu nome de usuário? Depois de confirmar, ele não poderá ser alterado.'))return;
      button.disabled=true;input.disabled=true;++checkSequence;paint('neutral','Confirmando…');
      try{const result=await global.eventCollaboration.claimUsername(value);if(active())lock(result.username);}
      catch(error){if(active()){
        available=null;input.disabled=false;paint(error.status===409?'unavailable':'neutral',error.message||'Não foi possível confirmar.');
        if(error.code==='nome_usuario_fixo'){try{const current=await global.eventCollaboration.getUsername();if(active()&&current.username)lock(current.username);}catch(_error){}}
      }}
    });
  }
  global.profileUsername=Object.freeze({attach});
})(window);
