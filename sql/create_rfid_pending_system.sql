-- ============================================================================
-- RFID PENDING APPROVAL SYSTEM
-- ============================================================================
-- Similar to BLE approval system but for RFID cards
-- Flow: ESP32 → pending → Kiosk approval → attendance

-- Create rfid_detections table (pending approvals)
CREATE TABLE IF NOT EXISTS rfid_detections (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rfid_uid VARCHAR(50) NOT NULL,
  student_id INT,
  student_name VARCHAR(255),
  kiosk_id INT,
  status ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED') DEFAULT 'PENDING_APPROVAL',
  detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  approved_by VARCHAR(100),
  rejected_at TIMESTAMP NULL,
  rejected_by VARCHAR(100),
  rejection_reason TEXT,
  INDEX idx_status (status),
  INDEX idx_detected (detected_at),
  INDEX idx_rfid (rfid_uid),
  INDEX idx_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Clean up old pending records (older than 5 minutes)
CREATE EVENT IF NOT EXISTS cleanup_old_rfid_pending
ON SCHEDULE EVERY 5 MINUTE
DO
  DELETE FROM rfid_detections 
  WHERE status = 'PENDING_APPROVAL' 
  AND detected_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE);

-- View for debugging
CREATE OR REPLACE VIEW v_pending_rfid AS
SELECT 
  r.*,
  s.name as student_full_name,
  s.lrn,
  s.grade,
  s.section,
  k.name as kiosk_name,
  k.location as kiosk_location
FROM rfid_detections r
LEFT JOIN students s ON r.student_id = s.id
LEFT JOIN kiosks k ON r.kiosk_id = k.id
WHERE r.status = 'PENDING_APPROVAL'
ORDER BY r.detected_at DESC;

SELECT 'RFID pending approval system created successfully!' as status;
