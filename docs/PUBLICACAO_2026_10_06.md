# Publicação de 06/10/2026

Integra as melhorias locais de assistente por intenções, repetições da rolagem,
isolamento de músicas do evento, remoção de avisos de preparação offline e
extração/compatibilidade de tablaturas com a main `51ca376`.

Preserva a busca que prefere versões com letra e a organização sem duplicatas
da main. Não executa scripts de exclusão/deduplicação do banco de produção.

Regra de privacidade reafirmada pelo usuário: músicas de Texto/manual são privadas.
Somente a criação inicial via online/upload contribui para o catálogo. Alterações
posteriores ficam na biblioteca pessoal, sem substituir ou criar versões públicas.
Uma flag antiga `CATALOG_OPEN_CONTRIBUTION=true` não pode reativar contribuição
aberta. Não remove entradas que já existam no catálogo; remoção/moderação exige
uma ação própria, com escopo definido.

Novos dados de eventos usam colunas JSON opcionais/aditivas, sem remoção de dados.
O frontend verifica capacidade do backend antes de enviar esses dados; durante
o intervalo entre deploys, alterações permanecem locais e na fila correspondente.

Verificação online deve confirmar cache v199, `/api/assistant/resolve` e
`/api/collaboration/capabilities` com `eventSongData: 1`, `textManualPrivate: true`
e `personalEditsPrivate: true`, sem criar usuários, músicas ou eventos de teste
em produção. Testes acústicos reais não são substituídos pelos testes automatizados.
