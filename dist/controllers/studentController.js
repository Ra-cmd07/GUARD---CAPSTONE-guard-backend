"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStudents = getStudents;
exports.createStudent = createStudent;
exports.getStudentById = getStudentById;
exports.updateStudent = updateStudent;
exports.getStudentAttendance = getStudentAttendance;
exports.hideAttendanceRecord = hideAttendanceRecord;
exports.getStudentSmsLogs = getStudentSmsLogs;
exports.clearStudentSmsLogs = clearStudentSmsLogs;
const db_1 = __importDefault(require("../lib/db"));
// ─── GET /api/students ────────────────────────────────────────────────
async function getStudents(req, res) {
    console.log('[getStudents] START');
    console.log('[getStudents] req.user:', JSON.stringify(req.user));
    try {
        const { role, profileId } = req.user;
        console.log(`[getStudents] Role: ${role}, ProfileId: ${profileId}`);
        // For parent role, get students linked via parent_student table
        if (role === 'parent' && profileId) {
            console.log(`[getStudents] Querying for parent ${profileId}`);
            // Get students linked to this parent from parent_student junction table
            const [studentLinks] = await db_1.default.execute(`SELECT s.id, s.lrn, s.name, s.gender, s.grade, s.section, 
                s.mac_address, s.rfid_uid, s.preferred_method, s.is_active, s.created_at
         FROM parent_student ps
         INNER JOIN students s ON ps.student_id = s.id
         WHERE ps.parent_id = ? AND s.is_active = 1`, [profileId]);
            console.log(`[getStudents] Found ${studentLinks.length} student(s) for parent ${profileId}`);
            res.json(studentLinks);
            return;
        }
        // Original logic for other roles
        let query = `
      SELECT
        s.id, s.lrn, s.name, s.gender, s.grade, s.section,
        s.mac_address, s.rfid_uid, s.preferred_method, s.is_active, s.created_at
      FROM students s
    `;
        const params = [];
        if (role === 'teacher' && profileId) {
            const [tRows] = await db_1.default.execute('SELECT section FROM teachers WHERE id = ?', [profileId]);
            const sec = tRows[0]?.section;
            if (sec) {
                query += ' WHERE s.section = ?';
                params.push(sec);
            }
        }
        else if (role === 'student' && profileId) {
            query += ' WHERE s.id = ?';
            params.push(profileId);
        }
        query += ' ORDER BY s.name';
        const [rows] = await db_1.default.execute(query, params);
        // For each student, fetch their guardian contacts from parent_student table
        const students = rows;
        for (const student of students) {
            const [guardians] = await db_1.default.execute(`SELECT p.name, p.contact, ps.relationship 
         FROM parent_student ps
         INNER JOIN parents p ON ps.parent_id = p.id
         WHERE ps.student_id = ?`, [student.id]);
            student.parents_guardians = guardians;
        }
        res.json(students);
    }
    catch (err) {
        const errorMessage = err.message;
        const errorStack = err.stack;
        console.error('getStudents error:', errorMessage);
        console.error('Stack:', errorStack);
        console.error('User:', req.user);
        res.status(500).json({
            error: 'Server error',
            message: errorMessage,
            details: process.env.NODE_ENV === 'development' ? errorStack : undefined
        });
    }
}
// ─── POST /api/students ───────────────────────────────────────────────
async function createStudent(req, res) {
    const conn = await db_1.default.getConnection();
    try {
        await conn.beginTransaction();
        const { lrn, name, gender, grade, section, mac_address, rfid_uid, preferred_method, parents_guardians } = req.body;
        if (!lrn || !name || !gender) {
            res.status(400).json({ error: 'lrn, name, and gender are required' });
            return;
        }
        const [result] = await conn.execute(`INSERT INTO students (lrn, name, gender, grade, section, mac_address, rfid_uid, preferred_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [lrn, name,
            gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : gender,
            grade || null, section || null, mac_address || null, rfid_uid || null,
            preferred_method || 'QR',
            req.user?.id || null]);
        const studentId = result.insertId;
        if (Array.isArray(parents_guardians)) {
            for (const pg of parents_guardians) {
                if (pg.name) {
                    await conn.execute('INSERT INTO parents_teachers (student_id, role, name, contact_number) VALUES (?, ?, ?, ?)', [studentId, pg.role, pg.name, pg.contact_number || null]);
                }
            }
        }
        await conn.commit();
        res.status(201).json({ id: studentId, message: 'Student registered successfully' });
    }
    catch (err) {
        await conn.rollback();
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(400).json({ error: 'LRN already registered' });
            return;
        }
        console.error('createStudent error:', err);
        res.status(500).json({ error: 'Server error' });
    }
    finally {
        conn.release();
    }
}
// ─── GET /api/students/:id ────────────────────────────────────────────
async function getStudentById(req, res) {
    try {
        const { id } = req.params;
        const [students] = await db_1.default.execute('SELECT * FROM students WHERE id = ?', [id]);
        if (students.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        const [guardians] = await db_1.default.execute('SELECT * FROM parents_teachers WHERE student_id = ?', [id]);
        res.json({ ...students[0], parents_guardians: guardians });
    }
    catch (err) {
        console.error('getStudentById error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── PUT /api/students/:id ────────────────────────────────────────────
async function updateStudent(req, res) {
    try {
        const { id } = req.params;
        const { name, gender, grade, section, mac_address, rfid_uid, preferred_method } = req.body;
        await db_1.default.execute(`UPDATE students SET name=?, gender=?, grade=?, section=?, mac_address=?, rfid_uid=?, preferred_method=?, updated_by=?
       WHERE id=?`, [name,
            gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : (gender || null),
            grade || null, section || null, mac_address || null, rfid_uid || null,
            preferred_method || 'QR',
            req.user.id, id]);
        res.json({ message: 'Student updated' });
    }
    catch (err) {
        console.error('updateStudent error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/students/:id/attendance ────────────────────────────────
// Returns confirmed attendance records + pending kiosk scans for parent portal.
// Shows ALL records including subject-specific ones so parents see the full picture.
// Records hidden by the parent (via parent_hidden_attendance) are excluded.
async function getStudentAttendance(req, res) {
    try {
        const { id } = req.params;
        const from = req.query.from;
        const to = req.query.to;
        // Resolve parent_id for filtering hidden records
        let parentId = null;
        if (req.user?.role === 'parent' && req.user?.profileId) {
            parentId = req.user.profileId;
        }
        // ── Confirmed attendance records ─────────────────────────────────
        let q = `
      SELECT
        id, student_id, student_name, lrn,
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        DATE_FORMAT(date, '%Y-%m-%d') AS date_str,
        session, subject, status, scan_method,
        time_in, time_out, photo_path, notes,
        timestamp, teacher_name,
        'confirmed' AS record_type
      FROM attendance
      WHERE student_id = ?
    `;
        const p = [id];
        if (from) {
            q += ' AND date >= ?';
            p.push(from);
        }
        if (to) {
            q += ' AND date <= ?';
            p.push(to);
        }
        if (parentId) {
            q += ` AND id NOT IN (
        SELECT CAST(record_id AS UNSIGNED) FROM parent_hidden_attendance
        WHERE parent_id = ? AND record_type = 'confirmed'
      )`;
            p.push(parentId);
        }
        // ── Pending kiosk scans ──────────────────────────────────────────
        let qPartial = `
      SELECT
        id, student_id, student_name, lrn,
        DATE_FORMAT(date, '%Y-%m-%d') AS date,
        DATE_FORMAT(date, '%Y-%m-%d') AS date_str,
        session, NULL AS subject, status, scan_method,
        time_in, time_out, photo_path, notes,
        scanned_at AS timestamp, NULL AS teacher_name,
        'pending' AS record_type
      FROM partial_attendance
      WHERE student_id = ?
    `;
        const pPartial = [id];
        if (from) {
            qPartial += ' AND date >= ?';
            pPartial.push(from);
        }
        if (to) {
            qPartial += ' AND date <= ?';
            pPartial.push(to);
        }
        if (parentId) {
            qPartial += ` AND id NOT IN (
        SELECT CAST(record_id AS UNSIGNED) FROM parent_hidden_attendance
        WHERE parent_id = ? AND record_type = 'pending'
      )`;
            pPartial.push(parentId);
        }
        const [confirmed] = await db_1.default.execute(q + ' ORDER BY date DESC, timestamp DESC', p);
        const [pending] = await db_1.default.execute(qPartial + ' ORDER BY date DESC, scanned_at DESC', pPartial);
        const confirmedKeys = new Set(confirmed.map((r) => `${r.date_str}_${(r.session || 'AM').toUpperCase()}`));
        const pendingFiltered = pending.filter((r) => {
            const key = `${r.date_str}_${(r.session || 'AM').toUpperCase()}`;
            return !confirmedKeys.has(key);
        });
        const all = [
            ...confirmed.map(r => ({ ...r, date: r.date_str })),
            ...pendingFiltered.map(r => ({
                ...r, date: r.date_str,
                status: `${r.status} (pending)`,
            })),
        ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        res.json(all);
    }
    catch (err) {
        console.error('getStudentAttendance error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── DELETE /api/students/:id/attendance/:recordId/hide ───────────────
// Parent hides an attendance record from their view (does NOT delete from DB)
async function hideAttendanceRecord(req, res) {
    try {
        const { id, recordId } = req.params;
        const recordType = (req.query.type || 'confirmed');
        if (!req.user?.profileId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }
        const parentId = req.user.profileId;
        // Verify this student belongs to this parent
        const [linkRows] = await db_1.default.execute('SELECT id FROM parent_student WHERE parent_id = ? AND student_id = ?', [parentId, id]);
        if (!linkRows.length) {
            res.status(403).json({ error: 'This student is not linked to your account' });
            return;
        }
        await db_1.default.execute(`INSERT IGNORE INTO parent_hidden_attendance (parent_id, record_id, record_type)
       VALUES (?, ?, ?)`, [parentId, String(recordId), recordType]);
        res.json({ success: true, message: 'Record hidden from your view' });
    }
    catch (err) {
        console.error('hideAttendanceRecord error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/students/:id/sms-logs ──────────────────────────────────────
async function getStudentSmsLogs(req, res) {
    try {
        const { id } = req.params;
        // Get SMS logs for this student
        const [logs] = await db_1.default.execute(`SELECT 
        id, student_name, parent_name, phone_number, message, 
        status, provider, sent_at, created_at
       FROM sms_logs 
       WHERE student_name = (SELECT name FROM students WHERE id = ?)
       ORDER BY created_at DESC
       LIMIT 100`, [id]);
        res.json(logs);
    }
    catch (err) {
        console.error('Error fetching SMS logs:', err);
        res.status(500).json({ error: 'Failed to fetch SMS logs' });
    }
}
// ─── DELETE /api/students/:id/sms-logs/clear ─────────────────────────────
async function clearStudentSmsLogs(req, res) {
    try {
        const { id } = req.params;
        console.log(`🗑️  Parent clearing SMS history for student ${id}...`);
        // Get student name first
        const [students] = await db_1.default.execute('SELECT name FROM students WHERE id = ?', [id]);
        if (students.length === 0) {
            res.status(404).json({ error: 'Student not found' });
            return;
        }
        const studentName = students[0].name;
        // Count before deletion
        const [countBefore] = await db_1.default.execute('SELECT COUNT(*) as total FROM sms_logs WHERE student_name = ?', [studentName]);
        const totalBefore = countBefore[0].total;
        // Delete SMS logs for this student only
        const [result] = await db_1.default.execute('DELETE FROM sms_logs WHERE student_name = ?', [studentName]);
        console.log(`✅ Deleted ${result.affectedRows} SMS logs for ${studentName}`);
        res.json({
            success: true,
            message: 'SMS history cleared successfully',
            deletedCount: result.affectedRows,
            previousCount: totalBefore
        });
    }
    catch (err) {
        console.error('Error clearing student SMS logs:', err);
        res.status(500).json({ error: 'Failed to clear SMS history' });
    }
}
