-- Add preferred_method column to students table
-- This allows students to select their preferred kiosk access method

ALTER TABLE `students` 
ADD COLUMN `preferred_method` ENUM('QR', 'BLE', 'RFID') DEFAULT 'QR' COMMENT 'Preferred kiosk access method'
AFTER `qr_code`;

-- Add index for faster filtering by preferred method
CREATE INDEX `idx_students_preferred_method` ON `students` (`preferred_method`);

-- Update existing records to have a default
UPDATE `students` SET `preferred_method` = 'QR' WHERE `preferred_method` IS NULL;
