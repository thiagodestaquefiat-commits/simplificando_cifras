/* Geometry-only diffuse bevel. No photo pixels are read or used as a height map. */
(function(global){
  'use strict';
  const cache=new Map(),pending=new Set();let frame=0;
  function distance(x,y,width,height,radius){
    const qx=Math.abs(x-width/2)-(width/2-radius),qy=Math.abs(y-height/2)-(height/2-radius);
    return -(Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius);
  }
  function heightAt(x,y,width,height,radius,bevel){
    const t=Math.max(0,Math.min(1,distance(x,y,width,height,radius)/bevel));
    return 2.4*Math.sin(t*Math.PI/2);
  }
  function pixels(width,height,radius,bevel,dpr){
    const w=Math.round(width*dpr),h=Math.round(height*dpr),data=new Uint8ClampedArray(w*h*4),step=.25;
    // Normalized distant light from upper left. Flat-face diffuse is L.z.
    const lx=-.47,ly=-.47,lz=Math.sqrt(1-2*.47*.47);
    for(let py=0;py<h;py++)for(let px=0;px<w;px++){
      const x=(px+.5)/dpr,y=(py+.5)/dpr,d=distance(x,y,width,height,radius);
      if(d<=0||d>=bevel)continue;
      const dx=(heightAt(x+step,y,width,height,radius,bevel)-heightAt(x-step,y,width,height,radius,bevel))/(2*step);
      const dy=(heightAt(x,y+step,width,height,radius,bevel)-heightAt(x,y-step,width,height,radius,bevel))/(2*step);
      const length=Math.hypot(dx,dy,1),diffuse=Math.max(0,(-dx*lx-dy*ly+lz)/length);
      const t=d/bevel,envelope=Math.sin(Math.PI*t);
      const delta=(diffuse-lz)*.48-.006*envelope;
      const alpha=Math.min(.18,Math.abs(delta))*Math.min(1,d*dpr);
      const offset=(py*w+px)*4,color=delta>0?255:0;
      data[offset]=data[offset+1]=data[offset+2]=color;data[offset+3]=Math.round(alpha*255);
    }
    return {width:w,height:h,data};
  }
  function paint(card){
    const width=card.clientWidth,height=card.clientHeight;if(!width||!height)return;
    const style=getComputedStyle(card),radius=parseFloat(style.borderTopLeftRadius),bevel=parseFloat(style.getPropertyValue('--card-bevel-width'))||5,dpr=Math.min(3,global.devicePixelRatio||1);
    const key=[width,height,radius,bevel,dpr].join(':');let source=cache.get(key);
    if(!source){
      const map=pixels(width,height,radius,bevel,dpr),canvas=document.createElement('canvas');canvas.width=map.width;canvas.height=map.height;
      const ctx=canvas.getContext('2d');if(!ctx)return;
      const image=ctx.createImageData(map.width,map.height);image.data.set(map.data);ctx.putImageData(image,0,0);source=canvas.toDataURL('image/png');
      if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,source);
    }
    card.style.setProperty('--card-bevel-map',`url("${source}")`);card.dataset.bevelReady='true';
  }
  function schedule(card){pending.add(card);if(!frame)frame=requestAnimationFrame(()=>{frame=0;for(const value of pending)paint(value);pending.clear();});}
  if(global.document){
    const cards=[...document.querySelectorAll('.roudy-search-shortcut')];
    if(global.ResizeObserver){const observer=new ResizeObserver(entries=>entries.forEach(entry=>schedule(entry.target)));cards.forEach(card=>observer.observe(card));}
    global.addEventListener('resize',()=>cards.forEach(schedule),{passive:true});cards.forEach(schedule);
  }
  if(typeof module!=='undefined')module.exports={distance,heightAt,pixels};
})(typeof window!=='undefined'?window:globalThis);
