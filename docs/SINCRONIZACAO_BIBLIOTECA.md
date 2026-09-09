# Sincronização segura da Biblioteca

## Arquitetura auditada

- `songRepository` abre primeiro `sc_songs_v1`, migra de `cifras_musicas_v1` quando necessário e continua gravando nas duas chaves.
- `sc_musicas_v2` aparece apenas na exportação como compatibilidade histórica. Eventos ficam em `sc_events_v1`/`cifras_setlists_v1`; playlists, medleys, favoritos e preferências usam chaves próprias.
- `Song` preserva o ID local, campos legados, blocos, `editorData`, `fullChordSheet`, contexto, metadados de Spotify/YouTube e campos futuros.
- O backend já persiste usuários, identidades externas, equipes, membros, eventos, repertórios, personalizações e histórico. Antes desta etapa não havia biblioteca pessoal persistente.
- A autenticação valida o Bearer token no servidor e define `g.current_user`; o cliente nunca escolhe o proprietário.

## Modelo e identidade

`personal_songs` guarda `owner_user_id`, `client_id`, o payload completo em JSON, versão, datas e soft delete. A restrição `(owner_user_id, client_id)` torna reenvios idempotentes. O ID original da música não é substituído e continua válido nos repertórios.

O `client_id` é criado no dispositivo somente após a confirmação de sincronização e fica no metadado `librarySync`. Em outro dispositivo, músicas já existentes são pareadas primeiro pelo `client_id` e, durante a adoção inicial, pelo ID original exato — nunca apenas por título/artista.

## Fluxo seguro

1. A biblioteca local abre imediatamente, inclusive offline.
2. Após login, somente músicas remotas são baixadas; músicas locais não são enviadas automaticamente sem consentimento.
3. A tela informa quantidades local, remota e a enviar.
4. Após confirmação, os IDs são persistidos localmente antes do envio e lotes de até 100 músicas são copiados.
5. Cada item retorna `created`, `existing`, `updated` ou `failed`; uma retomada reutiliza os mesmos IDs.
6. A cópia local nunca é apagada.

## Conflitos e exclusão

Versões usam concorrência otimista. Se local e remoto mudaram desde a última versão conhecida, a cópia local é preservada e o envio é bloqueado para resolução futura. Uma versão remota mais nova só substitui cache local sem edição. Exclusão remota silenciosa não é usada pelo frontend nesta fase; o endpoint implementa apenas soft delete para um fluxo explícito futuro.

Nenhuma migração desta fase altera repertórios ou seus IDs. O SQL aditivo está em `backend/migrations/002_personal_songs.sql`; na inicialização atual, `db.create_all()` também cria somente tabelas ausentes.
