(function(global){
  'use strict';
  const clone=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));
  function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){const result={};Object.keys(value).sort().forEach(key=>{if(value[key]!==undefined)result[key]=stable(value[key]);});return result;}return value;}
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  // Treat all mutually dependent musical representations as one unit.
  // Never combine a summary/transposition with unrelated lyrics from another edit.
  const music=new Set(['blocos','sections','harmonicSummary','fullChordSheet','editorData','tablature','key','originalKey','capo']);
  const ignored=new Set(['librarySync','updatedAt','createdAt']);
  function resolve(base,local,remote){
    if(!base||typeof base!=='object')return {song:clone(remote),preserve:true,merged:false};
    const keys=new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)].filter(key=>!ignored.has(key)));
    const groups=[...keys].filter(key=>!music.has(key)).map(key=>[key]);
    const musical=[...keys].filter(key=>music.has(key));if(musical.length)groups.push(musical);
    const result=clone(remote);let changed=false;
    for(const group of groups){
      const pick=value=>Object.fromEntries(group.filter(key=>Object.hasOwn(value,key)).map(key=>[key,value[key]]));
      const b=pick(base),l=pick(local),r=pick(remote),localChanged=!equal(b,l),remoteChanged=!equal(b,r);
      if(localChanged&&remoteChanged&&!equal(l,r))return {song:clone(remote),preserve:true,merged:false};
      if(localChanged&&!remoteChanged){for(const key of group){if(Object.hasOwn(local,key))result[key]=clone(local[key]);else delete result[key];}changed=true;}
    }
    return {song:result,preserve:false,merged:changed};
  }
  global.librarySyncPolicy=Object.freeze({resolve});
})(window);
