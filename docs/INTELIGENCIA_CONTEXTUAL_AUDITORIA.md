# Auditoria — Inteligência Contextual do ROUDY

## Arquitetura encontrada

- Frontend PWA em HTML, CSS e JavaScript puro, com módulos globais isolados por IIFE.
- Persistência local centralizada em `js/storage.js`; músicas, eventos, preferências e pacotes offline têm cópias locais.
- Backend Flask + SQLAlchemy, com SQLite local e PostgreSQL por `DATABASE_URL` em produção.
- Autenticação local por token e login opcional via Supabase/Google, com migração de identidade.
- Sincronização colaborativa versionada para eventos e biblioteca pessoal.

## Dados reutilizáveis

- Usuário: `CollaborationUser`, identidade externa, avatar e autenticação.
- Equipe: `Band`, `BandMember`, papel de acesso e função musical.
- Evento: data, hora, local, líder, equipe, versão e integrantes.
- Repertório: ordem, música, tom/capo/cifra/notas oficiais e sobreposição pessoal por usuário.
- Histórico: `EventChange` e notificações locais com tipo, ator, resumo e horário.
- Preferências: presets por instrumento, conteúdo, tema, fonte, rolagem e controles do Modo Palco.
- Offline: pacote de evento/repertório preparado para uso no palco e seu `preparedAt`.
- IA existente: resumo harmônico e busca musical; LLM permanece fora da fonte de verdade.

## Lacunas reais

- Não há registro confiável por música de `viu`, `estudou`, `revisou` ou `concluiu`.
- O pacote offline prova disponibilidade offline, não estudo ou domínio da música.
- `EventChange` não armazena de forma geral `songId`, `before`, `after` ou usuários afetados.
- Não há recibo por usuário da versão do repertório efetivamente revisada.
- Não há telemetria de ações suficiente para inferir preparação com segurança.

Consequência: o estado de preparação deve ser `UNKNOWN` quando não houver evidência explícita. Abrir uma música ou preparar o pacote offline não pode virar `READY` automaticamente.

## Riscos

1. Falso positivo de preparo, gerando confiança indevida antes do evento.
2. Fadiga de notificações se toda alteração coletiva for tratada como pessoal.
3. Vazamento de personalizações entre integrantes se o snapshot não filtrar por usuário.
4. Acoplamento da inteligência à UI, dificultando teste e evolução.
5. LLM transformado acidentalmente em fonte de fatos.
6. Datas sem timezone explícito; a fase temporal deve usar o contexto local conhecido.

## Arquitetura proposta

Fluxo puro e determinístico:

`dados reais → ContextSnapshot → Signals → relevância/prioridade → NextBestAction`

- `ContextSnapshot`: normaliza somente eventos acessíveis, equipe, função, fase temporal, repertório oficial/pessoal do próprio usuário, mudanças e estado de preparo.
- `Signal Engine`: produz fatos estruturados e deduplicados.
- `Relevance Engine`: pontuação explicável por regras nomeadas.
- `Next Best Action`: admite `NONE` e nunca inventa pendência.
- Observabilidade: toda ação inclui sinais, score, regras, dados ausentes e `usedLlm: false`.
- Privacidade: personalizações de outros usuários são removidas do snapshot.

## Plano incremental

1. Fundação determinística em módulo puro e testes — implementada.
2. Persistência explícita de revisão por usuário/música/versão — futura migration aditiva.
3. Enriquecer `EventChange` com evidência estruturada — futura migration aditiva.
4. Endpoint autenticado de snapshot/NBA, mantendo isolamento no servidor.
5. Integração discreta na Home após pesquisa Apple HIG obrigatória.
6. Linguagem natural opcional, recebendo apenas fatos mínimos já decididos deterministicamente.

## Decisão desta etapa

Nenhuma tabela, API ou interface foi alterada. A fundação aceita evidências futuras, mas devolve `UNKNOWN` quando os dados atuais não sustentam uma conclusão. Isso preserva funcionalidades e permite evoluir sem reescrever a lógica na UI.
