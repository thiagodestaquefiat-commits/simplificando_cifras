(function(global){
  'use strict';
  const INSTRUMENTS=new Set(['guitar','bass','ukulele','violin','other','unknown']);
  function text(value){return value==null?'':String(value).replace(/\r\n?/g,'\n');}
  function normalize(value){
    if(!value||typeof value!=='object')return null;
    const sections=(Array.isArray(value.sections)?value.sections:[]).map((section,index)=>({
      title:text(section?.title).trim().slice(0,80)||`Parte ${index+1}`,
      content:text(section?.content).trimEnd(),
      ...(section?.instrument?{instrument:section.instrument}:{}),
      ...(section?.tuning?{tuning:text(section.tuning).trim()}:{}),
      ...(section?.detected?{detected:true}:{})
    })).filter(section=>section.content.trim());
    if(!sections.length)return null;
    const instrument=INSTRUMENTS.has(value.instrument)?value.instrument:'guitar';
    return {instrument,tuning:text(value.tuning).trim().slice(0,100)||(instrument==='bass'?'E A D G':instrument==='ukulele'?'G C E A':instrument==='unknown'?'':instrument==='violin'?'G D A E':'E A D G B E'),capo:Math.max(0,Math.min(12,Number(value.capo)||0)),sections};
  }
  function parseEditor(value){
    const lines=text(value).split('\n');let current={title:'Tablatura',content:[]};const sections=[];
    const push=()=>{const content=current.content.join('\n').trimEnd();if(content.trim())sections.push({title:current.title,content});};
    lines.forEach(line=>{const heading=line.match(/^\s*\[([^\]]+)]\s*$/);if(heading){push();current={title:heading[1].trim()||'Tablatura',content:[]};}else current.content.push(line);});push();return sections;
  }
  function serializeEditor(value){const tab=normalize(value);return tab?tab.sections.map(section=>`[${section.title}]\n${section.content}`).join('\n\n'):'';}
  const TUNINGS=[
    ['guitar','Padrão',['E','A','D','G','B','E']],
    ['guitar','Drop D',['D','A','D','G','B','E']],
    ['guitar','Drop C',['C','G','C','F','A','D']],
    ['guitar','Drop C#',['C#','G#','C#','F#','A#','D#']],
    ['guitar','Drop B',['B','F#','B','E','G#','C#']],
    ['guitar','D padrão',['D','G','C','F','A','D']],
    ['guitar','C padrão',['C','F','Bb','Eb','G','C']],
    ['guitar','Meio tom abaixo',['Eb','Ab','Db','Gb','Bb','Eb']],
    ['guitar','DADGAD',['D','A','D','G','A','D']],
    ['guitar','Open G',['D','G','D','G','B','D']],
    ['guitar','Open D',['D','A','D','F#','A','D']],
    ['bass','Padrão',['E','A','D','G']],
    ['bass','Drop D',['D','A','D','G']],
    ['bass','Drop C',['C','G','C','F']],
    ['bass','5 cordas',['B','E','A','D','G']],
    ['bass','6 cordas',['B','E','A','D','G','C']],
    ['ukulele','Padrão / Low G',['G','C','E','A']],
    ['ukulele','D',['A','D','F#','B']],
    ['ukulele','Barítono',['D','G','B','E']]
  ];
  const pitch=n=>({C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11})[n];
  function lineNote(line){
    const m=text(line).match(/^\s*([A-Ga-g])([#b♯♭]?)(?:\d)?\s*[|:]\s*([-\d|/\\hHpPbBrRtTxX~^(). <>+=]+)\s*$/);
    return m&&m[3].includes('-')?m[1].toUpperCase()+m[2].replace('♯','#').replace('♭','b'):null;
  }
  function identify(notes){
    const key=notes.map(pitch).join(','),matches=TUNINGS.filter(t=>t[2].map(pitch).join(',')===key||[...t[2]].reverse().map(pitch).join(',')===key);
    const kinds=new Set(matches.map(t=>t[0]));
    // D G B E também pode ser um fragmento de quatro cordas da guitarra.
    const ambiguous=matches.some(t=>t[0]==='ukulele'&&t[1]==='Barítono');
    return kinds.size===1&&!ambiguous?{instrument:matches[0][0],tuning:matches[0][2].join(' ')+' · '+matches[0][1]}:{instrument:'unknown',tuning:notes.join(' ')};
  }
  function metadata(value){
    const raw=text(value),instrument=raw.match(/(?:instrumento|instrument)\s*:\s*([^\n]+)/i)?.[1]?.toLowerCase();
    const kind=instrument&&(/uk[ue]lele/.test(instrument)?'ukulele':/baixo|bass/.test(instrument)?'bass':/violino|violin/.test(instrument)?'violin':/viol[aã]o|guitarra|guitar/.test(instrument)?'guitar':null);
    const tuning=raw.match(/(?:afina[cç][aã]o|tuning)\s*:\s*([^\n]+)/i)?.[1]?.trim();
    let result=null;
    if(tuning){const notes=(tuning.match(/[A-G](?:#|b|♯|♭)?(?:\d)?/g)||[]).map(n=>n.replace(/\d/g,'').replace('♯','#').replace('♭','b'));if(notes.length>=4)result=identify(notes);}
    return {instrument:kind||result?.instrument||null,tuning:tuning||null,explicit:Boolean(kind)};
  }
  function extract(value){
    const lines=text(value).split('\n'),removed=new Set(),sections=[];
    const firstTab=lines.findIndex(line=>lineNote(line));let hint=metadata(lines.slice(0,firstTab<0?lines.length:firstTab).join('\n'));
    let heading='Tablatura';
    for(let i=0;i<lines.length;i++){
      const localHint=metadata(lines[i]);if(localHint.instrument||localHint.tuning)hint={instrument:localHint.explicit?localHint.instrument:hint.explicit?hint.instrument:localHint.instrument||hint.instrument,tuning:localHint.tuning||hint.tuning,explicit:localHint.explicit||hint.explicit};
      const label=lines[i].match(/^\s*\[([^\]]+)]/i)||lines[i].match(/^\s*(?:\[([^\]]+)\]|((?:solo|riff|intro|introdu[cç][aã]o|interl[uú]dio|parte)(?:\s+[^|]*)?))\s*:?\s*$/i);
      if(label)heading=(label[1]||label[2]).replace(/:$/,'').trim();
      if(!lineNote(lines[i]))continue;
      const start=i,notes=[];while(i<lines.length&&lineNote(lines[i])){notes.push(lineNote(lines[i]));i++;}i--;
      if(notes.length<4||notes.length>7)continue;
      const found=identify(notes),instrument=hint.instrument&&hint.instrument!=='unknown'?hint.instrument:found.instrument;
      sections.push({title:heading,content:lines.slice(start,i+1).join('\n'),instrument,tuning:hint.tuning||found.tuning,detected:true});
      for(let j=start;j<=i;j++)removed.add(j);
    }
    return {content:lines.filter((_line,i)=>!removed.has(i)).join('\n').trim(),sections};
  }
  function prepareSong(song){
    if(!song||!song.fullChordSheet?.content)return song;
    const result=extract(song.fullChordSheet.content);if(!result.sections.length)return song;
    const previous=normalize(song.tablature),sections=[...(previous?.sections||[])],seen=new Map();
    for(const section of result.sections){const key=JSON.stringify([section.title,section.content]),count=(seen.get(key)||0)+1;seen.set(key,count);if((previous?.sections||[]).filter(s=>s.content===section.content&&s.title===section.title).length<count)sections.push(section);}
    const capo=previous?.capo??Number(String(song.capo||'').match(/\d{1,2}/)?.[0]||0);
    const tablature=normalize({...previous,capo,instrument:previous?.instrument||result.sections[0].instrument,tuning:previous?.tuning||result.sections[0].tuning,sections});
    return {...song,fullChordSheet:result.content?{...song.fullChordSheet,content:result.content,sections:[]}:null,tablature};
  }
  function compatible(value,instrument){
    const tab=normalize(value);if(!tab)return null;
    const wanted=['guitar','bass','ukulele','violin'].includes(instrument)?instrument:null;
    if(!wanted)return null;
    const sections=tab.sections.filter(s=>(s.instrument||tab.instrument)===wanted);
    return sections.length?{...tab,instrument:wanted,tuning:sections[0].tuning||tab.tuning,sections}:null;
  }
  global.tablature=Object.freeze({normalize,parseEditor,serializeEditor,extract,prepareSong,compatible,identify});
})(window);
