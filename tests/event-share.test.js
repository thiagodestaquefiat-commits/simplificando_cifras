const assert=require('assert');
const eventShare=require('../js/event-share.js');

const library=new Map([
  ['1',{id:'1',title:'A alegria',artist:'3Palavrinhas',notes:'privado'}],
  ['2',{id:'2',title:'A Ele a glória',artist:'Gabriela Rocha'}],
  ['3',{id:'3',title:'A casa é sua'}],
  ['4',{id:'4',title:'Além do impossível',artist:'Toque no Altar'}],
  ['5',{id:'5',title:'Bondade de Deus',artist:'Isaias Saad'}]
]);
const event={id:'event-42',title:'Ensaio de interface',date:'2026-10-10',time:'19:30',location:'Estúdio ROUDY',members:[{name:'Privado',email:'privado@example.com'}],chat:[{body:'segredo'}],repertoire:[
  {songId:'1',shared:{title:'A alegria',artist:'3Palavrinhas',notes:'não compartilhar'},personalEdits:{user:{key:'G'}},preparation:{user:{status:'READY'}}},
  {songId:'2',shared:{}},{songId:'3',shared:{}},{songId:'4',shared:{}},{songId:'5',shared:{}}
]};

(async()=>{
  assert.strictEqual(eventShare.gradientVariant(event.id),eventShare.gradientVariant(event.id),'mesmo evento deve manter o gradiente');
  const variants=new Set(Array.from({length:30},(_,index)=>eventShare.gradientVariant(`event-${index}`)));
  assert(variants.size>1,'eventos diferentes devem poder gerar variantes diferentes');

  const data=eventShare.createData(event,id=>library.get(String(id)),{link:'https://roudy.test/?share=safe'});
  assert.strictEqual(data.visibleSongs.length,4,'o card deve mostrar no máximo quatro músicas');
  assert.strictEqual(data.remainingCount,1,'a contagem restante deve ser exata');
  assert.strictEqual(data.visibleSongs[2].artist,'','artista ausente deve ser omitido');
  assert.strictEqual(eventShare.createData({...event,location:'',eventLocation:null},id=>library.get(String(id))).location,'','local ausente deve permanecer vazio');
  assert.strictEqual(eventShare.createData({...event,repertoire:[]},id=>library.get(String(id))).visibleSongs.length,0,'repertório vazio deve ser suportado');

  const serialized=JSON.stringify(data);
  ['Privado','privado@example.com','segredo','não compartilhar','personalEdits','preparation','READY'].forEach(secret=>assert(!serialized.includes(secret),`dado privado vazou: ${secret}`));
  assert(eventShare.cardMarkup(data).includes('+ 1 música'),'markup deve exibir contagem singular correta');
  assert(!eventShare.cardMarkup(data).includes('undefined'),'markup não deve imprimir placeholders inválidos');

  const OriginalFile=global.File;
  global.File=class File {constructor(parts,name,options){this.parts=parts;this.name=name;this.type=options.type;}};
  let sharedPayload;
  const fileResult=await eventShare.share(data,{type:'image/png'},{canShare:payload=>payload.files?.length===1,share:async payload=>{sharedPayload=payload;}});
  assert.strictEqual(fileResult.kind,'file');assert.strictEqual(sharedPayload.files[0].type,'image/png');
  const textResult=await eventShare.share(data,{type:'image/png'},{canShare:()=>false,share:async payload=>{sharedPayload=payload;}});
  assert.strictEqual(textResult.kind,'text');assert.strictEqual(sharedPayload.url,data.link);
  const fallback=await eventShare.share(data,null,{});
  assert.strictEqual(fallback.kind,'fallback');assert(fallback.text.includes(data.link),'fallback deve preservar o link');
  global.File=OriginalFile;

  console.log('event-share tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
