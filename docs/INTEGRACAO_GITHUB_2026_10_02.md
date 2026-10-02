# Integração local com o GitHub — 02/10/2026

## Referências e escopo

- Origem: `origin/main`, commit `ae0d69d` (Merge PR #81), confirmado novamente ao concluir a integração.
- Checkpoint das alterações locais: `0351831`.
- Branch de integração: `codex/integracao-github-2026-10-02`.
- Integração local somente. Não houve push, deploy, alteração no Supabase nem execução da migração de catálogo em produção.
- As próximas etapas do plano não foram implementadas neste trabalho.

## Melhorias incorporadas do GitHub

- Busca de cifras com consulta rápida ao repertório do artista, comparação de títulos e tratamento de participações/versões ao vivo.
- Botão **Completar cifra**: acrescenta Letra + Cifras sem remover o resumo harmônico, tom ou capotraste existentes; informa ausência de resultado e limite diário.
- Busca por voz guiada na geração com IA e contribuição Pix disponível também para usuários conectados.
- Resumo harmônico sem nomes técnicos de seções, mantendo acordes, frases-gancho e blocos no modo palco.
- Regras atualizadas de elegibilidade do catálogo: texto manual excluído; fontes online/arquivo e conteúdo de cifra verificado podem participar, conforme os critérios do serviço.
- Ferramenta opcional de resolução manual de conflitos legados.

## Decisões ao resolver conflitos

Cinco arquivos tinham conflitos: `index.html`, `js/library-sync.js`, `service-worker.js`, `tests/library-sync.test.js` e `tests/pwa-branding.test.js`.

Foram mantidas as proteções locais de sincronização da etapa 3: comparação com base confirmada, mescla de campos independentes, preservação da outra edição em conflitos musicais, rejeição de versões remotas antigas, exclusões com recuperação e versão esperada, retry e descarte de respostas após troca de identidade. O relógio do dispositivo não determina automaticamente qual edição deve vencer.

A resolução manual recebida do GitHub foi conciliada com essas proteções: backup separado por conta, recuperação antes da substituição, bloqueio sem login, base de versão atualizada e confirmação da nuvem somente após nova consulta. Conflitos novos continuam tratados discretamente pela política local; o seletor manual atende pendências legadas.

As melhorias locais de backup seletivo, histórico, isolamento de contas/convidado, relatos de problemas e revisão autorizada foram preservadas no checkpoint e na integração. Completar cifra usa salvamento com checagem de falha e ignora o resultado se a conta ativa mudar. Identificadores e títulos da ferramenta de conflitos foram escapados.

O cache PWA foi atualizado para `v177-github-unificado`, com versões de scripts conciliadas, módulo de recuperação atual e ícones sem parâmetro usados na tela de entrada/manifesto. Nenhum armazenamento de músicas foi limpo.

## Validação

- Suíte principal `npm test`, incluindo política de sincronização, backup, isolamento A/B, exclusões, acordes e rolagem inteligente.
- Backend: **321 testes aprovados**.
- Navegador: completar cifra, resumo harmônico, voz/doação, conflitos legados, backup/recuperação em celular e desktop, estados de sincronização e PWA com recarga offline.
- Testes ajustados ao menu atual, tela de entrada, restauração seletiva e quantidade real de músicas iniciais.
- Servidor estático local em `http://127.0.0.1:4173/?github-unificado=184`.

Testes de voz usam simulações de reconhecimento e de áudio; não comprovam captação real do microfone nem desempenho de detecção de acordes. Testes de IA usam respostas simuladas e testes do serviço; não houve envio de arquivos pessoais nem cobrança de geração durante a validação.

## Limites e pendência já discutida

O endereço de API configurado no preview permanece o mesmo serviço publicado. O código do backend foi integrado e testado localmente, mas as rotas/proteções novas só estarão disponíveis no serviço oficial após um futuro deploy conjunto. Não foram alterados os dados de produção para validar esta mescla.

A separação completa entre contribuição inicial ao catálogo ROUDY e edições pessoais posteriores ainda precisa de uma etapa específica: a rota de atualização de músicas pessoais continua chamando `SharedSongService.contribute`. O filtro de texto manual incorporado do GitHub não equivale a impedir toda contribuição posterior de uma música elegível. A mescla não implementa nem declara concluída essa regra adicional solicitada pelo usuário.
