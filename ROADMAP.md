# Roadmap de Produto — Simplificando Cifras

Atualizado em 21 de agosto de 2026.

## 1. Ponto de partida

O projeto já é um MVP local funcional. Hoje ele entrega:

- biblioteca de músicas, pesquisa, cifras, transposição e capotraste;
- playlists/eventos com repertório ordenável, membros e funções;
- modo palco com navegação e rolagem automática;
- Spotify OAuth, busca, associação de faixas, metadados e player de estudo;
- ajustes pessoais e compartilhados simulados localmente;
- chat de evento, respostas, reações, enquetes e notificações locais;
- PWA instalável e funcionamento offline depois do primeiro carregamento;
- persistência em `localStorage` e sincronização entre abas do mesmo navegador.

Também existe uma versão do MVP publicada no **Netlify** e um banco de dados provisionado no **Railway**. Essa infraestrutura será preservada e auditada antes de qualquer migração. Neste repositório, ainda não foram encontrados a configuração do Netlify, o endereço da API, as migrações ou a conexão com o banco Railway; portanto, documentar e integrar esses componentes faz parte da primeira sprint.

A estimativa atual é de aproximadamente **46% do escopo funcional completo** e **30% da preparação para produção colaborativa**. O maior trabalho pendente não está na interface: está em identidade, banco de dados, permissões e sincronização entre usuários e aparelhos.

## 2. Direção técnica

### Decisão principal

Evoluir o código atual de forma gradual, sem uma reescrita completa.

| Área | Escolha para o MVP | Custo inicial | Motivo |
| --- | --- | --- | --- |
| Interface | JavaScript atual, dividido em módulos ES | Gratuito | Preserva o que já funciona |
| Build e desenvolvimento | Vite | Gratuito e open source | Build de produção, módulos e desenvolvimento rápido |
| Hospedagem web | Netlify atual | Plano gratuito enquanto estiver dentro da franquia | Evita uma migração sem benefício imediato |
| Banco online | Banco atual no Railway | Gratuito apenas para uso muito pequeno; baixo custo para produção | Preserva dados e trabalho já realizados |
| API/backend | Reaproveitar o serviço atual; criar uma API fina no Railway somente se ainda não existir | Conforme consumo | Centraliza autenticação, autorização e sincronização |
| Banco offline | IndexedDB com Dexie.js | Gratuito e open source | Mais seguro e estruturado que `localStorage` para dados grandes |
| Testes de unidade | Testes atuais; adoção gradual de Vitest | Gratuito e open source | Evita interromper a cobertura já existente |
| Testes de interface | Playwright | Gratuito e open source | Testes reais em navegadores e dispositivos simulados |
| Integração contínua | GitHub Actions | Gratuito em repositório público e com franquia em privado | Testar cada alteração automaticamente |
| Aplicativo móvel | PWA responsiva | Gratuito | Evita manter Android e iOS separados nesta fase |

### O que não faremos agora

- reescrever toda a interface em React, Vue ou outro framework;
- criar aplicativos Android e iOS nativos antes de validar a PWA;
- trocar Netlify ou Railway sem medir custo, limites e benefício;
- criar uma arquitetura de microsserviços;
- armazenar segredos, tokens privados ou chaves de IA no navegador;
- depender da IA para funções musicais essenciais;
- prometer letras ou cifras de qualquer música sem uma fonte autorizada.

Se a interface crescer a ponto de os módulos nativos ficarem difíceis de manter, Lit/Web Components poderá ser avaliado depois da primeira beta. Não é uma dependência do MVP.

## 3. Roadmap otimista

As estimativas consideram ciclos curtos e foco contínuo. Cada sprint deve terminar com uma versão utilizável e testada.

### Sprint 0 — Estabilizar e preparar a base (1 semana)

Objetivo: mapear a infraestrutura publicada e deixar o código pronto para usar o banco existente sem quebrar o MVP atual.

- identificar o projeto Netlify, domínio, branch de deploy e variáveis de ambiente;
- identificar o tipo e a versão do banco Railway, suas tabelas, migrações, backups e credenciais;
- localizar o repositório e a URL da API existente ou confirmar que atualmente há somente o banco;
- desenhar o fluxo Netlify → API → Railway e registrar ambientes de desenvolvimento, homologação e produção;
- criar uma versão estável e documentar o fluxo crítico;
- introduzir Vite sem mudar a aparência do produto;
- extrair gradualmente código e estilos do `index.html`;
- separar interface, casos de uso e repositórios de dados;
- adicionar configuração por ambiente para Spotify, API, Netlify e Railway, sem gravar segredos no frontend;
- configurar testes automáticos no GitHub Actions;
- criar testes Playwright dos fluxos biblioteca → música → evento → modo palco;
- definir IDs universais e datas de criação/alteração em todas as entidades.

**Pronto quando:** o build de produção funciona, os testes atuais continuam verdes, o aplicativo ainda funciona offline e a equipe consegue explicar e reproduzir o deploy e a conexão com o banco.

### Sprint 1 — Contas, perfis, bandas e segurança (2 semanas)

Objetivo: transformar o aplicativo local em um produto com usuários reais.

- criar migrações versionadas no banco Railway existente;
- implementar autenticação na API atual ou escolher uma solução compatível com sua linguagem;
- começar com login por e-mail e senha ou link mágico, conforme o backend já utilizado;
- perfil do músico com nome, foto e instrumentos;
- criar e participar de bandas/equipes por convite;
- funções iniciais: proprietário, líder, editor e músico;
- autorização obrigatória na API e restrições correspondentes no banco;
- tela de sessão, troca de banda e saída da conta;
- manter um modo local de demonstração para desenvolvimento.

**Pronto quando:** dois usuários diferentes entram na mesma banda e só acessam dados para os quais possuem permissão.

### Sprint 2 — Banco local e sincronização offline (2 semanas)

Objetivo: continuar funcionando em igrejas com internet fraca ou ausente.

- migrar músicas, eventos, repertórios e conversas de `localStorage` para IndexedDB/Dexie;
- criar migração automática que preserve os dados atuais do usuário;
- implementar fila de alterações pendentes (outbox);
- sincronizar ao recuperar a conexão;
- exibir estados simples: sincronizado, pendente e com conflito;
- adotar controle de versão e `updated_at` nas alterações;
- começar com resolução previsível: ajustes pessoais nunca disputam com compartilhados; edição compartilhada concorrente exige confirmação;
- oferecer exportação e restauração de segurança.

**Pronto quando:** o usuário altera repertório e cifras offline, fecha o aplicativo, abre novamente e sincroniza em outro aparelho sem perder dados.

### Sprint 3 — Repertório colaborativo real (2 semanas)

Objetivo: entregar o primeiro grande valor online do produto.

- playlists pessoais e repertórios de banda no banco;
- ordenação compartilhada e associação com eventos;
- versões de músicas e histórico básico de alterações;
- tom, capo e observações pessoais separados da versão oficial;
- edição compartilhada limitada por função;
- atividade recente e notificações dentro do aplicativo;
- duplicação segura de repertório e música para nova versão.

**Pronto quando:** um líder organiza o repertório e cada músico recebe a mesma ordem, mantendo seus próprios ajustes sem alterar a visualização dos demais.

### Sprint 4 — Modo palco confiável (1 a 2 semanas)

Objetivo: tornar a PWA segura para uso durante uma apresentação.

- pré-carregar offline todas as músicas do evento;
- indicar claramente quando o repertório está pronto para uso offline;
- navegação por gesto e por botões grandes;
- impedir o bloqueio da tela com Screen Wake Lock quando disponível;
- preservar transposição, capo, fonte, velocidade e posição de leitura por músico;
- notas pessoais por música;
- modo de alto contraste e controle de luminosidade visual da interface;
- testes em celular, tablet, retrato, paisagem e tela cheia.

**Pronto quando:** um repertório inteiro pode ser apresentado em modo avião, sem recarregar a página e sem perder as preferências pessoais.

### Sprint 5 — Agenda e escala (2 semanas)

Objetivo: organizar o ciclo completo de reunião, ensaio ou apresentação.

- tipos de evento: reunião, culto, ensaio, show e outro;
- local, data, horário, observações e responsáveis;
- confirmação de disponibilidade por músico;
- escala por função/instrumento e aviso de posições não preenchidas;
- vincular repertório e conversa ao evento;
- lembretes dentro do aplicativo;
- exportação `.ics` para adicionar ao calendário do aparelho;
- filtros de eventos futuros, passados e pendentes de resposta.

**Pronto quando:** o líder cria um evento, monta a escala e o repertório, e os músicos confirmam presença e adicionam a data ao calendário.

### Sprint 6 — Chat colaborativo em tempo real (2 semanas)

Objetivo: levar as funções já existentes para uma equipe real.

- mensagens em tempo real por WebSocket ou Server-Sent Events no backend existente;
- respostas, reações, menções, edição e exclusão;
- enquetes com um voto por usuário;
- contagem de não lidas e confirmação de leitura;
- anexos pequenos em armazenamento de objetos, evitando gravar arquivos no banco relacional;
- política de retenção e limites de arquivo;
- notificações web como melhoria posterior, sem bloquear a entrega do chat.

**Pronto quando:** usuários em aparelhos distintos conversam no evento, recebem atualizações em tempo real e não acessam chats de bandas das quais não participam.

### Sprint 7 — Conectar comunicação e música (1 a 2 semanas)

Objetivo: deixar de ser apenas um chat ao lado de um repertório.

- mensagem → música;
- mensagem → item do repertório;
- enquete → evento ou decisão musical;
- resultado de enquete → proposta de alteração, com aprovação do líder;
- registros de atividade ligando autor, ação e objeto alterado;
- atalhos contextuais para abrir cifra, modo estudo ou modo palco.

**Pronto quando:** uma decisão tomada no chat pode ser aplicada ao repertório de forma rastreável, sem copiar informações manualmente.

### Sprint 8 — Consolidar Spotify e modo estudo (1 semana)

Objetivo: polir o que já está funcional e reduzir falhas de associação e reprodução.

- revisar renovação de sessão, erros e estados de carregamento;
- associação manual e automática de faixa com confirmação visual;
- preservar metadados e capa em cache para acesso offline;
- fallback claro para “Abrir no Spotify” quando o player não estiver disponível;
- metrônomo local com BPM, acentuação e tap tempo;
- salvar BPM e preferências de estudo por música;
- não bloquear cifra ou modo palco quando o Spotify estiver desconectado.

**Pronto quando:** toda música pode ser estudada com metrônomo e, quando associada, com a referência do Spotify, sem tornar o restante do produto dependente da integração.

### Sprint 9 — Inteligência musical útil e controlada (2 semanas)

Objetivo: adicionar valor musical antes de adicionar custos de IA.

Primeiro, implementar localmente com regras testáveis:

- conversão para sistema Nashville;
- resumo harmônico;
- identificação de progressões recorrentes;
- explicação de acordes;
- sugestões simples de transposição e capo;
- simplificação baseada em substituições musicais revisadas;
- dicas por instrumento a partir do banco de diagramas validado.

Somente depois avaliar IA generativa por função segura no backend, com limite de uso, confirmação antes de salvar e indicação clara de conteúdo sugerido.

**Pronto quando:** as análises básicas funcionam sem API paga e nunca alteram uma cifra compartilhada sem confirmação humana.

### Sprint 10 — Beta com grupos reais (2 semanas)

Objetivo: validar o produto fora do ambiente de desenvolvimento.

- publicar frontend e backend de homologação;
- política de privacidade, exclusão de conta e consentimentos necessários;
- backup periódico compatível com os limites do plano escolhido;
- tratamento de erros e relatório opcional de falhas;
- acessibilidade por teclado, contraste e leitor de tela;
- piloto com 2 a 5 igrejas ou bandas;
- medir criação de evento, repertório concluído, confirmações e uso do modo palco;
- corrigir os problemas críticos antes de ampliar os convites.

**Pronto quando:** grupos reais usam o ciclo evento → escala → repertório → ensaio → palco, e os dados podem ser recuperados em caso de falha.

## 4. Marcos do produto

| Marco | Prazo otimista | Resultado | Maturidade esperada |
| --- | --- | --- | --- |
| Alpha online | 5 semanas | Base estável, login, bandas, permissões e sincronização inicial | 55% funcional / 60% produção |
| Beta colaborativa | 11 a 13 semanas | Repertório, palco, agenda e chat entre aparelhos | 75% funcional / 80% produção |
| Beta ampliada | 16 a 18 semanas | Integrações contextuais, modo estudo, inteligência musical e piloto | 90% funcional / pronta para validação comercial |

Esses prazos são uma meta otimista, não um compromisso rígido. Se houver apenas uma pessoa trabalhando em tempo parcial, é mais seguro considerar um ciclo de 5 a 7 meses.

## 5. Modelo de dados inicial

As primeiras migrações devem contemplar:

- `profiles`;
- `bands` e `band_members`;
- `songs`, `song_versions` e `song_sections`;
- `playlists` e `playlist_items`;
- `events`, `event_members` e `event_repertoire_items`;
- `personal_song_overrides`;
- `messages`, `message_reactions`, `polls`, `poll_options` e `poll_votes`;
- `notifications` e `activity_log`.

Todas as tabelas compartilhadas devem possuir identificador universal, autor, banda, data de criação, data de alteração e políticas de acesso. A interface não deve acessar tabelas sem passar pelos repositórios já iniciados no código.

## 6. Estratégia de baixo custo

- manter o frontend no Netlify e acompanhar os créditos mensais da conta atual;
- manter banco e possível API no Railway enquanto o custo e a confiabilidade forem adequados;
- ativar limites de uso e alertas no Railway para evitar cobranças inesperadas;
- evitar serviços duplicados: não adicionar Supabase apenas para funções que o backend Railway já possa cumprir;
- considerar Supabase, Neon ou outro serviço somente se a auditoria mostrar que o banco atual não atende autenticação, sincronização ou orçamento;
- manter arquivos de áudio fora do banco: o Spotify fornece a referência de reprodução, não deve ser copiado para o projeto;
- limitar anexos do chat a imagens e documentos pequenos;
- usar GitHub Actions apenas para build e testes essenciais;
- executar análise musical determinística no próprio navegador;
- adiar notificações por SMS, IA em nuvem e serviços pagos até existir uso real;
- acompanhar mensalmente banco, armazenamento, tráfego e mensagens em tempo real;
- documentar desde o início como exportar os dados para evitar dependência irreversível de fornecedor.

O Netlify possui plano gratuito com franquia mensal, mas pode pausar os projetos da conta ao atingir o limite. O Railway também oferece uma faixa gratuita pequena para experimentação; uma aplicação de produção deve prever ao menos o plano Hobby ou uma alternativa equivalente. Antes de um grupo depender do produto em eventos reais, será obrigatório ter backup externo testado e monitoramento de disponibilidade.

## 7. Riscos que precisam de decisão consciente

### Direitos sobre letras e cifras

Spotify fornece metadados e reprodução autorizada, não uma licença geral para copiar e redistribuir letras ou cifras. Para o MVP, o caminho seguro é trabalhar com conteúdo criado/importado pelo usuário, material próprio, domínio público ou provedores que concedam licença explícita.

### Conflitos de edição

Não tentar resolver colaboração musical complexa com “a última gravação vence” em silêncio. Ajustes pessoais são isolados; conflitos em versões compartilhadas devem mostrar comparação e exigir decisão.

### Offline

Offline não é apenas cache da página. Antes do modo palco, o aplicativo deve confirmar que evento, cifras, configurações e recursos essenciais estão armazenados no aparelho.

### Custos futuros

Os planos gratuitos são adequados para o piloto, mas não substituem orçamento de produção. A passagem para plano pago deve ocorrer quando grupos reais dependerem do produto para eventos críticos, não apenas quando o limite técnico for alcançado.

## 8. Próxima ação recomendada

Começar pela **Sprint 0**, reunindo o endereço do site Netlify, acesso ao projeto Railway e o repositório do backend, e então executar **Sprint 1 e Sprint 2 sem interrupção por novas funções visuais**. Ao final dessas etapas, o MVP publicado deverá usar identidade e dados compartilhados reais, preservando o modo offline. Esse é o ponto de maior ganho para o Simplificando Cifras agora.

## 9. Referências técnicas oficiais

- [Netlify: preços e franquias](https://www.netlify.com/pricing/)
- [Railway: preços e consumo](https://docs.railway.com/pricing)
- [Railway: controle de custos](https://docs.railway.com/pricing/cost-control)
- [Dexie.js e IndexedDB](https://dexie.org/docs)
- [Vite](https://vite.dev/guide/)
- [Playwright](https://playwright.dev/docs/intro)
- [GitHub Actions: uso e cobrança](https://docs.github.com/en/actions/concepts/billing-and-usage)
