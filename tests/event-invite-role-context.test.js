const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8'),source=html.slice(html.indexOf('let eventInviteSelection=null'),html.indexOf('let eventParticipantsMorphCleanup'));
const roles=['Vocal','Backing Vocal','Guitarra','Violão','Baixo','Bateria','Teclado','Ukulele','Violino'];
const nodes={},sheet={innerHTML:''},calls=[],event={id:'event',title:'Ensaio',remoteVersion:1};
const layer={querySelector:()=>sheet,classList:{add(){},contains:()=>true}};
const context={window:{},PROFILE_MUSICAL_ROLES:roles,eventModel:{ROLES:roles,canEditShared:()=>true},currentAuthState:{authenticated:true,user:{id:'owner'}},appCurrentUser:{id:'owner'},eventPermissionActor:()=>({id:'owner'}),findEvent:()=>event,ensureEventActionLayer:()=>layer,eventShareData:()=>({}),roudyEventShare:{cardMarkup:()=>'<article>Prévia preservada</article>'},eventEsc:String,attrJs:JSON.stringify,musicalRoleIcon:()=>'',showToast(){},requestAnimationFrame:fn=>fn(),document:{getElementById:id=>id==='event-action-layer'?layer:nodes[id]||null,querySelectorAll:()=>[]},closeEventActionLayer(){},setTimeout:fn=>fn(),eventUserInvites:{openSearchSheet:(id,options)=>calls.push(['search',id,options.role])},eventCollaboration:{createInvitation:async(id,text,role)=>{calls.push(['link',id,role]);return {token:'token',eventTitle:'Ensaio'};}},location:{origin:'https://roudy.test',pathname:'/'},URL,navigator:{share:async()=>{}},appPrompt(){}};
vm.createContext(context);vm.runInContext(source,context);
(async()=>{
 context.openEventInviteSheet('event');
 assert.equal((sheet.innerHTML.match(/Adicionar pessoa ao evento/g)||[]).length,1);
 assert(!sheet.innerHTML.includes('Convidar como vocalista'));
 assert(sheet.innerHTML.indexOf('<h3>')<sheet.innerHTML.indexOf('id="event-invite-role"'));
 assert(sheet.innerHTML.indexOf('id="event-invite-role"')<sheet.innerHTML.indexOf('event-invite-actions'));
 assert(sheet.innerHTML.includes('role:getEventInviteRole('),'QR consulta a mesma função');
 assert.equal((sheet.innerHTML.match(/onclick="shareEventMemberInvitation/g)||[]).length,2,'Compartilhar e Mais mantêm o mesmo contrato');
 nodes['event-invite-role-icon']={innerHTML:''};nodes['event-invite-role-name']={textContent:''};nodes['event-invite-role']={};
 for(const role of roles){
  context.selectEventInviteRole(role);
  assert.equal(context.getEventInviteRole('event'),role);
  assert.equal(nodes['event-invite-role-name'].textContent,context.eventInviteRoleDisplayName(role));
  assert(nodes['event-invite-role-icon'].innerHTML.includes('svg'));
  context.openEventMemberSearch('event');assert.equal(calls.at(-1)[2],role);
  await context.shareEventMemberInvitation('event');assert.equal(calls.at(-1)[2],role);
 }
 context.selectEventInviteRole('Liderança');assert.equal(context.getEventInviteRole('event'),'Violino');
 context.currentAuthState.user.id='other';context.selectEventInviteRole('Vocal');assert.equal(nodes['event-invite-role-name'].textContent,'Violinista (violino)','outra conta não altera a seleção');
 console.log('event-invite-role-context: OK (9 funções, ícone/nome, busca, links, QR, conta e hierarquia)');
})().catch(error=>{console.error(error);process.exitCode=1;});
