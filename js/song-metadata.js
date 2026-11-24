// Metadados explícitos da fonte; nunca deduzir cantor a partir do compositor.
(function(global){
  'use strict';
  function classify(line){
    const text=String(line||'').trim();
    let m=text.match(/^(?:composi[çc][ãa]o(?:\s+de)?|compositor(?:es)?)\s*:\s*(.{1,300})$/i);
    if(m)return {field:'composer',value:m[1].trim()};
    m=text.match(/^(?:artista|cantor(?:a)?|int[ée]rprete)\s*:\s*(.{1,160})$/i);
    if(m)return {field:'artist',value:m[1].trim()};
    m=text.match(/^(?:(?:\[?ritmo padr[ãa]o\]?|bpm|andamento)\s*:?\s*)?(\d{2,3})\s*(?:bpm|batidas por minuto)$/i)||text.match(/^(?:bpm|andamento)\s*:\s*(\d{2,3})$/i);
    if(m&&+m[1]>=30&&+m[1]<=240)return {field:'bpm',value:+m[1]};
    if(/^\[?ritmo padr[ãa]o\]?\s*$/i.test(text))return {field:'tempoLabel'};
    return null;
  }
  function repair(input){
    if(!input||typeof input!=='object')return input;
    const sheet=input.fullChordSheet;if(!sheet||typeof sheet.content!=='string')return input;
    if(sheet.sections!=null&&(!Array.isArray(sheet.sections)||sheet.sections.some(s=>!s||typeof s!=='object'||(s.linhas!=null&&(!Array.isArray(s.linhas)||s.linhas.some(l=>!l||typeof l!=='object'))))))return input;
    const candidates={artist:new Set(),composer:new Set(),bpm:new Set()};
    const evidence=new Map(),authoritative=sheet.bpmEvidenceText??sheet.sourceContent??sheet.content;
    String(authoritative).split(/\r?\n/).forEach(line=>{const m=classify(line);if(m?.field==='bpm'&&sheet.source!=='model_knowledge'){candidates.bpm.add(m.value);evidence.set(m.value,line.trim().slice(0,200));}});
    const record=line=>{const m=classify(line);if(m&&m.field!=='bpm'&&candidates[m.field])candidates[m.field].add(m.value);};
    sheet.content.split(/\r?\n/).forEach(record);
    for(const section of sheet.sections||[])for(const line of section.linhas||[])if(!line.acordes?.length)record(line.letra);
    const result={...input};
    for(const field of Object.keys(candidates))if(candidates[field].size===1&&!result[field])result[field]=[...candidates[field]][0];
    if(candidates.bpm.size===1&&candidates.bpm.has(result.bpm)){
      const url=input.bpmSource?.value===result.bpm?input.bpmSource?.url:input.sourceInfo?.url;
      result.bpmSource={kind:'explicit_sheet',value:result.bpm,evidence:evidence.get(result.bpm),sourceType:sheet.source||'saved_sheet',...(typeof url==='string'&&url.startsWith('https://')?{url:url.slice(0,2000)}:{})};
    }
    const remove=line=>{const m=classify(line);if(!m)return false;if(m.field==='tempoLabel')return candidates.bpm.size===1;return candidates[m.field].size===1;};
    const content=sheet.content.split(/\r?\n/).filter(line=>!remove(line)).join('\n').trim();
    const sections=(sheet.sections||[]).map(section=>({...section,linhas:(section.linhas||[]).filter(line=>line.acordes?.length||!remove(line.letra))})).filter(section=>section.linhas.length||!remove(section.nome));
    if(content!==sheet.content||JSON.stringify(sections)!==JSON.stringify(sheet.sections||[]))result.fullChordSheet={...sheet,sourceContent:sheet.sourceContent||sheet.content,content,sections};
    return result;
  }
  function trustedBpm(data){const proof=data?.bpmSource,match=classify(proof?.evidence);return proof?.kind==='explicit_sheet'&&proof.sourceType!=='model_knowledge'&&match?.field==='bpm'&&match.value===proof.value&&proof.value===data.bpm?data.bpm:null;}
  global.songMetadata=Object.freeze({repair,classify,trustedBpm});
})(window);
