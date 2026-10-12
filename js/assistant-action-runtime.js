(function (global) {
  'use strict';
  function create(host) {
    const result = global.roudyActionManager.result;
    const error = text => result('error', text);
    const unchanged = () => result('noop', 'Esse ajuste já está como você pediu.');
    const requireVerified = (matches, message) => matches ? result('executed', message) : error('Não consegui confirmar esse ajuste. Confira a ferramenta e tente novamente.');
    const handlers = {};

    handlers['navigation.home'] = async ({ slots }) => {
      host.home(slots.tab);
      return host.isHome(slots.tab) ? result('opened', slots.tab === 'setlists' ? 'Abrindo seus eventos.' : slots.tab === 'medley' ? 'Abrindo o Medley.' : 'Abrindo sua playlist.') : error('Não consegui abrir essa tela.');
    };
    function chooseEntities(kind, matches, choiceId) {
      if (choiceId !== undefined) {
        const selected = matches.filter(item => String(item.id) === choiceId);
        return selected.length === 1 ? { selected: selected[0] } : { output: result('blocked', 'Essa opção não está mais disponível para o pedido. Faça o pedido novamente.') };
      }
      if (matches.length === 1) return { selected: matches[0] };
      if (!matches.length) return { output: result('clarify', kind === 'song' ? 'Não encontrei essa música na sua playlist.' : 'Não encontrei um evento correspondente.') };
      if (matches.length > 5) return { output: result('clarify', kind === 'song' ? 'Encontrei muitas músicas. Diga o título e o artista para refinar.' : 'Encontrei muitos eventos. Diga o nome ou uma data mais específica.') };
      const choices = matches.map(item => ({ id: String(item.id), label: kind === 'song' ? `${item.title}${item.artist ? ' de ' + item.artist : ''}` : `${item.title}${item.date ? ', ' + host.localDate(item.date) : ''}${item.time ? ' às ' + item.time : ''}`, aliases: [item.title, kind === 'song' ? item.artist : item.time].filter(Boolean) }));
      const message = `Encontrei ${choices.length} ${kind === 'song' ? 'músicas' : 'eventos'}. ${choices.map((item, index) => `${index + 1}: ${item.label.slice(0,60)}`).join('. ')}. Qual você quer abrir? Pode dizer o nome ou o número.`;
      return { output: result('clarify', message, { followUp: { kind: 'entity', choices } }) };
    }
    handlers['song.open'] = async ({ slots, guard }) => {
      const selection = chooseEntities('song', host.songMatches(slots.query), slots.choiceId);
      if (selection.output) return selection.output;
      const matches = [selection.selected];
      if (!matches.length) return result('clarify', 'Não encontrei essa música na sua playlist.');
      if (matches.length !== 1) return result('clarify', 'Encontrei mais de uma música. Diga o título seguido de “de” e o nome do artista.');
      guard();host.openSong(matches[0]);
      return host.isSongOpen(matches[0].id) ? result('opened', `Abrindo ${matches[0].title}.`) : error('Não consegui abrir a música.');
    };
    async function openEvent(matches, guard, choiceId) {
      const selection = chooseEntities('event', matches, choiceId);
      if (selection.output) return selection.output;
      guard();host.openEvent(selection.selected);
      return host.isEventOpen(selection.selected.id) ? result('opened', `Abrindo o evento ${selection.selected.title}.`) : error('Não consegui abrir o evento.');
    }
    handlers['event.open'] = ({ slots, context, guard }) => openEvent(context.eventsAll.filter(event => host.clean(event.title).includes(slots.query)), guard, slots.choiceId);
    handlers['event.song'] = async ({slots,context,guard}) => {
      const event=host.eventById(context.eventId),items=event?.repertoire||[];
      const item=items[slots.index==='last'?items.length-1:slots.index-1];
      if(!item)return result('clarify','Não há uma música nessa posição no repertório do evento.');
      if(!host.eventItemAvailable(event,item))return result('blocked','Esta música do evento não está disponível neste dispositivo.');
      guard();host.openEventSong(event.id,item.id);
      return host.isEventSongOpen(event.id,item.id)?result('opened','Abrindo a música na versão deste evento.'):error('Não consegui abrir a música do evento.');
    };
    handlers['event.date'] = ({ slots, context, guard }) => {
      const today = new Date(), day = Number(slots.day), month = slots.month ? Number(slots.month) : null, year = slots.year ? Number(slots.year) : null;
      if (day < 1 || day > 31 || (month && (month < 1 || month > 12))) return result('blocked', 'Diga uma data válida para o evento.');
      let matches = context.eventsAll.filter(event => {
        const [y, m, d] = host.localDate(event.date).split('-').map(Number);
        return d === day && (!month || m === month) && (!year || y === year);
      });
      if (!month && !year) {
        const current = matches.filter(event => host.localDate(event.date).startsWith(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`));
        if (current.length) matches = current;
      }
      return openEvent(matches, guard, slots.choiceId);
    };
    handlers['event.agenda'] = async ({ slots, request, context, guard }) => {
      const payload = await host.resolveEvent(request.semanticRaw||request.raw, context.events);
      guard();
      if (payload.action === 'inform' || payload.action === 'clarify') return result('clarify', payload.message);
      if (payload.action === 'choose') return openEvent(payload.params.eventos.map(item => context.events[item.evento_id]?.event).filter(Boolean), guard, slots.choiceId);
      if (payload.action !== 'navigate' || payload.screen !== 'detalhes_evento') return error('Não consegui identificar o evento.');
      const event = context.events[payload.params.evento_id]?.event;
      return event ? openEvent([event], guard, slots.choiceId) : error('Evento não disponível.');
    };

    handlers['song.capo'] = async ({ slots }) => {
      if (host.capo() === slots.value) return unchanged();
      host.selectCapo(slots.value);
      return requireVerified(host.capo() === slots.value, slots.value ? `Capotraste ajustado para a casa ${slots.value}.` : 'Capotraste removido.');
    };
    handlers['song.transpose'] = async ({ slots }) => {
      const before = host.semitones(), desired = Math.max(-11, Math.min(11, before + slots.delta));
      if (before === desired) return result('noop', 'O tom já está no limite permitido.');
      host.transpose(slots.delta);
      const changed=Math.abs(desired-before);
      return requireVerified(host.semitones() === desired, `${slots.delta > 0 ? 'Subi' : 'Desci'} o tom em ${changed===1?'um semitom':changed+' semitons'}.`);
    };
    handlers['song.reset-key'] = async () => {
      if (host.semitones() === 0) return unchanged();
      host.resetTranspose();return requireVerified(host.semitones() === 0, 'Tom original restaurado.');
    };
    handlers['song.save'] = async ({ context, guard }) => {
      if (!host.isDirty()) return result('noop', 'Não há alterações pendentes nesta música.');
      guard();
      const saved = await host.saveSong();
      guard();
      if (!saved?.ok) return error('Não foi possível salvar as alterações. Elas continuam pendentes.');
      const expectedScope = context.eventId ? 'event-personal' : 'playlist-personal';
      if (saved.scope && saved.scope !== expectedScope) return error('O contexto do salvamento mudou. Confira a música antes de continuar.');
      if (host.isDirty()) return result('executed', 'O ajuste enviado foi salvo. Existem novas alterações que ainda precisam ser salvas.', { pendingChanges: true });
      return result('executed', context.eventId ? 'Alterações salvas somente na sua versão deste evento. A playlist foi preservada.' : 'Alterações salvas na sua playlist.', { saveScope: context.eventId ? 'event-personal' : 'playlist-personal', pendingSync: Boolean(saved.pendingSync) });
    };

    const controller = context => host.metronome(context.songOpen);
    handlers['metronome.open'] = async ({ context }) => {
      host.showMetronome(context.songOpen);
      return host.metronomeVisible(context.songOpen) ? result('opened', context.songOpen ? 'Metrônomo da música disponível. Diga iniciar metrônomo para tocar.' : 'Abrindo o metrônomo.') : error('Não consegui abrir o metrônomo.');
    };
    handlers['metronome.play'] = async ({ slots, context, guard }) => {
      const tool = controller(context);
      if (tool.isPlaying() === slots.start) return result('noop', slots.start ? 'O metrônomo já está tocando.' : 'O metrônomo já está parado.');
      if (!context.songOpen && slots.start) host.showMetronome(false);
      guard();
      if (slots.start) await host.startMetronome(context.songOpen);else tool.stop();
      return requireVerified(tool.isPlaying() === slots.start, slots.start ? 'Metrônomo iniciado.' : 'Metrônomo interrompido.');
    };
    handlers['metronome.bpm'] = async ({ slots, context, guard }) => {
      if (!context.songOpen) host.showMetronome(false);
      const tool = controller(context);guard();await tool.setBpm(slots.value);guard();
      if (tool.getBpm() !== slots.value) return error('Não consegui ajustar o BPM.');
      if (slots.start && !tool.isPlaying()) await host.startMetronome(context.songOpen);
      if (slots.start && !tool.isPlaying()) return error('O BPM foi ajustado, mas não foi possível iniciar o áudio do metrônomo.');
      return result('executed', `Metrônomo ${context.songOpen ? 'da música ' : ''}ajustado para ${slots.value} BPM${slots.start ? ' e iniciado' : ''}.`);
    };
    handlers['metronome.adjust'] = async ({ slots, context, guard }) => {
      if (!context.songOpen) host.showMetronome(false);
      const tool = controller(context), value = Math.max(30, Math.min(240, tool.getBpm() + slots.delta));
      if (tool.getBpm() === value) return result('noop', 'O BPM já está no limite permitido.');
      guard();await tool.setBpm(value);return requireVerified(tool.getBpm() === value, `Metrônomo ajustado para ${value} BPM.`);
    };
    handlers['metronome.meter'] = async ({ slots, context, guard }) => {
      if (!context.songOpen) host.showMetronome(false);
      const tool = controller(context), value = context.songOpen ? slots.value : Number(slots.value.split('/')[0]);
      guard();await tool.setMeter(value);return requireVerified(tool.getMeter() === value, `Compasso ajustado para ${slots.value}.`);
    };
    handlers['scroll.play'] = async ({ slots, context, guard }) => {
      let mode = slots.mode;
      if (!mode) {
        if (slots.start) return result('clarify', 'Você quer iniciar a rolagem automática ou a inteligente?', { followUp: { kind: 'command', choices: [ { id: 'automatic', label: 'automática', command: 'iniciar rolagem automatica' }, { id: 'smart', label: 'inteligente', command: 'iniciar rolagem inteligente' } ] } });
        const active = [context.smartActive && 'smart', context.autoActive && 'automatic'].filter(Boolean);
        if (active.length > 1) return result('clarify', 'Qual rolagem você quer parar: automática ou inteligente?', { followUp: { kind: 'command', choices: [ { id: 'automatic', label: 'automática', command: 'parar rolagem automatica' }, { id: 'smart', label: 'inteligente', command: 'parar rolagem inteligente' } ] } });
        if (!active.length) return result('noop', 'Não há rolagem ativa.');
        mode = active[0];
      }
      const isActive = () => host.scrollActive(mode);
      if (isActive() === slots.start) return result('noop', slots.start ? 'Essa rolagem já está ativa.' : 'Essa rolagem já está parada.');
      guard();await host.setScrolling(mode, slots.start);
      return requireVerified(isActive() === slots.start, `Rolagem ${mode === 'smart' ? 'inteligente' : 'automática'} ${slots.start ? 'ativada' : 'interrompida'}.`);
    };
    handlers['tools.stop-active'] = async args => {
      const { context } = args, active = [context.metronomeActive && 'metronome', context.autoActive && 'automatic', context.smartActive && 'smart', context.tunerActive && 'tuner'].filter(Boolean);
      if (!active.length) return result('clarify', 'Diga qual ferramenta deseja parar.');
      if (active.length > 1) {
        const names = {metronome:'metrônomo', automatic:'rolagem automática', smart:'rolagem inteligente', tuner:'afinador'};
        const commands = {metronome:'parar metronomo', automatic:'parar rolagem automatica', smart:'parar rolagem inteligente', tuner:'parar afinador'};
        return result('clarify', `Qual ferramenta você quer parar: ${active.map(id=>names[id]).join(', ')}?`, { followUp: { kind: 'command', choices: active.map(id=>({id,label:names[id],command:commands[id]})) } });
      }
      if (active[0] === 'tuner') { args.guard();host.stopTuner();return requireVerified(!host.tunerActive(), 'Afinador interrompido.'); }
      return active[0] === 'metronome' ? handlers['metronome.play']({ ...args, slots: { start: false } }) : handlers['scroll.play']({ ...args, slots: { start: false, mode: active[0] } });
    };
    handlers['search.playlist'] = async ({ slots }) => {
      host.searchPlaylist(slots.query);
      return host.playlistQuery() === slots.query ? result('opened', `Buscando ${slots.query}. Confira os resultados antes de adicionar.`) : error('Não consegui abrir a busca.');
    };
    handlers['search.youtube'] = async ({ slots, guard }) => {
      guard();const found = await host.searchYoutube(slots.query, guard);
      if (!found?.ok) return result(found?.reason === 'needs-song' ? 'clarify' : 'error', found?.message || 'Não foi possível concluir a busca no YouTube.');
      return result('opened', found.count ? `Encontrei ${found.count} vídeos no YouTube. Escolha a gravação desejada.` : 'Nenhum vídeo encontrado no YouTube.');
    };
    // Preference writes are checked both in storage and in the rendered app.
    const preferenceKeys = { 'settings.language': 'language', 'settings.color': 'chordColor', 'settings.theme': 'theme', 'settings.scale': 'scale' };
    for (const [id, key] of Object.entries(preferenceKeys)) handlers[id] = async ({ slots, guard }) => {
      guard();
      const saved = await host.updateSettings({ [key]: slots.value });
      const description = key === 'theme' ? `Tema ${ {light:'claro',dark:'escuro',system:'do sistema'}[slots.value] } aplicado.` : key === 'scale' ? `Tamanho da interface ajustado para ${slots.value} por cento.` : key === 'language' ? `Idioma da interface alterado para ${slots.label}.` : `Cor das cifras alterada para ${slots.label}.`;
      return requireVerified(saved?.ok && host.settings()[key] === slots.value && host.settingsApplied(key, slots.value), description);
    };
    handlers['settings.accessibility'] = async ({ slots, guard }) => {
      guard();const saved = await host.updateSettings({ [slots.key]: slots.value });
      return requireVerified(saved?.ok && host.settings()[slots.key] === slots.value && host.settingsApplied(slots.key, slots.value), `${slots.key === 'highContrast' ? 'Alto contraste' : 'Modo para daltônicos'} ${slots.value ? 'ativado' : 'desativado'}.`);
    };
    handlers['navigation.panel'] = async ({ slots, guard }) => {
      guard();const opened = await host.openPanel(slots.destination);
      return opened?.ok ? result('opened', opened.message || 'Tela aberta.') : error(opened?.message || 'Não consegui abrir essa tela.');
    };
    handlers['navigation.back'] = async ({ guard }) => {
      guard();return await host.back() ? result('opened', 'Voltei para a tela anterior.') : result('noop', 'Você já está na tela inicial.');
    };
    handlers['assistant.help'] = () => result('executed', 'Posso abrir músicas, eventos, notificações, perfil e configurações; ajustar idioma, tema, acessibilidade, cifras, instrumentos, afinador, metrônomo, rolagem e palco; abrir criação por IA, texto, arquivo ou câmera; acessar edição, convites, compartilhamento, Medley e backup. Você também pode combinar até três ajustes de tom, capotraste, BPM, compasso ou preferências e dizer desfazer a última alteração. Salvar deve ser a última etapa. Peça navegação e operações sensíveis separadamente; as confirmações continuam obrigatórias.');
    handlers['tuner.open'] = async ({ slots, guard }) => {
      guard();await host.showTuner();
      if (slots.instrument) host.selectTunerInstrument(slots.instrument);
      return requireVerified(host.tunerVisible() && (!slots.instrument || host.tunerInstrument() === slots.instrument), slots.instrument ? `Afinador preparado para ${slots.label}.` : 'Abrindo o afinador.');
    };
    handlers['tuner.play'] = async ({ slots, guard }) => {
      if (host.tunerActive() === slots.start) return result('noop', slots.start ? 'O afinador já está ouvindo.' : 'O afinador já está parado.');
      guard();
      if (slots.start) { if (!host.tunerVisible()) await host.showTuner();await host.startTuner(); }
      else host.stopTuner();
      // Prevent a microphone granted late from running in a different screen/account.
      try { guard(); } catch (error) { host.stopTuner();throw error; }
      return requireVerified(host.tunerActive() === slots.start, slots.start ? 'Afinador ouvindo.' : 'Afinador interrompido.');
    };
    handlers['tuner.string'] = async ({ slots }) => {
      host.selectTunerString(slots.index);
      return requireVerified(host.tunerString() === slots.index, slots.index === null ? 'Afinação automática selecionada.' : `Corda ${slots.index + 1} selecionada.`);
    };
    handlers['song.instrument'] = async ({ slots }) => {
      host.setInstrument(slots.value);
      return requireVerified(host.instrument() === slots.value, `Diagramas ajustados para ${slots.label}.`);
    };
    handlers['song.view'] = async ({ slots, guard }) => {
      if (!host.songViewAvailable(slots.value)) return result('blocked', slots.value === 'tablature' ? 'Esta música não tem tablatura compatível com o instrumento selecionado.' : 'Essa visualização não está disponível neste modo.');
      guard();host.setSongView(slots.value);
      return requireVerified(host.songView() === slots.value, `Exibindo ${slots.value === 'summary' ? 'resumo harmônico' : slots.value === 'tablature' ? 'tablaturas' : slots.value === 'lyrics' ? 'letra' : 'letra e cifra'}.`);
    };
    handlers['song.step'] = async ({ slots, guard }) => {
      const target = host.nextSong(slots.delta);
      if (!target) return result('noop', 'Não há outra música nessa direção no repertório aberto.');
      guard();host.stepSong(slots.delta);
      return requireVerified(host.isSongOpen(target.songId), slots.delta > 0 ? 'Abrindo a próxima música.' : 'Abrindo a música anterior.');
    };
    handlers['song.font'] = async ({ slots }) => {
      if (!host.stageActive()) return result('blocked', 'Abra o modo palco para ajustar a fonte por voz.');
      const before = host.songFont(), desired = Math.max(18, Math.min(48, before + slots.delta));
      if (before === desired) return unchanged();
      host.setSongFont(desired);return requireVerified(host.songFont() === desired, `Fonte ajustada para ${desired}.`);
    };
    handlers['scroll.speed'] = async ({ slots }) => {
      const before = host.scrollSpeed(), desired = Math.max(6, Math.min(120, before + (slots.delta > 0 ? 3 : -3)));
      if (before === desired) return unchanged();
      host.adjustScrollSpeed(slots.delta);return requireVerified(host.scrollSpeed() === desired, slots.delta > 0 ? 'Rolagem mais rápida.' : 'Rolagem mais lenta.');
    };
    handlers['stage.play'] = async ({ slots, context, guard }) => {
      if (host.stageActive() === slots.start) return result('noop', slots.start ? 'O modo palco já está ativo.' : 'O modo palco já está encerrado.');
      if (slots.start && !context.songOpen && (!context.eventId || !context.canAccessEvent)) return result('blocked', 'Abra uma música ou evento antes de iniciar o modo palco.');
      guard();await host.setStage(slots.start, context);
      return requireVerified(host.stageActive() === slots.start, slots.start ? 'Modo palco preparado.' : 'Modo palco encerrado.');
    };
    handlers['music.generate'] = async ({ slots, guard }) => {
      guard();const opened = await host.openGenerator(slots.mode);
      return opened ? result('opened', slots.mode === 'camera' ? 'Câmera aberta. Confira a permissão e fotografe a cifra.' : 'Criação de música aberta. Preencha e revise antes de salvar.') : error('Não consegui abrir a criação de música.');
    };
    handlers['song.edit'] = async ({ context, guard }) => {
      guard();return host.editSong(context.songId) ? result('opened', 'Editor da música aberto. Revise e salve na tela.') : error('Não consegui abrir a edição.');
    };
    handlers['song.delete'] = async ({ context, guard }) => {
      if (!host.confirm(`Excluir esta música da sua playlist?`)) return result('noop', 'Exclusão cancelada.');
      guard();host.deleteSong(context.songId);
      return host.songExists(context.songId) ? error('Não foi possível excluir. A música foi mantida.') : result('executed', 'Música excluída da sua playlist.');
    };
    handlers['medley.workflow'] = async ({ slots, guard }) => {
      if (slots.operation !== 'add' && !host.medleyCount()) return result('noop', 'O Medley está vazio.');
      guard();const response = await host.medleyWorkflow(slots.operation);
      return response?.ok ? result(response.status || 'opened', response.message) : error('Não consegui concluir essa ação no Medley.');
    };
    handlers['event.create'] = async ({ guard }) => {
      guard();return host.createEvent() ? result('opened', 'Criação de evento aberta. Preencha e salve na tela.') : error('Não consegui abrir a criação do evento.');
    };
    handlers['event.workflow'] = async ({ slots, context, guard }) => {
      guard();const response = await host.eventWorkflow(slots.operation, context, guard);
      return response?.ok ? result(response.status || 'opened', response.message) : result(response?.status || 'error', response?.message || 'Não consegui abrir essa ação do evento.');
    };
    handlers['event.invite-person'] = async ({slots,context,guard})=>{
      const found=await host.inviteCandidates(slots.query,context);guard();
      if(found.hasMore)return result('clarify','Há mais pessoas com esse nome. Diga o nome completo ou nome de usuário para refinar.');
      const users=Array.isArray(found)?found:found.users||[];
      const choices=users.map(user=>({id:String(user.id),label:`${user.name}${user.username?' @'+user.username:''}`,aliases:[user.name,user.username].filter(Boolean)}));
      if(!choices.length)return result('clarify','Não encontrei alguém com esse nome disponível para convidar. Diga o nome completo ou nome de usuário.');
      if(choices.length>5)return result('clarify','Encontrei muitas pessoas. Diga o nome completo ou nome de usuário para refinar.');
      const choice=slots.choiceId?choices.find(item=>item.id===slots.choiceId):choices.length===1?choices[0]:null;
      if(slots.choiceId&&!choice)return result('blocked','Essa pessoa não está mais disponível para este convite. Faça o pedido novamente.');
      if(!choice)return result('clarify',`Encontrei ${choices.length} pessoas. ${choices.map((item,index)=>`${index+1}: ${item.label.slice(0,60)}`).join('. ')}. Quem você quer convidar?`,{followUp:{kind:'entity',choices}});
      if(!slots.confirmed)return result('clarify',`Convidar ${choice.label} para este evento? Diga sim ou cancelar. A confirmação de segurança na tela será mantida.`,{followUp:{kind:'confirm',choiceId:choice.id}});
      guard();const invited=await host.invitePerson(context.eventId,users.find(user=>String(user.id)===choice.id),guard);
      return invited?.ok?result('executed','Convite enviado. A pessoa entrará no evento após aceitar.'):result(invited?.cancelled?'noop':'error',invited?.cancelled?'Convite cancelado.':invited?.message||'Não foi possível enviar o convite.');
    };
    handlers['account.login'] = async ({ context, guard }) => {
      if (context.authenticated) return result('noop', 'Você já está conectado.');
      guard();const response = await host.login();
      return response?.ok ? result('opened', 'Entrada com Google iniciada. Conclua a autenticação.') : error(response?.message || 'Não foi possível iniciar a entrada com Google.');
    };
    handlers['account.logout'] = async ({ context, guard }) => {
      if (!context.authenticated) return result('noop', 'Você já está sem login.');
      if (!host.confirm('Sair da sua conta? O aplicativo verificará a sincronização antes de sair.')) return result('noop', 'Saída cancelada.');
      guard();await host.logout();
      return host.authenticated() ? result('blocked', 'Você continua conectado. Conclua a sincronização antes de sair.') : result('executed', 'Você saiu da conta.');
    };
    handlers['library.sync'] = async ({ context, guard }) => {
      if (!context.authenticated) return result('blocked', 'Entre com sua conta para sincronizar. Sem login, os dados continuam locais.');
      guard();await host.sync();guard();
      const phase = host.syncPhase();
      return phase === 'synced' ? result('executed', 'Sincronização concluída.') : result('blocked', 'A sincronização ainda tem pendências. Seus dados locais foram preservados.');
    };
    handlers['backup.workflow'] = async ({ slots, guard }) => {
      guard();const response = await host.backupWorkflow(slots.operation);
      return response?.ok ? result(response.status || 'executed', response.message) : error('Não consegui preparar esse arquivo. Seus dados foram preservados.');
    };
    handlers['contribution.pix'] = async ({ guard }) => {
      guard();const copied = await host.copyPix();
      return copied?.ok ? result('executed', 'Código Pix copiado. Abra o banco e use Pix Copia e Cola.') : result('clarify', 'A cópia automática não foi permitida. Copie o código na janela aberta.');
    };
    handlers['compatibility.legacy'] = async ({ request }) => {
      if (!request.text) return { ...await host.legacy(request.raw), status: 'executed', feedbackAlreadyHandled: true };
      return result('clarify', 'Não reconheci um pedido completo. Diga uma ação por vez, com a ferramenta e o ajuste desejado.');
    };
    return Object.freeze({ context: host.context, handlers });
  }
  global.roudyAssistantRuntime = Object.freeze({ create });
})(window);
