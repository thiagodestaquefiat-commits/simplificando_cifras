const assert=require('node:assert/strict');
const {pixels,distance}=require('../js/card-bevel.js');
const width=174,height=189,radius=14,bevel=5,dpr=2,map=pixels(width,height,radius,bevel,dpr);
let affected=0;
for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
 const d=distance((x+.5)/dpr,(y+.5)/dpr,width,height,radius),alpha=map.data[(y*map.width+x)*4+3];
 if(d<=0||d>=bevel)assert.equal(alpha,0,'centro plano e exterior completamente transparentes');
 if(alpha)affected++;
}
assert.ok(affected>0&&affected<map.width*map.height*.15,'iluminação limitada à periferia');
function sample(x,y){const n=(Math.floor(y*dpr)*map.width+Math.floor(x*dpr))*4;return {color:map.data[n],alpha:map.data[n+3]};}
assert.equal(sample(50,2.5).color,255,'luz superior');assert.equal(sample(2.5,50).color,255,'luz à esquerda');
assert.equal(sample(width-2.5,50).color,0,'sombra à direita');assert.equal(sample(50,height-2.5).color,0,'sombra inferior');
assert.ok(sample(50,height-1).alpha>sample(50,height-4).alpha,'sombra decai continuamente da aresta à face plana');
assert.equal(sample(0,0).alpha,0,'canto externo não tem halo');
console.log('card-bevel.test.js: OK');
