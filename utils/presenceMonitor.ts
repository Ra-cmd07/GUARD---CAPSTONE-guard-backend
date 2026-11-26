/**
 * Student Presence Monitor
 * 
 * Monitors BLE beacon detections and alerts when students 
 * are not detected in their classroom for 1+ hours.
 * 
 * Runs independently via cron job - does NOT affect existing functionality.
 */

import cron from 'node-cron';
import pool from '../lib/db';
import { createNotification } from '../controllers/notificationController';

// Track which students have been alerted (prevent duplicate alerts)
const alertedStudents = new Map<number, Date>();

// Configuration
const MISSING_THRESHOLD_MINUTES = 60;  // Alert after 1 hour
const CHECK_INTERVAL = '*/15 8-15 * * 1-5';  // Every 15 min, 8AM-3PM, Mon-Fri
const ALERT_COOLDOWN_HOURS = 2;  // Don't re-alert same student for 2 hours

/**
 * Check for students missing from class
 */
async function checkMissingStudents(): Promise<void> {
  try {
    console.log('🔍 [Presence Monitor] Checking for missing students...');

    // Query: Find students not detected in last 60+ minutes
    // Uses ble_detections table which stores BLE attendance scans
    const [missingStudents] = await pool.execute(`
      SELECT 
        s.id, 
        s.name, 
        s.grade, 
        s.section,
        bl.room_name,
        bl.timestamp as last_seen,
        TIMESTAMPDIFF(MINUTE, bl.timestamp, NOW()) as minutes_missing
      FROM students s
      JOIN (
        SELECT student_id, location_name as room_name, MAX(detected_at) as timestamp
        FROM ble_detections
        WHERE DATE(detected_at) = CURDATE()
        GROUP BY student_id
      ) bl ON bl.student_id = s.id
      WHERE TIMESTAMPDIFF(MINUTE, bl.timestamp, NOW()) >= ?
      AND s.is_active = 1
      AND HOUR(NOW()) BETWEEN 8 AND 15
      ORDER BY minutes_missing DESC
    `, [MISSING_THRESHOLD_MINUTES]) as any[];

    const students = missingStudents as any[];
    
    if (students.length === 0) {
      console.log('✅ [Presence Monitor] All students present in class');
      return;
    }

    console.log(`⚠️  [Presence Monitor] Found ${students.length} missing student(s)`);

    // Process each missing student
    for (const student of students) {
      await alertMissingStudent(student);
    }

    // Clean up old alerts from memory (older than cooldown period)
    cleanupOldAlerts();

  } catch (error) {
    console.error('❌ [Presence Monitor] Error checking missing students:', error);
  }
}

/**
 * Send alert for a missing student
 */
async function alertMissingStudent(student: any): Promise<void> {
  const { id, name, grade, section, room_name, last_seen, minutes_missing } = student;

  // Check if student was already alerted recently (prevent spam)
  const lastAlertTime = alertedStudents.get(id);
  if (lastAlertTime) {
    const hoursSinceAlert = (Date.now() - lastAlertTime.getTime()) / 1000 / 60 / 60;
    if (hoursSinceAlert < ALERT_COOLDOWN_HOURS) {
      console.log(`⏭️  [Presence Monitor] ${name} already alerted ${hoursSinceAlert.toFixed(1)}h ago, skipping`);
      return;
    }
  }

  try {
    // Find the student's teacher (advisory teacher for their section)
    const [teachers] = await pool.execute(
      'SELECT user_id, name FROM teachers WHERE section = ?',
      [section]
    ) as any[];

    if (teachers.length === 0) {
      console.log(`⚠️  [Presence Monitor] No teacher found for section ${section}`);
      return;
    }

    const teacher = (teachers as any[])[0];
    const teacherUserId = teacher.user_id;
    const teacherName = teacher.name;

    // Format last seen time
    const lastSeenDate = new Date(last_seen);
    const lastSeenTime = lastSeenDate.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });

    // Create notification for teacher
    await createNotification(
      teacherUserId,
      '⚠️ Student Missing from Class',
      `${name} (${grade} ${section}) has not been detected in ${room_name} for ${minutes_missing} minutes. Last seen: ${lastSeenTime}. Please investigate.`,
      'warning',
      '/teacher/attendance'
    );

    // Also notify admin (user_id 1 is typically admin)
    const [admins] = await pool.execute(
      `SELECT u.id FROM users u 
       JOIN roles r ON r.id = u.role_id 
       WHERE r.name = 'admin' AND u.is_active = 1 
       LIMIT 1`
    ) as any[];

    if (admins.length > 0) {
      const adminUserId = (admins as any[])[0].id;
      await createNotification(
        adminUserId,
        '⚠️ Student Missing from Class',
        `${name} (${grade} ${section}) missing from ${room_name} for ${minutes_missing} min. Teacher: ${teacherName}. Last seen: ${lastSeenTime}.`,
        'warning',
        '/admin/dashboard'
      );
    }

    // Mark student as alerted
    alertedStudents.set(id, new Date());

    console.log(`🚨 [Presence Monitor] Alert sent for ${name} (${minutes_missing} min missing)`);

  } catch (error) {
    console.error(`❌ [Presence Monitor] Error alerting for ${name}:`, error);
  }
}

/**
 * Clean up old alert records from memory
 */
function cleanupOldAlerts(): void {
  const now = Date.now();
  const cutoffTime = now - (ALERT_COOLDOWN_HOURS * 60 * 60 * 1000);

  for (const [studentId, alertTime] of alertedStudents.entries()) {
    if (alertTime.getTime() < cutoffTime) {
      alertedStudents.delete(studentId);
    }
  }
}

/**
 * Initialize presence monitoring cron job
 */
export function startPresenceMonitoring(): void {
  console.log('🔍 [Presence Monitor] Starting student presence monitoring...');
  console.log(`   Threshold: ${MISSING_THRESHOLD_MINUTES} minutes`);
  console.log(`   Schedule: Every 15 minutes, 8AM-3PM, Mon-Fri`);
  console.log(`   Alert cooldown: ${ALERT_COOLDOWN_HOURS} hours`);

  // Schedule cron job: Every 15 minutes during school hours (8AM-3PM), Mon-Fri
  cron.schedule(CHECK_INTERVAL, () => {
    checkMissingStudents();
  });

  console.log('✅ [Presence Monitor] Presence monitoring active');
}

/**
 * Manual trigger (for testing)
 */
export async function triggerPresenceCheck(): Promise<void> {
  console.log('🧪 [Presence Monitor] Manual trigger activated');
  await checkMissingStudents();
}

export default { startPresenceMonitoring, triggerPresenceCheck };
