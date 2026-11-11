import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../lib/db';
import { emitAttendanceEvent } from '../src/websocket/socketHandler';
import { savePhotoLocally } from '../utils/localPhotoUpload';
import { uploadQueue } from '../utils/uploadQueue';

/**
 * Notify ESP32 GSM module that new SMS is ready
 * ESP32 will check /api/gsm/poll and start sending
 */
async function notifyESP32OfNewSMS(kioskId: number | null): Promise<void> {
  try {
    // Get ESP32 IP from kiosk record (if available)
    if (kioskId) {
      const [rows] = await pool.execute(
        'SELECT esp32_ip FROM kiosks WHERE id = ? AND esp32_ip IS NOT NULL',
        [kioskId]
      ) as any[];
      
      if ((rows as any[]).length > 0) {
        const esp32Ip = (rows as any[])[0].esp32_ip;
        
        // Trigger ESP32 to start polling (HTTP POST to ESP32's /trigger endpoint)
        // Note: This requires ESP32 to have a web server listening
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
          timeout: 2000 // 2 second timeout
        };
        
        const req = http.request(options, (res: any) => {
          console.log(`✅ ESP32 notified at ${esp32Ip}`);
        });
        
        req.on('error', (e: Error) => {
          console.log(`⚠️  Could not notify ESP32 at ${esp32Ip}: ${e.message}`);
        });
        
        req.on('timeout', () => {
          req.destroy();
          console.log(`⚠️  ESP32 notification timeout at ${esp32Ip}`);
        });
        
        req.write(postData);
        req.end();
      }
    }
  } catch (error) {
    console.log('⚠️  ESP32 notification failed:', error);
    // Don't throw - SMS still queued, ESP32 will poll eventually
  }
}

/**
 * Queue SMS for GSM module to send
 * Converts phone numbers to international format (+63...)
 */
async function queueSmsForGSM(
  phone: string,
  message: string,
  studentId: number,
  attendanceId: number
): Promise<boolean> {
  try {
    // Convert phone number to international format for GSM
    // 0917... → +63917...
    // 0953 681 2353 → +639536812353
    let internationalPhone = phone.trim().replace(/\s+/g, ''); // Remove spaces
    
    if (internationalPhone.startsWith('0')) {
      // Local format: replace leading 0 with +63
      internationalPhone = '+63' + internationalPhone.substring(1);
    } else if (internationalPhone.startsWith('63') && !internationalPhone.startsWith('+')) {
      // Missing + prefix
      internationalPhone = '+' + internationalPhone;
    } else if (!internationalPhone.startsWith('+63')) {
      // Invalid format, try to fix
      console.warn(`⚠️  Invalid phone format: ${phone}, attempting to fix...`);
      internationalPhone = '+63' + internationalPhone.replace(/^0+/, '');
    }
    
    await pool.execute(
      `INSERT INTO sms_queue 
       (phone_number, message, student_id, attendance_id, priority, status, created_at) 
       VALUES (?, ?, ?, ?, 'normal', 'pending', NOW())`,
      [internationalPhone, message, studentId, attendanceId]
    );
    console.log(`📩 SMS queued for GSM module → ${internationalPhone}: ${message.substring(0, 50)}...`);
    return true;
  } catch (error) {
    console.error('❌ Failed to queue SMS:', error);
    return false;
  }
}

// ─── POST /api/kiosk/scan ─────────────────────────────────────────────
// Central scan handler — called by kiosk UI after student authenticates
export async function kioskScan(req: Request, res: Response): Promise<void> {
  try {
    const {
      scan_method,      // 'QR' | 'RFID' | 'BLE'
      identifier,       // LRN (QR), RFID uid, or MAC (BLE)
      kiosk_id,
      photo_base64,     // optional captured photo
      qr_data,          // raw QR JSON string if scan_method = 'QR'
    } = req.body;

    console.log('🔍 BACKEND RECEIVED:');
    console.log('   scan_method:', scan_method);
    console.log('   identifier:', identifier);
    console.log('   identifier type:', typeof identifier);
    console.log('   identifier length:', identifier?.length);
    console.log('   kiosk_id:', kiosk_id);

    if (!scan_method || !identifier) {
      res.status(400).json({ error: 'scan_method and identifier are required' });
      return;
    }

    // ── Resolve student ──────────────────────────────────────────────
    let student: any = null;

    if (scan_method === 'QR') {
      // identifier = LRN
      const [rows] = await pool.execute(
        'SELECT * FROM students WHERE lrn = ? AND is_active = 1', [identifier]
      ) as any[];
      student = (rows as any[])[0];
    } else if (scan_method === 'RFID') {
      // identifier = RFID uid
      const [rows] = await pool.execute(
        'SELECT s.* FROM students s WHERE UPPER(s.rfid_uid) = UPPER(?) AND s.is_active = 1',
        [identifier]
      ) as any[];
      student = (rows as any[])[0];
    } else if (scan_method === 'BLE') {
      // identifier = MAC address
      const normalizedMac = identifier.toLowerCase().replace(/[:\-]/g, '');
      const [rows] = await pool.execute(
        `SELECT s.* FROM students s
         WHERE REPLACE(REPLACE(LOWER(s.mac_address), ':', ''), '-', '') = ?
         AND s.is_active = 1`,
        [normalizedMac]
      ) as any[];
      student = (rows as any[])[0];
    }

    if (!student) {
      res.status(404).json({ error: 'Student not found or not registered for this scan method' });
      return;
    }

    // ── Fallback: pull section/grade from assignments if student profile is missing them ──
    if (!student.section) {
      const [asgRows] = await pool.execute(
        `SELECT a.section, a.year_level FROM assignment_students asg
         JOIN assignments a ON a.id = asg.assignment_id
         WHERE asg.student_id = ? AND a.section IS NOT NULL LIMIT 1`,
        [student.id]
      ) as any[];
      if ((asgRows as any[]).length > 0) {
        student.section = (asgRows as any[])[0].section;
        student.grade   = student.grade || (asgRows as any[])[0].year_level;
        // Persist to students table so future scans work correctly
        await pool.execute(
          'UPDATE students SET section = ?, grade = ? WHERE id = ?',
          [student.section, student.grade, student.id]
        );
      }
    }

    // ── Determine status (Philippines timezone UTC+8) ────────────────
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const today = phTime.toISOString().split('T')[0];
    
    // Format time in 12-hour format with AM/PM
    // Use getUTC methods since phTime is already adjusted to PH time
    const hour24 = phTime.getUTCHours();
    const minutes = phTime.getUTCMinutes().toString().padStart(2, '0');
    const seconds = phTime.getUTCSeconds().toString().padStart(2, '0');
    const hour12 = hour24 % 12 || 12; // Convert 0 to 12 for midnight
    const ampm = hour24 < 12 ? 'AM' : 'PM';
    const timeStr = `${hour12}:${minutes}:${seconds} ${ampm}`;
    
    const localHour = hour24;
    const session = hour24 < 12 ? 'AM' : 'PM';

    // AUTO-TOGGLE: Check last record across both tables for THIS SESSION (AM/PM)
    // Check verified attendance first, then fall back to partial (pending)
    const [lastRecord] = await pool.execute(
      `SELECT status FROM (
         SELECT status, created_at FROM attendance
         WHERE student_id = ? AND date = ? AND session = ?
         UNION ALL
         SELECT status, created_at FROM partial_attendance
         WHERE student_id = ? AND date = ? AND session = ?
       ) combined
       ORDER BY created_at DESC
       LIMIT 1`,
      [student.id, today, session, student.id, today, session]
    ) as any[];

    let status: string;
    
    if ((lastRecord as any[]).length > 0) {
      const lastStatus = (lastRecord as any[])[0].status;
      
      // Toggle based on last status IN THIS SESSION
      if (lastStatus === 'Time-Out') {
        // Last was Time-Out, so next is Time-In (check if late)
        const hour = phTime.getUTCHours();
        const min  = phTime.getUTCMinutes();
        status = (hour > 8 || (hour === 8 && min > 0)) ? 'Late' : 'Time-In';
      } else {
        // Last was Time-In or Late, so next is Time-Out
        status = 'Time-Out';
      }
    } else {
      // No record for this session yet, first scan is Time-In (check if late)
      const hour = phTime.getUTCHours();
      const min  = phTime.getUTCMinutes();
      status = (hour > 8 || (hour === 8 && min > 0)) ? 'Late' : 'Time-In';
    }

    // REMOVED: Duplicate check - now allows unlimited check-ins/outs per day

    // ── Insert into partial_attendance (staging — teacher must verify) ──
    const [attResult] = await pool.execute(
      `INSERT INTO partial_attendance
         (student_id, student_name, lrn, gender, grade, section,
          kiosk_id, scan_method, status, session, date, time_in, time_out,
          photo_path, qr_data, scanned_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        student.id, student.name, student.lrn, student.gender,
        student.grade, student.section,
        kiosk_id || null, scan_method, status, session, today,
        status === 'Time-In' || status === 'Late' ? timeStr : null,
        status === 'Time-Out' ? timeStr : null,
        null,
        qr_data || null,
      ]
    ) as any[];
    const attendanceId = (attResult as any).insertId;

    // ── Upload photo to local storage SYNCHRONOUSLY (must complete before verification) ─────────────
    if (photo_base64) {
      try {
        const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
        
        const photoPath = await savePhotoLocally(base64Data, student.name, 'scan');
        console.log('📸 Photo saved locally:', photoPath);

        // Update partial_attendance record with photo path
        await pool.execute(
          'UPDATE partial_attendance SET local_path = ?, photo_path = ? WHERE id = ?',
          [photoPath, photoPath, attendanceId]
        );

        // Log to scan_photos
        await pool.execute(
          'INSERT INTO scan_photos (attendance_id, student_name, status, photo_path, local_path) VALUES (?, ?, ?, ?, ?)',
          [attendanceId, student.name, status, photoPath, photoPath]
        );

        // Queue Cloudinary upload (background, non-blocking)
        uploadQueue.enqueue(attendanceId, photoPath, student.name);
        console.log('📤 Queued for Cloudinary upload');
      } catch (err) {
        console.error('Photo upload failed:', err);
        // Continue without photo rather than failing entire request
      }
    }

    // ── SMS to parents ────────────────────────────────────────────────
    const [guardians] = await pool.execute(
      `SELECT p.name, p.contact, ps.relationship
       FROM parent_student ps
       JOIN parents p ON ps.parent_id = p.id
       WHERE ps.student_id = ?`,
      [student.id]
    ) as any[];

    const statusEmoji = status === 'Time-In' ? '✅' : status === 'Late' ? '⏰' : '🔔';
    const timeDisplay = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
    const message     = `${statusEmoji} ATTENDBOX: ${student.name} has ${status === 'Time-In' ? 'arrived at school' : status === 'Time-Out' ? 'left school' : 'arrived LATE'} at ${timeDisplay}. Date: ${today}.`;

    const smsResults: any[] = [];
    let anySMSQueued = false;
    
    for (const g of guardians as any[]) {
      if (g.contact) {
        // Queue SMS for GSM module — use NULL for attendance_id (record is in partial_attendance, not attendance yet)
        const queued = await queueSmsForGSM(g.contact, message, student.id, null as any);
        
        if (queued) anySMSQueued = true;

        // Log to sms_logs — NULL attendance_id avoids FK violation (will link on verification)
        await pool.execute(
          `INSERT INTO sms_logs (attendance_id, student_name, parent_name, phone_number, message, status, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [null, student.name, g.name, g.contact, message,
           queued ? 'queued' : 'failed', queued ? new Date() : null]
        );
        smsResults.push({ name: g.name, phone: g.contact, queued });
      }
    }
    
    // ── Notify ESP32 that SMS is queued (trigger polling) ────────────
    if (anySMSQueued) {
      // Small delay to ensure SMS is committed to database before ESP32 polls
      await new Promise(resolve => setTimeout(resolve, 500));
      await notifyESP32OfNewSMS(kiosk_id);
      console.log('📡 ESP32 GSM triggered (after 500ms delay)');
    }

    // ── Update kiosk last_ping ────────────────────────────────────────
    if (kiosk_id) {
      await pool.execute('UPDATE kiosks SET last_ping = NOW() WHERE id = ?', [kiosk_id]);
    }

    // ── Emit real-time WebSocket event ────────────────────────────────
    // Get parent ID for WebSocket room targeting
    const parentId = (guardians as any[])[0]?.id || null;
    
    emitAttendanceEvent({
      studentId: student.id,
      studentName: student.name,
      status,
      section: student.section,
      grade: student.grade,
      parentId,
      method: scan_method,
      timestamp: phTime,
    });

    res.status(201).json({
      message:      'Attendance recorded',
      attendanceId,
      student_name: student.name,
      status,
      session,
      date:         today,
      time:         timeStr,
      photo_path:   null, // Photo uploaded in background
      sms:          smsResults,
    });
  } catch (err) {
    console.error('kioskScan error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/kiosk/ping/:kioskId ────────────────────────────────────
export async function kioskPing(req: Request, res: Response): Promise<void> {
  try {
    const { kioskId } = req.params;
    await pool.execute('UPDATE kiosks SET last_ping = NOW() WHERE id = ?', [kioskId]);

    const [rows] = await pool.execute(
      'SELECT * FROM kiosks WHERE id = ?', [kioskId]
    ) as any[];
    const kiosk = (rows as any[])[0];
    if (!kiosk) { res.status(404).json({ error: 'Kiosk not found' }); return; }

    res.json(kiosk);
  } catch (err) {
    console.error('kioskPing error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/kiosk/list ──────────────────────────────────────────────
export async function getKioskList(_req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT id, name, location, gate, is_active FROM kiosks WHERE is_active = 1'
    ) as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/kiosk/recent-scans ─────────────────────────────────────
// Returns recent attendance records (last 10 seconds) for kiosk display
export async function getRecentScans(req: Request, res: Response): Promise<void> {
  try {
    const seconds = Number(req.query.seconds) || 10;
    const kioskId = req.query.kiosk_id ? Number(req.query.kiosk_id) : null;
    
    let query = `
      SELECT 
        a.id as attendance_id,
        a.student_id,
        a.student_name,
        a.lrn,
        a.scan_method,
        a.status,
        a.session,
        a.date,
        a.time_in,
        a.time_out,
        a.photo_path,
        a.created_at
      FROM partial_attendance a
      WHERE a.created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)
    `;
    
    const params: any[] = [seconds];
    
    if (kioskId !== null) {
      query += ' AND a.kiosk_id = ?';
      params.push(kioskId);
    }
    
    query += ' ORDER BY a.created_at DESC LIMIT 1';
    
    const [rows] = await pool.execute(query, params) as any[];
    
    res.json(rows);
  } catch (err) {
    console.error('getRecentScans error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

/**
 * ESP32 Auto-Registration
 * ESP32 calls this on boot to register its IP address automatically
 * No more manual SQL updates needed!
 */
export const registerESP32 = async (req: Request, res: Response) => {
  try {
    const { kiosk_id, esp32_ip, mac_address, firmware_version } = req.body;

    // Validate required fields
    if (!kiosk_id || !esp32_ip) {
      return res.status(400).json({ 
        error: 'Missing required fields: kiosk_id and esp32_ip are required' 
      });
    }

    // Validate IP format
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(esp32_ip)) {
      return res.status(400).json({ 
        error: 'Invalid IP address format' 
      });
    }

    console.log('═══════════════════════════════════════════════════');
    console.log('🤖 ESP32 AUTO-REGISTRATION');
    console.log('═══════════════════════════════════════════════════');
    console.log(`   Kiosk ID: ${kiosk_id}`);
    console.log(`   ESP32 IP: ${esp32_ip}`);
    console.log(`   MAC Address: ${mac_address || 'N/A'}`);
    console.log(`   Firmware: ${firmware_version || 'N/A'}`);
    console.log('═══════════════════════════════════════════════════');

    // Check if kiosk exists
    const [existingKiosk] = await pool.query(
      'SELECT id, name, location FROM kiosks WHERE id = ?',
      [kiosk_id]
    ) as any[];

    if ((existingKiosk as any[]).length === 0) {
      // Kiosk doesn't exist - create it automatically
      await pool.execute(
        `INSERT INTO kiosks (id, name, location, esp32_ip, esp32_last_trigger)
         VALUES (?, ?, ?, ?, NOW())`,
        [kiosk_id, `Kiosk ${kiosk_id}`, 'Auto-registered', esp32_ip]
      );

      console.log(`✅ Created new kiosk entry: Kiosk ${kiosk_id}`);
    } else {
      // Kiosk exists - update ESP32 IP
      await pool.execute(
        `UPDATE kiosks 
         SET esp32_ip = ?,
             esp32_last_trigger = NOW()
         WHERE id = ?`,
        [esp32_ip, kiosk_id]
      );

      const kioskName = (existingKiosk as any[])[0].name;
      console.log(`✅ Updated ESP32 IP for: ${kioskName}`);
    }

    // Optional: Log registration history (if you have a registration log table)
    try {
      await pool.execute(
        `INSERT INTO esp32_registration_log (kiosk_id, esp32_ip, mac_address, firmware_version, registered_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE 
           esp32_ip = VALUES(esp32_ip),
           registered_at = NOW()`,
        [kiosk_id, esp32_ip, mac_address || null, firmware_version || null]
      );
    } catch (logError) {
      // If log table doesn't exist, that's okay - registration still works
      console.log('ℹ️  Registration log not available (table may not exist)');
    }

    console.log('✅ ESP32 registration complete!');
    console.log('═══════════════════════════════════════════════════\n');

    res.json({
      success: true,
      message: 'ESP32 registered successfully',
      kiosk_id: kiosk_id,
      esp32_ip: esp32_ip,
      registered_at: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ ESP32 registration error:', error);
    res.status(500).json({ 
      error: 'Failed to register ESP32',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ─── POST /api/kiosk/verify-password ─────────────────────────────────
// Verify kiosk password and log attempt
export const verifyKioskPassword = async (req: Request, res: Response) => {
  try {
    const { password } = req.body;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    if (!password) {
      return res.status(400).json({ error: 'Password is required' });
    }

    // Check if IP is currently locked out
    const [lockoutCheck] = await pool.execute(
      `SELECT locked_until FROM kiosk_login_attempts 
       WHERE ip_address = ? AND locked_until > NOW() 
       ORDER BY attempt_time DESC LIMIT 1`,
      [ipAddress]
    ) as any[];

    if ((lockoutCheck as any[]).length > 0) {
      const lockedUntil = (lockoutCheck as any[])[0].locked_until;
      const remainingMinutes = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / 60000);
      
      return res.status(403).json({ 
        error: 'Too many failed attempts',
        locked: true,
        lockedUntil,
        remainingMinutes,
        message: `Access temporarily locked. Please try again in ${remainingMinutes} minute(s).`
      });
    }

    const correctPassword = process.env.KIOSK_PASSWORD || 'admin123';
    
    // Try to load settings from database, fallback to .env
    let maxAttempts = parseInt(process.env.KIOSK_MAX_ATTEMPTS || '3');
    let lockoutMinutes = parseInt(process.env.KIOSK_LOCKOUT_MINUTES || '15');
    let autoLockMinutes = parseInt(process.env.KIOSK_AUTO_LOCK_MINUTES || '5');
    
    try {
      const [settingsRows] = await pool.execute(
        'SELECT * FROM kiosk_settings WHERE id = 1 LIMIT 1'
      ) as any[];
      
      if ((settingsRows as any[]).length > 0) {
        const dbSettings = (settingsRows as any[])[0];
        maxAttempts = dbSettings.max_attempts || maxAttempts;
        lockoutMinutes = dbSettings.lockout_minutes || lockoutMinutes;
        autoLockMinutes = dbSettings.auto_lock_minutes || autoLockMinutes;
        console.log('📊 Using database settings:', { maxAttempts, lockoutMinutes, autoLockMinutes });
      }
    } catch (err) {
      console.log('ℹ️  No database settings found, using .env defaults');
    }

    // Check recent failed attempts count (within last hour)
    const [recentAttempts] = await pool.execute(
      `SELECT COUNT(*) as count FROM kiosk_login_attempts 
       WHERE ip_address = ? AND success = 0 
       AND attempt_time >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
      [ipAddress]
    ) as any[];

    const failedCount = (recentAttempts as any[])[0].count;
    const isCorrect = password === correctPassword;

    // Log the attempt
    if (isCorrect) {
      // Success - clear failed attempts and log success
      await pool.execute(
        `INSERT INTO kiosk_login_attempts (ip_address, success, attempt_time)
         VALUES (?, 1, NOW())`,
        [ipAddress]
      );

      // Clear old failed attempts for this IP
      await pool.execute(
        `DELETE FROM kiosk_login_attempts 
         WHERE ip_address = ? AND success = 0`,
        [ipAddress]
      );

      console.log(`✅ Kiosk unlocked from IP: ${ipAddress}`);

      return res.json({ 
        success: true, 
        message: 'Access granted',
        autoLockMinutes
      });
    } else {
      // Failed attempt
      const newFailedCount = failedCount + 1;
      let lockedUntil = null;

      // Lock account if max attempts reached
      if (newFailedCount >= maxAttempts) {
        lockedUntil = new Date(Date.now() + lockoutMinutes * 60000);
        
        await pool.execute(
          `INSERT INTO kiosk_login_attempts (ip_address, success, locked_until, attempt_time)
           VALUES (?, 0, ?, NOW())`,
          [ipAddress, lockedUntil]
        );

        console.log(`🚫 Kiosk locked from IP ${ipAddress} until ${lockedUntil}`);

        return res.status(403).json({ 
          error: 'Too many failed attempts',
          locked: true,
          lockedUntil,
          remainingMinutes: lockoutMinutes,
          message: `Maximum attempts exceeded. Access locked for ${lockoutMinutes} minutes.`
        });
      } else {
        // Log failed attempt
        await pool.execute(
          `INSERT INTO kiosk_login_attempts (ip_address, success, attempt_time)
           VALUES (?, 0, NOW())`,
          [ipAddress]
        );

        const remainingAttempts = maxAttempts - newFailedCount;
        console.log(`⚠️  Failed kiosk login from IP: ${ipAddress} (${remainingAttempts} attempts remaining)`);

        return res.status(401).json({ 
          error: 'Incorrect password',
          success: false,
          remainingAttempts,
          message: `Incorrect password. ${remainingAttempts} attempt(s) remaining.`
        });
      }
    }
  } catch (error) {
    console.error('❌ Kiosk password verification error:', error);
    res.status(500).json({ 
      error: 'Server error during password verification',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ─── GET /api/kiosk/login-attempts ───────────────────────────────────
// Get recent login attempts for admin monitoring
export const getLoginAttempts = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;

    const [attempts] = await pool.execute(
      `SELECT 
         id,
         ip_address,
         success,
         locked_until,
         attempt_time
       FROM kiosk_login_attempts
       ORDER BY attempt_time DESC
       LIMIT ?`,
      [limit]
    ) as any[];

    res.json(attempts);
  } catch (error) {
    console.error('❌ Error fetching login attempts:', error);
    res.status(500).json({ 
      error: 'Failed to fetch login attempts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


// ─── GET /api/kiosk/settings ─────────────────────────────────────────
// Get current kiosk security settings
export const getKioskSettings = async (req: Request, res: Response) => {
  try {
    const settings = {
      autoLockMinutes: parseInt(process.env.KIOSK_AUTO_LOCK_MINUTES || '5'),
      maxAttempts: parseInt(process.env.KIOSK_MAX_ATTEMPTS || '3'),
      lockoutMinutes: parseInt(process.env.KIOSK_LOCKOUT_MINUTES || '15'),
    };

    res.json(settings);
  } catch (error) {
    console.error('❌ Error fetching kiosk settings:', error);
    res.status(500).json({ 
      error: 'Failed to fetch settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ─── POST /api/kiosk/settings ────────────────────────────────────────
// Update kiosk security settings (saves to database, not .env)
export const updateKioskSettings = async (req: Request, res: Response) => {
  try {
    const { autoLockMinutes, maxAttempts, lockoutMinutes } = req.body;

    // Validation
    if (!autoLockMinutes || autoLockMinutes < 1 || autoLockMinutes > 60) {
      return res.status(400).json({ 
        error: 'autoLockMinutes must be between 1 and 60' 
      });
    }

    if (!maxAttempts || maxAttempts < 1 || maxAttempts > 10) {
      return res.status(400).json({ 
        error: 'maxAttempts must be between 1 and 10' 
      });
    }

    if (!lockoutMinutes || lockoutMinutes < 5 || lockoutMinutes > 60) {
      return res.status(400).json({ 
        error: 'lockoutMinutes must be between 5 and 60' 
      });
    }

    // Save to database (create settings table if needed)
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS kiosk_settings (
        id INT PRIMARY KEY DEFAULT 1,
        auto_lock_minutes INT NOT NULL DEFAULT 5,
        max_attempts INT NOT NULL DEFAULT 3,
        lockout_minutes INT NOT NULL DEFAULT 15,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Insert or update settings
    await pool.execute(`
      INSERT INTO kiosk_settings (id, auto_lock_minutes, max_attempts, lockout_minutes)
      VALUES (1, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        auto_lock_minutes = VALUES(auto_lock_minutes),
        max_attempts = VALUES(max_attempts),
        lockout_minutes = VALUES(lockout_minutes),
        updated_at = CURRENT_TIMESTAMP
    `, [autoLockMinutes, maxAttempts, lockoutMinutes]);

    console.log('✅ Kiosk settings updated:', {
      autoLockMinutes,
      maxAttempts,
      lockoutMinutes,
    });

    res.json({ 
      success: true,
      message: 'Settings saved successfully',
      settings: {
        autoLockMinutes,
        maxAttempts,
        lockoutMinutes,
      }
    });
  } catch (error) {
    console.error('❌ Error updating kiosk settings:', error);
    res.status(500).json({ 
      error: 'Failed to update settings',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};


// ─── GET /api/kiosk/current-status ───────────────────────────────────
// Get current attendance status (who's in, who's out)
export const getCurrentAttendanceStatus = async (req: Request, res: Response) => {
  try {
    // Use Philippines timezone (UTC+8) to match the date format used in kioskScan
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const today = phTime.toISOString().split('T')[0];
    
    console.log('🔍 [getCurrentAttendanceStatus] Checking for date:', today);

    // Get students currently IN (check both attendance and partial_attendance tables)
    const [currentlyInRows] = await pool.execute(`
      SELECT 
        a1.id,
        a1.student_id,
        a1.student_name,
        a1.status,
        a1.time_in,
        a1.photo_path,
        a1.created_at,
        s.gender,
        s.grade,
        s.section
      FROM (
        SELECT id, student_id, student_name, status, time_in, photo_path, created_at, date
        FROM attendance
        UNION ALL
        SELECT id, student_id, student_name, status, time_in, photo_path, created_at, date
        FROM partial_attendance
      ) a1
      INNER JOIN students s ON a1.student_id = s.id
      WHERE a1.date = ?
      AND a1.status IN ('Time-In', 'Late')
      AND NOT EXISTS (
        SELECT 1 FROM (
          SELECT student_id, status, created_at, date FROM attendance
          UNION ALL
          SELECT student_id, status, created_at, date FROM partial_attendance
        ) a2
        WHERE a2.student_id = a1.student_id
        AND a2.date = ?
        AND a2.status = 'Time-Out'
        AND a2.created_at > a1.created_at
      )
      ORDER BY a1.created_at DESC
    `, [today, today]) as any[];

    // Get students currently OUT (check both tables)
    const [currentlyOutRows] = await pool.execute(`
      SELECT 
        a.id,
        a.student_id,
        a.student_name,
        a.status,
        a.time_out,
        a.photo_path,
        a.created_at,
        s.gender,
        s.grade,
        s.section
      FROM (
        SELECT id, student_id, student_name, status, time_out, photo_path, created_at, date
        FROM attendance
        UNION ALL
        SELECT id, student_id, student_name, status, time_out, photo_path, created_at, date
        FROM partial_attendance
      ) a
      INNER JOIN students s ON a.student_id = s.id
      WHERE a.date = ?
      AND a.status = 'Time-Out'
      AND a.id = (
        SELECT a2.id FROM (
          SELECT id, student_id, created_at, date FROM attendance
          UNION ALL
          SELECT id, student_id, created_at, date FROM partial_attendance
        ) a2
        WHERE a2.student_id = a.student_id
        AND a2.date = ?
        ORDER BY a2.created_at DESC
        LIMIT 1
      )
      ORDER BY a.created_at DESC
    `, [today, today]) as any[];

    const currentlyIn = (currentlyInRows as any[]).map(row => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      status: row.status,
      timeIn: row.time_in,
      photoPath: row.photo_path,
      gender: row.gender,
      grade: row.grade,
      section: row.section,
      timestamp: row.created_at,
    }));

    const currentlyOut = (currentlyOutRows as any[]).map(row => ({
      id: row.id,
      studentId: row.student_id,
      studentName: row.student_name,
      status: row.status,
      timeOut: row.time_out,
      photoPath: row.photo_path,
      gender: row.gender,
      grade: row.grade,
      section: row.section,
      timestamp: row.created_at,
    }));
    
    console.log(`✅ [getCurrentAttendanceStatus] Found ${currentlyIn.length} IN, ${currentlyOut.length} OUT`);

    res.json({
      date: today,
      currentlyIn,
      currentlyOut,
      totalIn: currentlyIn.length,
      totalOut: currentlyOut.length,
    });
  } catch (error) {
    console.error('❌ Error fetching current attendance status:', error);
    res.status(500).json({ 
      error: 'Failed to fetch attendance status',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
