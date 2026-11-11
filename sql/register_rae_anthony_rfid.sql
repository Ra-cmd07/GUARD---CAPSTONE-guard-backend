-- ============================================================================
-- Register RFID for Rae Anthony
-- ============================================================================
-- Student: Rae Anthony (ID: 2)
-- Parent: Raenn (ID: 7) - Already linked
-- RFID UID: 5C:D0:F9:03
-- ============================================================================

USE attendbox_db;

-- Update Rae Anthony's RFID UID
UPDATE students 
SET rfid_uid = '5C:D0:F9:03',
    updated_at = NOW()
WHERE id = 2;

-- Verify the update
SELECT 
    id,
    name,
    lrn,
    rfid_uid,
    mac_address,
    grade,
    section,
    is_active
FROM students 
WHERE id = 2;

-- Verify parent link (should already exist)
SELECT 
    ps.id,
    s.name AS student_name,
    p.name AS parent_name,
    p.contact_number,
    ps.relationship
FROM parent_student ps
JOIN students s ON ps.student_id = s.id
JOIN parents_teachers p ON ps.parent_id = p.id
WHERE s.id = 2;

-- Summary
SELECT 
    '✅ Rae Anthony RFID registered!' AS status,
    'RFID UID: 5C:D0:F9:03' AS rfid,
    'Parent: Raenn' AS parent_link,
    'Ready for attendance!' AS ready;
