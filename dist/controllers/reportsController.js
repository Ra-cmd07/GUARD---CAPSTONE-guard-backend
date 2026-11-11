"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAttendanceTrend = getAttendanceTrend;
exports.getDailySummary = getDailySummary;
const db_1 = __importDefault(require("../lib/db"));
const date_fns_1 = require("date-fns");
// ─── GET /api/reports/attendance-trend ────────────────────────────────
async function getAttendanceTrend(req, res) {
    try {
        const days = parseInt(req.query.days) || 7;
        // Get attendance percentage for last N days
        const results = [];
        for (let i = days - 1; i >= 0; i--) {
            const date = (0, date_fns_1.format)((0, date_fns_1.subDays)(new Date(), i), 'yyyy-MM-dd');
            // Count total students
            const [totalStudents] = await db_1.default.execute('SELECT COUNT(*) as total FROM students WHERE is_active = 1');
            const total = totalStudents[0]?.total || 0;
            // Count students who attended (Time-In or Late) — only verified records
            const [attended] = await db_1.default.execute(`SELECT COUNT(DISTINCT student_id) as count 
         FROM attendance 
         WHERE date = ? 
         AND status IN ('Time-In', 'Late')`, [date]);
            const present = attended[0]?.count || 0;
            // Calculate percentage
            const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
            results.push({
                date: (0, date_fns_1.format)(new Date(date + 'T00:00:00'), 'MMM dd'),
                attendance: percentage,
                present,
                total,
            });
        }
        // Calculate summary statistics
        const percentages = results.map(r => r.attendance);
        const summary = {
            average: percentages.length > 0
                ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length)
                : 0,
            highest: percentages.length > 0 ? Math.max(...percentages) : 0,
            lowest: percentages.length > 0 ? Math.min(...percentages) : 0,
        };
        res.json({
            trend: results,
            summary,
        });
    }
    catch (err) {
        console.error('getAttendanceTrend error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/reports/daily-summary ───────────────────────────────────
async function getDailySummary(req, res) {
    try {
        const date = req.query.date || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        // Total students
        const [totalStudents] = await db_1.default.execute('SELECT COUNT(*) as total FROM students WHERE is_active = 1');
        const total = totalStudents[0]?.total || 0;
        // Present students (Time-In or Late)
        const [presentStudents] = await db_1.default.execute(`SELECT COUNT(DISTINCT student_id) as count 
       FROM attendance 
       WHERE date = ? 
       AND status IN ('Time-In', 'Late')`, [date]);
        const present = presentStudents[0]?.count || 0;
        // Late students
        const [lateStudents] = await db_1.default.execute(`SELECT COUNT(DISTINCT student_id) as count 
       FROM attendance 
       WHERE date = ? 
       AND status = 'Late'`, [date]);
        const late = lateStudents[0]?.count || 0;
        // Absent students
        const absent = total - present;
        // Attendance percentage
        const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
        res.json({
            date,
            total,
            present,
            late,
            absent,
            percentage,
        });
    }
    catch (err) {
        console.error('getDailySummary error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
