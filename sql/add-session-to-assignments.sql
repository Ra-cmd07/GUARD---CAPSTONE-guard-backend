-- Migration: Add session column to assignments table
-- session indicates whether a subject runs in the AM, PM, or spans BOTH sessions
-- Advisers (teacher_id) default to BOTH; subject teachers default to AM or PM as set by admin

ALTER TABLE assignments
  ADD COLUMN IF NOT EXISTS session ENUM('AM', 'PM', 'BOTH') NOT NULL DEFAULT 'AM'
  AFTER subject_teacher_id;

-- Advisers own the whole day — update existing adviser rows to BOTH
-- (rows where teacher_id is set and subject_teacher_id is NULL or same as teacher_id)
UPDATE assignments
SET session = 'BOTH'
WHERE teacher_id IS NOT NULL
  AND (subject_teacher_id IS NULL OR subject_teacher_id = teacher_id);
