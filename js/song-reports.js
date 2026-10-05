(function (global) {
  'use strict';
  const reasons = {chords:'Acordes incorretos', lyrics:'Letra incorreta', metadata:'Título ou artista incorreto', formatting:'Formatação desorganizada', inappropriate:'Conteúdo inadequado', other:'Outro problema'};
  const statuses = {pending:'Pendente', in_review:'Em revisão', resolved:'Resolvido', dismissed:'Não confirmado'};
  let generation = 0;
  const esc = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const text = value => global.uiI18n?.translate?.(value) || value;
  async function request(path, options = {}) {
    const token = global.appAuth?.getAccessToken();
    if (!token) throw new Error('Entre na sua conta para enviar um relato.');
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(global.apiConfig.sharedSongsEndpoint(path), {...options, signal:controller.signal, headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`}});
      if (token !== global.appAuth?.getAccessToken()) throw new Error('A conta mudou. Abra esta tela novamente.');
      const result = await response.json();
      if (!response.ok) throw new Error(result.erro?.mensagem || 'Não foi possível enviar. Tente novamente.');
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Sem conexão com o servidor. Tente novamente.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  async function attach(song, container) {
    if (!song || !container || !global.appAuth?.getAccessToken()) return;
    try {
      const result = await request(`report-target?title=${encodeURIComponent(song.title || '')}&artist=${encodeURIComponent(song.artist || '')}`);
      if (!container.isConnected || !result.song) return;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'btn btn-outline'; button.textContent = text('Reportar problema');
      button.onclick = () => open(result.song);
      container.append(button);
    } catch (_) { /* A background lookup must not interrupt reading the song. */ }
  }
  function modal(html) {
    const body = document.getElementById('modal-body');
    body.innerHTML = html;
    document.getElementById('modal-overlay').style.display = 'flex';
    return body;
  }
  function open(song) {
    const body = modal(`<div class="modal-title">Reportar problema</div><p data-no-i18n>${esc(song.title)} — ${esc(song.artist)}</p><p>O relato será revisado pela equipe. Sua playlist não será alterada.</p><form id="song-report-form"><label class="form-label" for="song-report-reason">Motivo</label><select class="form-input" id="song-report-reason" required>${Object.entries(reasons).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><label class="form-label" for="song-report-details" style="margin-top:16px">Descrição (opcional)</label><textarea class="form-textarea" id="song-report-details" maxlength="2000"></textarea><p>Descreva o problema sem incluir dados pessoais.</p><p id="song-report-feedback" role="status"></p><button class="btn btn-primary" type="submit">Enviar relato</button><button class="btn btn-outline" type="button" id="song-report-cancel">Cancelar</button></form>`);
    body.querySelector('#song-report-cancel').onclick = global.closeModal;
    body.querySelector('select').focus();
    const form = body.querySelector('form'), feedback = body.querySelector('#song-report-feedback');
    form.onsubmit = async event => {
      event.preventDefault(); const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
      try {
        const result = await request(`${encodeURIComponent(song.id)}/reports`, {method:'POST', body:JSON.stringify({reason:form.querySelector('select').value, details:form.querySelector('textarea').value})});
        if (!form.isConnected) return;
        feedback.textContent = text(result.duplicate ? 'Você já enviou um relato para esta música.' : 'Relato enviado para revisão. Obrigado!');
        form.querySelector('select').disabled = true; form.querySelector('textarea').disabled = true;
        submit.hidden = true;
      } catch (error) { if (form.isConnected) {feedback.textContent = text(error.message); submit.disabled = false;} }
    };
  }
  async function attachReview(container) {
    if (!container || !global.appAuth?.getAccessToken()) return;
    try {
      const result = await request('review-capability');
      if (!result.canReview || !container.isConnected) return;
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline'; button.textContent = text('Revisar relatos');
      button.onclick = () => review(); container.append(button);
    } catch (_) {}
  }
  async function review(status = 'pending', offset = 0) {
    const current = ++generation;
    const body = modal(`${global.accountSubpageHeader('Revisar relatos', 'openHelpSupport')}<select class="form-input" id="report-status">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${key===status?'selected':''}>${text(label)}</option>`).join('')}</select><div id="review-reports" aria-live="polite">Carregando...</div>`);
    body.querySelector('select').onchange = event => review(event.target.value);
    const list = body.querySelector('#review-reports');
    try {
      const result = await request(`reports?status=${status}&offset=${offset}`);
      if (current !== generation || !list.isConnected) return;
      list.innerHTML = result.reports.length ? '' : '<p>Nenhum relato neste estado.</p>';
      for (const report of result.reports) {
        const card = document.createElement('section'); card.className = 'wa-block';
        const content = report.songData?.fullChordSheet?.content || (report.songData?.harmonicSummary?.blocos || []).map(block => [block.secao, (block.acordes || []).join(' '), block.fraseGuia].filter(Boolean).join('\n')).join('\n\n');
        card.innerHTML = `<strong data-no-i18n>${esc(report.title)} — ${esc(report.artist)}</strong><p>${text(reasons[report.reason])}</p><p data-no-i18n style="white-space:pre-wrap">${esc(report.details)}</p><label class="form-label">Estado</label><select class="form-input">${Object.entries(statuses).map(([key,label])=>`<option value="${key}" ${key===report.status?'selected':''}>${text(label)}</option>`).join('')}</select><label class="form-label">Observação da revisão</label><textarea class="form-textarea" maxlength="2000" data-no-i18n>${esc(report.reviewNote)}</textarea><button class="btn btn-primary" type="button">Salvar revisão</button><p role="status"></p>`;
        const button = card.querySelector('button');
        const preview = document.createElement('details');
        preview.innerHTML = `<summary>Ver cifra do catálogo</summary><pre data-no-i18n style="white-space:pre-wrap;overflow-wrap:anywhere">${esc(content)}</pre>`;
        card.insertBefore(preview,card.querySelector('label'));
        button.onclick = async () => {
          button.disabled = true;
          try {await request(`reports/${report.id}`, {method:'PATCH', body:JSON.stringify({status:card.querySelector('select').value, reviewNote:card.querySelector('textarea').value})}); if (card.isConnected) card.querySelector('[role="status"]').textContent = text('Revisão salva.');}
          catch (error) {if (card.isConnected) card.querySelector('[role="status"]').textContent = text(error.message);}
          finally {button.disabled = false;}
        };
        list.append(card);
      }
      if (offset > 0) {const previous = document.createElement('button'); previous.className = 'btn btn-outline'; previous.textContent = text('Anterior'); previous.onclick=()=>review(status,Math.max(0,offset-50)); list.append(previous);}
      if (result.hasMore) {const next = document.createElement('button'); next.className = 'btn btn-outline'; next.textContent = text('Próximo'); next.onclick=()=>review(status,offset+50); list.append(next);}
    } catch (error) {if (list.isConnected) list.textContent = text(error.message);}
  }
  global.songReports = Object.freeze({attach, attachReview, request});
})(window);
