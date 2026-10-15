-- Tabela nova e somente aditiva: cópias de playlists compartilhadas por link.
CREATE TABLE IF NOT EXISTS shared_playlists (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(80) NOT NULL,
  playlist_data JSON NOT NULL,
  created_at DATETIME NOT NULL,
  INDEX ix_shared_playlists_owner_user_id (owner_user_id),
  CONSTRAINT fk_shared_playlists_owner FOREIGN KEY (owner_user_id) REFERENCES collaboration_users(id) ON DELETE CASCADE
);
