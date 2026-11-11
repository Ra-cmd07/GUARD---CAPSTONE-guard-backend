"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBleDevices = getBleDevices;
exports.uploadBleData = uploadBleData;
exports.getScanStatus = getScanStatus;
exports.setScanStatus = setScanStatus;
exports.detectBleToken = detectBleToken;
exports.getBleDashboard = getBleDashboard;
const db_1 = __importDefault(require("../lib/db"));
const blePositioning_1 = require("../utils/blePositioning");
const socketHandler_1 = require("../src/websocket/socketHandler");
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function normalizeMac(value) {
    return value
        .toLowerCase()
        .replace(/:/g, '')
        .replace(/-/g, '')
        .trim();
}
async function fetchBleData(macAddress) {
    const hasFilter = typeof macAddress === 'string' && macAddress.length > 0;
    const normalizedMac = hasFilter ? normalizeMac(macAddress) : '';
    const whereClause = hasFilter
        ? `WHERE REPLACE(REPLACE(LOWER(mac_address), ':', ''), '-', '') = ?`
        : '';
    const params = hasFilter ? [normalizedMac] : [];
    const [allRows] = await db_1.default.execute(`SELECT id, room_name, mac_address, distance, rssi, timestamp
     FROM BLEPROXY
     ${whereClause}
     ORDER BY timestamp DESC
     LIMIT 100`, params.length > 0 ? params : undefined);
    const [uniqueRows] = await db_1.default.execute(`SELECT d.room_name,
            d.mac_address,
            d.distance AS latest_distance,
            d.rssi AS latest_rssi,
            d.timestamp AS last_seen
     FROM BLEPROXY d
     JOIN (
       SELECT mac_address, MAX(timestamp) AS last_seen
       FROM BLEPROXY
       ${whereClause}
       GROUP BY mac_address
     ) m ON d.mac_address = m.mac_address AND d.timestamp = m.last_seen
     ORDER BY d.timestamp DESC`, params.length > 0 ? params : undefined);
    return { allRows, uniqueRows };
}
async function getBleDevices(req, res) {
    try {
        const macFilter = typeof req.query.mac === 'string'
            ? req.query.mac.trim()
            : undefined;
        const { allRows, uniqueRows } = await fetchBleData(macFilter);
        res.json({
            filterMac: macFilter || null,
            totalRecords: allRows.length,
            uniqueDevices: uniqueRows.length,
            records: allRows,
            latestDevices: uniqueRows,
        });
    }
    catch (err) {
        console.error('getBleDevices error:', err);
        res.status(500).json({ error: 'Unable to load BLE device data' });
    }
}
async function uploadBleData(req, res) {
    try {
        const devices = req.body?.devices;
        const roomName = String(req.body?.room_name || req.body?.roomName || 'room1').trim();
        if (!Array.isArray(devices) || devices.length === 0) {
            res.status(400).json({ error: 'devices array is required' });
            return;
        }
        const insertedCount = { value: 0 };
        const rejectedCount = { value: 0 };
        const insertPromises = devices.map(async (device) => {
            const uuid = String(device.uuid || '').trim();
            const macAddress = String(device.mac_address || device.mac || '').trim();
            const distance = Number(device.distance || 0);
            const rssi = Number(device.rssi || 0);
            const timestamp = String(device.timestamp || new Date().toISOString()).trim();
            // Require UUID (primary) or MAC (fallback for old data)
            if (!uuid && !macAddress) {
                rejectedCount.value++;
                return;
            }
            try {
                // 🆕 UUID-BASED LOOKUP: Check if UUID or MAC is registered in students table
                let students;
                if (uuid) {
                    [students] = await db_1.default.execute(`SELECT id FROM students WHERE uuid = ?`, [uuid]);
                }
                else {
                    // Fallback to MAC if UUID not provided (backward compatibility)
                    const normalizedMac = normalizeMac(macAddress);
                    [students] = await db_1.default.execute(`SELECT id FROM students 
             WHERE REPLACE(REPLACE(LOWER(mac_address), ':', ''), '-', '') = ?`, [normalizedMac]);
                }
                if (students.length === 0) {
                    console.warn(`UUID/MAC ${uuid || macAddress} not registered in students table`);
                    rejectedCount.value++;
                    return;
                }
                // Insert into BLEPROXY with UUID support
                await db_1.default.execute(`INSERT INTO BLEPROXY (room_name, uuid, mac_address, distance, rssi, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`, [roomName, uuid || null, macAddress || null, distance, rssi, timestamp]);
                insertedCount.value++;
            }
            catch (err) {
                console.error(`Error processing UUID/MAC ${uuid || macAddress}:`, err);
                rejectedCount.value++;
            }
        });
        await Promise.all(insertPromises);
        // 🗺️ TRILATERATION: Calculate and broadcast student positions
        try {
            // Get beacon/anchor coordinates (map room_name to physical location)
            // Note: room_name comes as "anchor_1", "anchor_2", "anchor_3" from ESP32
            const anchorCoordinates = {
                'anchor_1': '8.4857,124.6565', // Replace with actual Anchor 1 coordinates
                'anchor_2': '8.4858,124.6567', // Replace with actual Anchor 2 coordinates
                'anchor_3': '8.4856,124.6563', // Replace with actual Anchor 3 coordinates
            };
            // Get unique students from this batch
            const studentUUIDs = devices
                .map((d) => d.uuid)
                .filter((uuid) => uuid);
            if (studentUUIDs.length > 0) {
                // For each student, get latest readings from all anchors
                for (const uuid of studentUUIDs) {
                    const [readings] = await db_1.default.execute(`SELECT room_name, distance, rssi, timestamp
             FROM BLEPROXY
             WHERE uuid = ?
             AND timestamp > DATE_SUB(NOW(), INTERVAL 10 SECOND)
             ORDER BY timestamp DESC
             LIMIT 3`, [uuid]);
                    if (readings.length >= 2) { // Need at least 2 anchors for positioning
                        // Map readings to beacon signals
                        const signals = readings.map((r) => ({
                            beacon_id: r.room_name,
                            rssi: r.rssi,
                            coordinates: anchorCoordinates[r.room_name] || '8.4857,124.6565'
                        })).filter((s) => s.coordinates);
                        // Calculate position
                        const position = (0, blePositioning_1.calculatePosition)(signals);
                        if (position) {
                            // Get student info
                            const [studentInfo] = await db_1.default.execute(`SELECT id, name, grade, section FROM students WHERE uuid = ?`, [uuid]);
                            if (studentInfo.length > 0) {
                                const student = studentInfo[0];
                                // Broadcast via WebSocket
                                const io = (0, socketHandler_1.getIO)();
                                if (io) {
                                    io.to('admin').to('teacher').emit('location:update', {
                                        type: 'student_location',
                                        student: {
                                            id: student.id,
                                            name: student.name,
                                            section: student.section,
                                            grade: student.grade,
                                        },
                                        location: {
                                            position: {
                                                lat: position.lat,
                                                lng: position.lng,
                                                accuracy: position.accuracy
                                            },
                                            beacon: {
                                                name: signals[0].beacon_id,
                                            },
                                            distance: readings[0].distance,
                                            timestamp: new Date().toISOString(),
                                        }
                                    });
                                    console.log(`📍 Broadcasted position for ${student.name}: ${position.lat}, ${position.lng}`);
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (trilaterationError) {
            console.error('Trilateration error:', trilaterationError);
            // Don't fail the request if trilateration fails
        }
        res.status(201).json({
            message: 'BLE proxy data processed',
            roomName,
            inserted: insertedCount.value,
            rejected: rejectedCount.value,
        });
    }
    catch (err) {
        console.error('uploadBleData error:', err);
        res.status(500).json({ error: 'Unable to save BLE data' });
    }
}
// Track which kiosks are currently scanning for BLE tokens
// Key: kiosk_id, Value: { scanning: boolean, lastUpdate: timestamp }
const kioskScanStatus = new Map();
/**
 * Get BLE scan status for a kiosk
 * ESP32 polls this to know if it should scan
 */
async function getScanStatus(req, res) {
    try {
        const kioskId = parseInt(req.query.kiosk_id) || 1;
        const now = Date.now();
        // Get status for this kiosk
        const status = kioskScanStatus.get(kioskId);
        // If no status or too old (>10 seconds), assume not scanning
        if (!status || (now - status.lastUpdate) > 10000) {
            res.json({ scanning: false, kiosk_id: kioskId });
            return;
        }
        res.json({
            scanning: status.scanning,
            kiosk_id: kioskId,
            age_ms: now - status.lastUpdate
        });
    }
    catch (err) {
        console.error('[BLE Scan Status] Error:', err);
        res.status(500).json({ error: 'Failed to get scan status' });
    }
}
/**
 * Set BLE scan status for a kiosk
 * Kiosk calls this when BLE button is clicked or scanning stops
 */
async function setScanStatus(req, res) {
    try {
        const { kiosk_id, scanning } = req.body;
        if (typeof kiosk_id !== 'number' || typeof scanning !== 'boolean') {
            res.status(400).json({
                error: 'Invalid request: kiosk_id (number) and scanning (boolean) required'
            });
            return;
        }
        // Update status
        kioskScanStatus.set(kiosk_id, {
            scanning,
            lastUpdate: Date.now()
        });
        console.log(`[BLE Scan Status] Kiosk ${kiosk_id}: ${scanning ? 'STARTED' : 'STOPPED'} scanning`);
        res.json({
            success: true,
            kiosk_id,
            scanning,
            message: scanning ? 'BLE scanning enabled' : 'BLE scanning disabled'
        });
    }
    catch (err) {
        console.error('[BLE Scan Status] Error:', err);
        res.status(500).json({ error: 'Failed to set scan status' });
    }
}
/**
 * ESP32 BLE Token Attendance Detection
 * Receives BLE beacon detection from ESP32 and creates pending attendance
 * NOW SUPPORTS UUID-BASED IDENTIFICATION
 */
async function detectBleToken(req, res) {
    try {
        const { student_id, student_name, uuid, mac, rssi, distance, kiosk_id, gate_name } = req.body;
        // Validate required fields (UUID is now primary, MAC is optional)
        if (!uuid) {
            res.status(400).json({
                error: 'Missing required field: uuid'
            });
            return;
        }
        console.log(`[BLE Token] Detection from ESP32: UUID=${uuid}, Name=${student_name || 'unknown'}, Distance=${distance}m`);
        // 🆕 UUID-BASED LOOKUP: Find student by UUID (primary) or by student_id (fallback)
        let students;
        if (student_id) {
            // If student_id provided, verify it matches the UUID
            [students] = await db_1.default.execute(`SELECT id, name, grade, section, uuid, mac_address FROM students WHERE id = ? AND uuid = ?`, [student_id, uuid]);
        }
        else {
            // Look up by UUID only
            [students] = await db_1.default.execute(`SELECT id, name, grade, section, uuid, mac_address FROM students WHERE uuid = ?`, [uuid]);
        }
        if (students.length === 0) {
            console.warn(`[BLE Token] ❌ No student found with UUID: ${uuid}`);
            res.status(404).json({ error: 'Student not found for this UUID' });
            return;
        }
        const student = students[0];
        const actualStudentId = student.id;
        const actualStudentName = student.name;
        console.log(`[BLE Token] ✅ Student identified: ${actualStudentName} (ID: ${actualStudentId})`);
        // 🆕 OPTIONAL: Update MAC address if provided (for logging/debugging purposes)
        if (mac && student.mac_address !== mac) {
            console.log(`[BLE Token] MAC changed for ${actualStudentName}: ${student.mac_address} → ${mac}`);
            await db_1.default.execute(`UPDATE students SET mac_address = ?, updated_at = NOW() WHERE id = ?`, [mac, actualStudentId]);
            console.log(`[BLE Token] ✅ Student MAC address updated in database`);
        }
        // Check for recent pending detection (last 30 seconds) to prevent duplicates
        // Note: using detected_at (existing column) instead of created_at
        const [recentDetections] = await db_1.default.execute(`SELECT id FROM ble_detections 
       WHERE student_id = ? 
       AND status = 'pending' 
       AND detected_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)`, [actualStudentId]);
        if (recentDetections.length > 0) {
            console.log(`[BLE Token] Duplicate detection for ${actualStudentName} - ignoring`);
            res.json({
                success: true,
                message: 'Detection already exists (within 30 seconds)',
                duplicate: true
            });
            return;
        }
        // Insert BLE detection record (matching existing table structure)
        // Table has: beacon_id, location_name instead of kiosk_id, gate_name
        const [result] = await db_1.default.execute(`INSERT INTO ble_detections 
       (student_id, student_name, mac_address, rssi, beacon_id, location_name, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`, [actualStudentId, actualStudentName, mac || uuid, rssi || null, kiosk_id || 1, gate_name || 'Main Gate']);
        const detectionId = result.insertId;
        console.log(`[BLE Token] ✅ Detection recorded: ID ${detectionId} for ${actualStudentName}`);
        console.log(`[BLE Token] Status: PENDING (waiting for kiosk auto-approval)`);
        res.status(201).json({
            success: true,
            message: 'BLE detection recorded',
            id: detectionId,
            student_id: actualStudentId,
            student_name: actualStudentName,
            uuid: uuid,
            status: 'pending'
        });
    }
    catch (err) {
        console.error('[BLE Token] Error:', err);
        res.status(500).json({ error: 'Failed to process BLE detection' });
    }
}
async function getBleDashboard(req, res) {
    try {
        const macFilter = typeof req.query.mac === 'string'
            ? req.query.mac.trim()
            : undefined;
        const { allRows, uniqueRows } = await fetchBleData(macFilter);
        const uniqueCount = uniqueRows.length;
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>BLE Device Tracker Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            font-size: 14px;
        }
        .section {
            background: white;
            padding: 30px;
            border-radius: 10px;
            margin-bottom: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .section h2 {
            color: #333;
            margin-bottom: 20px;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        thead {
            background: #667eea;
            color: white;
        }
        th {
            padding: 15px;
            text-align: left;
            font-weight: 600;
        }
        td {
            padding: 12px 15px;
            border-bottom: 1px solid #eee;
        }
        tbody tr:hover {
            background: #f8f9ff;
        }
        .mac {
            font-family: 'Courier New', monospace;
            font-weight: 600;
            color: #667eea;
        }
        .distance {
            font-weight: 600;
            color: #27ae60;
        }
        .rssi {
            font-weight: 600;
            color: #e74c3c;
        }
        .timestamp {
            color: #999;
            font-size: 13px;
        }
        .empty {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 10px;
            text-align: center;
        }
        .stat-card h3 {
            margin-bottom: 10px;
            opacity: 0.9;
            font-size: 14px;
        }
        .stat-card .value {
            font-size: 32px;
            font-weight: bold;
        }
        .refresh-btn {
            background: #667eea;
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 5px;
            cursor: pointer;
            font-size: 14px;
            margin-bottom: 20px;
        }
        .refresh-btn:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>📡 BLE Device Tracker Dashboard</h1>
            <p class="subtitle">Real-time monitoring of Bluetooth LE devices detected by ESP32</p>
        </header>

        <div class="section">
            <h2>Active Devices (Latest Detection)</h2>
            <button class="refresh-btn" onclick="location.reload()">🔄 Refresh</button>
            ${uniqueRows.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>MAC Address</th>
                        <th>Latest Distance (m)</th>
                        <th>Latest RSSI (dBm)</th>
                        <th>Last Seen</th>
                    </tr>
                </thead>
                <tbody>
                    ${uniqueRows.map((row) => `
                        <tr>
                            <td class="mac">${escapeHtml(String(row.mac_address))}</td>
                            <td class="distance">${Number(row.latest_distance).toFixed(2)}</td>
                            <td class="rssi">${escapeHtml(String(row.latest_rssi))}</td>
                            <td class="timestamp">${escapeHtml(String(row.last_seen))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : `<p class="empty">No devices found yet. Waiting for ESP32 to send data...</p>`}
        </div>

        <div class="section">
            <h2>All Records (Last 100)</h2>
            <div class="stats">
                <div class="stat-card">
                    <h3>Total Records</h3>
                    <div class="value">${allRows.length}</div>
                </div>
                <div class="stat-card">
                    <h3>Unique Devices</h3>
                    <div class="value">${uniqueCount}</div>
                </div>
            </div>
            ${allRows.length > 0 ? `
            <table>
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>MAC Address</th>
                        <th>Distance (m)</th>
                        <th>RSSI (dBm)</th>
                        <th>Timestamp</th>
                    </tr>
                </thead>
                <tbody>
                    ${allRows.map((row) => `
                        <tr>
                            <td>${escapeHtml(String(row.id))}</td>
                            <td class="mac">${escapeHtml(String(row.mac_address))}</td>
                            <td class="distance">${Number(row.distance).toFixed(2)}</td>
                            <td class="rssi">${escapeHtml(String(row.rssi))}</td>
                            <td class="timestamp">${escapeHtml(String(row.timestamp))}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            ` : `<p class="empty">No records found yet.</p>`}
        </div>
    </div>
</body>
</html>`;
        res.type('html').send(html);
    }
    catch (err) {
        console.error('getBleDashboard error:', err);
        res.status(500).send('Unable to load BLE tracker dashboard');
    }
}
