# Auditoria da biblioteca inicial e plano de limpeza

## Relações encontradas

- As 86 músicas antigas eram um array embutido no frontend. No primeiro acesso, o array era copiado para `sc_songs_v1`/`cifras_musicas_v1`, junto com músicas pessoais.
- A sincronização envia essa coleção para `personal_songs`. A separação por usuário é feita por `owner_user_id`; a restrição única é `(owner_user_id, client_id)`.
- Excluir um `collaboration_user` causa cascade em `personal_songs`. Esta migração não exclui usuários e não usa esse caminho.
- `event_repertoire_items.song_id` é texto, sem chave estrangeira para `personal_songs`; portanto não existe cascade ao arquivar uma música pessoal. O script informa quantas referências textuais coincidem antes de qualquer alteração.
- Medleys são locais e exportáveis; não existe tabela de medley no backend. O medley-demo é gravado em `sc_medleys_v2` uma única vez para instalações novas.
- O endpoint `/identity/claim` transfere eventos/bandas e depois apaga o usuário legado, o que pode acionar cascade sobre `personal_songs`. A chamada automática foi removida do login; ele não faz parte da migração da biblioteca e não é chamado por esse fluxo.

## Regra de preservação

Uma cópia só é classificada como catálogo legado quando sua assinatura de conteúdo coincide exatamente com uma das 86 entradas originais. Qualquer alteração de título, artista, tom, capo, blocos, letra+cifra completa, Spotify ou capa muda a assinatura e preserva o registro.

No dispositivo, as cópias intactas são retiradas de exibição. Se eram a única coisa na biblioteca, entram exatamente quatro demos. Se havia músicas pessoais, elas permanecem sem receber demos extras. A sincronização ignora cópias remotas intactas do catálogo antigo para que não reapareçam.

## Execução segura em produção

1. Fazer snapshot/backup nativo do MySQL/Railway.
2. Executar `python scripts/audit_legacy_library.py --report <caminho>.json` com as variáveis do ambiente de produção.
3. Revisar no JSON os totais e **cada registro** em `records`: removidos, preservados, proprietários afetados e referências de repertório.
4. Somente após aprovação humana, repetir com `--apply --confirm <reportHash>`.

O modo de aplicação reconsulta o banco, exige que o hash do conjunto ainda seja idêntico, cria um segundo backup JSON e aplica apenas `deleted_at` + incremento de versão. Não há hard delete. Para reverter, restaure `deleted_at` e a versão usando o backup, ou restaure o snapshot do banco.

Nenhuma limpeza de produção foi executada por esta mudança.
