CREATE TABLE IF NOT EXISTS personal_songs (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  owner_user_id VARCHAR(80) NOT NULL,
  client_id VARCHAR(160) NOT NULL,
  song_data JSON NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  deleted_at DATETIME NULL,
  CONSTRAINT uq_personal_song_owner_client UNIQUE (owner_user_id, client_id),
  CONSTRAINT fk_personal_song_owner FOREIGN KEY (owner_user_id) REFERENCES collaboration_users(id) ON DELETE CASCADE,
  KEY ix_personal_songs_owner_user_id (owner_user_id)
);
