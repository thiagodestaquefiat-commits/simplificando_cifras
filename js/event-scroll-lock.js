(function(global){
  'use strict';
  const view=document.getElementById('view-sd');
  if(!view)return;
  let saved=null;
  const properties=['position','top','left','width','overflow'];
  function sync(){
    if(view.style.display==='flex'){
      if(saved)return;
      const body=document.body,root=document.documentElement;
      saved={x:global.scrollX,y:global.scrollY,body:properties.map(name=>[name,body.style.getPropertyValue(name),body.style.getPropertyPriority(name)]),rootOverflow:root.style.getPropertyValue('overflow'),rootPriority:root.style.getPropertyPriority('overflow')};
      body.style.position='fixed';body.style.top=`${-saved.y}px`;body.style.left=`${-saved.x}px`;body.style.width='100%';body.style.overflow='hidden';root.style.overflow='hidden';
    }else if(saved){
      const previous=saved;saved=null;
      for(const [name,value,priority] of previous.body){if(value)document.body.style.setProperty(name,value,priority);else document.body.style.removeProperty(name);}
      if(previous.rootOverflow)document.documentElement.style.setProperty('overflow',previous.rootOverflow,previous.rootPriority);else document.documentElement.style.removeProperty('overflow');
      global.scrollTo({left:previous.x,top:previous.y,behavior:'instant'});
    }
  }
  // Observe the lifecycle rather than only the Back button: sign-out and other
  // routes may also close this view. Re-rendering an open event keeps its lock.
  new MutationObserver(sync).observe(view,{attributes:true,attributeFilter:['style']});
  sync();
})(window);
