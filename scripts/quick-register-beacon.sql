-- ============================================================================
-- Quick Register BLE Beacon (from Serial Monitor)
-- ============================================================================

-- Register the beacon detected in Serial Monitor: F7:6C:A5:11:0A:F7
-- Assign to student Padios (ID: 1)

UPDATE students 
SET mac_address = 'F7:6C:A5:11:0A:F7' 
WHERE id = 1;

-- Verify registration
SELECT id, name, mac_address 
FROM students 
WHERE id = 1;

-- Check if beacon is now registered
SELECT id, name, mac_address 
FROM students 
WHERE mac_address = 'F7:6C:A5:11:0A:F7';

-- Done! Now test:
-- 1. Hold beacon near ESP32
-- 2. Should see in Serial Monitor: "✅ Padios → Gate 1 - Main Entrance"
-- 3. Attendance should be marked in database
