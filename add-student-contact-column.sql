-- Add contact column to students table
-- This makes it consistent with teachers table

ALTER TABLE students 
ADD COLUMN contact VARCHAR(20) DEFAULT NULL COMMENT 'Student contact number' 
AFTER section;

-- Verify the change
DESCRIBE students;
