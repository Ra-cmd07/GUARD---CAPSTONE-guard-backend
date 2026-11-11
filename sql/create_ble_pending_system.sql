-- ============================================================================
-- BLE PENDING APPROVAL SYSTEM
-- ============================================================================
-- Purpose: Store BLE detections that need guard approval before recording attendance
-- Flow: ESP32 → Pending → Kiosk shows → Guard approves → Attendance recorded

-- Create pending detections table
CREATE TABLE IF NOT EXISTS ble_detections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT,
  student_name VARCHAR(255),
  mac_address VARCHAR(50),
  beacon_id VARCHAR(50),
  location_name VARCHAR(255),
  rssi INT,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  approved_by VARCHAR(100),
  attendance_id INT NULL,
  
  INDEX idx_status (status),
  INDEX idx_detected_at (detected_at),
  INDEX idx_student_id (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='BLE detections waiting for kiosk approval';
