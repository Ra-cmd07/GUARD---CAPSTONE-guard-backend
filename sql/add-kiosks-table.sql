-- Add kiosks table for monitoring kiosk devices
CREATE TABLE IF NOT EXISTS kiosks (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  location VARCHAR(100) NOT NULL,
  status ENUM('online', 'stale', 'offline', 'unknown') DEFAULT 'unknown',
  last_heartbeat DATETIME NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample kiosks
INSERT INTO kiosks (id, name, location, status, last_heartbeat, ip_address) VALUES
('kiosk-1', 'Main Entrance', 'Building A', 'stale', DATE_SUB(NOW(), INTERVAL 15 MINUTE), '192.168.1.100'),
('kiosk-2', 'Back Entrance', 'Building B', 'unknown', NULL, '192.168.1.101')
ON DUPLICATE KEY UPDATE name = VALUES(name);
