# PRD — ROUDY

Documento de Requisitos do Produto · versão 1.0 · 1 de outubro de 2026

## 1. Referência e validade

Este documento descreve o produto presente no código local e seus requisitos de evolução. Base auditada: versão de pacote `0.7.1`, branch `codex/unificacao-melhorias-locais`, commit-base `9b50b85`, incluindo alterações locais posteriores de autenticação, assistente de voz e metrônomo. O frontend referencia o assistente `v17` e o cache PWA `v173`.

Esta revisão não compara o repositório remoto nem verifica os serviços de produção. Portanto, “implementado” significa existente na base local; não significa publicado, configurado ou validado em todos os dispositivos. Documentos antigos do projeto contêm informações superadas e não prevalecem sobre os achados desta revisão.

Estados utilizados: **implementado**, **experimental**, **dependente de configuração** e **requisito de evolução**. Metas numéricas abaixo são propostas, não resultados medidos.

## 2. Visão do produto

ROUDY é uma aplicação web progressiva para músicos organizarem sua biblioteca, prepararem repertórios em equipe, estudarem e executarem músicas. Reúne resumo harmônico, letra com cifras, tablaturas, transposição, eventos, modo palco, ferramentas musicais, geração assistida por IA e comandos de voz.

Proposta de valor: reduzir o uso de papel, a dispersão entre ferramentas e o esforço de preparar repertórios; facilitar a leitura durante a execução e preservar os dados pessoais entre dispositivos autenticados.

O produto atende especialmente músicos e líderes de equipes de louvor, sem limitar a organização de repertórios a esse contexto. A contribuição financeira voluntária por Pix ajuda a sustentar o projeto.

## 3. Problemas e objetivos

Problemas atendidos:

- Letras e cifras ficam dispersas em documentos, sites e mensagens.
- Cada músico precisa adaptar tom, capotraste e observações sem alterar a versão oficial da equipe.
- O líder precisa comunicar repertório, ordem, escala e alterações.
- Interagir com a tela durante a execução atrapalha a leitura e a performance.
- Conexões instáveis e troca de dispositivo dificultam o acesso ao conteúdo.

Objetivos de produto:

1. Permitir preparar uma música e incorporá-la à biblioteca com revisão explícita.
2. Disponibilizar um repertório oficial por evento e personalizações isoladas por integrante.
3. Oferecer leitura clara e navegação confiável durante ensaios e apresentações.
4. Sincronizar conteúdos autorizados com isolamento por identidade.
5. Reduzir toques necessários por meio de comandos de voz e ferramentas contextualizadas.

Não há, nesta base, compromisso com aplicativo nativo, assinatura comercial, assistente conversacional geral ou reconhecimento confiável de todos os acordes tocados simultaneamente.

## 4. Públicos e permissões

| Perfil | Necessidade | Acesso esperado |
| --- | --- | --- |
| Visitante | Experimentar e organizar conteúdo no aparelho | Biblioteca local; funções remotas dependem de autenticação |
| Músico autenticado | Manter biblioteca e participar de eventos | Dados próprios e eventos autorizados |
| Líder do evento | Organizar versão oficial e participantes | Alterações oficiais e transferência de liderança |
| Integrante do evento | Estudar a versão oficial e adaptar execução | Leitura oficial e alterações pessoais |
| Proprietário/líder de equipe | Organizar integrantes e eventos da equipe | Administração conforme validações do backend |

As permissões devem ser verificadas no servidor. Ocultar um botão não substitui autorização. Identidades locais legadas existem para compatibilidade; o fluxo principal atual de conta é Google via Supabase.

## 5. Arquitetura de informação e jornadas

Entrada: tela de acesso → Continuar com Google ou Continuar sem login → tela principal.

Tela principal: Playlist, Eventos e Medley. O menu da foto oferece Meu Perfil, Configurações e Ferramentas. Configurações contém Idioma, Aparência e Acessibilidade e Ajuda e Suporte. Ferramentas reúne Afinador e Metrônomo.

Jornadas principais:

1. **Biblioteca:** buscar → abrir música → escolher visualização → ajustar tom/capo → estudar ou executar.
2. **Criação:** Gerar com IA → Busca por IA, Arquivo ou foto ou Texto → processamento → rascunho editável → salvar explicitamente.
3. **Evento:** criar → definir data/local/membros → montar e ordenar repertório → compartilhar → abrir música ou modo palco.
4. **Personalização:** integrante abre música do evento → aplica versão pessoal → demais continuam com a versão oficial.
5. **Medley:** adicionar primeiro bloco → adicionar novos blocos no tom de referência → salvar na Playlist → reiniciar montagem.
6. **Voz:** tocar no agente → falar pedido → reconhecer intenção → executar no contexto correto → dar retorno visual e falado.
7. **Conta:** login → ativar cache da identidade → baixar/sincronizar conteúdos → logout → restaurar contexto visitante separado.

## 6. Requisitos funcionais

### RF-01 — Entrada e autenticação

Implementado: tela anterior à interface principal, Google via Supabase Auth e opção provisória de continuar sem login. Login por código/link de e-mail foi adiado e não aparece como método ativo do módulo atual.

O carregamento inicial da configuração e do SDK possui proteção de timeout. A ausência de configuração não deve deixar a tela de entrada indefinidamente bloqueada. Sessão autenticada deve ser persistida e renovada pelo mecanismo de autenticação.

Aceite: visitante consegue entrar; conta válida restaura contexto; falha de autenticação informa estado recuperável; logout não expõe automaticamente a biblioteca privada no contexto de outra conta.

### RF-02 — Perfil e configurações

Implementado: nome, telefone, e-mail e foto; seleção/edição de imagem; navegação de retorno entre subpáginas. Alterar e-mail pode depender de confirmação do provedor.

Configurações oferecem temas Claro, Escuro e Sistema, alto contraste, opção para daltônicos, escala de elementos e cor das cifras. Os seis idiomas são Português Brasileiro, Español, English, Italiano, Français e Deutsch, exibidos com bandeiras em grade de três por duas.

Aceite: preferências persistem; tema Sistema acompanha o aparelho; textos da interface mudam de idioma preservando conteúdo musical; retorno leva à tela anterior.

Limite: cobertura completa de tradução requer auditoria de todos os fluxos; a presença de seis opções não comprova que toda mensagem dinâmica já foi traduzida.

### RF-03 — Biblioteca pessoal / Playlist

Implementado: listagem, busca, criação, edição, exclusão pessoal, modelo musical central e dados locais. “Playlist” na tela principal designa a biblioteca do usuário; o repertório ordenado de evento é uma estrutura distinta.

Busca por voz preenche a pesquisa; uma correspondência exata e única pode abrir a música diretamente. Busca textual e identificação devem preservar homônimos e não tratar título/artista como identidade definitiva de sincronização.

Aceite: conteúdo salvo reaparece após recarga; exclusão pessoal não modifica repertórios oficiais; busca sem resultado fornece retorno; dados de uma conta não são absorvidos por outra.

O catálogo inicial varia conforme instalação, migração e identidade. A documentação antiga que fixa 86 músicas não deve ser usada como requisito atual: há catálogo de demonstração próprio e bibliotecas históricas preservadas. A música fictícia de teste existente no aparelho não é obrigação de todo novo usuário.

### RF-04 — Interface da música

Implementado: Resumo Harmônico, Letra + Cifras e tablatura quando houver conteúdo; metadados, editor, transposição, retorno ao tom original, capotraste de 0 a 12 e diagramas por instrumento.

Um único objeto Song reúne as representações. O editor preserva ordem de seções, letras e acordes; cifras completas usam posições semânticas dos acordes, em vez de depender apenas de espaços visuais. Dados legados permanecem compatíveis.

Aceite: transposição mantém qualidade dos acordes e notas de baixo; tablatura preserva espaços e símbolos; visualização indisponível não mostra conteúdo inventado; ajustes não corrompem o original.

Diagramas contemplam violão, ukulele, teclado, cavaquinho e viola caipira conforme definições existentes. Quando um desenho não estiver disponível, a interface deve informar isso.

### RF-05 — Eventos e repertórios

Implementado: título, data, horário, local, informações, membros/funções, repertório ordenado e versões oficiais e pessoais. Existe exatamente um líder por evento. Backend valida edição oficial, associação de membros, compartilhamento e concorrência.

Transferência: líder seleciona um integrante e transfere a liderança. O novo líder assume permissões oficiais; a troca deve ser registrada e não duplicar líderes.

Aceite: clicar em uma música abre o item correto; ordem permanece estável; somente líder altera versão oficial; personalizações do integrante não aparecem para outro; transferência exige autorização atual.

Convites possuem token e validade. Membros legados definidos apenas por nome podem depender de associação com uma identidade registrada para acesso remoto.

### RF-06 — Equipes, comunicação e localização

Implementado: bandas/equipes com proprietário, líderes e integrantes; vínculo opcional com evento. Há chat remoto de evento, respostas, reações, edição/exclusão, não lidas e enquetes no código, além de mecanismos locais de comunicação entre abas.

Eventos possuem busca de endereço, coordenadas e mapa com fallback estático. Serviços externos e chaves adequadas condicionam o funcionamento.

Aceite: somente participantes autorizados acessam comunicação; operações de mensagem respeitam autoria/permissões; falha do mapa preserva o endereço; evento legado sem coordenadas continua utilizável.

Entrega em tempo real entre dispositivos depende da configuração e disponibilidade dos serviços; não foi confirmada nesta revisão documental.

### RF-07 — Medley

Implementado: montagem por blocos de músicas diferentes. O primeiro bloco estabelece o tom de referência, e os seguintes são transpostos para ele. “Salvar na Playlist” fica abaixo de “Limpar tudo”. Após salvar, a montagem reinicia.

Aceite: todos os blocos respeitam o tom escolhido; salvamento cria conteúdo reabrível; letras não são transpostas; reinício não apaga o medley salvo.

### RF-08 — Modo palco e rolagem automática

Implementado: leitura dedicada, navegação ordenada quando vinculada ao evento, repertório rápido, controles de tom/capo/fonte/velocidade e preparação offline. Conteúdos de resumo são separados em blocos. Wake Lock e fullscreen dependem das capacidades do navegador.

Aceite: repertório segue a ordem oficial; primeira/última música têm limites claros; rolagem para ao sair; fechar palco devolve navegação utilizável; pacote offline preparado mantém leitura essencial.

Configurações e presets existem na base, mas o fluxo atual de entrada também aplica preferências específicas. Qualquer promessa de personalização por preset deve ser conferida na interface efetivamente entregue.

### RF-09 — Rolagem inteligente por áudio

Experimental: microfone, detecção de frequência via módulo do afinador, conversão para nota e comparação com a tônica do próximo acorde. Estabilização de aproximadamente 250 ms reduz avanços transitórios. Funciona sobre os elementos musicais renderizados em resumo e letra+cifra.

Comportamento requerido: marcar acorde reconhecido em verde; avançar suavemente ao concluir linha/bloco; preservar progresso durante silêncio e arrasto manual; realinhar ao reconhecer o alvo seguinte; ao finalizar sequência, pausar e voltar ao início; nova execução reinicia marcações.

Limite técnico: reconhecer a fundamental não equivale a identificar um acorde completo. Acordes polifônicos, ruído, inversões, voz e acompanhamento podem produzir falsos positivos/negativos. O beta não deve ser apresentado como reconhecimento garantido da harmonia.

Aceite deve combinar testes de sequência simulada com sessões reais de microfone, instrumentos e navegadores. Não foi realizado teste acústico nesta revisão.

### RF-10 — Afinador e metrônomos

Implementado: afinador automático e por corda para violão/guitarra, ukulele, contrabaixo e violino. Exibe nota, frequência e referência de afinação. Depende de autorização do microfone.

Há metrônomo geral em Ferramentas e metrônomo de estudo na música. Ambos oferecem BPM e compasso; a ferramenta geral permite arrastar a numeração. O metrônomo de estudo salva BPM/compasso no contexto de usuário e música.

Aceite: reprodução não duplica timers; parar cessa batidas; mudar BPM atualiza cadência; sair da música encerra seu metrônomo. Intervalo implementado: 30–240 BPM; compassos usuais 2/4, 3/4, 4/4 e 6/8.

### RF-11 — Assistente de voz

Implementado localmente: acionamento por ícone, reconhecimento de fala do navegador, normalização de comandos e respostas faladas. Não há escuta permanente por “E aí Roudy”; essa expressão pode integrar a fala após tocar no botão. Não é um agente de IA que interpreta qualquer pedido: usa regras e vocabulário explícitos.

Capacidades: abrir músicas, eventos por nome/data/hoje/amanhã, abas principais, configurações, perfil, ferramentas e Gerar com IA; ajustar idioma, tema, acessibilidade e cor; controlar recursos musicais e abrir ações de evento.

O botão aparece no cabeçalho principal, da música e do evento; interfaces sem cabeçalho podem usar atalho flutuante. A implementação oculta o assistente especificamente em Meu Perfil; regras mais amplas para todo o menu da conta ainda precisam ser alinhadas.

Ao navegar para evento a partir da música, fechar a camada da música antes de abrir o destino. O inverso segue a mesma regra.

Dentro da música, iniciar/parar e ajustar metrônomo usam a ferramenta integrada. Exemplos: “aciona o metrônomo”, “interrompa o metrônomo”, “metrônomo em 90 BPM”, “acelere o metrônomo”. Acelerar/desacelerar altera cinco BPM. Fora da música, utiliza o metrônomo geral.

“Gerar com IA”, “criar música com IA” e variações abrem a ferramenta. Preenchimento e geração autônomos por voz não estão implementados.

Limitações atuais a resolver: comandos de rolagem usam alternância em alguns caminhos, portanto “desativar” pode não ser idempotente; abrir metrônomo ainda tem um caminho que abre Ferramentas mesmo na música; números por extenso, sinônimos e compassos têm cobertura parcial. Os comandos são majoritariamente em português, mesmo com interface em outro idioma.

Aceite: intenção suportada executa uma única ação; resposta informa falha reconhecível; comando desconhecido não altera dados; operações destrutivas preservam confirmação do fluxo existente; destino fica imediatamente visível.

### RF-12 — Geração e organização com IA

Implementado e dependente de backend/provedor: três entradas — Busca por IA, Arquivo ou foto, Texto. Arquivos aceitos: PDF, PNG, JPG/JPEG, WebP e TXT. Interface permite até oito arquivos, com referência de 10 MB e 20 páginas/imagens; limites efetivos devem respeitar configuração do servidor.

Texto passa por organização musical para produzir resumo e cifra completa quando aplicável. Pesquisa possui caminhos de biblioteca pessoal, catálogo compartilhado, fontes online e fallback configurável. DeepSeek aparece como provedor utilizado pelo serviço; há módulo de OpenAI no repositório, cuja presença não comprova ativação em produção.

Saída: rascunho revisável; nunca salvar automaticamente. Manter grafia musical, qualidade de acordes, seções, ordem e alinhamento semântico. Não inventar letras ausentes da fonte. Mostrar falhas de autenticação, limite, timeout e fonte indisponível.

Aceite: insumo válido gera revisão; cancelamento preserva biblioteca; salvar é ação explícita; fonte e conteúdo são preservados segundo o contrato; chaves privadas não chegam ao navegador.

### RF-13 — Catálogo compartilhado

Implementado no backend: `shared_songs` e busca autenticada. A busca prioriza correspondência da biblioteca pessoal e depois procura o catálogo comum.

Criação/atualização de música pessoal no servidor chama contribuição para o catálogo. O serviço aplica filtros de elegibilidade; por isso, salvar somente localmente não equivale a contribuir, e nem todo payload será necessariamente publicado.

A implementação permite cifras completas provenientes de `user_upload`, `user_text` e `web_source`, conforme regras do serviço; material gerado exclusivamente a partir de conhecimento do modelo tem restrições próprias. Logo, não é correto afirmar que apenas acordes entram no catálogo ou que todo conteúdo enviado permanece exclusivamente privado.

Decisão de produto de 01/10/2026: manter as regras de contribuição existentes, sem acrescentar distinção visual de origem ou solicitação de retirada. Implementado localmente: reportar problema em músicas com correspondência exata no catálogo, motivos e descrição opcional, persistência no backend, fila restrita a revisores com identidade Supabase autorizada e estados de revisão. Relatos não removem músicas automaticamente e não modificam playlists pessoais. Configuração dos revisores e comportamento estão em `docs/RELATOS_CATALOGO.md`. Esta implementação ainda não foi publicada.

### RF-14 — Persistência, sincronização e isolamento

Implementado: armazenamento local centralizado, caches por identidade, biblioteca pessoal remota, metadados de versão, IDs de cliente, exclusão lógica, fila/reenvio e mecanismos de atualização entre contextos.

Visitante salva localmente. Ao entrar, conteúdos de visitante podem ser oferecidos para importação; recusar preserva contexto visitante. Conta existente deve recuperar seu próprio cache e dados remotos. Eventos legados possuem caminhos específicos de adoção e sincronização.

Etapa 3 implementada localmente: base confirmada por versão, mescla conservadora de campos independentes, resolução automática dos conflitos de conteúdo com versão confirmada do servidor ativa e edição local preservada em Recuperar versões. Representações musicais relacionadas são tratadas como uma unidade. Sem base anterior, a edição local é preservada antes de aplicar a remota. Exclusão prevalece na biblioteca ativa, mas a versão anterior/editada é guardada antes de aplicar a exclusão. Uma exclusão enviada verifica a versão atual no servidor, evitando apagar uma edição concorrente sem preservação. Falha em guardar a recuperação impede a substituição. Não há tela obrigatória de conflitos. Continua a proteção contra biblioteca remota inesperadamente vazia. Detalhes em `docs/ETAPA_3_SINCRONIZACAO.md`.

Alguns fluxos legados ainda exigem backup/consentimento. Isso diverge da experiência desejada de sincronização automática simples e deve ser tratado como dívida de produto. O usuário já rejeitou uma tela adicional de resolução manual de conflitos.

Aceite: contas A/B não compartilham caches privados; reenvio não duplica; falha parcial não perde itens; não limpar dados locais silenciosamente; conta autenticada sincroniza alterações elegíveis; exclusão pessoal não remove repertório de terceiros.

### RF-15 — Ajuda, contribuição e mídia

Implementado: Ajuda e Suporte com informação discreta de sincronização e opções avançadas de diagnóstico/restauração; QR de contribuição e Pix copia e cola. Copiar Pix não abre cobrança universalmente nem confirma pagamento.

YouTube é a integração visível atual para busca e player de estudo. Reprodução requer rede e disponibilidade do serviço. Spotify tem módulos e testes preservados, mas não constitui integração ativa obrigatória da interface atual.

Aceite: copiar informa sucesso/falha; fechar player impede áudio oculto; serviços externos indisponíveis não impedem a leitura local da música.

## 7. Modelo conceitual de dados

| Entidade | Responsabilidade |
| --- | --- |
| Usuário / identidade externa | Autenticação, perfil e vínculo com conta |
| Song | Música única: metadados, tom, capo, blocos, editorData, cifra completa, tablatura e mídia |
| PersonalSong | Proprietário, clientId, payload, versão e exclusão lógica |
| SharedSong | Conteúdo elegível do catálogo comum e metadados de busca |
| SharedSongReport | Relato autenticado, motivo, descrição e estado de revisão restrita |
| Evento | Líder, criador, equipe opcional, agenda, local e versão |
| Membro do evento | Participação, função e autorização |
| Item de repertório | Referência, ordem e versão oficial |
| Personalização | Diferenças privadas de cada integrante |
| Equipe / membro | Organização e funções administrativas |
| Mensagem / enquete / alteração | Comunicação e histórico do evento |
| Preferências / pacote offline | Configuração de leitura e dados essenciais no aparelho |

Identidade de música não é apenas seu título. Dados legados, campos opcionais e integrações devem ser preservados por normalização e migrações aditivas.

## 8. Requisitos não funcionais

- **Confiabilidade:** proteger conteúdo persistido; atualização não apaga bibliotecas; erros parciais ficam recuperáveis.
- **Segurança:** validar token e proprietário no backend; escapar conteúdo renderizado; segredos de IA e serviços privados ficam no servidor.
- **Privacidade:** isolamento entre identidades; diagnóstico não deve expor tokens; distinguir áudio local do afinador de reconhecimento de voz dependente do navegador e eventualmente de serviço externo.
- **Acessibilidade:** botões identificáveis, foco de teclado, rótulos, contraste, temas e escala; estados não podem depender exclusivamente de cor.
- **Responsividade:** celular, tablet e desktop, retrato e paisagem; conteúdos de música/evento centralizados e controles sem sobreposição.
- **Offline:** conteúdo previamente preparado disponível; login, IA, mapas, mídia e sincronização não são garantidos sem rede.
- **Performance:** busca local responsiva e processamento externo com estados de progresso/erro; limites e cache reduzem custo e bloqueios.
- **Compatibilidade:** testar APIs de microfone, SpeechRecognition, AudioContext, Wake Lock e fullscreen nos navegadores-alvo; oferecer alternativas manuais.
- **Observabilidade:** registrar duração, tipo de entrada e erro com minimização de conteúdo sensível; medir resultado de sync e falhas de navegação.

## 9. Arquitetura e dependências

Frontend: HTML/CSS/JavaScript, página principal extensa e módulos funcionais, servidor Node de desenvolvimento em `127.0.0.1:4173`, manifesto e service worker. Persistência atual usa storage local; IndexedDB/Vite aparecem em planos antigos, não como migração concluída.

Backend: Flask, modelos SQLAlchemy, schemas e serviços musicais. Banco depende de `DATABASE_URL`, com caminhos de compatibilidade para diferentes dialetos. Supabase autentica e oferece canais de atualização; não se deve presumir que todas as tabelas do produto residam no Supabase.

Hospedagem de referência: frontend Netlify e backend Railway. Variáveis, branch publicada, migrações e conectividade precisam de verificação própria antes de anunciar entrega em produção.

Dependências externas: Google/Supabase, provedor de IA, busca web configurável, YouTube e Geoapify/MapLibre. Disponibilidade, cotas e permissões desses serviços afetam somente os fluxos correspondentes.

## 10. Métricas e critérios de sucesso

Propostas para instrumentação, sem medição nesta revisão:

| Indicador | Definição / meta inicial proposta |
| --- | --- |
| Ativação | Percentual que salva primeira música ou cria primeiro evento |
| Retenção | Usuários ativos semanais que retornam para estudo/execução |
| Integridade | Zero perda silenciosa de conteúdo em testes críticos |
| Sincronização | Taxa de conclusão e pendências por identidade/dispositivo |
| Voz | Pelo menos 90% dos comandos suportados na matriz controlada de frases |
| IA | Taxa de rascunhos aproveitados e necessidade de correção por entrada |
| Palco | Conclusão de repertório preparado sem bloqueio de leitura offline |
| Performance | Ações locais p95 abaixo de 300 ms em dispositivo-alvo definido |
| Suporte | Erros por sessão e recorrência de recuperação/manual sync |

Eventos de análise sugeridos: entrada, primeiro conteúdo salvo, evento criado, palco iniciado, comando reconhecido/executado/falhou, geração iniciada/concluída/falhou e sync concluída/falhou. Não registrar letra, arquivo, voz bruta, token ou conteúdo privado como propriedade de analytics.

## 11. Validação e lançamento

Matriz mínima:

1. Visitante → criar → recarregar → entrar → importar/recusar → sair → conta B.
2. Dois dispositivos na mesma conta, edição offline, retorno online, falha parcial e exclusão.
3. Líder/integrante: edição oficial negada ao integrante; versão pessoal isolada; transferência.
4. Resumo, cifra completa e tablatura: edição, transposição, capo e retorno ao original.
5. Voz: música → evento → música; metrônomo contextual; aliases; comando desconhecido; permissão negada.
6. IA por três entradas, fontes ausentes, limites, timeout, revisão e cancelamento.
7. Palco offline, primeira/última música, orientação e Wake Lock indisponível.
8. Rolagem inteligente em áudio real, silêncio, repetição, gesto manual e conclusão.
9. Temas/idiomas/contraste, desktop e dispositivos móveis.

O repositório possui testes de frontend, backend e interface. Esta revisão não executou a suíte completa nem certifica produção. O teste do assistente existe separadamente e deve ser incorporado ao processo obrigatório de validação.

Critério de publicação: matriz crítica aprovada, configurações dos serviços verificadas, migrações compatíveis, cache atualizado, identificação inequívoca da versão e procedimento de reversão documentado. Beta acústico permanece identificado como experimental.

## 12. Prioridades e roadmap proposto

| Prioridade | Entrega | Motivo |
| --- | --- | --- |
| P0 | Consolidar isolamento de contas, migração e recuperação de sincronização | Proteção do conteúdo e confiança |
| P0 | Configurar revisores e publicar o fluxo de relatos do catálogo | Revisão humana sem exclusão automática |
| P0 | Validar matriz local/produção e identidade da versão publicada | Evitar anunciar função ainda indisponível |
| P1 | Comandos idempotentes e contexto consistente em voz | Corrigir alternâncias e navegação ambígua |
| P1 | Testes acústicos e refinamento da rolagem beta | Qualidade no uso musical real |
| P1 | Auditoria de idioma, acessibilidade e mobile | Experiência coerente nos seis idiomas |
| P1 | Atualizar documentação antiga e automatizar checks críticos | Fonte de verdade reproduzível |
| P2 | Extrair módulos da página, avaliar armazenamento estruturado | Manutenção e crescimento |
| P2 | Agenda/escala, lembretes e confirmação de disponibilidade | Evolução da colaboração |
| P2 | Avaliar login por e-mail após retomada explícita | Alternativa ao Google |

Não há prazos ou responsáveis assumidos. A equipe deve estimar entregas após priorização e validação dos serviços.

## 13. Decisões e questões em aberto

Decisões já expressas: Google como acesso atual; visitante provisório no MVP; preservar conteúdo musical ao traduzir; um líder por evento com transferência; medley usa tom do primeiro bloco; assistente acionado por toque sem abrir painel; metrônomo contextual; rolagem inteligente beta; não adicionar tela de resolução manual de conflitos.

Decisão adicional de 01/10/2026: preservar as regras atuais de contribuição, não acrescentar distinção visual de origem nem solicitação de retirada; problemas serão reportados e revisados por equipe autorizada, sem apagar dados pessoais ou músicas automaticamente.

Questões para planejamento: conferir paridade local/produção das regras de contribuição existentes; política determinística de conflitos sem tela extra; navegadores oficialmente suportados; alcance da tradução dos comandos; regras finais de presets do palco; dados de telemetria permitidos; separação de ambientes e limites de custos dos provedores.

## 14. Fontes internas da revisão

- `index.html`: navegação, conta, música, eventos, palco, configurações e comandos de interface.
- `js/app-assistant.js`, `js/app-auth.js`, `js/study-metronome.js`: voz, login e controle musical.
- `js/smart-scroll.js`, `js/tuner.js`, `js/tablature.js`: ferramentas e beta acústico.
- `js/song-model.js`, `js/song-repository.js`, `js/library-sync.js`, `js/demo-library.js`: dados, identidade e migração.
- `js/ai/ai-harmonic-summary.js` e cliente: entradas, rascunho e backend.
- `backend/app/routes/library.py`, `shared_songs.py`, `events.py`, `resumo_harmonico.py`: regras remotas.
- `backend/app/services/shared_songs_service.py`, `ia_service.py`, `backend/app/config.py`: catálogo, geração e configuração.
- `package.json`, `service-worker.js`, testes e documentação histórica: arquitetura e rastreabilidade.

Manutenção: revisar este PRD em cada mudança material de login, compartilhamento, sincronização, voz ou modo palco; registrar a versão auditada e as diferenças de produção.
