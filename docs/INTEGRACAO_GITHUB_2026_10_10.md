# Integração local — 10/10/2026

Main integrada: `288b2e3f0c17bf3fc190a03d1733c36f98563bf0` (PRs 92 e 93).
Checkpoint das alterações locais: `e6fff17`. Uma cópia adicional foi mantida no stash `codex-pre-integracao-main-2026-10-10`.

## Resolução

- Preservados os módulos locais de intenções, linguagem natural, acompanhamento, sequências, memória contextual e execução verificada.
- Integradas escolha de voz, respostas faladas opcionais e pronúncia do nome. A preparação da fala ocorre antes da execução para preservar callbacks e a espera pelo término da pergunta. Com voz desligada, o acompanhamento continua sem aguardar áudio inexistente.
- Mantidos comandos diretos sem prefixo obrigatório; variantes de Roudy também são aceitas. Negação principal e proteção contra respostas de outra tela/conta continuam vigentes.
- Mantida a aba Busca por IA além de Arquivo ou imagem e Texto. Integrados os nomes e acessos atualizados da main; o backend de geração não foi substituído.
- Integrados ajustes de cabeçalho, perfil, instrumentos, configurações/ajuda, modo palco, afinador, convites múltiplos e logout apenas da sessão local.
- Preservados controles de rolagem inteligente na barra, melhorias de áudio, tablaturas, isolamento das músicas dos eventos, persistência e backups.
- Resolvidos conflitos em index.html, app-assistant.js e service-worker.js. Assistente carregado uma única vez, cache v365 com os novos recursos e sem URLs duplicadas.

## Validação

- Suíte principal do projeto e sete testes de interface do assistente.
- Casos adicionais de voz selecionada/desligada, preparo de callbacks e prefixo opcional.
- PWA: cache instalado, reabertura offline e backup idempotente com dados preservados.
- Upload múltiplo: ordem, limites, remoção, rascunho único e tamanhos celular/desktop.
- Convites múltiplos: fila sem duplicações, envio somente no salvamento final, falha parcial, retry sem duplicar e entrada do integrante condicionada ao aceite.

Os testes de reconhecimento usam transcrições simuladas; não certificam microfone físico nem os serviços reais do Google/Supabase. Nenhum deploy ou push realizado.
