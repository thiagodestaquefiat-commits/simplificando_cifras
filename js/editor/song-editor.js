(function (global) {
  "use strict";
  const DRAFT_KEY = "sc_song_editor_drafts_v1";
  let session = null;

  function readDrafts() { return global.storage.get(DRAFT_KEY, {}); }
  function writeDraft(model) { const drafts=readDrafts();drafts[String(model.id)]=model;return global.storage.set(DRAFT_KEY,drafts); }
  function context(target) { const section=target.closest("[data-section]");const line=target.closest("[data-line]");const chord=target.closest("[data-chord]");return {sectionId:section?.dataset.section,lineId:line?.dataset.line,chordId:chord?.dataset.chord}; }
  function render() { if(!session)return;const old=document.getElementById("song-editor");const next=global.songEditorRenderer.shell(session.state.get(),session.mode);if(old)old.replaceWith(next);else document.body.appendChild(next);next.addEventListener("click",handleClick);next.addEventListener("change",handleChange); }
  function flash(message,error) { if(typeof global.showToast==="function")global.showToast((error?"⚠️ ":"✅ ")+message); }
  function setMode(mode) { session.mode=mode;render(); }

  function close(force) {
    if(!session)return true;
    if(!force&&session.state.isDirty()&&!global.confirm("Há alterações não salvas. Descartar alterações e sair?"))return false;
    document.getElementById("song-editor")?.remove();global.removeEventListener("beforeunload",beforeUnload);session=null;return true;
  }
  function beforeUnload(event) { if(session?.state.isDirty()){event.preventDefault();event.returnValue="";} }
  function saveDraft() { const model=session.state.get();model.status="draft";if(writeDraft(model)){session.state.markSaved();flash("Rascunho salvo neste navegador");render();}else flash("Não foi possível salvar o rascunho",true); }
  function saveSong() {
    const model=session.state.get();const validation=global.songEditorValidation.song(model);
    if(!validation.valid){setMode("edit");flash(validation.errors[0].message,true);return;}
    session.mode="preview";render();
    if(!global.confirm("Confira a prévia exibida. Salvar esta música na biblioteca?"))return;
    model.status="published";model.reviewedByUser=true;model.updatedAt=new Date().toISOString();
    const legacy=global.songFormat.toLegacy(model,session.existingSong);const result=session.options.onSave?.(legacy,model);
    if(result===false){flash("Não foi possível salvar a música",true);return;}
    const drafts=readDrafts();delete drafts[String(model.id)];global.storage.set(DRAFT_KEY,drafts);session.state.markSaved();flash("Música salva");close(true);
  }
  function allChordItems(model) { const items=[];model.sections.forEach((section)=>section.lines.forEach((line)=>line.chords.forEach((item)=>items.push({section,line,item}))));return items; }
  function simplifyAll() { const model=session.state.get();let count=0;allChordItems(model).forEach(({section,line,item})=>{const suggestion=global.chordSimplifier.suggest(item.chord);if(suggestion&&global.confirm(`Acorde atual: ${item.chord}\nSugestão: ${suggestion}\n\nAplicar esta sugestão?`)){session.state.updateChord(section.id,line.id,item.id,"chord",suggestion);count+=1;}});flash(count?`${count} sugestão(ões) aplicada(s)`:"Nenhuma simplificação aplicada");render(); }
  function handleClick(event) {
    const button=event.target.closest("button[data-action]");if(!button)return;const action=button.dataset.action;const ids=context(button);
    if(action==="close")return close(false);if(action==="discard"){if(global.confirm("Descartar todas as alterações desta edição?")){session.state.restoreInitial();return close(true);}return;}if(action==="mode")return setMode(button.dataset.mode);if(action==="undo"){session.state.undo();return render();}if(action==="redo"){session.state.redo();return render();}
    if(action==="save-draft")return saveDraft();if(action==="save-song")return saveSong();if(action==="section-add"){session.state.addSection(button.dataset.type||"verse");return render();}if(action==="simplify-all")return simplifyAll();if(action==="restore-key"){session.state.restoreOriginal();return render();}if(action==="restore-initial"){if(global.confirm("Restaurar a versão inicial desta edição?")){session.state.restoreInitial();render();}return;}
    if(action==="section-up")session.state.moveSection(ids.sectionId,-1);else if(action==="section-down")session.state.moveSection(ids.sectionId,1);else if(action==="section-duplicate")session.state.duplicateSection(ids.sectionId);else if(action==="section-remove"){if(global.confirm("Remover esta seção?"))session.state.removeSection(ids.sectionId);else return;}else if(action==="line-add")session.state.addLine(ids.sectionId);else if(action==="line-remove"){if(global.confirm("Remover esta linha?"))session.state.removeLine(ids.sectionId,ids.lineId);else return;}else if(action==="chord-add")session.state.addChord(ids.sectionId,ids.lineId,"C",0);else if(action==="chord-remove")session.state.removeChord(ids.sectionId,ids.lineId,ids.chordId);else if(action==="chord-down")session.state.transposeSingle(ids.sectionId,ids.lineId,ids.chordId,-1);else if(action==="chord-up")session.state.transposeSingle(ids.sectionId,ids.lineId,ids.chordId,1);else if(action==="chord-diagram"){session.mode="preview";return render();}else if(action==="simplify-apply")session.state.updateChord(ids.sectionId,ids.lineId,ids.chordId,"chord",button.dataset.suggestion);else if(action==="simplify-dismiss"){button.closest(".se-simplify")?.remove();return;}else return;render();
  }
  function handleChange(event) {
    const target=event.target;if(!target.isConnected)return;const ids=context(target);
    if(target.dataset.meta){const field=target.dataset.meta;if(field==="currentKey"){const value=target.value.trim();if(global.multiInstrumentChordLibrary.parseChord(value))session.state.transposeSong(value);else session.state.updateMeta(field,value);}else session.state.updateMeta(field,target.type==="number"?(target.value===""?null:Number(target.value)):target.value);return;}
    if(target.dataset.sectionField){session.state.updateSection(ids.sectionId,target.dataset.sectionField,target.value);return;}
    if(target.dataset.lineField){session.state.updateLine(ids.sectionId,ids.lineId,target.value);return;}
    if(target.dataset.chordField){session.state.updateChord(ids.sectionId,ids.lineId,ids.chordId,target.dataset.chordField,target.value.trim());if(target.dataset.chordField==="chord"){const result=global.songEditorValidation.chord(target.value.trim(),session.state.get().instrument);target.classList.toggle("se-invalid",!result.valid);target.title=result.valid?"":result.message;} }
  }

  function openSongEditor(data, options) {
    if(session&&!close(false))return null;const opts=options||{};const isLegacy=data&&Array.isArray(data.blocos);const model=isLegacy?global.songFormat.fromLegacy(data):global.songFormat.normalize(data||{source:opts.source||"manual",status:"draft"},{source:opts.source||"manual"});
    model.status="draft";if(opts.source)model.source=opts.source;if(model.source==="ai"){model.aiGenerated=true;model.reviewedByUser=false;}
    session={state:global.songEditorState.create(model),mode:"edit",options:opts,existingSong:isLegacy?data:opts.existingSong||null};global.addEventListener("beforeunload",beforeUnload);render();return session.state;
  }
  global.openSongEditor=openSongEditor;
  global.songEditor=Object.freeze({open:openSongEditor,close,readDrafts,key:DRAFT_KEY,getSession(){return session;}});
})(window);
