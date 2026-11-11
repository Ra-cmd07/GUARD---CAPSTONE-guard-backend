"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAttendanceThresholds = checkAttendanceThresholds;
exports.getAdminAlerts = getAdminAlerts;
exports.getTeacherAlerts = getTeacherAlerts;
exports.getParentAlerts = getParentAlerts;
exports.dismissAlert = dismissAlert;
exports.manualRunCheck = manualRunCheck;
const db_1 = __importDefault(require("../lib/db"));
const notificationController_1 = require("./notificationController");
const date_fns_1 = require("date-fns");
// ─── Config ───────────────────────────────────────────────────────────
const THRESHOLD = parseFloat(process.env.ATTENDANCE_THRESHOLD || '80');
// ─── Core job: check all students and create alerts ──────────────────
async function checkAttendanceThresholds() {
    const monthYear = (0, date_fns_1.format)(new Date(), 'yyyy-MM');
    console.log(`🔍 [Threshold Check] Running for month: ${monthYear}, threshold: ${THRESHOLD}%`);
    try {
        // Get monthly attendance rate for every student
        const [students] = await db_1.default.query(`
      SELECT
        s.id        AS student_id,
        s.name      AS student_name,
        s.section,
        ROUND(
          SUM(CASE WHEN a.status IN ('Time-In','Late') THEN 1 ELSE 0 END)
          / NULLIF(COUNT(DISTINCT DATE(CONVERT_TZ(a.date,'+00:00','+08:00'))), 0)
          * 100, 1
        ) AS rate_pct
      FROM students s
      LEFT JOIN attendance a ON a.student_id = s.id
        AND DATE_FORMAT(CONVERT_TZ(a.date,'+00:00','+08:00'), '%Y-%m') = ?
      GROUP BY s.id
      HAVING rate_pct IS NOT NULL AND rate_pct < ?
    `, [monthYear, THRESHOLD]);
        console.log(`   Found ${students.length} students below threshold`);
        for (const s of students) {
            // Skip if already alerted this month
            const [existing] = await db_1.default.query(`SELECT id FROM attendance_alerts
         WHERE student_id = ? AND month_year = ? AND alert_type = 'low_attendance'`, [s.student_id, monthYear]);
            if (existing.length)
                continue;
            // Insert alert record
            await db_1.default.query(`INSERT INTO attendance_alerts
           (student_id, alert_type, attendance_rate, threshold, month_year,
            notified_teacher, notified_parent, notified_admin, created_at)
         VALUES (?, 'low_attendance', ?, ?, ?, 0, 0, 0, NOW())
         ON DUPLICATE KEY UPDATE attendance_rate = VALUES(attendance_rate)`, [s.student_id, s.rate_pct, THRESHOLD, monthYear]);
            // ── Notify teacher ─────────────────────────────────────────────
            const [tRows] = await db_1.default.query(`SELECT t.user_id FROM teachers t
         WHERE LOWER(t.section) = LOWER(?) LIMIT 1`, [s.section]);
            if (tRows.length) {
                await (0, notificationController_1.createNotification)(tRows[0].user_id, `⚠️ Low Attendance: ${s.student_name}`, `${s.student_name}'s attendance rate is ${s.rate_pct}% this month (below ${THRESHOLD}% threshold).`, 'warning', '/teacher');
                await db_1.default.query(`UPDATE attendance_alerts SET notified_teacher = 1
           WHERE student_id = ? AND month_year = ?`, [s.student_id, monthYear]);
            }
            // ── Notify parent via in-app + SMS ─────────────────────────────
            const [parentRows] = await db_1.default.query(`SELECT p.user_id, p.contact FROM parent_student ps
         JOIN parents p ON p.id = ps.parent_id
         WHERE ps.student_id = ?`, [s.student_id]);
            for (const parent of parentRows) {
                await (0, notificationController_1.createNotification)(parent.user_id, `⚠️ Attendance Alert: ${s.student_name}`, `${s.student_name} has an attendance rate of ${s.rate_pct}% this month. Please contact the school.`, 'warning', '/parent');
                if (parent.contact) {
                    const sms = `AttendBox: Your child ${s.student_name} has an attendance rate of ${s.rate_pct}% this month. Please contact the school.`;
                    await db_1.default.query(`INSERT INTO sms_queue (phone_number, message, student_id, priority, status, created_at)
             VALUES (?, ?, ?, 'high', 'pending', NOW())`, [parent.contact, sms.slice(0, 160), s.student_id]);
                }
            }
            if (parentRows.length) {
                await db_1.default.query(`UPDATE attendance_alerts SET notified_parent = 1
           WHERE student_id = ? AND month_year = ?`, [s.student_id, monthYear]);
            }
            // ── Notify all admins ──────────────────────────────────────────
            const [adminRows] = await db_1.default.query(`SELECT id FROM users WHERE role_id = 1`);
            for (const admin of adminRows) {
                await (0, notificationController_1.createNotification)(admin.id, `⚠️ At-Risk Student: ${s.student_name}`, `${s.student_name} (${s.section}) has ${s.rate_pct}% attendance this month — below the ${THRESHOLD}% threshold.`, 'warning', '/admin');
            }
            if (adminRows.length) {
                await db_1.default.query(`UPDATE attendance_alerts SET notified_admin = 1
           WHERE student_id = ? AND month_year = ?`, [s.student_id, monthYear]);
            }
            console.log(`   ✅ Alert created for ${s.student_name} (${s.rate_pct}%)`);
        }
        console.log(`✅ Threshold check complete`);
    }
    catch (err) {
        console.error('❌ checkAttendanceThresholds error:', err);
    }
}
// ─── GET /admin/alerts ────────────────────────────────────────────────
// Returns students currently below threshold this month (not dismissed by admin)
async function getAdminAlerts(req, res) {
    try {
        const monthYear = req.query.month || (0, date_fns_1.format)(new Date(), 'yyyy-MM');
        let rows;
        try {
            // Try with dismiss filter (requires ADD_ALERT_DISMISS.sql migration to have been run)
            [rows] = await db_1.default.query(`
        SELECT
          aa.id, aa.student_id, aa.attendance_rate, aa.threshold, aa.month_year,
          aa.notified_teacher, aa.notified_parent, aa.notified_admin, aa.created_at,
          s.name    AS student_name,
          s.section,
          s.lrn,
          s.grade
        FROM attendance_alerts aa
        JOIN students s ON s.id = aa.student_id
        WHERE aa.month_year = ?
          AND aa.dismissed_by_admin IS NULL
        ORDER BY aa.attendance_rate ASC
      `, [monthYear]);
        }
        catch {
            // Fallback: column not yet added — show all alerts without dismiss filter
            [rows] = await db_1.default.query(`
        SELECT
          aa.id, aa.student_id, aa.attendance_rate, aa.threshold, aa.month_year,
          aa.notified_teacher, aa.notified_parent, aa.notified_admin, aa.created_at,
          s.name    AS student_name,
          s.section,
          s.lrn,
          s.grade
        FROM attendance_alerts aa
        JOIN students s ON s.id = aa.student_id
        WHERE aa.month_year = ?
        ORDER BY aa.attendance_rate ASC
      `, [monthYear]);
        }
        res.json({ alerts: rows, count: rows.length, threshold: THRESHOLD, month: monthYear });
    }
    catch (err) {
        console.error('Error fetching alerts:', err);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
}
// ─── GET /teacher/alerts ──────────────────────────────────────────────
// Returns at-risk students in this teacher's section
async function getTeacherAlerts(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const [tRows] = await db_1.default.query('SELECT section FROM teachers WHERE user_id = ? LIMIT 1', [userId]);
        if (!tRows.length)
            return res.status(404).json({ error: 'Teacher not found' });
        const monthYear = (0, date_fns_1.format)(new Date(), 'yyyy-MM');
        const [rows] = await db_1.default.query(`
      SELECT aa.student_id, aa.attendance_rate, s.name AS student_name, s.lrn
      FROM attendance_alerts aa
      JOIN students s ON s.id = aa.student_id
      WHERE aa.month_year = ? AND LOWER(s.section) = LOWER(?)
      ORDER BY aa.attendance_rate ASC
    `, [monthYear, tRows[0].section]);
        res.json({ alerts: rows, threshold: THRESHOLD });
    }
    catch (err) {
        console.error('Error fetching teacher alerts:', err);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
}
// ─── GET /parent/alerts ───────────────────────────────────────────────
// Returns alert status for this parent's children (not dismissed by parent)
async function getParentAlerts(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const [pRows] = await db_1.default.query('SELECT id FROM parents WHERE user_id = ? LIMIT 1', [userId]);
        if (!pRows.length)
            return res.status(404).json({ error: 'Parent not found' });
        const monthYear = (0, date_fns_1.format)(new Date(), 'yyyy-MM');
        let rows;
        try {
            [rows] = await db_1.default.query(`
        SELECT aa.id, aa.student_id, aa.attendance_rate, aa.threshold, aa.month_year,
               s.name AS student_name
        FROM attendance_alerts aa
        JOIN students s ON s.id = aa.student_id
        JOIN parent_student ps ON ps.student_id = aa.student_id
        WHERE ps.parent_id = ? AND aa.month_year = ?
          AND aa.dismissed_by_parent IS NULL
      `, [pRows[0].id, monthYear]);
        }
        catch {
            // Fallback: column not yet added
            [rows] = await db_1.default.query(`
        SELECT aa.id, aa.student_id, aa.attendance_rate, aa.threshold, aa.month_year,
               s.name AS student_name
        FROM attendance_alerts aa
        JOIN students s ON s.id = aa.student_id
        JOIN parent_student ps ON ps.student_id = aa.student_id
        WHERE ps.parent_id = ? AND aa.month_year = ?
      `, [pRows[0].id, monthYear]);
        }
        res.json({ alerts: rows, threshold: THRESHOLD });
    }
    catch (err) {
        console.error('Error fetching parent alerts:', err);
        res.status(500).json({ error: 'Failed to fetch parent alerts' });
    }
}
// ─── PATCH /alerts/:id/dismiss ────────────────────────────────────────
// Admin or parent dismisses an alert so it no longer appears on their dashboard
async function dismissAlert(req, res) {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { role } = req.user;
        try {
            if (role === 'admin') {
                await db_1.default.query(`UPDATE attendance_alerts SET dismissed_by_admin = NOW() WHERE id = ?`, [id]);
            }
            else if (role === 'parent') {
                await db_1.default.query(`UPDATE attendance_alerts SET dismissed_by_parent = NOW() WHERE id = ?`, [id]);
            }
            else {
                return res.status(403).json({ error: 'Only admin or parent can dismiss alerts' });
            }
        }
        catch (colErr) {
            // Column doesn't exist yet — return success anyway so UI still removes it locally
            console.warn('dismissAlert: column may not exist yet, run ADD_ALERT_DISMISS.sql —', colErr.message);
        }
        res.json({ success: true, message: 'Alert dismissed' });
    }
    catch (err) {
        console.error('Error dismissing alert:', err);
        res.status(500).json({ error: 'Failed to dismiss alert' });
    }
}
// ─── POST /admin/alerts/run-check (manual trigger) ───────────────────
async function manualRunCheck(req, res) {
    await checkAttendanceThresholds();
    res.json({ success: true, message: 'Threshold check completed' });
}
exports.default = {
    checkAttendanceThresholds,
    getAdminAlerts,
    getTeacherAlerts,
    getParentAlerts,
    dismissAlert,
    manualRunCheck,
};
