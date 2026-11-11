-- ============================================================================
-- SMS Queue Table for GSM Module Integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS `sms_queue` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `phone_number` VARCHAR(20) NOT NULL COMMENT 'Phone number in +639XXXXXXXXX format',
  `message` TEXT NOT NULL COMMENT 'SMS message content',
  `student_id` INT NULL COMMENT 'Reference to student',
  `attendance_id` INT NULL COMMENT 'Reference to attendance record',
  `priority` ENUM('high', 'normal', 'low') DEFAULT 'normal' COMMENT 'SMS priority',
  `status` ENUM('pending', 'sent', 'failed', 'cancelled') DEFAULT 'pending' COMMENT 'SMS status',
  `retry_count` INT DEFAULT 0 COMMENT 'Number of send attempts',
  `error_message` TEXT NULL COMMENT 'Error message if failed',
  `created_at` DATETIME NOT NULL COMMENT 'When SMS was queued',
  `sent_at` DATETIME NULL COMMENT 'When SMS was successfully sent',
  `last_retry_at` DATETIME NULL COMMENT 'Last retry attempt timestamp',
  
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_phone_number` (`phone_number`),
  INDEX `idx_student_id` (`student_id`),
  INDEX `idx_attendance_id` (`attendance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add foreign keys (optional)
-- ALTER TABLE `sms_queue` 
--   ADD CONSTRAINT `fk_sms_student` FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON DELETE SET NULL,
--   ADD CONSTRAINT `fk_sms_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance`(`id`) ON DELETE SET NULL;

-- ============================================================================
-- Sample Queries
-- ============================================================================

-- View pending SMS
-- SELECT * FROM sms_queue WHERE status = 'pending' ORDER BY created_at ASC;

-- View failed SMS
-- SELECT * FROM sms_queue WHERE status = 'failed' ORDER BY created_at DESC;

-- SMS statistics (last 24 hours)
-- SELECT status, COUNT(*) as count FROM sms_queue WHERE created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) GROUP BY status;

-- Clear old SMS (keep last 7 days)
-- DELETE FROM sms_queue WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
