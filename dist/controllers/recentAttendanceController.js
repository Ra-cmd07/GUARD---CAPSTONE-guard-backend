"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRecentAttendanceDetailed = getRecentAttendanceDetailed;
const db_1 = __importDefault(require("../lib/db"));
/**
 * GET /api/attendance/recent-detailed
 * Returns recent attendance (last 7 days) with enhanced info:
 * - Subject teacher name + subject
 * - Adviser name
 * - Parents with phone numbers
 */
async function getRecentAttendanceDetailed(req, res) {
    try {
        console.log('📊 Fetching recent attendance with teacher/parent details...');
        const query = `
      SELECT 
        pa.id,
        pa.student_id,
        pa.student_name,
        pa.date,
        pa.time_in,
        pa.time_out,
        pa.scan_method,
        pa.status,
        pa.photo_path,
        pa.session,
        s.grade,
        s.section,
        
        -- Get first matching assignment for the student's section
        a.subject AS subject,
        subject_teacher.name AS subject_teacher_name,
        subject_teacher_user.username AS subject_teacher_username,
        subject_teacher.id AS subject_teacher_id,
        adviser.name AS adviser_name,
        adviser_user.username AS adviser_username,
        adviser.id AS adviser_id,
        
        -- Check if student has ANY assignment
        CASE WHEN a.id IS NOT NULL THEN 1 ELSE 0 END AS has_assignment,
        
        -- Parents with phone numbers and usernames
        GROUP_CONCAT(
          DISTINCT CONCAT(p.name, '|', IFNULL(p.contact, ''), '|', IFNULL(parent_user.username, ''))
          SEPARATOR '||'
        ) AS parents_data
        
      FROM partial_attendance pa
      LEFT JOIN students s ON s.id = pa.student_id
      
      -- Get ONE assignment that matches the student via assignment_students table
      LEFT JOIN assignment_students asg ON asg.student_id = s.id
      LEFT JOIN assignments a ON a.id = asg.assignment_id 
        AND a.section COLLATE utf8mb4_unicode_ci = s.section COLLATE utf8mb4_unicode_ci
        AND a.year_level COLLATE utf8mb4_unicode_ci = s.grade COLLATE utf8mb4_unicode_ci
      
      LEFT JOIN teachers subject_teacher ON subject_teacher.id = a.subject_teacher_id
      LEFT JOIN users subject_teacher_user ON subject_teacher_user.id = subject_teacher.user_id
      LEFT JOIN teachers adviser ON adviser.id = a.teacher_id
      LEFT JOIN users adviser_user ON adviser_user.id = adviser.user_id
      LEFT JOIN parent_student ps ON ps.student_id = pa.student_id
      LEFT JOIN parents p ON p.id = ps.parent_id
      LEFT JOIN users parent_user ON parent_user.id = p.user_id
      
      WHERE pa.date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      
      GROUP BY pa.id, pa.student_id, pa.student_name, pa.date, 
               pa.time_in, pa.time_out, pa.scan_method, pa.status, pa.photo_path,
               pa.session, s.grade, s.section,
               a.id, a.subject, subject_teacher.name, subject_teacher_user.username, subject_teacher.id,
               adviser.name, adviser_user.username, adviser.id
      
      ORDER BY pa.created_at DESC
      LIMIT 200
    `;
        const [rows] = await db_1.default.execute(query);
        // Parse parents_data into array of objects
        const results = rows.map((row) => {
            let parents = [];
            if (row.parents_data) {
                const parentsArr = row.parents_data.split('||');
                parents = parentsArr.map((p) => {
                    const [name, contact, username] = p.split('|');
                    return {
                        name: name || '',
                        contact: contact || '',
                        username: username || ''
                    };
                }).filter((p) => p.name); // Remove empty entries
            }
            return {
                id: row.id,
                student_id: row.student_id,
                student_name: row.student_name,
                grade: row.grade || '',
                section: row.section || '',
                date: row.date,
                time_in: row.time_in,
                time_out: row.time_out,
                scan_method: row.scan_method,
                status: row.status,
                session: row.session || 'AM',
                photo_path: row.photo_path,
                // Teacher info with usernames
                subject_teacher_name: row.subject_teacher_name,
                subject_teacher_username: row.subject_teacher_username,
                subject_teacher_id: row.subject_teacher_id,
                subject: row.subject,
                adviser_name: row.adviser_name,
                adviser_username: row.adviser_username,
                adviser_id: row.adviser_id,
                has_assignment: Boolean(row.has_assignment),
                // Parents with usernames
                parents: parents,
            };
        });
        console.log(`✅ Fetched ${results.length} recent attendance records`);
        res.json(results);
    }
    catch (error) {
        console.error('❌ Error fetching recent attendance:', error);
        res.status(500).json({ error: 'Server error fetching recent attendance' });
    }
}
