"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLocations = getLocations;
exports.createLocation = createLocation;
exports.captureFingerprint = captureFingerprint;
exports.deleteLocation = deleteLocation;
exports.getLocationSamples = getLocationSamples;
exports.predictLocation = predictLocation;
exports.captureDistanceCal = captureDistanceCal;
exports.getDistanceCal = getDistanceCal;
exports.deleteDistanceCal = deleteDistanceCal;
exports.correctDistance = correctDistance;
exports.getCorrectedDistance = getCorrectedDistance;
exports.captureRoomZone = captureRoomZone;
exports.getRoomZones = getRoomZones;
exports.deleteRoomZone = deleteRoomZone;
exports.detectZone = detectZone;
exports.getStudentStatus = getStudentStatus;
exports.getRoomEvents = getRoomEvents;
const db_1 = __importDefault(require("../lib/db"));
// ─── GET /api/fingerprint/locations ──────────────────────────────────
// List all calibrated locations
async function getLocations(req, res) {
    try {
        const [rows] = await db_1.default.query(`SELECT fl.id, fl.label, fl.description, fl.created_at,
              COUNT(fs.id) AS sample_count
       FROM fingerprint_locations fl
       LEFT JOIN fingerprint_samples fs ON fs.location_id = fl.id
       GROUP BY fl.id
       ORDER BY fl.label`);
        res.json(rows);
    }
    catch (err) {
        console.error('getLocations error:', err);
        res.status(500).json({ error: 'Failed to fetch locations' });
    }
}
// ─── POST /api/fingerprint/locations ─────────────────────────────────
// Create or upsert a location label (admin only)
async function createLocation(req, res) {
    try {
        const { label, description } = req.body;
        if (!label?.trim()) {
            res.status(400).json({ error: 'label is required' });
            return;
        }
        const [result] = await db_1.default.query(`INSERT INTO fingerprint_locations (label, description, created_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE description = VALUES(description)`, [label.trim(), description || null, req.user.id]);
        // Get the id (insertId or existing)
        let locationId = result.insertId;
        if (!locationId) {
            const [existing] = await db_1.default.query(`SELECT id FROM fingerprint_locations WHERE label = ?`, [label.trim()]);
            locationId = existing[0]?.id;
        }
        res.status(201).json({ id: locationId, label: label.trim(), message: 'Location saved' });
    }
    catch (err) {
        console.error('createLocation error:', err);
        res.status(500).json({ error: 'Failed to create location' });
    }
}
// ─── POST /api/fingerprint/capture ───────────────────────────────────
// Admin triggers a capture: reads last N seconds of BLEPROXY data
// and saves them as fingerprint samples for the given location.
// The admin stands at the reference point, taps Capture in the app,
// and the ESP32 anchors' recent readings are stored as the fingerprint.
async function captureFingerprint(req, res) {
    try {
        const { location_id, seconds = 10 } = req.body;
        if (!location_id) {
            res.status(400).json({ error: 'location_id is required' });
            return;
        }
        // Verify location exists
        const [locRows] = await db_1.default.query(`SELECT id, label FROM fingerprint_locations WHERE id = ?`, [location_id]);
        if (!locRows.length) {
            res.status(404).json({ error: 'Location not found' });
            return;
        }
        // Pull the most recent BLEPROXY readings within the capture window
        const [bleRows] = await db_1.default.query(`SELECT room_name AS anchor_id,
              AVG(rssi)     AS rssi,
              AVG(distance) AS distance
       FROM BLEPROXY
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       GROUP BY room_name`, [seconds]);
        if (!bleRows.length) {
            res.status(422).json({
                error: 'No BLE anchor readings found in the last window. Make sure anchors are active.',
            });
            return;
        }
        // Insert one sample row per anchor
        const insertValues = bleRows.map((r) => [
            location_id, r.anchor_id, r.rssi, r.distance,
        ]);
        for (const vals of insertValues) {
            await db_1.default.query(`INSERT INTO fingerprint_samples (location_id, anchor_id, rssi, distance)
         VALUES (?, ?, ?, ?)`, vals);
        }
        console.log(`[Fingerprint] Captured ${insertValues.length} anchor readings for location ${locRows[0].label}`);
        res.status(201).json({
            message: 'Fingerprint captured',
            location: locRows[0].label,
            anchors_captured: insertValues.length,
            readings: bleRows,
        });
    }
    catch (err) {
        console.error('captureFingerprint error:', err);
        res.status(500).json({ error: 'Failed to capture fingerprint' });
    }
}
// ─── DELETE /api/fingerprint/locations/:id ────────────────────────────
// Delete a location and all its samples (admin only)
async function deleteLocation(req, res) {
    try {
        const { id } = req.params;
        await db_1.default.query('DELETE FROM fingerprint_locations WHERE id = ?', [id]);
        res.json({ success: true, message: 'Location and samples deleted' });
    }
    catch (err) {
        console.error('deleteLocation error:', err);
        res.status(500).json({ error: 'Failed to delete location' });
    }
}
// ─── GET /api/fingerprint/locations/:id/samples ───────────────────────
// View samples for a location (for review/debugging)
async function getLocationSamples(req, res) {
    try {
        const { id } = req.params;
        const [rows] = await db_1.default.query(`SELECT anchor_id, rssi, distance, captured_at
       FROM fingerprint_samples
       WHERE location_id = ?
       ORDER BY captured_at DESC
       LIMIT 200`, [id]);
        res.json(rows);
    }
    catch (err) {
        console.error('getLocationSamples error:', err);
        res.status(500).json({ error: 'Failed to fetch samples' });
    }
}
// ─── POST /api/fingerprint/predict ───────────────────────────────────
// Given current BLEPROXY readings, predict which location the person is in.
// Uses k-NN with Euclidean distance on RSSI vectors.
async function predictLocation(req, res) {
    try {
        const secondsWindow = Number(req.query.seconds) || 10;
        // Get current live readings averaged per anchor
        const [liveRows] = await db_1.default.query(`SELECT room_name AS anchor_id, AVG(rssi) AS rssi
       FROM BLEPROXY
       WHERE timestamp >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       GROUP BY room_name`, [secondsWindow]);
        if (!liveRows.length) {
            res.status(422).json({ error: 'No live BLE readings available for prediction' });
            return;
        }
        // Build live RSSI vector keyed by anchor_id
        const liveVector = {};
        for (const r of liveRows) {
            liveVector[r.anchor_id] = r.rssi;
        }
        // Load all fingerprint samples averaged per location+anchor
        const [fpRows] = await db_1.default.query(`SELECT fs.location_id, fl.label, fs.anchor_id, AVG(fs.rssi) AS rssi
       FROM fingerprint_samples fs
       JOIN fingerprint_locations fl ON fl.id = fs.location_id
       GROUP BY fs.location_id, fs.anchor_id`);
        if (!fpRows.length) {
            res.status(422).json({ error: 'No fingerprint data trained yet. Run calibration first.' });
            return;
        }
        // Group fingerprint vectors by location
        const locationVectors = {};
        for (const fp of fpRows) {
            if (!locationVectors[fp.location_id]) {
                locationVectors[fp.location_id] = { label: fp.label, vector: {} };
            }
            locationVectors[fp.location_id].vector[fp.anchor_id] = fp.rssi;
        }
        // Compute Euclidean distance between live vector and each location vector
        // Use -100 dBm as default for missing anchors (very weak / not detected)
        const DEFAULT_RSSI = -100;
        const allAnchors = new Set([
            ...Object.keys(liveVector),
            ...fpRows.map((r) => r.anchor_id),
        ]);
        let bestLocationId = null;
        let bestLabel = 'Unknown';
        let bestDistance = Infinity;
        for (const [locIdStr, loc] of Object.entries(locationVectors)) {
            let sumSq = 0;
            for (const anchor of allAnchors) {
                const live = liveVector[anchor] ?? DEFAULT_RSSI;
                const fp = loc.vector[anchor] ?? DEFAULT_RSSI;
                sumSq += (live - fp) ** 2;
            }
            const dist = Math.sqrt(sumSq);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestLocationId = Number(locIdStr);
                bestLabel = loc.label;
            }
        }
        res.json({
            predicted_location: bestLabel,
            location_id: bestLocationId,
            confidence_distance: Math.round(bestDistance * 10) / 10,
            live_anchors: liveRows,
        });
    }
    catch (err) {
        console.error('predictLocation error:', err);
        res.status(500).json({ error: 'Failed to predict location' });
    }
}
// ─────────────────────────────────────────────────────────────────────
// DISTANCE CALIBRATION  — empirical RSSI→distance correction
// ─────────────────────────────────────────────────────────────────────
// ─── POST /api/fingerprint/distance-cal ──────────────────────────────
// Admin stands at a known distance from a specific anchor and captures
// the average RSSI for that anchor over the last N seconds.
// Reads from BLEPROXY (anchors sending to backend) OR accepts direct
// rssi value when the anchor sends to the trilateration server instead.
async function captureDistanceCal(req, res) {
    try {
        const { anchor_id, known_distance, seconds = 10, rssi: directRssi } = req.body;
        if (!anchor_id || known_distance == null) {
            res.status(400).json({ error: 'anchor_id and known_distance are required' });
            return;
        }
        const dist = parseFloat(known_distance);
        if (isNaN(dist) || dist <= 0) {
            res.status(400).json({ error: 'known_distance must be a positive number' });
            return;
        }
        let avgRssi;
        let sampleCount;
        if (directRssi != null) {
            // Direct RSSI provided — anchor sends to trilateration server, not BLEPROXY
            avgRssi = parseFloat(directRssi);
            sampleCount = 1;
            if (isNaN(avgRssi)) {
                res.status(400).json({ error: 'rssi must be a valid number when provided directly' });
                return;
            }
        }
        else {
            // Read from BLEPROXY (anchor sends directly to backend)
            const [rows] = await db_1.default.query(`SELECT AVG(rssi) AS avg_rssi, COUNT(*) AS sample_count
         FROM BLEPROXY
         WHERE room_name = ?
           AND timestamp >= DATE_SUB(NOW(), INTERVAL ? SECOND)`, [anchor_id, seconds]);
            avgRssi = rows[0]?.avg_rssi;
            sampleCount = rows[0]?.sample_count || 0;
            if (!avgRssi) {
                res.status(422).json({
                    error: `No readings found for anchor "${anchor_id}" in the last ${seconds}s. ` +
                        `If this anchor sends to the trilateration server (port 8080), provide the rssi value directly.`,
                });
                return;
            }
        }
        // Insert calibration point
        await db_1.default.query(`INSERT INTO fingerprint_distance_cal (anchor_id, known_distance, rssi, created_by)
       VALUES (?, ?, ?, ?)`, [anchor_id, dist, avgRssi, req.user.id]);
        console.log(`[DistanceCal] anchor=${anchor_id} dist=${dist}m rssi=${avgRssi.toFixed(1)} samples=${sampleCount}`);
        res.status(201).json({
            message: 'Distance calibration point saved',
            anchor_id,
            known_distance: dist,
            observed_rssi: Math.round(avgRssi * 10) / 10,
            sample_count: sampleCount,
        });
    }
    catch (err) {
        console.error('captureDistanceCal error:', err);
        res.status(500).json({ error: 'Failed to capture distance calibration' });
    }
}
// ─── GET /api/fingerprint/distance-cal ───────────────────────────────
// List all calibration points, grouped by anchor
async function getDistanceCal(req, res) {
    try {
        const [rows] = await db_1.default.query(`SELECT anchor_id, known_distance, rssi, captured_at
       FROM fingerprint_distance_cal
       ORDER BY anchor_id, known_distance ASC`);
        res.json(rows);
    }
    catch (err) {
        console.error('getDistanceCal error:', err);
        res.status(500).json({ error: 'Failed to fetch calibration data' });
    }
}
// ─── DELETE /api/fingerprint/distance-cal/:anchor_id ─────────────────
// Clear all calibration points for one anchor (to recalibrate)
async function deleteDistanceCal(req, res) {
    try {
        const { anchor_id } = req.params;
        await db_1.default.query(`DELETE FROM fingerprint_distance_cal WHERE anchor_id = ?`, [anchor_id]);
        res.json({ success: true, message: `Calibration data cleared for anchor ${anchor_id}` });
    }
    catch (err) {
        console.error('deleteDistanceCal error:', err);
        res.status(500).json({ error: 'Failed to delete calibration data' });
    }
}
// ─── GET /api/fingerprint/correct-distance ───────────────────────────
// Given a live RSSI and anchor_id, return an empirically corrected distance.
// Uses linear interpolation between the two nearest calibration points.
// Falls back to the raw path-loss estimate if no calibration data exists.
async function correctDistance(req, res) {
    try {
        const anchor_id = req.query.anchor_id;
        const rssi = parseFloat(req.query.rssi);
        if (!anchor_id || isNaN(rssi)) {
            res.status(400).json({ error: 'anchor_id and rssi query params are required' });
            return;
        }
        const corrected = await getCorrectedDistance(anchor_id, rssi);
        res.json(corrected);
    }
    catch (err) {
        console.error('correctDistance error:', err);
        res.status(500).json({ error: 'Failed to correct distance' });
    }
}
// ─── Shared helper: interpolate corrected distance ────────────────────
// Exported so the trilateration server (Python) can call it via HTTP,
// or any other internal controller can use it directly.
async function getCorrectedDistance(anchor_id, rssi) {
    // Load calibration points for this anchor, ordered by distance
    const [rows] = await db_1.default.query(`SELECT known_distance, rssi
     FROM fingerprint_distance_cal
     WHERE anchor_id = ?
     ORDER BY known_distance ASC`, [anchor_id]);
    const cal = rows;
    // No calibration data — fall back to standard path-loss formula
    if (!cal.length) {
        const TX_POWER = -59; // RSSI at 1m (typical BLE beacon)
        const PATH_LOSS = 2.5; // Indoor path-loss exponent
        const fallback = Math.pow(10, (TX_POWER - rssi) / (10 * PATH_LOSS));
        return { corrected_distance: Math.round(fallback * 100) / 100, method: 'fallback', raw_rssi: rssi };
    }
    // Only one calibration point — scale from it
    if (cal.length === 1) {
        const ref = cal[0];
        // RSSI decreases (more negative) as distance increases
        // Use ratio from reference point with path-loss exponent = 2.5
        const PATH_LOSS = 2.5;
        const dist = ref.known_distance * Math.pow(10, (ref.rssi - rssi) / (10 * PATH_LOSS));
        return { corrected_distance: Math.round(dist * 100) / 100, method: 'extrapolated', raw_rssi: rssi };
    }
    // Find the two calibration points that bracket this RSSI value.
    // Note: higher RSSI (less negative) = shorter distance, so calibration
    // points are ordered ascending distance / descending RSSI.
    let lower = cal[0];
    let upper = cal[cal.length - 1];
    for (let i = 0; i < cal.length - 1; i++) {
        // cal is sorted by distance ASC, so rssi DESC
        if (rssi <= cal[i].rssi && rssi >= cal[i + 1].rssi) {
            lower = cal[i];
            upper = cal[i + 1];
            break;
        }
    }
    // Linear interpolation between the two bracketing points
    // rssi maps to distance: as rssi decreases, distance increases
    const rssiRange = lower.rssi - upper.rssi; // positive value
    const distRange = upper.known_distance - lower.known_distance; // positive value
    let corrected;
    if (rssiRange === 0) {
        corrected = (lower.known_distance + upper.known_distance) / 2;
    }
    else {
        const t = (lower.rssi - rssi) / rssiRange; // 0 at lower point, 1 at upper point
        corrected = lower.known_distance + t * distRange;
    }
    // Clamp to reasonable range
    corrected = Math.max(0.1, Math.round(corrected * 100) / 100);
    return { corrected_distance: corrected, method: 'interpolated', raw_rssi: rssi };
}
// ─────────────────────────────────────────────────────────────────────
// ROOM ZONES — inside/doorway/outside calibration + Enter/Exit detection
// ─────────────────────────────────────────────────────────────────────
// ─── POST /api/fingerprint/room-zones ────────────────────────────────
// Admin captures three positions (inside / doorway / outside) for a room.
// The doorway distance is automatically derived from the distance calibration table.
async function captureRoomZone(req, res) {
    try {
        const { room_name, anchor_id, inside_rssi, doorway_rssi, outside_rssi, } = req.body;
        if (!room_name || !anchor_id || inside_rssi == null || doorway_rssi == null || outside_rssi == null) {
            res.status(400).json({ error: 'room_name, anchor_id, inside_rssi, doorway_rssi, outside_rssi are required' });
            return;
        }
        // Convert doorway RSSI → corrected distance using calibration table
        const corrected = await getCorrectedDistance(String(anchor_id), parseFloat(doorway_rssi));
        const doorwayDistanceM = corrected.corrected_distance;
        await db_1.default.query(`INSERT INTO room_zones
         (room_name, anchor_id, inside_rssi, doorway_rssi, outside_rssi, doorway_distance_m, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         inside_rssi = VALUES(inside_rssi),
         doorway_rssi = VALUES(doorway_rssi),
         outside_rssi = VALUES(outside_rssi),
         doorway_distance_m = VALUES(doorway_distance_m),
         created_by = VALUES(created_by)`, [
            room_name, anchor_id,
            parseFloat(inside_rssi), parseFloat(doorway_rssi), parseFloat(outside_rssi),
            doorwayDistanceM,
            req.user.id,
        ]);
        console.log(`[RoomZone] Saved zone for ${room_name} / ${anchor_id}: doorway=${doorwayDistanceM}m (${corrected.method})`);
        res.status(201).json({
            message: 'Room zone saved',
            room_name,
            anchor_id,
            inside_rssi: parseFloat(inside_rssi),
            doorway_rssi: parseFloat(doorway_rssi),
            outside_rssi: parseFloat(outside_rssi),
            doorway_distance_m: doorwayDistanceM,
            distance_method: corrected.method,
        });
    }
    catch (err) {
        console.error('captureRoomZone error:', err);
        res.status(500).json({ error: 'Failed to save room zone' });
    }
}
// ─── GET /api/fingerprint/room-zones ─────────────────────────────────
async function getRoomZones(req, res) {
    try {
        const [rows] = await db_1.default.query(`SELECT id, room_name, anchor_id, inside_rssi, doorway_rssi, outside_rssi,
              doorway_distance_m, created_at
       FROM room_zones
       ORDER BY room_name, anchor_id`);
        res.json(rows);
    }
    catch (err) {
        console.error('getRoomZones error:', err);
        res.status(500).json({ error: 'Failed to fetch room zones' });
    }
}
// ─── DELETE /api/fingerprint/room-zones/:id ───────────────────────────
async function deleteRoomZone(req, res) {
    try {
        const { id } = req.params;
        await db_1.default.query('DELETE FROM room_zones WHERE id = ?', [id]);
        res.json({ success: true });
    }
    catch (err) {
        console.error('deleteRoomZone error:', err);
        res.status(500).json({ error: 'Failed to delete room zone' });
    }
}
// ─── In-memory: last known room status per student ────────────────────
// Key: student_id (string from trilateration STUDENTS config)
// Value: { room_name, status: 'inside'|'outside', last_distance, last_rssi, since }
const studentRoomStatus = {};
// ─── POST /api/fingerprint/detect-zone ───────────────────────────────
// Called by the trilateration server every few seconds with live readings
// per student. Compares against room zone thresholds and logs Enter/Exit.
async function detectZone(req, res) {
    try {
        const { readings } = req.body;
        // readings: [{ student_id, student_name, anchor_id, rssi, corrected_distance }]
        if (!Array.isArray(readings) || !readings.length) {
            res.json({ events: [] });
            return;
        }
        // Load all room zones once
        const [zones] = await db_1.default.query(`SELECT room_name, anchor_id, doorway_rssi, doorway_distance_m
       FROM room_zones`);
        const events = [];
        for (const r of readings) {
            const { student_id, student_name, anchor_id, rssi, corrected_distance } = r;
            const studentKey = String(student_id);
            // Find zone for this anchor
            const zone = zones.find(z => String(z.anchor_id) === String(anchor_id));
            if (!zone)
                continue;
            // Determine status: inside if corrected_distance ≤ doorway AND rssi ≥ doorway_rssi
            // Both must agree to prevent false triggers
            const distInside = corrected_distance <= zone.doorway_distance_m;
            const rssiInside = rssi >= zone.doorway_rssi; // stronger = closer = inside
            const newStatus = (distInside && rssiInside) ? 'inside' : 'outside';
            const prev = studentRoomStatus[studentKey];
            const prevStatus = prev?.status ?? null;
            // Detect transition
            if (prevStatus !== newStatus) {
                const eventType = newStatus === 'inside' ? 'enter' : 'exit';
                const now = new Date().toISOString();
                // Log to database
                try {
                    await db_1.default.query(`INSERT INTO room_events
               (student_id, student_name, event_type, room_name, anchor_id, rssi, distance_m)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [
                        student_id || null, student_name,
                        eventType, zone.room_name, anchor_id,
                        rssi, corrected_distance,
                    ]);
                }
                catch (dbErr) {
                    console.error('[RoomEvent] DB insert failed:', dbErr);
                }
                events.push({
                    student_id, student_name,
                    event_type: eventType,
                    room_name: zone.room_name,
                    occurred_at: now,
                });
                console.log(`[RoomEvent] ${student_name} ${eventType.toUpperCase()}ED ${zone.room_name} (dist=${corrected_distance}m, rssi=${rssi}dBm)`);
            }
            // Update in-memory status
            studentRoomStatus[studentKey] = {
                room_name: zone.room_name,
                status: newStatus,
                last_distance: corrected_distance,
                last_rssi: rssi,
                since: prev?.status === newStatus ? (prev.since) : new Date().toISOString(),
            };
        }
        res.json({ events });
    }
    catch (err) {
        console.error('detectZone error:', err);
        res.status(500).json({ error: 'Failed to detect zone' });
    }
}
// ─── GET /api/fingerprint/student-status ─────────────────────────────
// Returns current inside/outside status for all tracked students
async function getStudentStatus(req, res) {
    res.json(studentRoomStatus);
}
// ─── GET /api/fingerprint/room-events ────────────────────────────────
// Returns recent room entry/exit events
async function getRoomEvents(req, res) {
    try {
        const limit = Number(req.query.limit) || 20;
        const [rows] = await db_1.default.query(`SELECT id, student_id, student_name, event_type, room_name, anchor_id,
              rssi, distance_m, occurred_at
       FROM room_events
       ORDER BY occurred_at DESC
       LIMIT ?`, [limit]);
        res.json(rows);
    }
    catch (err) {
        console.error('getRoomEvents error:', err);
        res.status(500).json({ error: 'Failed to fetch room events' });
    }
}
