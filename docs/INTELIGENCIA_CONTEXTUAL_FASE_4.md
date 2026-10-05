# Inteligência Contextual — Fase 4

## Escopo

Esta fase adiciona Delivery Policy, acknowledgement explícito e uma integração discreta nas superfícies existentes. Não há LLM, chatbot, push, nova página, feed ou mudança no Modo Palco.

## Pesquisa Apple HIG

Foram consultadas as orientações Apple para **Feedback**, **Notifications**, **Buttons** e **Accessibility**. As decisões aplicadas foram:

- informação não crítica fica integrada ao conteúdo, sem alert ou modal interruptivo;
- a apresentação é única, acionável e próxima da jornada existente;
- o propósito do botão é expresso por label textual familiar;
- estado não depende apenas de cor;
- controles novos mantêm alvo de toque de pelo menos 44 pt, foco de teclado e nome acessível;
- a leitura da cifra permanece prioritária e o controle de preparação não aparece no Modo Palco.

## Auditoria de superfícies

- **Home:** já possuía uma única área editorial/contextual (`playlist-ai-card`), adequada para uma NBA sem criar outro card.
- **Evento:** já concentra repertório, participantes, mudanças e destinations. Não recebeu uma segunda apresentação para evitar duplicação.
- **Música:** já possui o contexto navegacional do evento e a versão efetiva do item; recebeu somente a confirmação explícita de preparação.
- **Navegação:** foram reutilizados `openDetailFromPlaylist`, `openSD` e `openStageFromEvent`.
- **Mensagens:** toast continua reservado ao resultado de uma ação explícita; nenhum modal automático foi adicionado.

## Delivery Policy

`context-delivery.js` recebe a NBA pronta e apenas decide a superfície. Não recalcula prioridade ou relevância e não conhece o DOM.

- `NONE` → `NONE`, sem conteúdo contextual.
- ação sem destination válida → `NONE`.
- `REVIEW_CHANGED_SONG`, `START_PREPARATION`, `CONTINUE_PREPARATION` e `ENTER_STAGE_MODE` → área contextual existente da Home.
- no máximo uma ação primária é renderizada.

A tradução de `actionType` + evidência estruturada para copy fica centralizada no mesmo módulo. Quando `evidenceIncomplete` é verdadeiro, a mensagem é deliberadamente genérica e não inventa before/after.

## Acknowledgement

`ContextAcknowledgement` persiste `userId`, `eventId`, `fingerprint`, `actionType` e `acknowledgedAt`, com unicidade por usuário e fingerprint.

- **PRESENTED:** evento interno emitido uma vez por fingerprint na sessão; não grava acknowledgement.
- **ACKNOWLEDGED:** somente o toque explícito em “Agora não” cria o registro local e tenta sincronizá-lo.
- **RESOLVED:** somente a fonte de verdade elimina a necessidade; para revisão musical, isso exige novo `SongReviewReceipt` da revisão atual.

Abrir a música não cria receipt. Dispensar uma recomendação não altera `CHANGED_AFTER_REVIEW` e não produz `READY`. Uma nova revisão gera outra fingerprint e pode ser apresentada mesmo que a mudança anterior tenha sido dispensada.

## Confirmação de preparação

Na tela da música aberta pelo contexto de um evento, um controle discreto oferece:

- `Marcar como preparado` para uma versão ainda não confirmada;
- `Confirmar versão revisada` após mudança relevante;
- `✓ Preparado` como estado confirmado e não acionável.

O controle fica fora do corpo da cifra, não aparece ao abrir uma música sem evento e é ocultado no Modo Palco. O clique cria primeiro um receipt local da revisão efetiva, atualiza o estado derivado e sincroniza em seguida.

## Offline e falhas

- receipts e acknowledgements são gravados localmente como `pending` antes da chamada remota;
- ao reconectar, acknowledgements pendentes são enviados e a Home é recalculada;
- um receipt offline de revisão antiga é rejeitado pelo backend com `revisao_desatualizada`; a versão atual é recarregada e não fica falsamente READY;
- falha do motor mantém a Home genérica utilizável, sem erro técnico para o usuário;
- dados incompletos nunca geram alegação específica de alteração.

## Eventos internos

Sem tracking externo e sem conteúdo musical:

- `context_action_presented`;
- `context_action_opened`;
- `context_action_acknowledged`;
- `context_action_resolved`.

## Resultado visual

Na Home, a área editorial que já existia troca seu kicker, título, descrição e CTA conforme a única NBA. Um botão secundário textual “Agora não” permite dispensar explicitamente. Não há selo de IA, sparkle, novo card, modal ou badge.

Na música do evento, uma faixa fina integrada à superfície preta contém uma cápsula de 44 px de altura alinhada à direita. Ela usa borda e superfície neutras, label textual e check no estado confirmado; nenhuma decoração de IA ou glow foi adicionada.

## Testes e limitações

Os testes JavaScript cobrem `NONE`, cada ação suportada, agregação, competição, destination, copy segura, isolamento entre usuários/eventos, acknowledgement idempotente, fila offline, abertura sem READY, confirmação explícita, expiração após receipt, mudança nova/fingerprint nova e fallback da Home.

O teste backend cobre persistência idempotente, autenticação, isolamento e a separação entre acknowledgement e receipt. A suíte Python não foi executada porque Flask/pytest não estão instalados no ambiente; `compileall` valida apenas sintaxe, não integração.

## Próxima fase recomendada

Validar a integração em uso real e medir somente os eventos internos já preparados: apresentação, abertura, dispensa e resolução. Antes de adicionar qualquer nova superfície, observar se a Home reduz cliques e se “Agora não” evita repetição sem esconder mudanças novas. Uma eventual camada de linguagem natural deve continuar posterior, opcional e nunca ser fonte de verdade.
