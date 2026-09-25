(function(global){
  'use strict';
  const INSTRUMENTS=new Set(['guitar','bass','ukulele','violin','other']);
  function text(value){return value==null?'':String(value).replace(/\r\n?/g,'\n');}
  function normalize(value){
    if(!value||typeof value!=='object')return null;
    const sections=(Array.isArray(value.sections)?value.sections:[]).map((section,index)=>({
      title:text(section?.title).trim().slice(0,80)||`Parte ${index+1}`,
      content:text(section?.content).trimEnd()
    })).filter(section=>section.content.trim());
    if(!sections.length)return null;
    const instrument=INSTRUMENTS.has(value.instrument)?value.instrument:'guitar';
    return {instrument,tuning:text(value.tuning).trim().slice(0,100)||(instrument==='bass'?'E A D G':instrument==='ukulele'?'G C E A':'E A D G B E'),capo:Math.max(0,Math.min(12,Number(value.capo)||0)),sections};
  }
  function parseEditor(value){
    const lines=text(value).split('\n');let current={title:'Tablatura',content:[]};const sections=[];
    const push=()=>{const content=current.content.join('\n').trimEnd();if(content.trim())sections.push({title:current.title,content});};
    lines.forEach(line=>{const heading=line.match(/^\s*\[([^\]]+)]\s*$/);if(heading){push();current={title:heading[1].trim()||'Tablatura',content:[]};}else current.content.push(line);});push();return sections;
  }
  function serializeEditor(value){const tab=normalize(value);return tab?tab.sections.map(section=>`[${section.title}]\n${section.content}`).join('\n\n'):'';}
  global.tablature=Object.freeze({normalize,parseEditor,serializeEditor});
})(window);
