const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const handlers={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../service-worker.js'),'utf8'),{URL,self:{location:{origin:'https://roudy.test'},addEventListener:(name,handler)=>handlers[name]=handler}});
for(const url of ['/api/collaboration/me/cover','/api/collaboration/events/event-1/messages/message-1/audio']){
  let intercepted=false;handlers.fetch({request:{method:'GET',url:'https://roudy.test'+url},respondWith(){intercepted=true;}});assert.equal(intercepted,false,'dados privados não entram no cache do service worker');
}
console.log('service-worker-private-resources.test.js: OK');
