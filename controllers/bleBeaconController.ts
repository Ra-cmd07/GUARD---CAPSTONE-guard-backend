import { Request, Response } from 'express';
import pool from '../lib/db';

/**
 * BLE Beacon Controller
 * Handles BLE scanning as attendance method (like RFID/QR)
 * Creates partial attendance + immediate SMS to parents
 */

/**
 * POST /api/ble/beacon-detect
 * BLE scan method - creates partial attendance + immediate SMS
 * (No distance tracking, no approval needed for SMS)
 */
export async function handleBeaconDetection(req: Request, res: Response): Promise<void> {
  try {
    const {
      anchor_id,
      target_id,
      found,
      distance,
      rssi,
      proximity_zone,
      mac_address
    } = req.body;

    if (!anchor_id || !target_id) {
      res.status(400).json({ error: 'anchor_id and target_id are required' });
      return;
    }

    if (!found) {
      res.status(200).json({ success: true, message: 'Beacon not found' });
      return;
    }

    // Get student info
    const [studentRows] = await pool.execute(
      `SELECT id, name, lrn, mac_address FROM students 
       WHERE id = ? OR mac_address = ?`,
      [target_id, mac_address]
    ) as any[];

    if ((studentRows as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    const student = (studentRows as any[])[0];

    // Check if already scanned today via BLE
    const today = new Date().toISOString().split('T')[0];
    const [existingRows] = await pool.execute(
      `SELECT id FROM partial_attendance 
       WHERE student_id = ? AND date = ? AND scan_method = 'BLE'
       ORDER BY created_at DESC LIMIT 1`,
      [student.id, today]
    ) as any[];

    if ((existingRows as any[]).length > 0) {
      res.status(200).json({ 
        success: true,
        message: 'Already scanned today',
        duplicate: true
      });
      return;
    }

    // Check if kiosk exists
    const [kioskRows] = await pool.execute(
      `SELECT k.id, k.name, k.location 
       FROM kiosks k 
       WHERE k.id = ? AND k.is_active = 1`,
      [anchor_id]
    ) as any[];

    if ((kioskRows as any[]).length === 0) {
      res.status(404).json({ error: 'Kiosk not found' });
      return;
    }

    const kiosk = (kioskRows as any[])[0];

    console.log(`🎯 BLE SCAN: ${student.name} at ${kiosk.name}`);

    // Record partial attendance + send SMS (async, non-blocking)
    recordBLEAttendance(student, kiosk.id, anchor_id).catch(err => 
      console.error('Attendance recording error:', err)
    );

    // Fast response
    res.status(200).json({ 
      success: true,
      student: student.name,
      kiosk: kiosk.name,
      status: 'partial_attendance_created'
    });

  } catch (error) {
    console.error('BLE beacon detection error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * Background: Record BLE partial attendance + send SMS immediately
 * (No approval needed for SMS - sent right away)
 */
async function recordBLEAttendance(student: any, kioskId: number, anchorId: number): Promise<void> {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const hour = now.getHours();
  const session = hour < 12 ? 'AM' : 'PM';
  const status = hour > 8 ? 'Late' : 'Time-In';
  const timeStr = now.toLocaleTimeString('en-PH', { hour12: true });

  // Create partial attendance (PENDING approval)
  await pool.execute(
    `INSERT INTO partial_attendance
     (student_id, student_name, kiosk_id, scan_method, status, approval_status, session, 
      date, time_in, created_at)
     VALUES (?, ?, ?, 'BLE', ?, 'PENDING', ?, ?, ?, NOW())`,
    [student.id, student.name, kioskId, status, session, today, timeStr]
  );

  console.log(`   ✅ Partial attendance created (PENDING approval)`);

  // Queue SMS to parents (immediate - no approval needed)
  const [parents] = await pool.execute(
    `SELECT p.contact, p.name 
     FROM parent_student ps 
     JOIN parents p ON p.id = ps.parent_id 
     WHERE ps.student_id = ?`,
    [student.id]
  ) as any[];

  const message = `✅ ATTENDBOX: ${student.name} has arrived at school at ${timeStr} via BLE scan. Date: ${today}.`;

  for (const parent of parents as any[]) {
    if (parent.contact) {
      await pool.execute(
        `INSERT INTO sms_queue 
         (phone_number, message, student_id, priority, status, created_at)
         VALUES (?, ?, ?, 'normal', 'pending', NOW())`,
        [parent.contact, message, student.id]
      );
    }
  }

  console.log(`   📩 SMS queued to ${(parents as any[]).length} parent(s)`);

  // Trigger ESP32 GSM
  await notifyESP32OfNewSMS(anchorId);
  console.log(`   📡 ESP32 GSM triggered`);
}

/**
 * Notify ESP32 GSM module to start polling for SMS
 */
async function notifyESP32OfNewSMS(kioskId: number): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT esp32_ip FROM kiosks WHERE id = ? AND esp32_ip IS NOT NULL',
      [kioskId]
    ) as any[];

    if ((rows as any[]).length > 0) {
      const esp32Ip = (rows as any[])[0].esp32_ip;
      const http = require('http');
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

      const req = http.request(options, () => {
        // Silent success
      });

      req.on('error', () => {
        // Silent failure (ESP32 might be offline)
      });

      req.on('timeout', () => {
        req.destroy();
      });

      req.write(postData);
      req.end();
    }
  } catch (error) {
    // Silent failure
  }
}

/**
 * GET /api/ble/location-history
 * Get BLE scan history from database
 */
export async function getLocationHistory(req: Request, res: Response): Promise<void> {
  try {
    const { student_id, hours } = req.query;
    const timeLimit = hours ? parseInt(hours as string) : 24;

    let query = `
      SELECT 
        pa.id,
        pa.student_id,
        pa.student_name,
        pa.kiosk_id,
        k.name as kiosk_name,
        pa.scan_method,
        pa.status,
        pa.approval_status,
        pa.session,
        pa.date,
        pa.time_in,
        pa.scanned_at,
        pa.approved_by,
        pa.approved_at
      FROM partial_attendance pa
      LEFT JOIN kiosks k ON k.id = pa.kiosk_id
      WHERE pa.scan_method = 'BLE'
        AND pa.scanned_at >= DATE_SUB(NOW(), INTERVAL ? HOUR)
    `;

    const params: any[] = [timeLimit];

    if (student_id) {
      query += ' AND pa.student_id = ?';
      params.push(student_id);
    }

    query += ' ORDER BY pa.scanned_at DESC LIMIT 100';

    const [rows] = await pool.execute(query, params) as any[];

    res.json(rows);
  } catch (error) {
    console.error('Get location history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
}

export default {
  handleBeaconDetection,
  getLocationHistory
};
