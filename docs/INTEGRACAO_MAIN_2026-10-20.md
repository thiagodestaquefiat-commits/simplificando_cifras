# Integração local — 20/10/2026

Base anterior: `642672d`. Main consultada no GitHub: `5e87c17` (PR #100).

As melhorias locais foram preservadas no checkpoint `fefdeac`, antes da mesclagem, na branch local `codex/integracao-main-2026-10-20`. Nenhuma alteração foi enviada para main nem foi solicitado deploy.

## Funcionalidades reunidas

Da main: playlists na Home, organização de músicas em playlists, tons próprios por item, cópia para eventos, compartilhamento de playlists, sugestões de encerramento visíveis aos integrantes com inclusão restrita ao líder e correção de espaço/Enter/salvamento na edição rápida dos blocos.

Locais: persistência de foto de perfil, convite com função musical selecionada, lista de funções simplificada, busca priorizada pelos instrumentos do perfil, memória de tons dos vocalistas com proteção de conflitos e ajustes manuais, transposição consistente de resumo/Letra+Cifra e documentação/testes correspondentes.

O único conflito textual estava em `service-worker.js`. Foram mantidos os recursos de ambas as versões e adotado o cache `v516-main-integrada`. Os modelos do backend e scripts da página foram conferidos após a mesclagem automática. A integração não redesenha componentes nem muda as decisões de interface já aprovadas.

## Validação

- `npm test`: suíte geral com os testes de playlists da main.
- `python -m pytest backend/tests -q -p no:cacheprovider`: suíte completa em banco isolado.
- `npm run test:invite-roles`, `npm run test:profile`, `npm run test:vocal-keys`: funcionalidades locais preservadas.
- `tests/main-integration-2026-10-20-ui.test.js`: Home, tons independentes por playlist, inclusão no evento e teclado da edição rápida em celular/desktop.

As novas funcionalidades de conta e histórico vocal continuam exigindo a publicação conjunta de backend/frontend para uso no ambiente oficial. O preview local mantém a configuração de API já existente; não foi alterado o banco de produção durante os testes.
