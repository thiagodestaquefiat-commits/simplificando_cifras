# Assistente de voz — entrega 2

Nota de atualização: esta é a cobertura histórica da entrega 2. O acompanhamento e os novos limites estão em `ASSISTENTE_ENTREGA_3.md`.

Implementação local em 10/10/2026. Complementa `ASSISTENTE_ENTREGA_1.md`.

## Resultado

O catálogo passou de 18 ações centrais para 46, mais uma entrada de fallback. As novas ações usam pedidos completos, validação de contexto/permissões e funções reais do aplicativo. Não criam uma biblioteca ou uma regra de salvamento paralela.

O código antigo foi preservado fisicamente para evitar uma remoção ampla neste trabalho. Pedidos não reconhecidos não executam suas regras de alteração por substring. O adaptador só conserva a saudação vazia; os comandos migrados usam o catálogo e o executor verificado.

## Cobertura

- Idiomas: português brasileiro, espanhol, inglês, italiano, francês e alemão. Exemplo: `mudar idioma para inglês`. Isso não implica compreensão livre nesses seis idiomas.
- Aparência: dez cores de cifras, temas claro/escuro/sistema. Exemplos: `cor da cifra azul`, `tema escuro`.
- Acessibilidade: alto contraste, modo para daltônicos, escala de 100 a 140 nas opções existentes.
- Telas: configurações, aparência/acessibilidade, idiomas, ferramentas, ajuda, conta, perfil, bandas, backup e notificações/convites. Voltar respeita as camadas existentes.
- Afinador: abrir, preparar violão/guitarra/ukulele/baixo/violino, iniciar/parar, selecionar corda ou modo automático. Exemplo: `afinador para ukulele`, `corda quatro`.
- Música: instrumentos dos diagramas; resumo, letra+cifra, letra e tablaturas compatíveis; próxima/anterior dentro do repertório; fonte no palco e velocidade da rolagem. Tom, capo, BPM, compasso e salvamento da primeira entrega permanecem.
- Palco: iniciar na música ou no primeiro item disponível do evento e sair. Evento vazio não produz falso sucesso.
- Criação: Gerar com IA, busca por IA, arquivo, texto e câmera. Abre os fluxos existentes; abrir não gera nem salva conteúdo automaticamente.
- Edição/exclusão: editar a música abre o editor correto. Exclusão da playlist exige confirmação nativa; a versão aberta pelo evento não pode excluir a música da playlist.
- Medley: abrir inclusão de bloco e salvamento; limpar com confirmação existente. Medley vazio é tratado como nenhuma alteração.
- Eventos: criar, editar dados, adicionar músicas, ordenar repertório, ver participantes, abrir chat/avisos, compartilhar, buscar integrantes, acessar liderança e menu de exclusão.
- Conta: entrada Google, saída confirmada com verificação da sincronização e sincronizar biblioteca.
- Recuperação: exportar backup, acessar importação e baixar diagnóstico. Importação abre Backup e dados; em Opções avançadas, o usuário toca em Importar Backup para escolher o arquivo. O gesto é necessário em navegadores que bloqueiam seleção programática. A importação continua aditiva e sem eventos.
- Contribuição: copiar Pix; falha de cópia usa a alternativa existente sem anunciar que copiou. Não inicia pagamentos.

## Proteções

- Uma ação por pedido; negações, contradições, valores inválidos e pedidos incompletos não autorizam uma alteração parcial.
- Evento alvo é o realmente aberto ou a origem da música do evento, nunca uma tela antiga atrás da playlist.
- Administração exige liderança e busca de integrantes exige login. A autorização do servidor permanece.
- Convites, compartilhamento, liderança e exclusão de evento abrem os fluxos existentes para seleção/confirmação, sem conclusão automática por voz.
- Outro comando não descarta editor aberto, formulário de geração/criação, edição inline ou prévia de configurações não salva. Conclua ou feche o formulário pela interface.
- Preferências alteradas por voz atualizam também os campos correspondentes. Um Salvar posterior não restaura acidentalmente um valor antigo.
- O seletor de cor abre com a cor salva, não sempre em laranja.
- Permissão de microfone concedida após mudança de contexto é invalidada e a captura interrompida.
- Sem novo histórico persistente de áudio, transcrições, credenciais ou dados pessoais.
- Perfil/menus de conta mantêm a regra de esconder o assistente. Nenhuma interface de conversa foi criada.

## Limites

Não é uma IA generativa e não oferece entendimento irrestrito. Ainda não implementa conversa de acompanhamento, sequências, preenchimento integral de formulários, ditado de músicas ou escolha automática de usuários/arquivos/vídeos. Aceitar/rejeitar convite e reportar/revisar problemas continuam nos fluxos existentes, sem automação do envio por voz nesta entrega.

A transcrição depende do navegador e do microfone. Os testes usam dados fictícios, APIs simuladas e transcrições simuladas; não certificam microfone físico ou login Google em produção.

## Arquivos principais

- `js/assistant-actions.js`: catálogo e parâmetros.
- `js/assistant-action-runtime.js`: execução e verificação.
- `js/assistant-action-manager.js`: proteção dos editores e conflitos ampliados.
- `js/app-assistant.js`: ponte nativa, contexto, preferências e aliases.
- `index.html`: retornos verificáveis de login/diagnóstico/Pix, cor inicial e versões de scripts.
- `service-worker.js`: cache `simplificando-cifras-v351-assistente-catalogo`, sem apagar dados locais.
- `tests/assistant-second-delivery.test.js` e `tests/assistant-second-delivery-ui.test.js`: lógica e integração.
- `package.json`: novos testes incorporados.

## Verificação

- `npm test`: 61 suítes de frontend aprovadas.
- `npm run test:assistant:ui`: três suítes de integração aprovadas, incluindo regressões da entrega 1, cobertura da entrega 2 e contexto.
- `tests/pwa-branding.test.js`: aprovado.
- `git diff --check`: sem erros de whitespace.

Interface local: `http://127.0.0.1:4173/?assistente-catalogo=351`.

Sem push, deploy, migração Supabase ou alteração em contas reais.
