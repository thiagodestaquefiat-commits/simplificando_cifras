CREATE TABLE shared_songs (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  artist VARCHAR(255),
  normalized_title VARCHAR(255) NOT NULL,
  normalized_artist VARCHAR(255),
  song_key VARCHAR(20),
  capo VARCHAR(50),
  song_data JSON NOT NULL,
  contributed_by VARCHAR(80),
  times_searched INT DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FULLTEXT INDEX idx_search (normalized_title, normalized_artist)
);
