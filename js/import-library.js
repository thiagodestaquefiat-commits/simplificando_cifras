(function(global){
  "use strict";

  const FORMAT="simplificando-cifras-exportacao",MAX_BACKUP_BYTES=25*1024*1024;
  const clone=value=>global.structuredClone?global.structuredClone(value):JSON.parse(JSON.stringify(value));
  function parseStored(value){
    if(Array.isArray(value))return value;
    if(typeof value!=="string")return null;
    try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:null;}catch(_error){return null;}
  }

  function extractSongs(payload){
    if(!payload||typeof payload!=="object"||payload.formato!==FORMAT||Number(payload.versao)!==1)throw new Error("Este arquivo não é um backup válido do ROUDY.");
    const session=payload.origens?.sessaoAtual?.musicas;
    if(Array.isArray(session))return {songs:session,source:"sessaoAtual"};
    const raw=payload.origens?.armazenamentoUsuario?.armazenamentoBruto||{};
    for(const key of ["sc_songs_v1","cifras_musicas_v1","sc_musicas_v2"]){const songs=parseStored(raw[key]);if(songs)return {songs,source:`armazenamentoBruto.${key}`};}
    const known=payload.origens?.armazenamentoUsuario?.dadosConhecidos?.musicas||{};
    for(const key of ["sc_songs_v1","cifras_musicas_v1","sc_musicas_v2"]){const songs=parseStored(known[key]);if(songs)return {songs,source:`dadosConhecidos.${key}`};}
    throw new Error("O backup não contém uma biblioteca de músicas restaurável.");
  }

  function identity(song){
    const clientId=String(song?.librarySync?.clientId||"").trim();
    const localId=song&&song.id!==null&&song.id!==undefined?String(song.id):"";
    return {clientId,localId};
  }

  function musicalPayload(song){const copy=clone(song);delete copy.librarySync;return copy;}
  function sameContent(left,right){return JSON.stringify(musicalPayload(left))===JSON.stringify(musicalPayload(right));}
  function matchingIndexes(collection,candidate){
    const target=identity(candidate),matches=new Set();
    collection.forEach((song,index)=>{const current=identity(song);if(target.clientId&&current.clientId===target.clientId)matches.add(index);if(target.localId&&current.localId===target.localId)matches.add(index);});
    return [...matches];
  }

  function plan(payload,currentSongs){
    const extracted=extractSongs(payload),current=Array.isArray(currentSongs)?currentSongs:[],accepted=[],existing=[],conflicts=[],invalid=[],seen=[];
    extracted.songs.forEach((rawSong,index)=>{
      try{
        if(!rawSong||typeof rawSong!=="object"||Array.isArray(rawSong))throw new Error("Música inválida");
        const id=identity(rawSong);if(!id.clientId&&!id.localId)throw new Error("Identificador ausente");
        const stableRestoreTime=rawSong.updatedAt||rawSong.createdAt||"1970-01-01T00:00:00.000Z";
        const song=global.songModel.create(clone(rawSong),{now:stableRestoreTime});
        const duplicateInBackup=matchingIndexes(seen,song);
        if(duplicateInBackup.length){
          const prior=seen[duplicateInBackup[0]];
          if(!sameContent(prior,song))conflicts.push({index,title:song.title,reason:"duplicada_no_backup",backupSong:clone(song)});
          else existing.push({index,title:song.title,reason:"duplicada_no_backup"});
          return;
        }
        seen.push(song);
        const matches=matchingIndexes(current,song);
        if(matches.length>1){conflicts.push({index,title:song.title,reason:"identificadores_ambiguos",backupSong:clone(song)});return;}
        if(matches.length===1){
          const local=current[matches[0]];
          if(sameContent(local,song))existing.push({index,title:song.title,reason:"ja_existente"});
          else conflicts.push({index,title:song.title,reason:"conteudo_diferente",localIndex:matches[0],backupSong:clone(song)});
          return;
        }
        accepted.push(song);
      }catch(error){invalid.push({index,message:String(error.message||error)});}
    });
    return Object.freeze({format:payload.formato,version:payload.versao,source:extracted.source,total:extracted.songs.length,current:current.length,newSongs:accepted.length,existing:existing.length,conflicts:conflicts.length,invalid:invalid.length,accepted,existingItems:existing,conflictItems:conflicts,invalidItems:invalid});
  }

  function parse(text,currentSongs){
    if(typeof text!=="string"||!text.trim())throw new Error("Selecione um arquivo de backup JSON.");
    if(new Blob([text]).size>MAX_BACKUP_BYTES)throw new Error("O backup excede o limite de 25 MB.");
    let payload;try{payload=JSON.parse(text);}catch(_error){throw new Error("O arquivo selecionado não contém JSON válido.");}
    return plan(payload,currentSongs);
  }

  function apply(restorePlan,currentSongs){
    if(!restorePlan||!Array.isArray(restorePlan.accepted))throw new Error("Revise o backup antes de restaurar.");
    const current=Array.isArray(currentSongs)?currentSongs:[];
    const songs=[...current.map(clone),...restorePlan.accepted.map(clone)];
    return {songs,restored:restorePlan.accepted.length,existing:restorePlan.existing,conflicts:restorePlan.conflicts,invalid:restorePlan.invalid};
  }

  global.libraryImporter=Object.freeze({format:FORMAT,maxBackupBytes:MAX_BACKUP_BYTES,extractSongs,plan,parse,apply,sameContent,identity});
})(window);
