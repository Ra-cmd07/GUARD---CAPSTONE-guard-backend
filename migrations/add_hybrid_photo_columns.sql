-- Add hybrid photo storage columns to attendance table
-- This allows both local and Cloudinary storage simultaneously

-- MySQL doesn't support IF NOT EXISTS for columns, so we'll use a procedure
DELIMITER $$

CREATE PROCEDURE AddHybridColumnsIfNotExist()
BEGIN
    -- Check and add local_path column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'attendance' 
        AND COLUMN_NAME = 'local_path'
    ) THEN
        ALTER TABLE attendance 
        ADD COLUMN local_path VARCHAR(500) DEFAULT NULL COMMENT 'Local file path for fast access';
    END IF;

    -- Check and add cloudinary_url column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'attendance' 
        AND COLUMN_NAME = 'cloudinary_url'
    ) THEN
        ALTER TABLE attendance 
        ADD COLUMN cloudinary_url VARCHAR(500) DEFAULT NULL COMMENT 'Cloudinary CDN URL for mobile access';
    END IF;

    -- Check and add cloudinary_uploaded column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'attendance' 
        AND COLUMN_NAME = 'cloudinary_uploaded'
    ) THEN
        ALTER TABLE attendance 
        ADD COLUMN cloudinary_uploaded BOOLEAN DEFAULT FALSE COMMENT 'Whether photo has been uploaded to Cloudinary';
    END IF;
END$$

DELIMITER ;

-- Execute the procedure
CALL AddHybridColumnsIfNotExist();

-- Drop the procedure after use
DROP PROCEDURE AddHybridColumnsIfNotExist;

-- Migrate existing photo_path data to local_path
UPDATE attendance 
SET local_path = photo_path,
    cloudinary_uploaded = FALSE
WHERE photo_path IS NOT NULL AND photo_path != '';

-- Add index for faster queries on upload status
CREATE INDEX IF NOT EXISTS idx_cloudinary_uploaded ON attendance(cloudinary_uploaded);

-- Optional: Add same columns to scan_photos table for consistency
DELIMITER $$

CREATE PROCEDURE AddHybridColumnsToScanPhotosIfNotExist()
BEGIN
    -- Check and add local_path column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'scan_photos' 
        AND COLUMN_NAME = 'local_path'
    ) THEN
        ALTER TABLE scan_photos 
        ADD COLUMN local_path VARCHAR(500) DEFAULT NULL;
    END IF;

    -- Check and add cloudinary_url column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'scan_photos' 
        AND COLUMN_NAME = 'cloudinary_url'
    ) THEN
        ALTER TABLE scan_photos 
        ADD COLUMN cloudinary_url VARCHAR(500) DEFAULT NULL;
    END IF;

    -- Check and add cloudinary_uploaded column
    IF NOT EXISTS (
        SELECT * FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = 'attendbox_db' 
        AND TABLE_NAME = 'scan_photos' 
        AND COLUMN_NAME = 'cloudinary_uploaded'
    ) THEN
        ALTER TABLE scan_photos 
        ADD COLUMN cloudinary_uploaded BOOLEAN DEFAULT FALSE;
    END IF;
END$$

DELIMITER ;

-- Execute the procedure
CALL AddHybridColumnsToScanPhotosIfNotExist();

-- Drop the procedure after use
DROP PROCEDURE AddHybridColumnsToScanPhotosIfNotExist;

-- Migrate existing photo_path data to local_path in scan_photos
UPDATE scan_photos 
SET local_path = photo_path,
    cloudinary_uploaded = FALSE
WHERE photo_path IS NOT NULL AND photo_path != '';
