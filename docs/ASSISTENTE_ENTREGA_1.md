# Assistente de voz — entrega 1

Nota de atualização: esta é a descrição histórica da primeira entrega. As ampliações estão em `ASSISTENTE_ENTREGA_2.md` e `ASSISTENTE_ENTREGA_3.md`.

## Escopo

Refatoração técnica da interpretação e execução, mantendo o ícone, a captura de fala do navegador, a resposta falada, os avisos existentes e os comandos não migrados. Não há novo painel, escuta permanente, modelo generativo ou alteração no banco de produção.

## Módulos

- `js/assistant-actions.js`: catálogo declarativo; interpreta frases e parâmetros, sem escrever dados ou manipular telas.
- `js/assistant-action-manager.js`: resolve candidatos, valida valores, verifica contexto e permissões, bloqueia concorrência e negações, elimina duplicações da mesma sessão de reconhecimento e entrega resultado estruturado.
- `js/assistant-action-runtime.js`: executa ações através das funções reais do aplicativo e verifica o resultado.
- `js/app-assistant.js`: integração com microfone, contexto do ROUDY e compatibilidade dos comandos anteriores.

Não é necessário adicionar novos ramos ao gerenciador para uma nova ação: registrar sua definição no catálogo e seu handler no runtime. O gerenciador aceita somente handlers previamente registrados; não interpreta código ou nomes de funções recebidos por texto.

## Ações migradas

| Ação | Contexto/regra |
| --- | --- |
| Abrir música | Título ou título + artista; várias correspondências não escolhem a primeira silenciosamente |
| Abrir evento por nome/data | Somente eventos acessíveis; lista existente quando houver várias opções |
| Próximo evento, hoje, amanhã | Mantém o motor de intenções Python e o fallback local; descarta resultados atrasados se os eventos/conta mudaram |
| Playlist, eventos, Medley | Navegação direta pelas funções existentes |
| Capotraste | Inteiro de 0 a 12; música aberta e edição autorizada |
| Subir/descer/restaurar tom | Ajuste de uma unidade, respeitando limites e contexto |
| Salvar alterações | Usa o salvamento real da playlist ou da versão pessoal do evento; não modifica o catálogo comunitário nem a versão oficial por engano |
| Metrônomo | Abrir, iniciar/parar, BPM, ajuste relativo e compasso; utiliza o metrônomo da música quando ela está aberta |
| Rolagem | Iniciar/parar automática ou inteligente; preserva a detecção de acordes e o progresso |
| Parar sem alvo | Só executa se houver uma única ferramenta pertinente ativa; caso contrário pede especificação |
| Busca da playlist | Abre a busca existente e preenche o termo |
| Busca do YouTube | Prioridade explícita sobre busca geral; reutiliza o seletor de gravação da música, sem salvar o vídeo automaticamente |

São 18 ações centrais e um adaptador de compatibilidade. Idioma, aparência, perfil, afinador, IA, câmera, criação/edição de eventos, compartilhamento e demais comandos anteriores continuam no caminho existente. Esses comandos ainda não receberam a mesma migração e auditoria de resultado das ações centrais.

## Segurança e limites

- Verifica conta, biblioteca carregada, música, evento e item do repertório.
- Uma tela de evento aberta por trás da música não muda o contexto da playlist. Pedidos explícitos para salvar em outro destino são bloqueados, em vez de copiar dados silenciosamente.
- Bloqueia controles de estudo/salvamento quando outro editor estiver aberto, evitando salvar o rascunho errado.
- Negação é analisada antes de executar regras antigas. Uma palavra negativa dentro de um título explicitamente solicitado pode continuar sendo interpretada como nome de música.
- Bloqueia pedidos combinados, contraditórios e correções compostas nesta fase; não executa só a primeira metade.
- Repetir um comando de início não reinicia uma ferramenta já ativa.
- A mesma identificação de sessão de fala não repete uma alteração. Um novo toque representa um pedido novo: subir o tom duas vezes intencionalmente continua possível.
- Não anuncia sucesso quando o controlador, o áudio ou a persistência falham.
- Uma edição manual feita enquanto o salvamento remoto aguarda resposta permanece pendente, sem ser apagada ou considerada salva.
- Um editor aberto ou modificado durante esse salvamento também permanece aberto com seu novo rascunho, sem ser fechado pela resposta anterior.
- Memória de deduplicação é curta, limitada e apenas em RAM. Não cria histórico persistente de áudio, transcrições ou credenciais; o resultado anterior não é exposto depois de trocar de conta.
- A busca por YouTube precisa de uma música aberta ou de uma correspondência única na playlist para abrir o seletor existente. Uma busca sem esse alvo pede que a música seja aberta; não reativa o painel antigo oculto.
- Não introduz diálogo com memória de acompanhamento, sequências de ações, preenchimento integral de formulários ou entendimento semântico generativo; essas são entregas posteriores.

## Verificação

- `npm run test:assistant`: catálogo, conflitos, negações, parâmetros, permissões, duplicações, falha de áudio, falha de ajuste, falha de salvamento e troca de conta, além dos comandos anteriores e motor de intenções.
- `npm run test:assistant:ui`: requer o servidor local na porta 4173 e Playwright; verifica os controles reais, salvamento por voz, playlist versus evento, mudanças durante um salvamento, busca de vídeo, editor aberto, falha de armazenamento e resposta antiga após troca de conta.
- A suíte principal preserva os testes existentes e inclui o novo teste do gerenciador.
- Verificações de navegador usam dados fictícios e APIs simuladas; não certificam a transcrição em microfone real ou o login Google em produção.

## Execução

Interface: `http://127.0.0.1:4173/?assistente-acoes=350`.
Cache offline: `simplificando-cifras-v350-assistente-acoes`.

Somente implementação local. Nenhum push/deploy ou migração externa faz parte desta entrega.
