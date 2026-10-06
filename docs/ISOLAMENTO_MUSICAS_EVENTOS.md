# Música do evento separada da playlist

Ao selecionar uma música no editor do evento, captura-se uma cópia profunda da
música e dos ajustes salvos da playlist: tom/transposição, capo, resumo, letra/cifra,
tablatura, BPM/compasso, vídeo e preferências de leitura. A cópia fica em
`repertoire.shared.songData`, sem referência mutável ao objeto da biblioteca.
Transposição e capo são materializados na cópia, mantendo a aparência inicial.

Edições pessoais posteriores ficam em `personalEdits[userId].songData`, somente
nesse item desse evento. As edições compartilhadas continuam restritas ao líder
e afetam apenas a versão oficial desse evento. Nada é escrito em `PersonalSong`,
`SharedSong` ou na lista principal por essas operações.

Correções de interface: Editar Cifra e o editor completo preservam o contexto do
evento; Salvar alterações do detalhe usa a gravação pessoal do evento; o metrônomo
usa uma chave própria por evento/item; vídeo fica em rascunho até salvar; completar
cifra e rascunhos de IA mantêm o destino do evento; Excluir da Playlist não aparece
nesse contexto e a exclusão da biblioteca é bloqueada pela voz nesse caso.

Eventos legados sem cópia capturam a versão local disponível na primeira leitura,
preservando ajustes oficiais existentes. Isso não recupera automaticamente valores
que já tenham sido sobrescritos na playlist antes desta correção.

Sincronização: duas colunas JSON opcionais e aditivas (`shared_song_data` e
`personal_song_data`), sem exclusão de tabelas/dados. Os endpoints mantêm validações
de líder/integrante e retornam personalização somente ao respectivo usuário.
O cliente consulta `/api/collaboration/capabilities` antes de enviar cópias. Se o
backend ainda não suporta, mantém alterações locais/na fila; não confirma gravação
remota incompleta. Reconciliação preserva cópias locais ausentes no backend legado
e aplica a fila pessoal da identidade atual. Nenhum catálogo comunitário é alimentado
por edições de evento.

Testes de interface isolada: cópia inicial fiel à playlist, tom/capo/BPM/vídeo,
edição de título e letra completa, reabertura e alteração posterior da playlist.
Testes de backend: privacidade, permissões, cópia persistida, dados inválidos e
catálogos pessoais/comunitários intactos. Implementação local; sincronização dos
novos campos exige publicar frontend e backend juntos. Não houve deploy.
