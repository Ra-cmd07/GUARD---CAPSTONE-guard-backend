"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingDetections = getPendingDetections;
exports.approveDetection = approveDetection;
exports.rejectDetection = rejectDetection;
const db_1 = __importDefault(require("../lib/db"));
const localPhotoUpload_1 = require("../utils/localPhotoUpload");
const uploadQueue_1 = require("../utils/uploadQueue");
/**
 * Queue SMS for GSM module to send
 * Converts phone numbers to international format (+63...)
 */
async function queueSmsForGSM(phone, message, studentId, attendanceId) {
    try {
        // Convert phone number to international format for GSM
        // 0917... → +63917...
        // 0953 681 2353 → +639536812353
        let internationalPhone = phone.trim().replace(/\s+/g, ''); // Remove spaces
        if (internationalPhone.startsWith('0')) {
            // Local format: replace leading 0 with +63
            internationalPhone = '+63' + internationalPhone.substring(1);
        }
        else if (internationalPhone.startsWith('63') && !internationalPhone.startsWith('+')) {
            // Missing + prefix
            internationalPhone = '+' + internationalPhone;
        }
        else if (!internationalPhone.startsWith('+63')) {
            // Invalid format, try to fix
            console.warn(`⚠️  Invalid phone format: ${phone}, attempting to fix...`);
            internationalPhone = '+63' + internationalPhone.replace(/^0+/, '');
        }
        await db_1.default.execute(`INSERT INTO sms_queue 
       (phone_number, message, student_id, attendance_id, priority, status, created_at) 
       VALUES (?, ?, ?, ?, 'normal', 'pending', NOW())`, [internationalPhone, message, studentId, attendanceId]);
        console.log(`📩 SMS queued for GSM module → ${internationalPhone}: ${message.substring(0, 50)}...`);
        return true;
    }
    catch (error) {
        console.error('❌ Failed to queue SMS:', error);
        return false;
    }
}
// ─── GET /api/ble/pending ─────────────────────────────────────────────
// Get pending BLE detections for kiosk approval
async function getPendingDetections(req, res) {
    try {
        const seconds = Number(req.query.seconds) || 60; // Last 60 seconds by default
        const [rows] = await db_1.default.execute(`SELECT 
        id,
        student_id,
        student_name,
        mac_address,
        beacon_id,
        location_name,
        rssi,
        status,
        detected_at,
        TIMESTAMPDIFF(SECOND, detected_at, NOW()) as seconds_ago
       FROM ble_detections
       WHERE status = 'pending'
       AND detected_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY detected_at DESC`, [seconds]);
        res.json(rows);
    }
    catch (err) {
        console.error('getPendingDetections error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/ble/approve/:id ────────────────────────────────────────
// Approve a pending BLE detection and record attendance
async function approveDetection(req, res) {
    try {
        const { id } = req.params;
        const { photo_base64, approved_by } = req.body;
        // Get detection details
        const [detections] = await db_1.default.execute('SELECT * FROM ble_detections WHERE id = ? AND status = \"pending\"', [id]);
        if (detections.length === 0) {
            res.status(404).json({ error: 'Detection not found or already processed' });
            return;
        }
        const detection = detections[0];
        // Get full student details (including lrn, gender, grade, section)
        const [students] = await db_1.default.execute('SELECT * FROM students WHERE id = ?', [detection.student_id]);
        if (students.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        const student = students[0];
        console.log('🔍 DEBUG: Student data from DB:', {
            id: student.id,
            name: student.name,
            lrn: student.lrn,
            gender: student.gender,
            grade: student.grade,
            section: student.section
        });
        // Handle photo upload to local storage if provided (SYNCHRONOUS - must complete before INSERT)
        let photoPath = null;
        if (photo_base64) {
            try {
                const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
                // Save to local uploads folder (AWAIT completion before INSERT)
                photoPath = await (0, localPhotoUpload_1.savePhotoLocally)(base64Data, student.name, 'ble_approved');
                console.log('📸 BLE photo saved locally:', photoPath);
                // Log to scan_photos immediately
                await db_1.default.execute('INSERT INTO scan_photos (attendance_id, student_name, status, photo_path, local_path) VALUES (?, ?, ?, ?, ?)', [null, student.name, 'pending', photoPath, photoPath]);
            }
            catch (err) {
                console.error('Failed to save BLE photo locally:', err);
                // Continue without photo rather than failing entire request
            }
        }
        // Calculate Philippines time (UTC+8)
        const now = new Date();
        const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const localDate = phTime.toISOString().split('T')[0];
        // Format time in 12-hour format with AM/PM
        // Use getUTC methods since phTime is already adjusted to PH time
        const hour24 = phTime.getUTCHours();
        const minutes = phTime.getUTCMinutes().toString().padStart(2, '0');
        const seconds = phTime.getUTCSeconds().toString().padStart(2, '0');
        const hour12 = hour24 % 12 || 12;
        const ampm = hour24 < 12 ? 'AM' : 'PM';
        const localTime = `${hour12}:${minutes}:${seconds} ${ampm}`;
        const localHour = hour24;
        const localMinute = phTime.getUTCMinutes();
        const session = hour24 < 12 ? 'AM' : 'PM';
        // AUTO-TOGGLE: Check last record across both tables for THIS SESSION (AM/PM)
        const [lastRecord] = await db_1.default.execute(`SELECT status FROM (
         SELECT status, created_at FROM attendance
         WHERE student_id = ? AND date = ? AND session = ?
         UNION ALL
         SELECT status, created_at FROM partial_attendance
         WHERE student_id = ? AND date = ? AND session = ?
       ) combined
       ORDER BY created_at DESC
       LIMIT 1`, [student.id, localDate, session, student.id, localDate, session]);
        let status;
        let attendanceId;
        let attendanceStatus;
        if (lastRecord.length > 0) {
            const lastStatus = lastRecord[0].status;
            if (lastStatus === 'Time-Out') {
                status = (localHour > 8 || (localHour === 8 && localMinute > 0)) ? 'Late' : 'Time-In';
            }
            else {
                status = 'Time-Out';
            }
        }
        else {
            status = (localHour > 8 || (localHour === 8 && localMinute > 0)) ? 'Late' : 'Time-In';
        }
        // Insert into partial_attendance (staging — teacher must verify)
        const [insertResult] = await db_1.default.execute(`INSERT INTO partial_attendance
       (student_id, student_name, lrn, gender, grade, section, kiosk_id,
        scan_method, status, session, date, time_in, time_out, photo_path, local_path,
        scanned_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'BLE', ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`, [
            student.id, student.name, student.lrn, student.gender,
            student.grade, student.section, detection.kiosk_id || null,
            status, session, localDate,
            status === 'Time-In' || status === 'Late' ? localTime : null,
            status === 'Time-Out' ? localTime : null,
            photoPath,
            photoPath,
        ]);
        attendanceId = insertResult.insertId;
        attendanceStatus = status;
        // Queue Cloudinary upload (background, non-blocking)
        if (photoPath) {
            // Update scan_photos with actual attendance_id (was null during initial insert)
            await db_1.default.execute('UPDATE scan_photos SET attendance_id = ? WHERE photo_path = ? AND attendance_id IS NULL ORDER BY created_at DESC LIMIT 1', [attendanceId, photoPath]);
            uploadQueue_1.uploadQueue.enqueue(attendanceId, photoPath, student.name);
            console.log('📤 BLE photo queued for Cloudinary upload');
        }
        console.log(`✅ Scan staged to partial_attendance (${session}): ${student.name} ${status} ${photoPath ? '📸' : ''}`);
        // Send SMS notification to parents/guardians
        const [guardians] = await db_1.default.execute(`SELECT p.name, p.contact, ps.relationship
       FROM parent_student ps
       JOIN parents p ON ps.parent_id = p.id
       WHERE ps.student_id = ?`, [student.id]);
        const statusEmoji = attendanceStatus === 'Time-In' ? '✅' : attendanceStatus === 'Late' ? '⏰' : '🔔';
        const message = `${statusEmoji} ATTENDBOX: ${student.name} has ${attendanceStatus === 'Time-In' ? 'arrived at school' : attendanceStatus === 'Time-Out' ? 'left school' : 'arrived LATE'} at ${localTime}. Date: ${localDate}.`;
        for (const g of guardians) {
            if (g.contact) {
                // NULL attendance_id — avoids FK violation (record is in partial_attendance, not attendance yet)
                const queued = await queueSmsForGSM(g.contact, message, student.id, null);
                await db_1.default.execute(`INSERT INTO sms_logs (attendance_id, student_name, parent_name, phone_number, message, status, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`, [null, student.name, g.name, g.contact, message,
                    queued ? 'queued' : 'failed', queued ? new Date() : null]);
            }
        }
        // Update detection status to approved
        await db_1.default.execute(`UPDATE ble_detections 
       SET status = 'approved', approved_at = NOW(), approved_by = ?, attendance_id = ?
       WHERE id = ?`, [approved_by || 'kiosk', attendanceId, id]);
        res.status(201).json({
            message: 'Detection approved and attendance recorded',
            detection_id: id,
            attendance_id: attendanceId,
            student_name: student.name,
            status: attendanceStatus,
            date: localDate,
            time: localTime,
            photo_saved: photoPath ? true : false,
        });
    }
    catch (err) {
        console.error('approveDetection error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/ble/reject/:id ─────────────────────────────────────────
// Reject a pending BLE detection (don't record attendance)
async function rejectDetection(req, res) {
    try {
        const { id } = req.params;
        const { reason, rejected_by } = req.body;
        const [result] = await db_1.default.execute(`UPDATE ble_detections 
       SET status = 'rejected', approved_at = NOW(), approved_by = ?
       WHERE id = ? AND status = 'pending'`, [rejected_by || 'kiosk', id]);
        if (result.affectedRows === 0) {
            res.status(404).json({ error: 'Detection not found or already processed' });
            return;
        }
        console.log(`❌ Detection REJECTED: ID ${id}${reason ? ` - ${reason}` : ''}`);
        res.json({
            message: 'Detection rejected',
            detection_id: id,
        });
    }
    catch (err) {
        console.error('rejectDetection error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
