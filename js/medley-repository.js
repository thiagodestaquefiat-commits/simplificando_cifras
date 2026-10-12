(function(global){
  "use strict";
  const GUEST_KEY="sc_guest_medley_v1",OWNER_KEY="sc_personal_medley_caches_v1";
  const clone=value=>JSON.parse(JSON.stringify(value));
  function caches(){const value=global.storage.get(OWNER_KEY,{});return value&&typeof value==="object"&&!Array.isArray(value)?value:{};}
  function load(ownerId){
    if(ownerId){const value=caches()[String(ownerId)];return Array.isArray(value)?clone(value):[];}
    const guest=global.storage.get(GUEST_KEY,null);if(Array.isArray(guest))return guest;
    const legacy=global.demoLibrary.loadMedley(global.storage,false);
    // Older builds wrote the active account's medley to the anonymous key too.
    // Keep that data in its owner cache, without exposing it to guests.
    const belongsToAccount=legacy.length&&Object.values(caches()).some(value=>Array.isArray(value)&&JSON.stringify(value)===JSON.stringify(legacy));
    const initial=belongsToAccount?[]:legacy;
    global.storage.set(GUEST_KEY,initial);return clone(initial);
  }
  function save(ownerId,blocks){
    const value=Array.isArray(blocks)?clone(blocks):[];
    if(!ownerId)return global.storage.set(GUEST_KEY,value);
    const values=caches();values[String(ownerId)]=value;return global.storage.set(OWNER_KEY,values);
  }
  // Sair da conta: apaga do aparelho o medley DESTA conta.
  function purgeOwner(ownerId){const owner=String(ownerId||"").trim();if(!owner)return false;const values=caches();if(!Object.prototype.hasOwnProperty.call(values,owner))return true;delete values[owner];return global.storage.set(OWNER_KEY,values);}
  global.medleyRepository=Object.freeze({load,save,purgeOwner});
})(window);
