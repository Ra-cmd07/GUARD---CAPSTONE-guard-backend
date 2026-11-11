"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTeacherRoleLabel = buildTeacherRoleLabel;
exports.getTeacherClasses = getTeacherClasses;
exports.getTodayAttendanceSummary = getTodayAttendanceSummary;
exports.markManualAttendance = markManualAttendance;
exports.addAttendanceNote = addAttendanceNote;
exports.excuseAbsence = excuseAbsence;
exports.getTeacherSubjectAssignments = getTeacherSubjectAssignments;
exports.getSubjectAttendance = getSubjectAttendance;
exports.verifyPartialAttendance = verifyPartialAttendance;
exports.getAttendanceRoster = getAttendanceRoster;
exports.confirmAttendance = confirmAttendance;
exports.autoMarkAbsent = autoMarkAbsent;
const db_1 = __importDefault(require("../lib/db"));
const date_fns_1 = require("date-fns");
// ─── Helper: get teacher row from DB ─────────────────────────────────
async function getTeacherRow(userId) {
    const [rows] = await db_1.default.query(`SELECT t.id, t.user_id, t.name, t.section, t.subject, t.room, t.schedule, t.contact
     FROM teachers t
     WHERE t.user_id = ?
     LIMIT 1`, [userId]);
    return rows.length > 0 ? rows[0] : null;
}
// ─── Helper: build role label for audit notes ─────────────────────────
// Queries the exact assignment row for (teacherId, studentSection) to determine
// whether the teacher is the adviser or subject teacher for that section.
// Returns one of:
//   "Adviser – Section IT3R4"
//   "Subject Teacher – Mathematics (IT3R4)"
//   "Teacher"  (fallback when no matching assignment found)
async function buildTeacherRoleLabel(teacherId, studentSection) {
    try {
        if (studentSection) {
            // Find the exact assignment row that matches this teacher + this section.
            // A single row can have both teacher_id (adviser) and subject_teacher_id (subject teacher).
            // We prioritise the adviser role: if teacher_id matches, they are the adviser.
            const [rows] = await db_1.default.query(`SELECT section, subject,
                teacher_id,
                subject_teacher_id
         FROM assignments
         WHERE LOWER(TRIM(section)) = LOWER(TRIM(?))
           AND (teacher_id = ? OR subject_teacher_id = ?)
         ORDER BY
           -- adviser match comes first
           CASE WHEN teacher_id = ? THEN 0 ELSE 1 END
         LIMIT 1`, [studentSection, teacherId, teacherId, teacherId]);
            if (rows.length > 0) {
                const row = rows[0];
                if (Number(row.teacher_id) === teacherId) {
                    // This teacher is the ADVISER for this section
                    return `Adviser – Section ${row.section}`;
                }
                else {
                    // This teacher is the SUBJECT TEACHER for this section
                    return `Subject Teacher – ${row.subject} (${row.section})`;
                }
            }
        }
        // Fallback: no studentSection provided or no matching assignment row found.
        // Check if the teacher is an adviser for any section.
        const [adviserRows] = await db_1.default.query(`SELECT section FROM assignments WHERE teacher_id = ? LIMIT 1`, [teacherId]);
        if (adviserRows.length > 0) {
            return `Adviser – Section ${adviserRows[0].section}`;
        }
        // Check if subject teacher for any section.
        const [subjectRows] = await db_1.default.query(`SELECT subject, section FROM assignments WHERE subject_teacher_id = ? LIMIT 1`, [teacherId]);
        if (subjectRows.length > 0) {
            return `Subject Teacher – ${subjectRows[0].subject}${subjectRows[0].section ? ` (${subjectRows[0].section})` : ''}`;
        }
        // Last resort: teachers table section column only (adviser assumed)
        const [tRows] = await db_1.default.query(`SELECT section, subject FROM teachers WHERE id = ? LIMIT 1`, [teacherId]);
        if (tRows.length > 0) {
            const t = tRows[0];
            if (t.section)
                return `Adviser – Section ${t.section}`;
            if (t.subject)
                return `Subject Teacher – ${t.subject}`;
        }
    }
    catch (err) {
        console.error('buildTeacherRoleLabel error:', err);
    }
    return 'Teacher';
}
async function getAssignmentsForTeacher(teacherId) {
    // Get ALL assignments where this teacher is EITHER adviser OR subject teacher
    const [rows] = await db_1.default.query(`SELECT id, year_level, strand, track, section, subject,
            teacher_id, subject_teacher_id,
            CASE WHEN teacher_id = ? THEN 'adviser' ELSE 'subject_teacher' END AS role
     FROM assignments
     WHERE teacher_id = ? OR subject_teacher_id = ?
     ORDER BY year_level, strand, track, section, subject`, [teacherId, teacherId, teacherId]);
    return rows;
}
async function getTeacherStudentIds(teacherId) {
    const [rows] = await db_1.default.query(`SELECT DISTINCT asg.student_id
     FROM assignment_students asg
     JOIN assignments a ON a.id = asg.assignment_id
     WHERE a.teacher_id = ? OR a.subject_teacher_id = ?`, [teacherId, teacherId]);
    return rows.map((row) => row.student_id);
}
// ─── GET /teacher/classes ─────────────────────────────────────────────
async function getTeacherClasses(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const assignments = await getAssignmentsForTeacher(teacher.id);
        // ── Case 1: Teacher is assigned as ADVISER in the assignments table ──
        // Only show advisory class if teacher_id matches (they are the class adviser)
        const advisoryAssignments = assignments.filter((a) => a.teacher_id === teacher.id);
        if (advisoryAssignments.length > 0) {
            const studentIds = await getTeacherStudentIds(teacher.id);
            const [students] = await db_1.default.query(`SELECT id, lrn, name, grade, section, preferred_method,
                0 AS days_present, 0 AS attendance_30d
         FROM students
         WHERE id IN (?)
         ORDER BY name`, [studentIds.length > 0 ? studentIds : [0]]);
            res.json({
                teacher: {
                    name: teacher.name,
                    section: advisoryAssignments[0].section,
                    subject: advisoryAssignments[0].subject,
                    room: teacher.room,
                    schedule: teacher.schedule,
                    year_level: advisoryAssignments[0].year_level,
                    strand: advisoryAssignments[0].strand,
                    track: advisoryAssignments[0].track,
                    assignments,
                    is_adviser: true,
                },
                students,
                totalStudents: students.length,
            });
            return;
        }
        // ── Case 2: Teacher is ONLY a subject teacher (not an adviser) ──
        // No advisory class — return empty advisory with their subject assignments
        if (assignments.length > 0) {
            const studentIds = await getTeacherStudentIds(teacher.id);
            const [students] = await db_1.default.query(`SELECT id, lrn, name, grade, section, preferred_method,
                0 AS days_present, 0 AS attendance_30d
         FROM students
         WHERE id IN (?)
         ORDER BY name`, [studentIds.length > 0 ? studentIds : [0]]);
            res.json({
                teacher: {
                    name: teacher.name,
                    section: null, // NOT an adviser — no advisory section
                    subject: assignments[0].subject,
                    room: teacher.room,
                    schedule: teacher.schedule,
                    year_level: assignments[0].year_level,
                    strand: assignments[0].strand,
                    track: assignments[0].track,
                    assignments,
                    is_adviser: false, // Key flag: hide Classroom Advisory in sidebar
                },
                students,
                totalStudents: students.length,
            });
            return;
        }
        // ── Case 3: No assignments at all — fall back to old section-based lookup ──
        // Only used for teachers not yet configured in the new Assignment system
        const [students] = await db_1.default.query(`SELECT id, lrn, name, grade, section, preferred_method,
              0 AS days_present, 0 AS attendance_30d
       FROM students
       WHERE LOWER(section) = LOWER(?)
       ORDER BY name`, [teacher.section]);
        res.json({
            teacher: {
                name: teacher.name,
                section: teacher.section,
                subject: teacher.subject,
                room: teacher.room,
                schedule: teacher.schedule,
                is_adviser: !!teacher.section, // show advisory only if section is set
            },
            students,
            totalStudents: students.length,
        });
    }
    catch (error) {
        console.error('Error getting teacher classes:', error);
        res.status(500).json({ error: 'Failed to load classes' });
    }
}
// ─── GET /teacher/attendance/today ────────────────────────────────────
async function getTodayAttendanceSummary(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const date = req.query.date || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const assignments = await getAssignmentsForTeacher(teacher.id);
        let attendance = [];
        let allStudents = [];
        let section = teacher.section || '';
        if (assignments.length > 0) {
            // Find the adviser's section specifically
            const advisoryAsg = assignments.find((a) => a.teacher_id === teacher.id);
            if (advisoryAsg) {
                section = advisoryAsg.section;
            }
            else {
                section = assignments[0]?.section || section;
            }
            // Get students only for this section
            const [sectionStudentRows] = await db_1.default.query(`SELECT DISTINCT asg.student_id
         FROM assignment_students asg
         JOIN assignments a ON a.id = asg.assignment_id
         WHERE a.teacher_id = ?
           AND LOWER(TRIM(a.section)) = LOWER(TRIM(?))`, [teacher.id, section]);
            let studentIds = sectionStudentRows.map((r) => r.student_id);
            // Fallback to section-based lookup if no assignment_students
            if (studentIds.length === 0) {
                const [fallbackRows] = await db_1.default.query(`SELECT id FROM students WHERE LOWER(section) = LOWER(?) ORDER BY name`, [section]);
                studentIds = fallbackRows.map((r) => r.id);
            }
            // Final attendance (verified — from attendance table)
            // Advisory view: only show general attendance (subject IS NULL)
            // Subject-specific records belong to subject teachers' views
            const [attendanceRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, grade, section,
                status, session, scan_method, subject,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                time_in, time_out,
                timestamp, photo_path, is_overridden, notes,
                1 AS is_verified
         FROM attendance
         WHERE student_id IN (?)
           AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
           AND (subject IS NULL OR subject = '')
         ORDER BY timestamp DESC`, [studentIds.length > 0 ? studentIds : [0], date]);
            // Partial attendance (pending — from partial_attendance table)
            const [partialRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, grade, section,
                status, session, scan_method,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                time_in, NULL AS time_out,
                scanned_at AS timestamp, photo_path, 0 AS is_overridden, notes,
                0 AS is_verified
         FROM partial_attendance
         WHERE student_id IN (?) AND date = ?
         ORDER BY scanned_at DESC`, [studentIds.length > 0 ? studentIds : [0], date]);
            attendance = [...attendanceRows, ...partialRows];
            const [studentRows] = await db_1.default.query(`SELECT id, lrn, name, grade, section, preferred_method
         FROM students WHERE id IN (?) ORDER BY name`, [studentIds.length > 0 ? studentIds : [0]]);
            allStudents = studentRows;
        }
        else {
            // Final
            const [attendanceRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, grade, section,
                status, session, scan_method, subject,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                time_in, time_out,
                timestamp, photo_path, is_overridden, notes,
                1 AS is_verified
         FROM attendance
         WHERE LOWER(section) = LOWER(?)
           AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
           AND (subject IS NULL OR subject = '')
         ORDER BY timestamp DESC`, [section, date]);
            // Partial
            const [partialRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, grade, section,
                status, session, scan_method,
                DATE_FORMAT(date, '%Y-%m-%d') AS date,
                time_in, NULL AS time_out,
                scanned_at AS timestamp, photo_path, 0 AS is_overridden, notes,
                0 AS is_verified
         FROM partial_attendance
         WHERE LOWER(section) = LOWER(?) AND date = ?
         ORDER BY scanned_at DESC`, [section, date]);
            attendance = [...attendanceRows, ...partialRows];
            const [studentRows] = await db_1.default.query(`SELECT id, lrn, name, grade, section, preferred_method
         FROM students WHERE LOWER(section) = LOWER(?) ORDER BY name`, [section]);
            allStudents = studentRows;
        }
        // Stats
        const presentSet = new Set();
        const lateSet = new Set();
        const absentSet = new Set(allStudents.map((s) => s.id));
        for (const r of attendance) {
            if (r.status === 'Time-In') {
                presentSet.add(r.student_id);
                absentSet.delete(r.student_id);
            }
            else if (r.status === 'Late') {
                lateSet.add(r.student_id);
                absentSet.delete(r.student_id);
            }
        }
        const stats = {
            present: presentSet.size,
            late: lateSet.size,
            absent: absentSet.size,
            total: allStudents.length,
            attendanceRate: allStudents.length > 0
                ? Math.round(((presentSet.size + lateSet.size) / allStudents.length) * 100)
                : 0,
        };
        res.json({ date, section: section, stats, attendance, allStudents });
    }
    catch (error) {
        console.error('Error getting attendance summary:', error);
        res.status(500).json({ error: 'Failed to load attendance summary' });
    }
}
// ─── POST /teacher/attendance/manual ─────────────────────────────────
async function markManualAttendance(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { student_id, status, session, reason } = req.body;
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const [studentRows] = await db_1.default.query(`SELECT id, name, lrn, grade, section FROM students WHERE id = ?`, [student_id]);
        if (!studentRows.length)
            return res.status(404).json({ error: 'Student not found' });
        const student = studentRows[0];
        if (teacher.section.toLowerCase() !== student.section.toLowerCase())
            return res.status(403).json({ error: 'Cannot mark attendance for students outside your class' });
        const dateStr = (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        const timeStr = (0, date_fns_1.format)(new Date(), 'HH:mm:ss');
        const roleLabel = await buildTeacherRoleLabel(teacher.id, student.section);
        const auditNote = reason
            ? `${reason} | Manually recorded by ${teacher.name} (${roleLabel})`
            : `Manually recorded by ${teacher.name} (${roleLabel})`;
        const [result] = await db_1.default.query(`INSERT INTO attendance
         (student_id, student_name, lrn, grade, section,
          teacher_id, teacher_name, scan_method, status, session,
          date, time_in, timestamp, is_overridden, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Manual', ?, ?, ?, ?, NOW(), 1, ?, NOW())`, [
            student.id, student.name, student.lrn, student.grade, student.section,
            teacher.id, teacher.name,
            status, session || 'AM',
            dateStr, timeStr,
            auditNote,
        ]);
        res.json({
            success: true,
            message: `Attendance marked for ${student.name}`,
            attendanceId: result.insertId,
        });
    }
    catch (error) {
        console.error('Error marking manual attendance:', error);
        res.status(500).json({ error: 'Failed to mark attendance' });
    }
}
// ─── POST /teacher/attendance/note ───────────────────────────────────
async function addAttendanceNote(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { attendance_id, student_id, note, excuse_type } = req.body;
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const [studentRows] = await db_1.default.query(`SELECT section FROM students WHERE id = ?`, [student_id]);
        if (!studentRows.length)
            return res.status(404).json({ error: 'Student not found' });
        if (teacher.section.toLowerCase() !== studentRows[0].section.toLowerCase())
            return res.status(403).json({ error: 'Cannot add notes for students outside your class' });
        if (attendance_id) {
            await db_1.default.query(`UPDATE attendance SET notes = CONCAT(IFNULL(notes, ''), ' | ', ?) WHERE id = ?`, [note, attendance_id]);
        }
        // Try inserting into teacher_notes (silently skip if table missing)
        try {
            await db_1.default.query(`INSERT INTO teacher_notes (teacher_id, student_id, attendance_id, note, excuse_type, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`, [teacher.id, student_id, attendance_id, note, excuse_type || 'general']);
        }
        catch (_) { /* table may not exist */ }
        res.json({ success: true, message: 'Note added successfully' });
    }
    catch (error) {
        console.error('Error adding attendance note:', error);
        res.status(500).json({ error: 'Failed to add note' });
    }
}
// ─── POST /teacher/attendance/excuse ─────────────────────────────────
async function excuseAbsence(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { student_id, date, reason } = req.body;
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const [studentRows] = await db_1.default.query(`SELECT id, name, lrn, grade, section FROM students WHERE id = ?`, [student_id]);
        if (!studentRows.length)
            return res.status(404).json({ error: 'Student not found' });
        const student = studentRows[0];
        if (teacher.section.toLowerCase() !== student.section.toLowerCase())
            return res.status(403).json({ error: 'Cannot excuse students outside your class' });
        const excuseNote = reason || `Excused by ${teacher.name}`;
        const [existing] = await db_1.default.query(`SELECT id FROM attendance WHERE student_id = ? AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ? LIMIT 1`, [student_id, date]);
        if (existing.length > 0) {
            await db_1.default.query(`UPDATE attendance SET status = 'Absent', is_overridden = 1, notes = ? WHERE id = ?`, [excuseNote, existing[0].id]);
        }
        else {
            await db_1.default.query(`INSERT INTO attendance
           (student_id, student_name, lrn, grade, section,
            teacher_id, teacher_name, scan_method, status, session,
            date, timestamp, is_overridden, notes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Manual', 'Absent', 'AM', ?, NOW(), 1, ?, NOW())`, [
                student.id, student.name, student.lrn, student.grade, student.section,
                teacher.id, teacher.name,
                date, excuseNote,
            ]);
        }
        res.json({ success: true, message: `Absence excused for ${student.name}` });
    }
    catch (error) {
        console.error('Error excusing absence:', error);
        res.status(500).json({ error: 'Failed to excuse absence' });
    }
}
// ─── GET /teacher/subject-assignments ────────────────────────────────
// Returns all subject assignments where this teacher is the subject_teacher
async function getTeacherSubjectAssignments(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        // Assignments where this teacher is the subject teacher
        const [rows] = await db_1.default.query(`SELECT a.id, a.year_level, a.strand, a.track, a.section, a.subject,
              a.teacher_id,
              adv.name AS adviser_name,
              COUNT(DISTINCT asg.student_id) AS student_count
       FROM assignments a
       LEFT JOIN teachers adv ON adv.id = a.teacher_id
       LEFT JOIN assignment_students asg ON asg.assignment_id = a.id
       WHERE a.subject_teacher_id = ?
       GROUP BY a.id
       ORDER BY a.year_level, a.strand, a.track, a.section, a.subject`, [teacher.id]);
        // Also include assignments where teacher is the adviser (advisory class)
        const [advisoryRows] = await db_1.default.query(`SELECT a.id, a.year_level, a.strand, a.track, a.section, a.subject,
              a.teacher_id,
              adv.name AS adviser_name,
              COUNT(DISTINCT asg.student_id) AS student_count
       FROM assignments a
       LEFT JOIN teachers adv ON adv.id = a.teacher_id
       LEFT JOIN assignment_students asg ON asg.assignment_id = a.id
       WHERE a.teacher_id = ? AND (a.subject_teacher_id IS NULL OR a.subject_teacher_id = ?)
       GROUP BY a.id
       ORDER BY a.section, a.subject`, [teacher.id, teacher.id]);
        res.json({
            advisory: advisoryRows,
            subjects: rows,
            teacher: { id: teacher.id, name: teacher.name, section: teacher.section },
        });
    }
    catch (error) {
        console.error('Error getting subject assignments:', error);
        res.status(500).json({ error: 'Failed to load subject assignments' });
    }
}
// ─── GET /teacher/subject-attendance ─────────────────────────────────
// Returns partial (from partial_attendance) + final (from attendance) for an assignment
async function getSubjectAttendance(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { assignment_id, date } = req.query;
        if (!assignment_id)
            return res.status(400).json({ error: 'assignment_id required' });
        const targetDate = date || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        // Get the assignment's students
        const [studentRows] = await db_1.default.query(`SELECT s.id, s.lrn, s.name, s.grade, s.section
       FROM assignment_students asg
       JOIN students s ON s.id = asg.student_id
       WHERE asg.assignment_id = ?
       ORDER BY s.name`, [assignment_id]);
        if (!studentRows.length) {
            return res.json({ partial: [], final: [], students: [], date: targetDate });
        }
        const studentIds = studentRows.map((s) => s.id);
        // Partial — kiosk scans waiting for teacher verification (separate table)
        const [partialRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, status, session, scan_method,
              DATE_FORMAT(date, '%Y-%m-%d') AS date,
              time_in, photo_path, notes, scanned_at AS timestamp
       FROM partial_attendance
       WHERE student_id IN (?)
         AND date = ?
       ORDER BY scanned_at DESC`, [studentIds, targetDate]);
        // Final — verified records: only show records for THIS subject
        // (confirmed by this subject teacher) to avoid showing adviser's general records
        // Get the assignment's subject name for filtering
        const [asgInfo] = await db_1.default.query(`SELECT subject FROM assignments WHERE id = ? LIMIT 1`, [assignment_id]);
        const assignmentSubject = asgInfo[0]?.subject || null;
        const [finalRows] = await db_1.default.query(`SELECT id, student_id, student_name, lrn, status, session, scan_method, subject,
              DATE_FORMAT(date, '%Y-%m-%d') AS date,
              time_in, timestamp, photo_path, notes, is_overridden,
              teacher_name
       FROM attendance
       WHERE student_id IN (?)
         AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
         AND (
           subject = ?
           OR teacher_id = (
             SELECT subject_teacher_id FROM assignments WHERE id = ? LIMIT 1
           )
         )
       ORDER BY timestamp DESC`, [studentIds, targetDate, assignmentSubject, assignment_id]);
        res.json({ partial: partialRows, final: finalRows, students: studentRows, date: targetDate });
    }
    catch (error) {
        console.error('Error getting subject attendance:', error);
        res.status(500).json({ error: 'Failed to load subject attendance' });
    }
}
// ─── POST /teacher/attendance/verify ─────────────────────────────────
// Promotes a partial_attendance record → attendance (final)
async function verifyPartialAttendance(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { attendance_id, status } = req.body;
        if (!attendance_id)
            return res.status(400).json({ error: 'attendance_id required' });
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher not found' });
        // Fetch the partial record
        const [partialRows] = await db_1.default.query(`SELECT * FROM partial_attendance WHERE id = ? LIMIT 1`, [attendance_id]);
        if (!partialRows.length) {
            return res.status(404).json({ error: 'Partial attendance record not found' });
        }
        const partial = partialRows[0];
        const validStatuses = ['Time-In', 'Late', 'Absent', 'Time-Out', 'Excused'];
        const finalStatus = validStatuses.includes(status) ? status : partial.status;
        const roleLabel = await buildTeacherRoleLabel(teacher.id, partial.section);
        const verifyNote = `Verified by ${teacher.name} (${roleLabel})`;
        console.log('📋 Verifying partial attendance:');
        console.log('   Partial ID:', attendance_id);
        console.log('   Student:', partial.student_name);
        console.log('   Photo path:', partial.photo_path);
        console.log('   Local path:', partial.local_path);
        // Promote: INSERT into attendance
        await db_1.default.query(`INSERT INTO attendance
         (student_id, student_name, lrn, gender, grade, section,
          kiosk_id, scan_method, status, session, date, time_in, time_out,
          photo_path, local_path, cloudinary_url, cloudinary_uploaded, qr_data, notes,
          teacher_id, teacher_name, is_overridden, timestamp, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`, [
            partial.student_id, partial.student_name, partial.lrn, partial.gender,
            partial.grade, partial.section,
            partial.kiosk_id, partial.scan_method, finalStatus, partial.session,
            partial.date, partial.time_in, partial.time_out,
            partial.photo_path, partial.local_path, partial.cloudinary_url, partial.cloudinary_uploaded, partial.qr_data,
            verifyNote,
            teacher.id, teacher.name,
        ]);
        console.log('✅ Attendance verified - Photo copied:', partial.photo_path ? 'YES' : 'NO');
        console.log('   Cloudinary URL:', partial.cloudinary_url || 'Not yet uploaded');
        // Remove from partial_attendance
        await db_1.default.query(`DELETE FROM partial_attendance WHERE id = ?`, [attendance_id]);
        res.json({ success: true, message: 'Attendance verified and moved to Final list' });
    }
    catch (error) {
        console.error('Error verifying attendance:', error);
        res.status(500).json({ error: 'Failed to verify attendance' });
    }
}
// ─── GET /teacher/attendance/roster ──────────────────────────────────
// Returns ALL assigned students for the section, merged with any kiosk
// scans from partial_attendance for the requested date + session.
// Each row contains:
//   - student info (always present)
//   - partial_id: id of the kiosk scan row (null = no scan yet)
//   - scan_time: time of kiosk scan (null = no scan)
//   - scan_status: status from kiosk scan ('Time-In'|'Late'|'Time-Out'|null)
//   - scan_method: 'QR'|'RFID'|'BLE'|null
//   - final_am: confirmed AM attendance record (null if not yet confirmed)
//   - final_pm: confirmed PM attendance record (null if not yet confirmed)
//
// Session authorization:
//   - Teacher's assignment session = 'AM'   → only AM roster
//   - Teacher's assignment session = 'PM'   → only PM roster
//   - Teacher's assignment session = 'BOTH' → shows whichever session is requested
//   - If no assignment found (legacy), defaults to whichever session is requested
async function getAttendanceRoster(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const date = req.query.date || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        const requestedSess = (req.query.session || 'AM').toUpperCase();
        const requestedSection = req.query.section?.trim() || null;
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const assignments = await getAssignmentsForTeacher(teacher.id);
        let studentIds = [];
        let section = teacher.section || '';
        // ── Resolve section and students ─────────────────────────────────
        if (requestedSection) {
            // Subject teacher viewing a specific section (e.g. Adriana viewing IT3R3)
            section = requestedSection;
            const [asgRows] = await db_1.default.query(`SELECT DISTINCT asg.student_id
         FROM assignment_students asg
         JOIN assignments a ON a.id = asg.assignment_id
         WHERE (a.teacher_id = ? OR a.subject_teacher_id = ?)
           AND LOWER(TRIM(a.section)) = LOWER(TRIM(?))`, [teacher.id, teacher.id, section]);
            studentIds = asgRows.map((r) => r.student_id);
        }
        else if (assignments.length > 0) {
            // Advisory view — find the section where this teacher IS the adviser
            const advisoryAssignment = assignments.find((a) => a.teacher_id === teacher.id);
            if (advisoryAssignment) {
                section = advisoryAssignment.section;
            }
            else {
                section = assignments[0]?.section || section;
            }
            // Get students only for the resolved advisory section, not all assignments
            const [asgRows] = await db_1.default.query(`SELECT DISTINCT asg.student_id
         FROM assignment_students asg
         JOIN assignments a ON a.id = asg.assignment_id
         WHERE a.teacher_id = ?
           AND LOWER(TRIM(a.section)) = LOWER(TRIM(?))`, [teacher.id, section]);
            studentIds = asgRows.map((r) => r.student_id);
            // Fallback: if no students via assignment_students, try section-based lookup
            if (studentIds.length === 0) {
                const [rows] = await db_1.default.query(`SELECT id FROM students WHERE LOWER(section) = LOWER(?) ORDER BY name`, [section]);
                studentIds = rows.map((r) => r.id);
            }
        }
        else {
            const [rows] = await db_1.default.query(`SELECT id FROM students WHERE LOWER(section) = LOWER(?) ORDER BY name`, [section]);
            studentIds = rows.map((r) => r.id);
        }
        // ── Resolve authorized session for THIS section ──────────────────
        // Rule: if teacher is the ADVISER for the viewed section → BOTH
        //       if teacher is only a SUBJECT TEACHER for this section → use that subject's session
        let authorizedSession = 'BOTH';
        try {
            const [adviserCheck] = await db_1.default.query(`SELECT id FROM assignments
         WHERE teacher_id = ?
           AND LOWER(TRIM(section)) = LOWER(TRIM(?))
         LIMIT 1`, [teacher.id, section]);
            if (adviserCheck.length > 0) {
                authorizedSession = 'BOTH';
            }
            else {
                const [sessRows] = await db_1.default.query(`SELECT session FROM assignments
           WHERE subject_teacher_id = ?
             AND LOWER(TRIM(section)) = LOWER(TRIM(?))
           LIMIT 1`, [teacher.id, section]);
                if (sessRows.length > 0 && sessRows[0].session) {
                    authorizedSession = sessRows[0].session;
                }
            }
        }
        catch {
            authorizedSession = 'BOTH';
        }
        // ── Enforce session ──────────────────────────────────────────────
        const effectiveSession = authorizedSession === 'BOTH' ? requestedSess : authorizedSession;
        if (authorizedSession !== 'BOTH' && requestedSess !== authorizedSession) {
            return res.status(403).json({
                error: `You are only authorized to manage ${authorizedSession} attendance for this section.`,
                authorized_session: authorizedSession,
            });
        }
        if (studentIds.length === 0) {
            return res.json({ date, session: effectiveSession, authorized_session: authorizedSession, section, roster: [] });
        }
        // ── Fetch all assigned students ──────────────────────────────────
        const [studentRows] = await db_1.default.query(`SELECT id, lrn, name, grade, section, gender, photo_path FROM students
       WHERE id IN (?) ORDER BY name`, [studentIds]);
        // ── Kiosk scans (partial_attendance) for today ───────────────────
        const [partialRows] = await db_1.default.query(`SELECT id, student_id, session, status, scan_method, time_in, time_out, scanned_at, photo_path
       FROM partial_attendance
       WHERE student_id IN (?) AND date = ?
       ORDER BY scanned_at ASC`, [studentIds, date]);
        // ── Confirmed records (attendance) for today ─────────────────────
        const [finalRows] = await db_1.default.query(`SELECT id, student_id, session, status, scan_method, time_in, timestamp, subject
       FROM attendance
       WHERE student_id IN (?)
         AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
       ORDER BY timestamp ASC`, [studentIds, date]);
        // ── Build lookup maps ────────────────────────────────────────────
        const partialMap = {};
        for (const p of partialRows) {
            const sid = p.student_id;
            const sess = (p.session || 'AM').toUpperCase();
            if (!partialMap[sid])
                partialMap[sid] = {};
            partialMap[sid][sess] = p;
        }
        // ── Get the subject for this teacher's assignment in this section ──
        // Used to show "which subject" label in the roster row AND to filter confirmed records
        let assignmentSubject = null;
        let isAdviser = false;
        try {
            // Check if teacher is the adviser for this section
            const [adviserCheck] = await db_1.default.query(`SELECT id FROM assignments
         WHERE teacher_id = ?
           AND LOWER(TRIM(section)) = LOWER(TRIM(?))
         LIMIT 1`, [teacher.id, section]);
            isAdviser = adviserCheck.length > 0;
            if (!isAdviser) {
                // Not adviser, check if subject teacher
                const [subjRows] = await db_1.default.query(`SELECT subject FROM assignments
           WHERE subject_teacher_id = ?
             AND LOWER(TRIM(section)) = LOWER(TRIM(?))
           LIMIT 1`, [teacher.id, section]);
                if (subjRows.length > 0) {
                    assignmentSubject = subjRows[0].subject || null;
                }
            }
        }
        catch { /* ignore */ }
        // ── Build finalMap filtered by current teacher's role ────────────
        // Adviser sees general attendance (subject IS NULL)
        // Subject teacher sees their subject-specific attendance
        const finalMap = {};
        for (const f of finalRows) {
            const sid = f.student_id;
            const sess = (f.session || 'AM').toUpperCase();
            const fSubject = f.subject;
            // Filter based on teacher role:
            // - Adviser: only records where subject IS NULL or empty
            // - Subject teacher: only records where subject matches their assignment
            const isMatch = isAdviser
                ? (!fSubject || fSubject === '')
                : (fSubject === assignmentSubject);
            if (isMatch) {
                if (!finalMap[sid])
                    finalMap[sid] = {};
                // Only store if not already stored (keep first record per session)
                if (!finalMap[sid][sess]) {
                    finalMap[sid][sess] = f;
                }
            }
        }
        // ── Build roster ─────────────────────────────────────────────────
        const roster = studentRows.map((s) => {
            const scans = partialMap[s.id] || {};
            const finals = finalMap[s.id] || {};
            const kioskScan = scans[effectiveSession] || null;
            const finalRecord = finals[effectiveSession] || null;
            const amConfirmed = finals['AM'] || null; // has a confirmed AM record today
            // PM can be confirmed if:
            //   (a) student has a kiosk scan today (any session), OR
            //   (b) student has a confirmed AM record (was present this morning)
            const hasAnyScan = Object.keys(scans).length > 0;
            const hasAmConfirmed = !!amConfirmed && amConfirmed.status !== 'Absent';
            const canConfirmPM = hasAnyScan || hasAmConfirmed;
            // Get photo from any scan today (prefer current session, fallback to any session, then student table)
            let photoPath = kioskScan?.photo_path || null;
            if (!photoPath) {
                // Try to get photo from any scan today
                const allScans = Object.values(scans);
                for (const scan of allScans) {
                    if (scan.photo_path) {
                        photoPath = scan.photo_path;
                        break;
                    }
                }
            }
            if (!photoPath) {
                photoPath = s.photo_path || null; // Fallback to student table
            }
            return {
                student_id: s.id,
                student_name: s.name,
                lrn: s.lrn,
                grade: s.grade,
                section: s.section,
                gender: s.gender,
                photo_path: photoPath, // ← Photo from any scan today or student table
                partial_id: kioskScan?.id ?? null,
                scan_time: kioskScan?.time_in ?? kioskScan?.scanned_at ?? null,
                scan_status: kioskScan?.status ?? null,
                scan_method: kioskScan?.scan_method ?? null,
                has_scan: !!kioskScan,
                has_any_scan: hasAnyScan,
                has_am_confirmed: hasAmConfirmed, // ← new: unlocks PM confirm
                can_confirm_pm: canConfirmPM, // ← new: pre-computed for frontend
                final_am: finals['AM'] || null,
                final_pm: finals['PM'] || null,
                final_current: finalRecord,
                already_confirmed: !!finalRecord,
                // subject for this teacher's assignment — null for adviser (general attendance)
                subject: assignmentSubject,
                confirmed_subject: finalRecord?.subject || null,
            };
        });
        res.json({ date, session: effectiveSession, authorized_session: authorizedSession, section, roster });
    }
    catch (error) {
        console.error('Error getting attendance roster:', error);
        res.status(500).json({ error: 'Failed to load attendance roster' });
    }
}
// ─── POST /teacher/attendance/confirm ────────────────────────────────
// Confirms a student from the Automated Partial Attendance List into the
// Final Attendance List.
//
// Rules enforced here (not just on the frontend):
//   1. Student must have a kiosk scan in partial_attendance for today
//      (for the requested session OR any session today for PM)
//   2. Teacher must be authorized for the requested session
//      (assignment.session must be AM, PM, or BOTH matching the request)
//   3. The record is inserted into attendance, NOT deleted from partial
async function confirmAttendance(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { student_id, session, status, date: reqDate, subject, time_in: teacherTimeIn } = req.body;
        if (!student_id || !session) {
            return res.status(400).json({ error: 'student_id and session are required' });
        }
        const targetSession = session.toUpperCase();
        if (!['AM', 'PM'].includes(targetSession)) {
            return res.status(400).json({ error: 'session must be AM or PM' });
        }
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const dateStr = reqDate || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        // ── Enforce session authorization ────────────────────────────────
        // Check which session this teacher is authorized for.
        // Adviser role always wins — if teacher_id matches, they get BOTH.
        let authorizedSession = 'BOTH';
        try {
            // Check adviser first
            const [adviserCheck] = await db_1.default.query(`SELECT id FROM assignments WHERE teacher_id = ? LIMIT 1`, [teacher.id]);
            if (adviserCheck.length > 0) {
                authorizedSession = 'BOTH';
            }
            else {
                // Not an adviser — check subject teacher session
                const [sessRows] = await db_1.default.query(`SELECT session FROM assignments
           WHERE subject_teacher_id = ?
           LIMIT 1`, [teacher.id]);
                if (sessRows.length > 0 && sessRows[0].session) {
                    authorizedSession = sessRows[0].session;
                }
            }
        }
        catch {
            authorizedSession = 'BOTH'; // session column not yet migrated
        }
        if (authorizedSession !== 'BOTH' && targetSession !== authorizedSession) {
            return res.status(403).json({
                error: `You are only authorized to confirm ${authorizedSession} attendance. You cannot confirm ${targetSession} attendance.`,
            });
        }
        // ── Get student info ─────────────────────────────────────────────
        const [studentRows] = await db_1.default.query(`SELECT id, name, lrn, gender, grade, section FROM students WHERE id = ?`, [student_id]);
        if (!studentRows.length) {
            return res.status(404).json({ error: 'Student not found' });
        }
        const student = studentRows[0];
        // ── Enforce kiosk scan / AM confirmation requirement ─────────────
        // AM: student must have a kiosk scan for AM specifically
        // PM: student must have EITHER a kiosk scan today OR a confirmed AM record
        const partialParams = targetSession === 'PM'
            ? [student_id, dateStr]
            : [student_id, targetSession, dateStr];
        const [scanCheck] = await db_1.default.query(`SELECT id, session, status, scan_method, time_in, scanned_at, photo_path, local_path, cloudinary_url, cloudinary_uploaded FROM partial_attendance
       WHERE student_id = ?
       ${targetSession === 'PM' ? 'AND date = ?' : 'AND session = ? AND date = ?'}
       ORDER BY scanned_at DESC
       LIMIT 1`, partialParams);
        // For PM: also check if student has a confirmed AM record (present this morning)
        let amConfirmRecord = null;
        if (targetSession === 'PM' && !scanCheck.length) {
            const [amRows] = await db_1.default.query(`SELECT id, scan_method, time_in, timestamp FROM attendance
         WHERE student_id = ? AND session = 'AM'
           AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
           AND status != 'Absent'
         LIMIT 1`, [student_id, dateStr]);
            amConfirmRecord = amRows[0] || null;
        }
        if (!scanCheck.length && !amConfirmRecord) {
            return res.status(403).json({
                error: targetSession === 'PM'
                    ? 'Cannot confirm PM attendance: student has not scanned the kiosk today and has no confirmed AM record.'
                    : 'Cannot confirm attendance: student has not scanned the kiosk this morning.'
            });
        }
        // Determine the session to write into the attendance record.
        // For AM: use the kiosk scan's actual session (could be AM or FULL)
        // For PM: always write PM — the teacher is confirming afternoon presence
        const kioskSession = targetSession === 'PM'
            ? 'PM'
            : (scanCheck[0]?.session?.toUpperCase() || targetSession);
        // ── Check if already confirmed for the TARGET session + subject ──
        // Adviser: check for records where subject IS NULL
        // Subject teacher: check for records where subject matches theirs
        const subjectVal = subject || null;
        const subjectCheckCondition = subjectVal
            ? 'AND subject = ?'
            : 'AND (subject IS NULL OR subject = \'\')';
        const subjectCheckParams = subjectVal
            ? [student_id, targetSession, dateStr, subjectVal]
            : [student_id, targetSession, dateStr];
        const [existingFinal] = await db_1.default.query(`SELECT id FROM attendance
       WHERE student_id = ? AND session = ?
         AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
         ${subjectCheckCondition}
       LIMIT 1`, subjectCheckParams);
        if (existingFinal.length) {
            const alreadyMsg = subjectVal
                ? `${targetSession} attendance for ${subjectVal} already confirmed for this student today.`
                : `${targetSession} general attendance already confirmed for this student today.`;
            return res.status(409).json({ error: alreadyMsg });
        }
        // ── Determine final status and scan info ─────────────────────────
        const scan = scanCheck[0] || amConfirmRecord || {};
        const finalStatus = status || scan.status || 'Time-In';
        const scanMethod = scan.scan_method || 'Manual';
        const timeIn = teacherTimeIn?.trim()
            || (scanCheck.length ? (scan.time_in || scan.scanned_at || null) : null);
        const actualSession = kioskSession;
        // ── Get photo paths from partial_attendance scan ────────────────
        const photoPath = scan.photo_path || null;
        const localPath = scan.local_path || null;
        const cloudinaryUrl = scan.cloudinary_url || null;
        const cloudinaryUploaded = scan.cloudinary_uploaded || false;
        console.log('📋 Confirming attendance:');
        console.log('   Student:', student.name);
        console.log('   Session:', targetSession);
        console.log('   Photo path:', photoPath);
        console.log('   Local path:', localPath);
        console.log('   Cloudinary URL:', cloudinaryUrl || 'Not yet uploaded');
        // ── Resolve the section from the teacher's advisory assignment ──────
        // student.section may be NULL (cleared for SF2) — use teacher's advisory section
        let sectionForRecord = student.section || teacher.section || null;
        if (!sectionForRecord) {
            try {
                // Prefer the section where this teacher IS the adviser (teacher_id match)
                const [advSec] = await db_1.default.query(`SELECT section FROM assignments
           WHERE teacher_id = ?
           AND section IS NOT NULL AND section != ''
           LIMIT 1`, [teacher.id]);
                if (advSec.length > 0) {
                    sectionForRecord = advSec[0].section;
                }
                else {
                    // Fallback: subject teacher assignment
                    const [subjSec] = await db_1.default.query(`SELECT section FROM assignments
             WHERE subject_teacher_id = ?
             AND section IS NOT NULL AND section != ''
             LIMIT 1`, [teacher.id]);
                    if (subjSec.length > 0) {
                        sectionForRecord = subjSec[0].section;
                    }
                }
            }
            catch { /* ignore */ }
        }
        const roleLabel = await buildTeacherRoleLabel(teacher.id, sectionForRecord || student.section);
        const confirmNote = `Confirmed ${actualSession} by ${teacher.name} (${roleLabel})`;
        // ── Insert into final attendance ─────────────────────────────────
        const subjectForInsert = subjectVal;
        const [result] = await db_1.default.query(`INSERT INTO attendance
         (student_id, student_name, lrn, gender, grade, section,
          teacher_id, teacher_name, scan_method, status, session,
          date, time_in, subject, photo_path, local_path, cloudinary_url, cloudinary_uploaded, 
          timestamp, is_overridden, notes, is_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 0, ?, 1, NOW())`, [
            student.id, student.name, student.lrn, student.gender,
            student.grade, sectionForRecord || null,
            teacher.id, teacher.name,
            scanMethod, finalStatus, actualSession,
            dateStr, timeIn, subjectForInsert, photoPath, localPath, cloudinaryUrl, cloudinaryUploaded,
            confirmNote,
        ]);
        console.log('✅ Attendance confirmed - Photo copied:', photoPath ? 'YES' : 'NO');
        console.log('   Cloudinary URL copied:', cloudinaryUrl ? 'YES' : 'NO');
        // Also mark original kiosk scan(s) as verified so SF2 picks them up correctly
        await db_1.default.query(`UPDATE attendance
       SET is_verified = 1
       WHERE student_id = ?
         AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
         AND session = ?
         AND is_verified = 0`, [student.id, dateStr, actualSession]);
        res.json({
            success: true,
            message: `${targetSession} attendance confirmed for ${student.name}`,
            attendanceId: result.insertId,
            session: targetSession,
            status: finalStatus,
        });
    }
    catch (error) {
        console.error('Error confirming attendance:', error);
        res.status(500).json({ error: 'Failed to confirm attendance' });
    }
}
// ─── POST /teacher/attendance/auto-absent ────────────────────────────
// Marks all students in the section who have NO confirmed attendance for
// the given session as Absent.  Called at end-of-session cutoff.
// Only inserts for students who:
//   - are assigned to this teacher's section
//   - have NO confirmed record in attendance for that session/date
// Does NOT require a kiosk scan — the system auto-inserts the absent record.
async function autoMarkAbsent(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { session, date: reqDate } = req.body;
        if (!session)
            return res.status(400).json({ error: 'session is required' });
        const targetSession = session.toUpperCase();
        if (!['AM', 'PM'].includes(targetSession)) {
            return res.status(400).json({ error: 'session must be AM or PM' });
        }
        const teacher = await getTeacherRow(userId);
        if (!teacher)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const dateStr = reqDate || (0, date_fns_1.format)(new Date(), 'yyyy-MM-dd');
        const assignments = await getAssignmentsForTeacher(teacher.id);
        let studentIds = [];
        let section = teacher.section || '';
        if (assignments.length > 0) {
            section = assignments[0]?.section || section;
            studentIds = await getTeacherStudentIds(teacher.id);
        }
        else {
            const [rows] = await db_1.default.query(`SELECT id FROM students WHERE LOWER(section) = LOWER(?)`, [section]);
            studentIds = rows.map((r) => r.id);
        }
        if (!studentIds.length)
            return res.json({ marked: 0 });
        // ── Determine if teacher is adviser or subject teacher ──────────
        let assignmentSubject = null;
        let isAdviser = false;
        try {
            const [adviserCheck] = await db_1.default.query(`SELECT id FROM assignments
         WHERE teacher_id = ?
           AND LOWER(TRIM(section)) = LOWER(TRIM(?))
         LIMIT 1`, [teacher.id, section]);
            isAdviser = adviserCheck.length > 0;
            if (!isAdviser) {
                const [subjRows] = await db_1.default.query(`SELECT subject FROM assignments
           WHERE subject_teacher_id = ?
             AND LOWER(TRIM(section)) = LOWER(TRIM(?))
           LIMIT 1`, [teacher.id, section]);
                if (subjRows.length > 0) {
                    assignmentSubject = subjRows[0].subject || null;
                }
            }
        }
        catch { /* ignore */ }
        // Find which students already have a confirmed record for this session + subject
        // Adviser: check for general attendance (subject IS NULL)
        // Subject teacher: check for their specific subject
        const subjectCheckCondition = isAdviser
            ? 'AND (subject IS NULL OR subject = \'\')'
            : 'AND subject = ?';
        const confirmCheckParams = isAdviser
            ? [studentIds, targetSession, dateStr]
            : [studentIds, targetSession, dateStr, assignmentSubject];
        const [alreadyConfirmed] = await db_1.default.query(`SELECT DISTINCT student_id FROM attendance
       WHERE student_id IN (?)
         AND session = ?
         AND DATE(CONVERT_TZ(date, '+00:00', '+08:00')) = ?
         ${subjectCheckCondition}`, confirmCheckParams);
        const confirmedIds = new Set(alreadyConfirmed.map((r) => r.student_id));
        // Students who still need absent marking
        const toMark = studentIds.filter(id => !confirmedIds.has(id));
        if (!toMark.length)
            return res.json({ marked: 0 });
        // Get their info
        const [studentRows] = await db_1.default.query(`SELECT id, name, lrn, gender, grade, section FROM students WHERE id IN (?)`, [toMark]);
        const roleLabel = await buildTeacherRoleLabel(teacher.id, section);
        const absentNote = `Auto-marked Absent ${targetSession} — no confirmation by ${teacher.name} (${roleLabel})`;
        const subjectVal = isAdviser ? null : assignmentSubject;
        let marked = 0;
        for (const s of studentRows) {
            await db_1.default.query(`INSERT INTO attendance
           (student_id, student_name, lrn, gender, grade, section,
            teacher_id, teacher_name, scan_method, status, session,
            date, subject, timestamp, is_overridden, notes, is_verified, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Auto', 'Absent', ?, ?, ?, NOW(), 0, ?, 1, NOW())`, [
                s.id, s.name, s.lrn, s.gender, s.grade, s.section,
                teacher.id, teacher.name,
                targetSession, dateStr, subjectVal, absentNote,
            ]);
            marked++;
        }
        res.json({
            success: true,
            marked,
            session: targetSession,
            date: dateStr,
            message: `${marked} student(s) auto-marked Absent for ${targetSession}`,
        });
    }
    catch (error) {
        console.error('Error auto-marking absent:', error);
        res.status(500).json({ error: 'Failed to auto-mark absent' });
    }
}
exports.default = {
    getTeacherClasses,
    getTodayAttendanceSummary,
    markManualAttendance,
    addAttendanceNote,
    excuseAbsence,
    getTeacherSubjectAssignments,
    getSubjectAttendance,
    verifyPartialAttendance,
    getAttendanceRoster,
    confirmAttendance,
    autoMarkAbsent,
};
