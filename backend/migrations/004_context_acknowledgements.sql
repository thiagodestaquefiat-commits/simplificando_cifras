CREATE TABLE IF NOT EXISTS context_acknowledgements (
  id VARCHAR(36) NOT NULL PRIMARY KEY,
  user_id VARCHAR(80) NOT NULL,
  event_id VARCHAR(80) NOT NULL,
  fingerprint VARCHAR(300) NOT NULL,
  action_type VARCHAR(80) NOT NULL,
  acknowledged_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,
  CONSTRAINT uq_context_ack_user_fingerprint UNIQUE (user_id, fingerprint),
  CONSTRAINT fk_context_ack_user FOREIGN KEY (user_id) REFERENCES collaboration_users(id) ON DELETE CASCADE,
  CONSTRAINT fk_context_ack_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
);
