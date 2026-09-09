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

## Painel e contadores

O painel usa o mesmo estado do mecanismo de sincronização, sem números fixos:

- **Neste dispositivo:** quantidade atual de músicas retornada por `songRepository`, incluindo músicas que existem somente localmente.
- **Na nuvem:** quantidade de registros pessoais ativos retornados pela conta autenticada; itens com `deleted_at` não entram na resposta.
- **Pendentes:** soma de alterações locais ainda não confirmadas pelo servidor e versões remotas ainda não aplicadas localmente. Um item é contado uma única vez em cada direção.
- **Conflitos:** músicas para as quais local e remoto mudaram desde a última versão conhecida. A cópia local e um snapshot da cópia remota ficam preservados no metadado local para uma resolução futura.

Os estados visíveis são: sem autenticação, aguardando consentimento, sincronizando, sincronizado, pendente, offline, conflito e erro. O painel nunca inicia o primeiro upload sozinho. Depois do consentimento, edições locais podem ser retomadas automaticamente quando a conexão volta.

## Dois dispositivos e falhas parciais

O download remoto é combinado com a coleção local pelo `client_id`; somente na adoção inicial também é aceito o ID original exato. Uma música local exclusiva nunca é removida pelo download. Se um dispositivo não alterou uma música, uma versão remota mais nova pode atualizar seu cache; se ambos alteraram, nenhuma delas é sobrescrita.

Em lotes parcialmente aceitos, somente respostas confirmadas recebem nova versão e hash. Os itens que falharam continuam pendentes e uma nova tentativa envia apenas esses itens. Os lotes usam no máximo 100 músicas, portanto a fixture de 136 músicas é enviada em 100 + 36.

## Conflitos e exclusão

Versões usam concorrência otimista. Se local e remoto mudaram desde a última versão conhecida, a cópia local é preservada e o envio é bloqueado para resolução futura. Uma versão remota mais nova só substitui cache local sem edição. Exclusão remota silenciosa não é usada pelo frontend nesta fase; o endpoint implementa apenas soft delete para um fluxo explícito futuro.

Nenhuma migração desta fase altera repertórios ou seus IDs. O SQL aditivo está em `backend/migrations/002_personal_songs.sql`; na inicialização atual, `db.create_all()` também cria somente tabelas ausentes.
