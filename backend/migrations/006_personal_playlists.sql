-- Tabela nova e somente aditiva: playlists pessoais sincronizadas entre os aparelhos do dono.
-- Guarda só referências às músicas da biblioteca + tom/ajustes de cada item.
-- (O app também cria esta tabela sozinho via db.create_all() ao iniciar.)
CREATE TABLE IF NOT EXISTS personal_playlists (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(80) NOT NULL,
  client_id VARCHAR(160) NOT NULL,
  playlist_data JSON NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX ix_personal_playlists_owner_user_id (owner_user_id),
  CONSTRAINT uq_personal_playlist_owner_client UNIQUE (owner_user_id, client_id),
  CONSTRAINT fk_personal_playlists_owner FOREIGN KEY (owner_user_id) REFERENCES collaboration_users(id) ON DELETE CASCADE
);
