-- Fix time_in and time_out columns to support AM/PM format
-- Change from TIME datatype to VARCHAR(20)

USE attendbox_db;

-- First, convert existing TIME values to 12-hour format with AM/PM
-- Then change column type to VARCHAR

-- Step 1: Change time_in column type
ALTER TABLE attendance 
MODIFY COLUMN time_in VARCHAR(20) NULL;

-- Step 2: Change time_out column type  
ALTER TABLE attendance 
MODIFY COLUMN time_out VARCHAR(20) NULL;

-- Step 3: Update existing records to add AM/PM
UPDATE attendance 
SET time_in = CONCAT(
  IF(HOUR(STR_TO_DATE(time_in, '%H:%i:%s')) % 12 = 0, 12, HOUR(STR_TO_DATE(time_in, '%H:%i:%s')) % 12),
  ':',
  LPAD(MINUTE(STR_TO_DATE(time_in, '%H:%i:%s')), 2, '0'),
  ':',
  LPAD(SECOND(STR_TO_DATE(time_in, '%H:%i:%s')), 2, '0'),
  ' ',
  IF(HOUR(STR_TO_DATE(time_in, '%H:%i:%s')) < 12, 'AM', 'PM')
)
WHERE time_in IS NOT NULL 
AND time_in NOT LIKE '% AM' 
AND time_in NOT LIKE '% PM';

UPDATE attendance 
SET time_out = CONCAT(
  IF(HOUR(STR_TO_DATE(time_out, '%H:%i:%s')) % 12 = 0, 12, HOUR(STR_TO_DATE(time_out, '%H:%i:%s')) % 12),
  ':',
  LPAD(MINUTE(STR_TO_DATE(time_out, '%H:%i:%s')), 2, '0'),
  ':',
  LPAD(SECOND(STR_TO_DATE(time_out, '%H:%i:%s')), 2, '0'),
  ' ',
  IF(HOUR(STR_TO_DATE(time_out, '%H:%i:%s')) < 12, 'AM', 'PM')
)
WHERE time_out IS NOT NULL
AND time_out NOT LIKE '% AM' 
AND time_out NOT LIKE '% PM';

SELECT '✅ Column types changed to VARCHAR(20)' as status;
SELECT '✅ Existing records updated with AM/PM' as status;
SELECT 'Sample updated records:' as info;
SELECT id, student_name, date, time_in, time_out, status 
FROM attendance 
WHERE time_in IS NOT NULL 
LIMIT 5;
