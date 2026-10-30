-- Tabela nova e somente aditiva: perfil de recomendação das músicas do catálogo compartilhado
-- (gênero, subgênero, andamento, BPM, temas, sacra) e votos de BPM da comunidade (ids em hash).
-- Não altera shared_songs nem nenhuma outra tabela.
-- (O app também cria esta tabela sozinho via db.create_all() ao iniciar.)
CREATE TABLE IF NOT EXISTS shared_song_profiles (
  song_id VARCHAR(36) NOT NULL PRIMARY KEY,
  classification JSON NULL,
  bpm_votes JSON NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT fk_shared_song_profiles_song FOREIGN KEY (song_id) REFERENCES shared_songs(id) ON DELETE CASCADE
);
