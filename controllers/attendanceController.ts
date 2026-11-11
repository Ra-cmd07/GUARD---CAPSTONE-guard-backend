import { Request, Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';
import { buildTeacherRoleLabel } from './teacherController';

// ─── GET /api/attendance ──────────────────────────────────────────────
// Admin sees all; Teacher sees own class; Parent sees child; Student sees own
export async function getAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { role, id: userId, profileId } = req.user!;
    // Use Philippines timezone (UTC+8)
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const date = (req.query.date as string) || phTime.toISOString().split('T')[0];
    const section = req.query.section as string | undefined;

    console.log('🔍 getAttendance called:', { role, userId, profileId, date, section });

    let query = `
      SELECT a.id, a.student_id, a.student_name, a.lrn, a.gender,
             a.grade, a.section, a.teacher_id, a.teacher_name,
             a.kiosk_id, a.scan_method, a.status, a.session,
             a.date, a.time_in, a.time_out, a.timestamp,
             a.photo_path, a.by_whom, a.notes, a.is_overridden,
             a.created_at, a.updated_at
      FROM attendance a
      WHERE a.date = ?
    `;
    const params: any[] = [date];

    if (role === 'teacher' && profileId) {
      // Teacher sees only their assigned section
      const [tRows] = await pool.execute(
        'SELECT section FROM teachers WHERE id = ?', [profileId]
      ) as any[];
      const teacherSection = (tRows as any[])[0]?.section;
      console.log('👨‍🏫 Teacher section:', teacherSection);
      if (teacherSection) {
        // Flexible matching: works with both "Grade 7 - section 1" and "section 1" formats
        // Extract the section number/identifier from teacher's section (e.g., "section 1" from "Grade 7 - section 1")
        const sectionPart = teacherSection.split('-').pop()?.trim() || teacherSection;
        console.log('📝 Section part extracted:', sectionPart);
        query += ' AND (a.section = ? OR a.section = ? OR a.section LIKE ? OR a.teacher_id = ?)';
        params.push(teacherSection, sectionPart, `%${sectionPart}%`, profileId);
        console.log('🔍 Query params:', params);
      } else {
        query += ' AND a.teacher_id = ?';
        params.push(profileId);
      }
    } else if (role === 'parent' && profileId) {
      // Parent sees only their children
      query += ` AND a.student_id IN (
        SELECT ps.student_id FROM parent_student ps WHERE ps.parent_id = ?
      )`;
      params.push(profileId);
    } else if (role === 'student' && profileId) {
      query += ' AND a.student_id = ?';
      params.push(profileId);
    } else if (role === 'admin') {
      // Admin sees all verified records; filter by section if provided
      if (section) { query += ' AND a.section = ?'; params.push(section); }
    }

    query += ' ORDER BY a.timestamp DESC';

    console.log('📤 Executing query:', query);
    console.log('📤 With params:', params);

    const [rows] = await pool.execute(query, params) as any[];
    console.log('✅ Query returned', (rows as any[]).length, 'rows');
    if ((rows as any[]).length > 0) {
      console.log('📋 First row:', (rows as any[])[0]);
    }
    res.json(rows);
  } catch (err) {
    console.error('getAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/attendance ─────────────────────────────────────────────
export async function createAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { role, profileId } = req.user!;
    const {
      student_id, student_name, lrn, gender, grade, section,
      teacher_id, teacher_name, kiosk_id, scan_method,
      status, session, date, time_in, time_out,
      photo_path, qr_data, by_whom, notes,
    } = req.body;

    if (!student_name || !status || !date) {
      res.status(400).json({ error: 'student_name, status, and date are required' });
      return;
    }

    // Resolve teacher info from token if teacher role
    let resolvedTeacherId = teacher_id || null;
    let resolvedTeacherName = teacher_name || null;
    if (role === 'teacher' && profileId && !resolvedTeacherId) {
      resolvedTeacherId = profileId;
      const [tRows] = await pool.execute(
        'SELECT name FROM teachers WHERE id = ?', [profileId]
      ) as any[];
      resolvedTeacherName = (tRows as any[])[0]?.name || null;
    }

    // REMOVED: Duplicate check - now allows unlimited attendance records per day

    const session_ = session || (new Date().getHours() < 12 ? 'AM' : 'PM');
    const scanMethod = scan_method || 'QR';

    const [result] = await pool.execute(
      `INSERT INTO attendance
         (student_id, student_name, lrn, gender, grade, section,
          teacher_id, teacher_name, kiosk_id, scan_method,
          status, session, date, time_in, time_out,
          photo_path, qr_data, by_whom, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        student_id || null, student_name,
        lrn || null, gender || null, grade || null, section || null,
        resolvedTeacherId, resolvedTeacherName,
        kiosk_id || null, scanMethod,
        status, session_, date,
        time_in || null, time_out || null,
        photo_path || null, qr_data || null,
        by_whom || null, notes || null,
      ]
    ) as any[];

    const newId = (result as any).insertId;
    res.status(201).json({ id: newId, message: 'Attendance recorded' });
  } catch (err) {
    console.error('createAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /api/attendance/:id ────────────────────────────────────────
// Teachers can override their class records (logged); admin can override all
export async function updateAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id }  = req.params;
    const { role, profileId } = req.user!;
    const { status, session, notes, reason } = req.body;

    // Fetch existing record
    const [existingRows] = await pool.execute(
      'SELECT * FROM attendance WHERE id = ?', [id]
    ) as any[];
    const existing = (existingRows as any[])[0];
    if (!existing) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    // Teacher can only update their section (with flexible matching)
    // TEMPORARILY DISABLED - Allow all teachers to override
    /*
    if (role === 'teacher' && profileId) {
      const [tRows] = await pool.execute(
        'SELECT section FROM teachers WHERE id = ?', [profileId]
      ) as any[];
      const teacherSection = (tRows as any[])[0]?.section;
      
      if (teacherSection && existing.section) {
        // Extract section part from teacher's section (e.g., "section 1" from "Grade 7 - section 1")
        const teacherSectionPart = teacherSection.includes(' - ') 
          ? teacherSection.split(' - ')[1].trim() 
          : teacherSection;
        
        // Check if sections match (exact or partial)
        const sectionsMatch = 
          existing.section === teacherSection ||  // Exact match
          existing.section === teacherSectionPart ||  // Part match
          existing.section.includes(teacherSectionPart) ||  // Contains match
          teacherSectionPart.includes(existing.section);  // Reverse contains
        
        if (!sectionsMatch) {
          console.log(`❌ Section mismatch: Teacher="${teacherSection}" vs Record="${existing.section}"`);
          res.status(403).json({ error: 'Cannot update records outside your section' });
          return;
        } else {
          console.log(`✅ Section match: Teacher="${teacherSection}" matches Record="${existing.section}"`);
        }
      }
    }
    */
    console.log(`✅ Section check disabled - Teacher can override all records`);

    await pool.execute(
      `UPDATE attendance SET status = ?, session = ?, notes = ?, is_overridden = 1, updated_by = ?
       WHERE id = ?`,
      [status || existing.status, session || existing.session, notes || existing.notes,
       req.user!.id, id]
    );

    // Log the override if made by a teacher
    if (role === 'teacher' && profileId && (status !== existing.status || session !== existing.session)) {
      // Append role-context audit note
      const roleLabel = await buildTeacherRoleLabel(profileId as number, existing.section);
      const [tRows] = await pool.execute('SELECT name FROM teachers WHERE id = ?', [profileId]) as any[];
      const teacherName = (tRows as any[])[0]?.name || 'Teacher';
      const auditSuffix = `Modified by ${teacherName} (${roleLabel})`;

      await pool.execute(
        `UPDATE attendance
         SET notes = CONCAT(IFNULL(notes,''), ' | ', ?),
             teacher_id = ?,
             teacher_name = ?
         WHERE id = ?`,
        [auditSuffix, profileId, teacherName, id]
      );

      await pool.execute(
        `INSERT INTO attendance_override_log
           (attendance_id, teacher_id, old_status, new_status, old_session, new_session, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, profileId, existing.status, status || existing.status,
         existing.session, session || existing.session, reason || null]
      );
    }

    res.json({ message: 'Updated successfully' });
  } catch (err) {
    console.error('updateAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/attendance/:id ───────────────────────────────────────
export async function deleteAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM attendance WHERE id = ?', [id]);
    res.json({ message: 'Deleted successfully' });
  } catch (err) {
    console.error('deleteAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/attendance/stats ────────────────────────────────────────
export async function getAttendanceStats(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { role, profileId } = req.user!;
    // Use Philippines timezone (UTC+8)
    const now = new Date();
    const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
    const date = (req.query.date as string) || phTime.toISOString().split('T')[0];

    let sectionFilter = '';
    let params: any[] = [date];

    if (role === 'teacher' && profileId) {
      const [tRows] = await pool.execute(
        'SELECT section FROM teachers WHERE id = ?', [profileId]
      ) as any[];
      const teacherSection = (tRows as any[])[0]?.section;
      if (teacherSection) {
        // Flexible matching: works with both "Grade 7 - section 1" and "section 1" formats
        const sectionPart = teacherSection.split('-').pop()?.trim() || teacherSection;
        sectionFilter = ' AND (section = ? OR section = ? OR section LIKE ?)';
        params.push(teacherSection, sectionPart, `%${sectionPart}%`);
      }
    }

    const [rows] = await pool.execute(
      `SELECT status, COUNT(*) AS count
       FROM attendance
       WHERE date = ? ${sectionFilter}
       GROUP BY status`,
      params
    ) as any[];

    const stats: Record<string, number> = { 'Time-In': 0, 'Time-Out': 0, Late: 0, Absent: 0 };
    for (const row of rows as any[]) { stats[row.status] = Number(row.count); }
    stats.present = stats['Time-In'] + stats['Late'];

    res.json(stats);
  } catch (err) {
    console.error('getAttendanceStats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/attendance/override-logs ────────────────────────────────
export async function getOverrideLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      `SELECT aol.*, t.name AS teacher_name, a.student_name, a.date
       FROM attendance_override_log aol
       JOIN teachers t ON t.id = aol.teacher_id
       JOIN attendance a ON a.id = aol.attendance_id
       ORDER BY aol.overridden_at DESC
       LIMIT 200`
    ) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getOverrideLogs error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/attendance/recent ───────────────────────────────────────
// Get recent attendance records for kiosk display (WiFi-based BLE polling)
export async function getRecentAttendance(req: Request, res: Response): Promise<void> {
  try {
    const scan_method = (req.query.method as string) || 'BLE';
    const seconds = Number(req.query.seconds) || 30; // Last 30 seconds by default

    const [rows] = await pool.execute(
      `SELECT 
        a.id, 
        a.student_id, 
        a.student_name, 
        a.status, 
        a.date,
        a.time_in,
        a.time_out,
        a.scan_method,
        a.photo_path,
        a.timestamp,
        TIMESTAMPDIFF(SECOND, a.timestamp, NOW()) as seconds_ago
       FROM attendance a
       WHERE a.scan_method = ? 
       AND a.timestamp >= DATE_SUB(NOW(), INTERVAL ? SECOND)
       ORDER BY a.timestamp DESC
       LIMIT 10`,
      [scan_method, seconds]
    ) as any[];

    res.json(rows);
  } catch (err) {
    console.error('getRecentAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
