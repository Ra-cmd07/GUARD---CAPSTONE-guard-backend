-- Migration: Add MAC address column to ble_beacons table
-- This allows ESP32 beacons to advertise their own BLE MAC address
-- for triangulation purposes

ALTER TABLE ble_beacons 
ADD COLUMN mac_address VARCHAR(50) NULL 
AFTER coordinates;

-- Add comment
ALTER TABLE ble_beacons 
MODIFY COLUMN mac_address VARCHAR(50) NULL 
COMMENT 'BLE MAC address of this beacon device (if it broadcasts BLE)';

-- Example: Set MAC addresses for existing beacons
-- UPDATE ble_beacons SET mac_address = 'AA:BB:CC:DD:EE:01' WHERE beacon_id = 'BEACON_GATE1';
-- UPDATE ble_beacons SET mac_address = 'AA:BB:CC:DD:EE:02' WHERE beacon_id = 'BEACON_ROOM201';
