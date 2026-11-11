-- ============================================================
-- ATTENDBOX — guardmap_db.sql
-- Unified Student Attendance Tracking and Mapping System
-- ============================================================

CREATE DATABASE IF NOT EXISTS `attendbox_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `attendbox_db`;

-- ──────────────────────────────────────────────────────────
-- 1. ROLES
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `roles` (
  `id`          TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        ENUM('admin','teacher','parent','student') NOT NULL,
  `description` VARCHAR(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_roles_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `roles` (`id`, `name`, `description`) VALUES
  (1, 'admin',   'Full system access'),
  (2, 'teacher', 'Manages class attendance'),
  (3, 'parent',  'Views child attendance'),
  (4, 'student', 'Views own attendance');

-- ──────────────────────────────────────────────────────────
-- 2. USERS  (central auth table)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  `username`     VARCHAR(80)     NOT NULL,
  `password`     VARCHAR(255)    NOT NULL COMMENT 'bcrypt hash',
  `role_id`      TINYINT UNSIGNED NOT NULL,
  `is_active`    TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`   INT UNSIGNED    DEFAULT NULL,
  `updated_by`   INT UNSIGNED    DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `idx_users_role_id` (`role_id`),
  CONSTRAINT `fk_users_role`
    FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 3. TEACHERS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `teachers` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `name`         VARCHAR(150) NOT NULL,
  `employee_id`  VARCHAR(50)  DEFAULT NULL,
  `age`          TINYINT UNSIGNED DEFAULT NULL,
  `gender`       ENUM('Male','Female','Other') DEFAULT NULL,
  `section`      VARCHAR(100) DEFAULT NULL COMMENT 'Grade/section assigned',
  `subject`      VARCHAR(100) DEFAULT NULL,
  `room`         VARCHAR(50)  DEFAULT NULL,
  `schedule`     VARCHAR(100) DEFAULT NULL,
  `contact`      VARCHAR(20)  DEFAULT NULL,
  `address`      TEXT         DEFAULT NULL,
  `photo_path`   VARCHAR(255) DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`   INT UNSIGNED DEFAULT NULL,
  `updated_by`   INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_teachers_user_id` (`user_id`),
  KEY `idx_teachers_section` (`section`),
  CONSTRAINT `fk_teachers_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 4. STUDENTS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `students` (
  `id`           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED  DEFAULT NULL COMMENT 'Linked user account (optional)',
  `lrn`          VARCHAR(30)   NOT NULL COMMENT 'Learner Reference Number',
  `name`         VARCHAR(150)  NOT NULL,
  `gender`       ENUM('M','F') DEFAULT NULL,
  `grade`        VARCHAR(20)   DEFAULT NULL,
  `section`      VARCHAR(50)   DEFAULT NULL,
  `teacher_id`   INT UNSIGNED  DEFAULT NULL COMMENT 'Advisory teacher',
  `mac_address`  VARCHAR(50)   DEFAULT NULL COMMENT 'BLE MAC address',
  `rfid_uid`     VARCHAR(50)   DEFAULT NULL COMMENT 'RFID card UID',
  `qr_code`      TEXT          DEFAULT NULL COMMENT 'QR payload JSON',
  `photo_path`   VARCHAR(255)  DEFAULT NULL,
  `is_active`    TINYINT(1)    NOT NULL DEFAULT 1,
  `created_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`   INT UNSIGNED  DEFAULT NULL,
  `updated_by`   INT UNSIGNED  DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_students_lrn` (`lrn`),
  UNIQUE KEY `uq_students_user_id` (`user_id`),
  KEY `idx_students_section` (`section`),
  KEY `idx_students_teacher` (`teacher_id`),
  CONSTRAINT `fk_students_user`
    FOREIGN KEY (`user_id`)    REFERENCES `users`    (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_students_teacher`
    FOREIGN KEY (`teacher_id`) REFERENCES `teachers` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 5. PARENTS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `parents` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `name`         VARCHAR(150) NOT NULL,
  `relationship` VARCHAR(50)  DEFAULT NULL,
  `contact`      VARCHAR(20)  DEFAULT NULL,
  `address`      TEXT         DEFAULT NULL,
  `photo_path`   VARCHAR(255) DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`   INT UNSIGNED DEFAULT NULL,
  `updated_by`   INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parents_user_id` (`user_id`),
  CONSTRAINT `fk_parents_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 6. PARENT ↔ STUDENT  (many-to-many)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `parent_student` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `parent_id`    INT UNSIGNED NOT NULL,
  `student_id`   INT UNSIGNED NOT NULL,
  `relationship` VARCHAR(50)  DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_parent_student` (`parent_id`, `student_id`),
  CONSTRAINT `fk_ps_parent`
    FOREIGN KEY (`parent_id`)  REFERENCES `parents`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ps_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 7. KIOSKS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `kiosks` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(100) NOT NULL,
  `location`     VARCHAR(150) DEFAULT NULL,
  `gate`         VARCHAR(50)  DEFAULT NULL,
  `ip_address`   VARCHAR(45)  DEFAULT NULL,
  `is_active`    TINYINT(1)   NOT NULL DEFAULT 1,
  `last_ping`    DATETIME     DEFAULT NULL,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`   INT UNSIGNED DEFAULT NULL,
  `updated_by`   INT UNSIGNED DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO `kiosks` (`id`, `name`, `location`, `gate`, `is_active`) VALUES
  (1, 'Main Entrance Kiosk', 'Main Building', 'Gate 1', 1),
  (2, 'Back Entrance Kiosk', 'Annex Building', 'Gate 2', 1);

-- ──────────────────────────────────────────────────────────
-- 8. ATTENDANCE
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED  DEFAULT NULL,
  `student_name`   VARCHAR(150)  NOT NULL,
  `lrn`            VARCHAR(30)   DEFAULT NULL,
  `gender`         ENUM('M','F') DEFAULT NULL,
  `grade`          VARCHAR(20)   DEFAULT NULL,
  `section`        VARCHAR(50)   DEFAULT NULL,
  `teacher_id`     INT UNSIGNED  DEFAULT NULL,
  `teacher_name`   VARCHAR(150)  DEFAULT NULL,
  `kiosk_id`       INT UNSIGNED  DEFAULT NULL,
  `scan_method`    ENUM('QR','RFID','BLE','Manual') DEFAULT 'QR',
  `status`         ENUM('Time-In','Time-Out','Late','Absent') NOT NULL DEFAULT 'Time-In',
  `session`        ENUM('AM','PM') NOT NULL DEFAULT 'AM',
  `date`           DATE          NOT NULL,
  `time_in`        TIME          DEFAULT NULL,
  `time_out`       TIME          DEFAULT NULL,
  `timestamp`      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `photo_path`     VARCHAR(255)  DEFAULT NULL,
  `qr_data`        TEXT          DEFAULT NULL,
  `by_whom`        VARCHAR(150)  DEFAULT NULL,
  `notes`          TEXT          DEFAULT NULL,
  `is_overridden`  TINYINT(1)    NOT NULL DEFAULT 0,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_by`     INT UNSIGNED  DEFAULT NULL,
  `updated_by`     INT UNSIGNED  DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_att_student_id`   (`student_id`),
  KEY `idx_att_teacher_id`   (`teacher_id`),
  KEY `idx_att_date`         (`date`),
  KEY `idx_att_status`       (`status`),
  KEY `idx_att_section`      (`section`),
  KEY `idx_att_kiosk`        (`kiosk_id`),
  CONSTRAINT `fk_att_student`
    FOREIGN KEY (`student_id`)  REFERENCES `students` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_teacher`
    FOREIGN KEY (`teacher_id`)  REFERENCES `teachers` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_att_kiosk`
    FOREIGN KEY (`kiosk_id`)    REFERENCES `kiosks`   (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 9. ATTENDANCE OVERRIDE LOG
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `attendance_override_log` (
  `id`              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_id`   INT UNSIGNED NOT NULL,
  `teacher_id`      INT UNSIGNED NOT NULL,
  `old_status`      ENUM('Time-In','Time-Out','Late','Absent') DEFAULT NULL,
  `new_status`      ENUM('Time-In','Time-Out','Late','Absent') NOT NULL,
  `old_session`     ENUM('AM','PM') DEFAULT NULL,
  `new_session`     ENUM('AM','PM') DEFAULT NULL,
  `reason`          TEXT        DEFAULT NULL,
  `overridden_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_override_att`     (`attendance_id`),
  KEY `idx_override_teacher` (`teacher_id`),
  CONSTRAINT `fk_override_att`
    FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_override_teacher`
    FOREIGN KEY (`teacher_id`)    REFERENCES `teachers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 10. SMS LOGS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `sms_logs` (
  `id`             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  `attendance_id`  INT UNSIGNED  DEFAULT NULL,
  `student_name`   VARCHAR(150)  NOT NULL,
  `parent_name`    VARCHAR(150)  DEFAULT NULL,
  `phone_number`   VARCHAR(20)   NOT NULL,
  `message`        TEXT          NOT NULL,
  `status`         ENUM('sent','failed','pending') NOT NULL DEFAULT 'pending',
  `provider`       VARCHAR(50)   DEFAULT NULL,
  `sent_at`        DATETIME      DEFAULT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sms_attendance` (`attendance_id`),
  CONSTRAINT `fk_sms_attendance`
    FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 11. SCAN PHOTOS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `scan_photos` (
  `id`            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `attendance_id` INT UNSIGNED DEFAULT NULL,
  `student_name`  VARCHAR(150) NOT NULL,
  `status`        VARCHAR(50)  DEFAULT NULL,
  `photo_path`    VARCHAR(255) NOT NULL,
  `captured_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_scan_photos_att` (`attendance_id`),
  CONSTRAINT `fk_scan_photos_att`
    FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 12. BLE PROXY
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `BLEPROXY` (
  `id`          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `room_name`   VARCHAR(100) DEFAULT NULL,
  `mac_address` VARCHAR(50)  NOT NULL,
  `distance`    FLOAT        DEFAULT NULL,
  `rssi`        INT          DEFAULT NULL,
  `timestamp`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_ble_mac`  (`mac_address`),
  KEY `idx_ble_time` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 13. RFID LOGS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `RFID_LOGS` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uid`          VARCHAR(50)  NOT NULL,
  `USTP_CDO`     VARCHAR(50)  DEFAULT NULL COMMENT 'Location/gate',
  `student_name` VARCHAR(150) DEFAULT NULL,
  `student_id`   INT UNSIGNED DEFAULT NULL,
  `timestamp`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rfid_uid`     (`uid`),
  KEY `idx_rfid_student` (`student_id`),
  CONSTRAINT `fk_rfid_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 14. RFID TAGS  (uid → student mapping)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rfid_tags` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `uid`        VARCHAR(50)  NOT NULL,
  `student_id` INT UNSIGNED DEFAULT NULL,
  `name`       VARCHAR(150) DEFAULT NULL,
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rfid_uid` (`uid`),
  CONSTRAINT `fk_rfid_tags_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 15. LOGIN LOGS
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `login_logs` (
  `id`         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    INT UNSIGNED NOT NULL,
  `username`   VARCHAR(80)  NOT NULL,
  `role`       VARCHAR(20)  NOT NULL,
  `ip_address` VARCHAR(45)  DEFAULT NULL,
  `user_agent` VARCHAR(255) DEFAULT NULL,
  `success`    TINYINT(1)   NOT NULL DEFAULT 1,
  `logged_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_login_user` (`user_id`),
  KEY `idx_login_at`   (`logged_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 16. USER SESSIONS  (optional JWT blacklist / refresh)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id`           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      INT UNSIGNED NOT NULL,
  `token_hash`   VARCHAR(64)  NOT NULL COMMENT 'SHA-256 of JWT',
  `expires_at`   DATETIME     NOT NULL,
  `revoked`      TINYINT(1)   NOT NULL DEFAULT 0,
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user`  (`user_id`),
  KEY `idx_sessions_token` (`token_hash`),
  CONSTRAINT `fk_sessions_user`
    FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- 17. PARENTS_TEACHERS  (QR generation, legacy compatibility)
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `parents_teachers` (
  `id`             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `student_id`     INT UNSIGNED NOT NULL,
  `role`           VARCHAR(50)  NOT NULL COMMENT 'Parent 1 / Parent 2 / Teacher',
  `name`           VARCHAR(150) NOT NULL,
  `contact_number` VARCHAR(20)  DEFAULT NULL,
  `created_at`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_pt_student` (`student_id`),
  CONSTRAINT `fk_pt_student`
    FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ──────────────────────────────────────────────────────────
-- SEED DATA — Default admin account
-- Password: admin123  (bcrypt hash, 10 rounds)
-- ──────────────────────────────────────────────────────────
INSERT IGNORE INTO `users` (`id`, `username`, `password`, `role_id`, `is_active`) VALUES
  (1, 'admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lihO', 1);

-- ──────────────────────────────────────────────────────────
-- VIEWS for dashboard statistics
-- ──────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW `v_attendance_today` AS
  SELECT a.*, s.grade, s.section AS student_section
  FROM   `attendance` a
  LEFT JOIN `students` s ON s.id = a.student_id
  WHERE  a.`date` = CURDATE();

CREATE OR REPLACE VIEW `v_dashboard_stats` AS
  SELECT
    (SELECT COUNT(*)     FROM `students` WHERE is_active = 1)  AS total_students,
    (SELECT COUNT(*)     FROM `teachers`)                       AS total_teachers,
    (SELECT COUNT(*)     FROM `kiosks`   WHERE is_active = 1)  AS active_kiosks,
    (SELECT COUNT(*)     FROM `sms_logs` WHERE DATE(created_at) = CURDATE()) AS sms_today,
    (SELECT COUNT(*)     FROM `attendance` WHERE `date` = CURDATE()) AS attendance_today,
    (SELECT COUNT(*)     FROM `attendance` WHERE `date` = CURDATE() AND status IN ('Time-In','Late')) AS present_today,
    ROUND(
      (SELECT COUNT(*) FROM `attendance` WHERE `date` = CURDATE() AND status IN ('Time-In','Late')) /
      NULLIF((SELECT COUNT(*) FROM `students` WHERE is_active = 1), 0) * 100, 1
    ) AS attendance_rate_today;
