CREATE TABLE IF NOT EXISTS song_review_receipts (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  event_id VARCHAR(80) NOT NULL,
  repertoire_item_id VARCHAR(80) NOT NULL,
  song_id VARCHAR(120) NOT NULL,
  band_id VARCHAR(80) NULL,
  revision_hash VARCHAR(64) NOT NULL,
  revision_payload JSON NOT NULL,
  client_receipt_id VARCHAR(80) NOT NULL,
  reviewed_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  CONSTRAINT uq_song_review_receipt_context UNIQUE (event_id, repertoire_item_id, user_id),
  CONSTRAINT uq_song_review_receipt_client UNIQUE (user_id, client_receipt_id),
  CONSTRAINT fk_song_review_receipt_user FOREIGN KEY (user_id) REFERENCES collaboration_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_song_review_receipt_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_song_review_receipt_item FOREIGN KEY (repertoire_item_id) REFERENCES event_repertoire_items(id) ON DELETE CASCADE
);

ALTER TABLE event_changes ADD COLUMN IF NOT EXISTS song_id VARCHAR(120) NULL;
ALTER TABLE event_changes ADD COLUMN IF NOT EXISTS change_type VARCHAR(80) NULL;
ALTER TABLE event_changes ADD COLUMN IF NOT EXISTS before_value JSON NULL;
ALTER TABLE event_changes ADD COLUMN IF NOT EXISTS after_value JSON NULL;
ALTER TABLE event_changes ADD COLUMN IF NOT EXISTS affected_users JSON NULL;
