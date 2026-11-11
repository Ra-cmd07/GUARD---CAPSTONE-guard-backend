-- ============================================================================
-- CLEAR ALL LOCATION HISTORY DATA
-- ============================================================================
-- This script removes all BLE location tracking history while keeping:
-- - BLE beacon configurations (ble_beacons table)
-- - Student and parent data
-- - Attendance records
-- ============================================================================

-- Clear student location history
TRUNCATE TABLE student_locations;

-- Clear BLE detection history (pending/approved/rejected detections)
TRUNCATE TABLE ble_detections;

-- Optional: Clear location history from attendance records (only location fields)
-- Uncomment if you want to clear location data from attendance but keep attendance records
-- UPDATE attendance SET location_name = NULL, coordinates = NULL WHERE 1=1;

SELECT '✅ Location history cleared!' as status;
SELECT 'student_locations table: TRUNCATED' as result;
SELECT 'ble_detections table: TRUNCATED' as result;
