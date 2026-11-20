"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const db_1 = __importDefault(require("../lib/db"));
const http_1 = __importDefault(require("http"));
const router = (0, express_1.Router)();
// Rate limiting: prevent duplicate scans within cooldown period
const studentScanCooldown = {}; // studentId -> timestamp
const COOLDOWN_MS = 3000; // 3 seconds cooldown between scans
/**
 * POST /api/attendance/scan-ble
 * Web kiosk BLE scan endpoint
 * Flow: ESP32 scan → Queue SMS → Trigger GSM → Create partial attendance
 */
router.post('/scan-ble', async (req, res) => {
    console.log('═══════════════════════════════════════════════════');
    console.log('🔵 BLE SCAN REQUEST RECEIVED');
    console.log('═══════════════════════════════════════════════════');
    try {
        const { kiosk_id } = req.body;
        console.log('   Kiosk ID:', kiosk_id);
        if (!kiosk_id) {
            console.log('   ❌ ERROR: No kiosk_id provided');
            return res.status(400).json({ error: 'kiosk_id is required' });
        }
        // Get kiosk ESP32 IP
        console.log('   📡 Looking up kiosk in database...');
        const [kioskRows] = await db_1.default.execute(`SELECT id, name, location, esp32_ip 
       FROM kiosks 
       WHERE id = ? AND is_active = 1`, [kiosk_id]);
        if (kioskRows.length === 0) {
            console.log('   ❌ ERROR: Kiosk not found');
            return res.status(404).json({ error: 'Kiosk not found' });
        }
        const kiosk = kioskRows[0];
        console.log(`   ✅ Kiosk found: ${kiosk.name}`);
        console.log(`   ESP32 IP: ${kiosk.esp32_ip}`);
        if (!kiosk.esp32_ip) {
            console.log('   ❌ ERROR: ESP32 IP not configured');
            return res.status(400).json({ error: 'ESP32 IP not configured for this kiosk' });
        }
        // Call ESP32 /scan endpoint
        console.log(`   📡 Calling ESP32 at ${kiosk.esp32_ip}/scan...`);
        const esp32Response = await callESP32Scan(kiosk.esp32_ip);
        console.log('   ✅ ESP32 response received:', JSON.stringify(esp32Response));
        if (!esp32Response.found) {
            console.log('   ❌ No BLE token detected');
            return res.status(404).json({
                error: 'No BLE token detected',
                message: 'Please bring your BLE token closer to the kiosk'
            });
        }
        const { student_id, student_name, rssi, mac_address } = esp32Response;
        console.log(`   ✅ Student detected: ${student_name} (ID: ${student_id}, RSSI: ${rssi} dBm)`);
        // Get full student info
        console.log('   📊 Looking up student in database...');
        const [studentRows] = await db_1.default.execute(`SELECT id, name, lrn FROM students WHERE id = ?`, [student_id]);
        if (studentRows.length === 0) {
            console.log('   ❌ ERROR: Student not found in database');
            return res.status(404).json({ error: 'Student not found in database' });
        }
        const student = studentRows[0];
        console.log(`   ✅ Student info: ${student.name} (LRN: ${student.lrn})`);
        // ──────────────────────────────────────────────────────────────
        // COOLDOWN CHECK: Prevent duplicate scans within 3 seconds
        // ──────────────────────────────────────────────────────────────
        const now = Date.now();
        const lastScanTime = studentScanCooldown[student.id];
        if (lastScanTime && (now - lastScanTime) < COOLDOWN_MS) {
            const remainingSeconds = Math.ceil((COOLDOWN_MS - (now - lastScanTime)) / 1000);
            console.log(`   ⏳ COOLDOWN: Student ${student.id} scanned ${Math.ceil((now - lastScanTime) / 1000)}s ago`);
            console.log(`   ⏳ Please wait ${remainingSeconds} more second(s) before scanning again`);
            return res.status(429).json({
                error: 'Please wait before scanning again',
                message: `Please wait ${remainingSeconds} seconds before scanning again`,
                cooldown_remaining: remainingSeconds
            });
        }
        // Update last scan time
        studentScanCooldown[student.id] = now;
        console.log(`   ✅ Cooldown check passed for student ${student.id}`);
        // ──────────────────────────────────────────────────────────────
        // NO DUPLICATE CHECK - Allow unlimited scans per student
        // ──────────────────────────────────────────────────────────────
        const currentTime = new Date();
        // Get Philippine date/time (UTC+8) - ADD 8 HOURS to UTC
        const philippineTime = new Date(currentTime.getTime() + (8 * 60 * 60 * 1000));
        const today = philippineTime.toISOString().split('T')[0];
        // Format time correctly in 12-hour format with AM/PM
        const hour24 = philippineTime.getUTCHours();
        const minutes = philippineTime.getUTCMinutes();
        const seconds = philippineTime.getUTCSeconds();
        const hour12 = hour24 % 12 || 12; // Convert 0 to 12 for midnight, 13-23 to 1-11
        const ampm = hour24 < 12 ? 'AM' : 'PM';
        const timeStr = `${hour12}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;
        console.log(`   📅 Date calculation:`);
        console.log(`      UTC time: ${currentTime.toISOString()}`);
        console.log(`      Philippine time: ${philippineTime.toISOString()}`);
        console.log(`      Hour (24h): ${hour24}`);
        console.log(`      Hour (12h): ${hour12} ${ampm}`);
        console.log(`      Date used: ${today}`);
        console.log(`      Time used: ${timeStr}`);
        // Determine session based on hour
        const session = hour24 < 12 ? 'AM' : 'PM';
        // AUTO-TOGGLE: Check last record across both tables for THIS SESSION (AM/PM)
        // Check verified attendance first, then fall back to partial (pending)
        console.log(`   🔍 Checking last attendance for student ${student.id} on ${today} (session: ${session})...`);
        const [lastRecord] = await db_1.default.execute(`SELECT status FROM (
         SELECT status, created_at FROM attendance
         WHERE student_id = ? AND date = ? AND session = ?
         UNION ALL
         SELECT status, created_at FROM partial_attendance
         WHERE student_id = ? AND date = ? AND session = ?
       ) combined
       ORDER BY created_at DESC
       LIMIT 1`, [student.id, today, session, student.id, today, session]);
        let status;
        if (lastRecord.length > 0) {
            const lastStatus = lastRecord[0].status;
            console.log(`   📊 Last status: ${lastStatus}`);
            // Toggle based on last status IN THIS SESSION
            if (lastStatus === 'Time-Out') {
                // Last was Time-Out, so next is Time-In (check if late)
                status = (hour24 > 8 || (hour24 === 8 && minutes > 0)) ? 'Late' : 'Time-In';
                console.log(`   ✅ Toggling: Time-Out → ${status}`);
            }
            else {
                // Last was Time-In or Late, so next is Time-Out
                status = 'Time-Out';
                console.log(`   ✅ Toggling: ${lastStatus} → Time-Out`);
            }
        }
        else {
            // No record for this session yet, first scan is Time-In (check if late)
            status = (hour24 > 8 || (hour24 === 8 && minutes > 0)) ? 'Late' : 'Time-In';
            console.log(`   ✅ First scan of session: ${status}`);
        }
        console.log(`   💾 Creating partial attendance (session: ${session}, status: ${status})...`);
        // ──────────────────────────────────────────────────────────────
        // STEP 1: Queue SMS to parents (async, non-blocking)
        // Pass status to customize the message
        // ──────────────────────────────────────────────────────────────
        console.log(`   📩 Queueing SMS to parents (status: ${status}, time: ${timeStr})...`);
        queueSMSToParents(student.id, student.name, today, timeStr, status).catch(err => {
            console.error('   ⚠️  SMS queueing error:', err);
        });
        // ──────────────────────────────────────────────────────────────
        // STEP 2: Trigger ESP32 GSM (async, non-blocking)
        // ──────────────────────────────────────────────────────────────
        console.log('   📡 Triggering ESP32 GSM module...');
        triggerESP32GSM(kiosk.esp32_ip).catch(err => {
            console.error('   ⚠️  GSM trigger error:', err);
        });
        await db_1.default.execute(`INSERT INTO partial_attendance
       (student_id, student_name, kiosk_id, scan_method, status, approval_status, 
        session, date, time_in, created_at)
       VALUES (?, ?, ?, 'BLE', ?, 'PENDING', ?, ?, ?, NOW())`, [student.id, student.name, kiosk.id, status, session, today, timeStr]);
        console.log('   ✅ Partial attendance created!');
        console.log('   📤 Sending success response to frontend...');
        // Return success to web kiosk
        const response = {
            success: true,
            student_id: student.id,
            student_name: student.name,
            attendance_status: status, // Time-In, Late, or Time-Out
            status: 'partial_attendance_recorded',
            message: `${student.name} - ${status} recorded!`
        };
        console.log('   📨 Response:', JSON.stringify(response));
        console.log('═══════════════════════════════════════════════════\n');
        res.json(response);
    }
    catch (error) {
        console.error('❌ BLE SCAN ERROR:', error);
        console.log('═══════════════════════════════════════════════════\n');
        res.status(500).json({ error: 'Server error during BLE scan' });
    }
});
/**
 * Call ESP32 /scan endpoint
 */
async function callESP32Scan(esp32Ip) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: esp32Ip,
            port: 80,
            path: '/scan',
            method: 'GET',
            timeout: 5000
        };
        const req = http_1.default.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => {
                data += chunk;
            });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    resolve(parsed);
                }
                catch (err) {
                    reject(new Error('Invalid JSON from ESP32'));
                }
            });
        });
        req.on('error', (err) => {
            reject(err);
        });
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('ESP32 scan timeout'));
        });
        req.end();
    });
}
/**
 * Queue SMS to parents (async)
 */
async function queueSMSToParents(studentId, studentName, date, time, status) {
    const [parents] = await db_1.default.execute(`SELECT p.contact, p.name 
     FROM parent_student ps 
     JOIN parents p ON p.id = ps.parent_id 
     WHERE ps.student_id = ?`, [studentId]);
    // Change message based on status
    let message;
    if (status === 'Time-Out') {
        message = `ATTENDBOX: ${studentName} has left school at ${time} via BLE scan. Date: ${date}.`;
    }
    else if (status === 'Late') {
        message = `ATTENDBOX: ${studentName} has arrived late at school at ${time} via BLE scan. Date: ${date}.`;
    }
    else {
        message = `ATTENDBOX: ${studentName} has arrived at school at ${time} via BLE scan. Date: ${date}.`;
    }
    for (const parent of parents) {
        if (parent.contact) {
            await db_1.default.execute(`INSERT INTO sms_queue 
         (phone_number, message, student_id, priority, status, created_at)
         VALUES (?, ?, ?, 'normal', 'pending', NOW())`, [parent.contact, message, studentId]);
        }
    }
}
/**
 * Trigger ESP32 GSM (async)
 */
async function triggerESP32GSM(esp32Ip) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({ action: 'start_polling' });
        const options = {
            hostname: esp32Ip,
            port: 80,
            path: '/trigger',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 2000
        };
        const req = http_1.default.request(options, () => {
            resolve();
        });
        req.on('error', () => {
            resolve(); // Silent failure
        });
        req.on('timeout', () => {
            req.destroy();
            resolve(); // Silent failure
        });
        req.write(postData);
        req.end();
    });
}
exports.default = router;
