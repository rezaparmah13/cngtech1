-- Import into a dedicated MySQL 5.7+/MariaDB database. No sample personal data.
CREATE TABLE cng_requests (
  id CHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  reference CHAR(12) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  ticket_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  payload MEDIUMTEXT CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  status ENUM('new','contacted','closed') NOT NULL DEFAULT 'new',
  created_at DATETIME NOT NULL,
  INDEX created_at_id (created_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE cng_rate_limits (
  bucket_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  expires_at DATETIME NOT NULL,
  INDEX expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
