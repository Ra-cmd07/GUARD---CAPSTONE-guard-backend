-- Migration: Create student_locations table for real-time BLE tracking
-- This table stores the current position of students based on BLE signal strength

CREATE TABLE IF NOT EXISTS student_locations (
  student_id INT PRIMARY KEY,
  location_name VARCHAR(100) NOT NULL,
  location_type VARCHAR(50),
  coordinates VARCHAR(100),  -- "lat,lng" format
  signal_strength INT,       -- RSSI value (e.g., -65 dBm)
  is_active TINYINT(1) DEFAULT 1,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_active (is_active),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add indexes for faster queries
CREATE INDEX idx_student_active ON student_locations(student_id, is_active);
CREATE INDEX idx_timestamp_active ON student_locations(timestamp, is_active);
