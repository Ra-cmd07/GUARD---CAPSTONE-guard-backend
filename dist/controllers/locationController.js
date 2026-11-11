"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateBleLocation = updateBleLocation;
exports.updateBleLocationBatch = updateBleLocationBatch;
exports.getLiveStudentLocations = getLiveStudentLocations;
exports.getStudentLocation = getStudentLocation;
exports.getBeacons = getBeacons;
exports.deactivateStudentLocation = deactivateStudentLocation;
exports.clearStudentLocationHistory = clearStudentLocationHistory;
exports.updateTrilaterationPosition = updateTrilaterationPosition;
const db_1 = __importDefault(require("../lib/db"));
const blePositioning_1 = require("../utils/blePositioning");
const socketHandler_1 = require("../src/websocket/socketHandler");
// Store last known positions for smoothing
const lastPositions = new Map();
/**
 * POST /api/location/ble-update
 * Receive BLE RSSI readings and calculate/broadcast real-time position
 */
async function updateBleLocation(req, res) {
    try {
        const { studentId, beaconId, rssi, macAddress } = req.body;
        // Allow either studentId OR macAddress
        if ((!studentId && !macAddress) || !beaconId || rssi === undefined) {
            res.status(400).json({ error: 'studentId (or macAddress), beaconId, and rssi are required' });
            return;
        }
        let finalStudentId = studentId;
        // If macAddress provided but no studentId, lookup student by MAC
        if (!studentId && macAddress) {
            const [macLookup] = await db_1.default.execute(`SELECT id FROM students WHERE mac_address = ? OR rfid_uid = ?`, [macAddress, macAddress]);
            if (macLookup.length === 0) {
                res.status(404).json({ error: 'Student not found with MAC address: ' + macAddress });
                return;
            }
            finalStudentId = macLookup[0].id;
        }
        // Get student info
        const [studentRows] = await db_1.default.execute(`SELECT s.id, s.name, s.grade, s.section, s.lrn
       FROM students s WHERE s.id = ?`, [finalStudentId]);
        const student = studentRows[0];
        if (!student) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        // Get beacon info and coordinates
        const [beaconRows] = await db_1.default.execute(`SELECT beacon_id, name, location_name, coordinates, location_type
       FROM ble_beacons WHERE beacon_id = ?`, [beaconId]);
        const beacon = beaconRows[0];
        if (!beacon || !beacon.coordinates) {
            res.status(404).json({ error: 'Beacon not found or has no coordinates' });
            return;
        }
        // Calculate distance from RSSI
        const distance = (0, blePositioning_1.rssiToDistance)(rssi);
        // Get beacon coordinates
        const [beaconLat, beaconLng] = beacon.coordinates.split(',').map(Number);
        // Calculate new position with offset based on distance
        const lastPos = lastPositions.get(studentId);
        const newPosition = (0, blePositioning_1.calculateOffsetPosition)(beaconLat, beaconLng, rssi, lastPos);
        // Smooth the position to prevent jitter
        const smoothedPosition = (0, blePositioning_1.smoothPosition)(newPosition, lastPos || null, 0.4);
        // Store last position
        lastPositions.set(studentId, smoothedPosition);
        // Store in database
        await db_1.default.execute(`INSERT INTO student_locations 
       (student_id, location_name, location_type, coordinates, signal_strength, distance, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)
       ON DUPLICATE KEY UPDATE
         location_name = VALUES(location_name),
         location_type = VALUES(location_type),
         coordinates = VALUES(coordinates),
         signal_strength = VALUES(signal_strength),
         distance = VALUES(distance),
         timestamp = CURRENT_TIMESTAMP,
         is_active = 1`, [
            finalStudentId,
            beacon.location_name,
            beacon.location_type,
            `${smoothedPosition.lat},${smoothedPosition.lng}`,
            rssi,
            parseFloat(distance.toFixed(2)) // Store distance with 2 decimal places
        ]);
        // Broadcast real-time location via WebSocket
        const io = (0, socketHandler_1.getIO)();
        if (io) {
            io.to('admin').to('teacher').emit('location:update', {
                type: 'student_location',
                student: {
                    id: student.id,
                    name: student.name,
                    section: student.section,
                    grade: student.grade,
                    lrn: student.lrn,
                },
                location: {
                    position: smoothedPosition,
                    beacon: {
                        beaconId: beacon.beacon_id,
                        name: beacon.name,
                        locationName: beacon.location_name,
                        locationType: beacon.location_type,
                    },
                    rssi,
                    distance: Math.round(distance),
                    timestamp: new Date(),
                },
            });
        }
        res.json({
            success: true,
            student: {
                id: student.id,
                name: student.name,
            },
            position: smoothedPosition,
            beacon: beacon.name,
            distance: Math.round(distance),
            rssi,
        });
    }
    catch (err) {
        console.error('BLE location update error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * POST /api/location/ble-batch
 * Batch update for multiple BLE readings (more efficient)
 */
async function updateBleLocationBatch(req, res) {
    try {
        const { readings } = req.body; // Array of { studentId, beaconId, rssi, macAddress }
        if (!Array.isArray(readings) || readings.length === 0) {
            res.status(400).json({ error: 'readings array is required' });
            return;
        }
        const updates = [];
        for (const reading of readings) {
            const { studentId, beaconId, rssi } = reading;
            if (!studentId || !beaconId || rssi === undefined)
                continue;
            // Get student and beacon info
            const [studentRows] = await db_1.default.execute('SELECT id, name, grade, section, lrn FROM students WHERE id = ?', [studentId]);
            const [beaconRows] = await db_1.default.execute('SELECT beacon_id, name, location_name, coordinates, location_type FROM ble_beacons WHERE beacon_id = ?', [beaconId]);
            const student = studentRows[0];
            const beacon = beaconRows[0];
            if (!student || !beacon || !beacon.coordinates)
                continue;
            const distance = (0, blePositioning_1.rssiToDistance)(rssi);
            const [beaconLat, beaconLng] = beacon.coordinates.split(',').map(Number);
            const lastPos = lastPositions.get(studentId);
            const newPosition = (0, blePositioning_1.calculateOffsetPosition)(beaconLat, beaconLng, rssi, lastPos);
            const smoothedPosition = (0, blePositioning_1.smoothPosition)(newPosition, lastPos || null, 0.4);
            lastPositions.set(studentId, smoothedPosition);
            // Store in database
            await db_1.default.execute(`INSERT INTO student_locations 
         (student_id, location_name, location_type, coordinates, signal_strength, is_active)
         VALUES (?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           location_name = VALUES(location_name),
           location_type = VALUES(location_type),
           coordinates = VALUES(coordinates),
           signal_strength = VALUES(signal_strength),
           timestamp = CURRENT_TIMESTAMP,
           is_active = 1`, [
                studentId,
                beacon.location_name,
                beacon.location_type,
                `${smoothedPosition.lat},${smoothedPosition.lng}`,
                rssi
            ]);
            updates.push({
                studentId: student.id,
                studentName: student.name,
                section: student.section,
                grade: student.grade,
                position: smoothedPosition,
                beaconName: beacon.name,
                distance: Math.round(distance),
                timestamp: new Date(),
            });
        }
        // Broadcast batch update via WebSocket
        const io = (0, socketHandler_1.getIO)();
        if (io && updates.length > 0) {
            io.to('admin').to('teacher').emit('location:batch', {
                type: 'batch_update',
                students: updates,
            });
        }
        res.json({
            success: true,
            processed: updates.length,
            failed: readings.length - updates.length,
        });
    }
    catch (err) {
        console.error('BLE batch location update error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * GET /api/location/students-live
 * Get current real-time positions of all active students
 */
async function getLiveStudentLocations(req, res) {
    try {
        const [rows] = await db_1.default.execute(`SELECT 
         sl.student_id,
         s.name AS student_name,
         s.grade,
         s.section,
         sl.location_name,
         sl.location_type,
         sl.coordinates,
         sl.signal_strength AS rssi,
         TIMESTAMPDIFF(SECOND, sl.timestamp, NOW()) AS seconds_ago,
         sl.is_active
       FROM student_locations sl
       JOIN students s ON s.id = sl.student_id
       WHERE sl.is_active = 1
         AND TIMESTAMPDIFF(MINUTE, sl.timestamp, NOW()) <= 5
       ORDER BY sl.timestamp DESC`);
        const locations = rows.map(row => {
            const [lat, lng] = (row.coordinates || '0,0').split(',').map(Number);
            const distance = row.rssi ? Math.round((0, blePositioning_1.rssiToDistance)(row.rssi)) : null;
            return {
                studentId: row.student_id,
                name: row.student_name,
                grade: row.grade,
                section: row.section,
                location: {
                    name: row.location_name,
                    type: row.location_type,
                    position: { lat, lng },
                    accuracy: distance,
                },
                rssi: row.rssi,
                secondsAgo: row.seconds_ago,
                isActive: row.is_active === 1,
            };
        });
        res.json({
            count: locations.length,
            locations,
        });
    }
    catch (err) {
        console.error('Get live locations error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * GET /api/location/student/:id
 * Get current location for a specific student (for parent dashboard)
 * Query param: ?history=true to get location history
 */
async function getStudentLocation(req, res) {
    try {
        const { id } = req.params;
        const { history } = req.query;
        // If history requested, return all locations from last 24 hours
        if (history === 'true') {
            const [rows] = await db_1.default.execute(`SELECT 
           sl.student_id,
           s.name AS student_name,
           sl.location_name,
           sl.location_type,
           sl.coordinates,
           sl.signal_strength AS rssi,
           sl.distance,
           sl.timestamp,
           bb.building,
           bb.floor
         FROM student_locations sl
         JOIN students s ON s.id = sl.student_id
         LEFT JOIN ble_beacons bb ON bb.location_name = sl.location_name
         WHERE sl.student_id = ?
           AND sl.timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         ORDER BY sl.timestamp DESC
         LIMIT 50`, [id]);
            const historyData = rows.map(row => {
                // Use database distance if available, otherwise calculate from RSSI
                const distance = row.distance ? parseFloat(row.distance) : (row.rssi ? (0, blePositioning_1.rssiToDistance)(row.rssi) : null);
                return {
                    student_id: row.student_id,
                    student_name: row.student_name,
                    location_name: row.location_name,
                    location_type: row.location_type,
                    building: row.building,
                    floor: row.floor,
                    rssi: row.rssi,
                    distance: distance ? parseFloat(distance.toFixed(2)) : null,
                    timestamp: row.timestamp,
                };
            });
            res.json(historyData);
            return;
        }
        // Otherwise return current location only
        const [rows] = await db_1.default.execute(`SELECT 
         sl.student_id,
         s.name AS student_name,
         s.grade,
         s.section,
         sl.location_name,
         sl.location_type,
         sl.coordinates,
         sl.signal_strength AS rssi,
         TIMESTAMPDIFF(MINUTE, sl.timestamp, NOW()) AS minutes_ago,
         sl.is_active,
         sl.timestamp
       FROM student_locations sl
       JOIN students s ON s.id = sl.student_id
       WHERE sl.student_id = ?
       ORDER BY sl.timestamp DESC
       LIMIT 1`, [id]);
        if (rows.length === 0) {
            res.json(null); // No location data
            return;
        }
        const row = rows[0];
        const [lat, lng] = (row.coordinates || '0,0').split(',').map(Number);
        const distance = row.rssi ? Math.round((0, blePositioning_1.rssiToDistance)(row.rssi)) : null;
        res.json({
            student_id: row.student_id,
            student_name: row.student_name,
            grade: row.grade,
            section: row.section,
            location_name: row.location_name,
            location_type: row.location_type,
            coordinates: row.coordinates,
            position: { lat, lng },
            accuracy: distance,
            minutes_ago: row.minutes_ago,
            location_status: row.minutes_ago <= 5 ? 'active' : 'recent',
            is_active: row.is_active === 1,
            timestamp: row.timestamp,
        });
    }
    catch (err) {
        console.error('Get student location error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * GET /api/location/beacons
 * Get all active BLE beacons for map display
 */
async function getBeacons(req, res) {
    try {
        const [rows] = await db_1.default.execute(`SELECT beacon_id, name, location_name, location_type, coordinates, mac_address, building, floor, is_active
       FROM ble_beacons
       WHERE is_active = 1
       ORDER BY location_name`);
        // Return array directly for parent dashboard compatibility
        res.json({
            beacons: rows,
        });
    }
    catch (err) {
        console.error('Get beacons error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * POST /api/location/deactivate/:studentId
 * Mark student as inactive (left school/area)
 */
async function deactivateStudentLocation(req, res) {
    try {
        const { studentId } = req.params;
        await db_1.default.execute('UPDATE student_locations SET is_active = 0 WHERE student_id = ?', [studentId]);
        // Remove from position cache
        lastPositions.delete(Number(studentId));
        // Broadcast removal via WebSocket
        const io = (0, socketHandler_1.getIO)();
        if (io) {
            io.to('admin').to('teacher').emit('location:removed', {
                type: 'student_left',
                studentId: Number(studentId),
            });
        }
        res.json({ success: true, message: 'Student location deactivated' });
    }
    catch (err) {
        console.error('Deactivate location error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
/**
 * DELETE /api/location/student/:id/clear
 * Clear all location history for a specific student
 */
async function clearStudentLocationHistory(req, res) {
    try {
        const { id } = req.params;
        // Delete all location records for this student
        await db_1.default.execute('DELETE FROM student_locations WHERE student_id = ?', [id]);
        // Remove from position cache
        lastPositions.delete(Number(id));
        res.json({
            success: true,
            message: 'Location history cleared successfully'
        });
    }
    catch (err) {
        console.error('Clear location history error:', err);
        res.status(500).json({ error: 'Failed to clear location history' });
    }
}
/**
 * POST /api/location/trilateration-update
 * Receive pre-calculated position from trilateration server
 */
async function updateTrilaterationPosition(req, res) {
    try {
        const { studentId, latitude, longitude, accuracy, locationName, locationType, distance, zone } = req.body;
        if (!studentId || !latitude || !longitude) {
            res.status(400).json({ error: 'studentId, latitude, and longitude are required' });
            return;
        }
        // Format coordinates as "lat,lng" string
        const coordinates = `${latitude},${longitude}`;
        // Store in database
        await db_1.default.execute(`INSERT INTO student_locations 
       (student_id, location_name, location_type, coordinates, signal_strength, distance, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`, [
            studentId,
            locationName || zone || 'BLE_TRACKING',
            locationType || 'ble_tracking',
            coordinates,
            accuracy || 0, // Use accuracy as signal_strength
            distance || 0
        ]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('Trilateration update error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
