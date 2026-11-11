-- ============================================================
-- BLE Location Tracking Enhancement
-- ============================================================

-- Add location tracking table
CREATE TABLE IF NOT EXISTS `student_locations` (
  `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `student_id`      INT UNSIGNED    NOT NULL,
  `student_name`    VARCHAR(150)    NOT NULL,
  `mac_address`     VARCHAR(50)     NOT NULL,
  `beacon_id`       VARCHAR(50)     NOT NULL COMMENT 'BLE Beacon identifier',
  `location_name`   VARCHAR(100)    NOT NULL COMMENT 'Gate 1, Classroom 201, Cafeteria, etc.',
  `location_type`   ENUM('gate','classroom','cafeteria','library','gym','office','other') DEFAULT 'other',
  `coordinates`     VARCHAR(50)     DEFAULT NULL COMMENT 'lat,lng for map display',
  `signal_strength` INT             DEFAULT NULL COMMENT 'RSSI value',
  `timestamp`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_active`       TINYINT(1)      NOT NULL DEFAULT 1 COMMENT 'Set to 0 when student leaves area',
  PRIMARY KEY (`id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_mac_address` (`mac_address`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_active` (`is_active`),
  CONSTRAINT `fk_student_locations_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add BLE beacons configuration table
CREATE TABLE IF NOT EXISTS `ble_beacons` (
  `id`              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `beacon_id`       VARCHAR(50)     NOT NULL COMMENT 'Unique beacon identifier',
  `name`            VARCHAR(100)    NOT NULL,
  `location_name`   VARCHAR(100)    NOT NULL COMMENT 'Gate 1, Room 201, etc.',
  `location_type`   ENUM('gate','classroom','cafeteria','library','gym','office','other') DEFAULT 'other',
  `coordinates`     VARCHAR(50)     DEFAULT NULL COMMENT 'lat,lng',
  `floor`           VARCHAR(20)     DEFAULT NULL,
  `building`        VARCHAR(50)     DEFAULT NULL,
  `is_active`       TINYINT(1)      NOT NULL DEFAULT 1,
  `last_ping`       DATETIME        DEFAULT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_beacon_id` (`beacon_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Insert sample beacons
INSERT INTO `ble_beacons` (`beacon_id`, `name`, `location_name`, `location_type`, `coordinates`, `floor`, `building`) VALUES
  ('BEACON_GATE1', 'Main Gate Entrance', 'Gate 1 - Main Entrance', 'gate', '8.4857,124.6565', 'Ground', 'Main Building'),
  ('BEACON_GATE2', 'Back Gate', 'Gate 2 - Back Entrance', 'gate', '8.4860,124.6570', 'Ground', 'Main Building'),
  ('BEACON_ROOM201', 'Grade 7 Classroom', 'Room 201 - Grade 7 Section 1', 'classroom', '8.4855,124.6568', '2nd Floor', 'Academic Building'),
  ('BEACON_CAFETERIA', 'School Cafeteria', 'Cafeteria', 'cafeteria', '8.4858,124.6566', 'Ground', 'Cafeteria Building'),
  ('BEACON_LIBRARY', 'School Library', 'Library', 'library', '8.4856,124.6569', '1st Floor', 'Academic Building'),
  ('BEACON_GYM', 'Gymnasium', 'Gymnasium', 'gym', '8.4859,124.6564', 'Ground', 'Sports Complex');

-- View for getting latest student locations
CREATE OR REPLACE VIEW `v_student_current_location` AS
  SELECT 
    sl.student_id,
    sl.student_name,
    sl.location_name,
    sl.location_type,
    sl.coordinates,
    sl.timestamp AS last_seen,
    bb.building,
    bb.floor,
    TIMESTAMPDIFF(MINUTE, sl.timestamp, NOW()) AS minutes_ago,
    CASE 
      WHEN TIMESTAMPDIFF(MINUTE, sl.timestamp, NOW()) <= 5 THEN 'active'
      WHEN TIMESTAMPDIFF(MINUTE, sl.timestamp, NOW()) <= 15 THEN 'recent'
      ELSE 'stale'
    END AS location_status
  FROM student_locations sl
  LEFT JOIN ble_beacons bb ON sl.beacon_id = bb.beacon_id
  WHERE sl.id IN (
    SELECT MAX(id) 
    FROM student_locations 
    WHERE is_active = 1 
    GROUP BY student_id
  );
