import { Request, Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── GET /api/students ────────────────────────────────────────────────
export async function getStudents(req: AuthRequest, res: Response): Promise<void> {
  console.log('[getStudents] START');
  console.log('[getStudents] req.user:', JSON.stringify(req.user));
  
  try {
    const { role, profileId } = req.user!;
    console.log(`[getStudents] Role: ${role}, ProfileId: ${profileId}`);
    
    // For parent role, get students linked via parent_student table
    if (role === 'parent' && profileId) {
      console.log(`[getStudents] Querying for parent ${profileId}`);
      
      // Get students linked to this parent from parent_student junction table
      const [studentLinks] = await pool.execute(
        `SELECT s.id, s.lrn, s.name, s.gender, s.grade, s.section, 
                s.mac_address, s.rfid_uid, s.preferred_method, s.is_active, s.created_at
         FROM parent_student ps
         INNER JOIN students s ON ps.student_id = s.id
         WHERE ps.parent_id = ? AND s.is_active = 1`,
        [profileId]
      ) as any[];
      console.log(`[getStudents] Found ${(studentLinks as any[]).length} student(s) for parent ${profileId}`);
      
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
    const params: any[] = [];

    if (role === 'teacher' && profileId) {
      const [tRows] = await pool.execute(
        'SELECT section FROM teachers WHERE id = ?', [profileId]
      ) as any[];
      const sec = (tRows as any[])[0]?.section;
      if (sec) { query += ' WHERE s.section = ?'; params.push(sec); }
    } else if (role === 'student' && profileId) {
      query += ' WHERE s.id = ?';
      params.push(profileId);
    }

    query += ' ORDER BY s.name';
    const [rows] = await pool.execute(query, params) as any[];
    
    // For each student, fetch their guardian contacts from parent_student table
    const students = rows as any[];
    for (const student of students) {
      const [guardians] = await pool.execute(
        `SELECT p.name, p.contact, ps.relationship 
         FROM parent_student ps
         INNER JOIN parents p ON ps.parent_id = p.id
         WHERE ps.student_id = ?`,
        [student.id]
      ) as any[];
      student.parents_guardians = guardians;
    }
    
    res.json(students);
  } catch (err) {
    const errorMessage = (err as Error).message;
    const errorStack = (err as Error).stack;
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
export async function createStudent(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { lrn, name, gender, grade, section, mac_address, rfid_uid, preferred_method, parents_guardians } = req.body;

    if (!lrn || !name || !gender) {
      res.status(400).json({ error: 'lrn, name, and gender are required' });
      return;
    }

    const [result] = await conn.execute(
      `INSERT INTO students (lrn, name, gender, grade, section, mac_address, rfid_uid, preferred_method, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [lrn, name,
       gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : gender,
       grade || null, section || null, mac_address || null, rfid_uid || null,
       preferred_method || 'QR',
       req.user?.id || null]
    ) as any[];
    const studentId = (result as any).insertId;

    if (Array.isArray(parents_guardians)) {
      for (const pg of parents_guardians) {
        if (pg.name) {
          await conn.execute(
            'INSERT INTO parents_teachers (student_id, role, name, contact_number) VALUES (?, ?, ?, ?)',
            [studentId, pg.role, pg.name, pg.contact_number || null]
          );
        }
      }
    }

    await conn.commit();
    res.status(201).json({ id: studentId, message: 'Student registered successfully' });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'LRN already registered' });
      return;
    }
    console.error('createStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// ─── GET /api/students/:id ────────────────────────────────────────────
export async function getStudentById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const [students] = await pool.execute(
      'SELECT * FROM students WHERE id = ?', [id]
    ) as any[];
    if ((students as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    const [guardians] = await pool.execute(
      'SELECT * FROM parents_teachers WHERE student_id = ?', [id]
    ) as any[];
    res.json({ ...(students as any[])[0], parents_guardians: guardians });
  } catch (err) {
    console.error('getStudentById error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PUT /api/students/:id ────────────────────────────────────────────
export async function updateStudent(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, gender, grade, section, mac_address, rfid_uid, preferred_method } = req.body;

    await pool.execute(
      `UPDATE students SET name=?, gender=?, grade=?, section=?, mac_address=?, rfid_uid=?, preferred_method=?, updated_by=?
       WHERE id=?`,
      [name,
       gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : (gender || null),
       grade || null, section || null, mac_address || null, rfid_uid || null,
       preferred_method || 'QR',
       req.user!.id, id]
    );
    res.json({ message: 'Student updated' });
  } catch (err) {
    console.error('updateStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/students/:id/attendance ────────────────────────────────
// Returns confirmed attendance records + pending kiosk scans for parent portal.
// Shows ALL records including subject-specific ones so parents see the full picture.
// Records hidden by the parent (via parent_hidden_attendance) are excluded.
export async function getStudentAttendance(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id }   = req.params;
    const from     = req.query.from as string;
    const to       = req.query.to   as string;

    // Resolve parent_id for filtering hidden records
    let parentId: number | null = null;
    if (req.user?.role === 'parent' && req.user?.profileId) {
      parentId = req.user.profileId as number;
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
    const p: any[] = [id];

    if (from) { q += ' AND date >= ?'; p.push(from); }
    if (to)   { q += ' AND date <= ?'; p.push(to); }

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
    const pPartial: any[] = [id];

    if (from) { qPartial += ' AND date >= ?'; pPartial.push(from); }
    if (to)   { qPartial += ' AND date <= ?'; pPartial.push(to); }

    if (parentId) {
      qPartial += ` AND id NOT IN (
        SELECT CAST(record_id AS UNSIGNED) FROM parent_hidden_attendance
        WHERE parent_id = ? AND record_type = 'pending'
      )`;
      pPartial.push(parentId);
    }

    const [confirmed] = await pool.execute(
      q + ' ORDER BY date DESC, timestamp DESC', p
    ) as any[];

    const [pending] = await pool.execute(
      qPartial + ' ORDER BY date DESC, scanned_at DESC', pPartial
    ) as any[];

    // ── Merge Time-In and Time-Out records by date/session with LATEST times ───────────
    // Strategy: Group by date+session, but use the LATEST time_in and LATEST time_out
    // This allows multiple in/out cycles per day while showing both times in one row
    
    interface MergedRecord {
      date_str: string;
      session: string;
      time_in: string | null;
      time_out: string | null;
      time_in_timestamp: Date | null;
      time_out_timestamp: Date | null;
      [key: string]: any;
    }
    
    const recordMap = new Map<string, MergedRecord>();

    // Helper to parse time and create full timestamp for comparison
    const parseTimeToTimestamp = (dateStr: string, timeStr: string | null): Date | null => {
      if (!timeStr) return null;
      // Parse "H:MM:SS AM/PM" format
      const match = timeStr.match(/(\d+):(\d+):(\d+)\s*(AM|PM)/i);
      if (!match) return null;
      
      let hours = parseInt(match[1]);
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      const meridiem = match[4].toUpperCase();
      
      // Convert to 24-hour format
      if (meridiem === 'PM' && hours !== 12) hours += 12;
      if (meridiem === 'AM' && hours === 12) hours = 0;
      
      const date = new Date(dateStr);
      date.setHours(hours, minutes, seconds, 0);
      return date;
    };

    // Process all confirmed records
    (confirmed as any[]).forEach((record: any) => {
      const key = `${record.date_str}_${(record.session || 'AM').toUpperCase()}`;
      
      if (!recordMap.has(key)) {
        recordMap.set(key, {
          ...record,
          date_str: record.date_str,
          date: record.date_str,
          session: record.session,
          record_type: 'confirmed',
          status_label: record.status,
          time_in_timestamp: parseTimeToTimestamp(record.date_str, record.time_in),
          time_out_timestamp: parseTimeToTimestamp(record.date_str, record.time_out),
        });
      } else {
        const existing = recordMap.get(key)!;
        
        // Update time_in if this record has a LATER time_in
        if (record.time_in) {
          const newTimeIn = parseTimeToTimestamp(record.date_str, record.time_in);
          if (!existing.time_in_timestamp || (newTimeIn && newTimeIn > existing.time_in_timestamp)) {
            existing.time_in = record.time_in;
            existing.time_in_timestamp = newTimeIn;
          }
        }
        
        // Update time_out if this record has a LATER time_out
        if (record.time_out) {
          const newTimeOut = parseTimeToTimestamp(record.date_str, record.time_out);
          if (!existing.time_out_timestamp || (newTimeOut && newTimeOut > existing.time_out_timestamp)) {
            existing.time_out = record.time_out;
            existing.time_out_timestamp = newTimeOut;
          }
        }
      }
    });

    // Process all pending records
    (pending as any[]).forEach((record: any) => {
      const key = `${record.date_str}_${(record.session || 'AM').toUpperCase()}`;
      
      if (!recordMap.has(key)) {
        recordMap.set(key, {
          ...record,
          date_str: record.date_str,
          date: record.date_str,
          session: record.session,
          record_type: 'pending',
          status_label: `${record.status} (pending)`,
          time_in_timestamp: parseTimeToTimestamp(record.date_str, record.time_in),
          time_out_timestamp: parseTimeToTimestamp(record.date_str, record.time_out),
        });
      } else {
        const existing = recordMap.get(key)!;
        
        // Update time_in if this pending record has a LATER time_in
        if (record.time_in) {
          const newTimeIn = parseTimeToTimestamp(record.date_str, record.time_in);
          if (!existing.time_in_timestamp || (newTimeIn && newTimeIn > existing.time_in_timestamp)) {
            existing.time_in = record.time_in;
            existing.time_in_timestamp = newTimeIn;
            // Mark as pending if we're using pending data
            if (existing.record_type === 'confirmed') {
              existing.status_label = existing.status || record.status;
            }
          }
        }
        
        // Update time_out if this pending record has a LATER time_out
        if (record.time_out) {
          const newTimeOut = parseTimeToTimestamp(record.date_str, record.time_out);
          if (!existing.time_out_timestamp || (newTimeOut && newTimeOut > existing.time_out_timestamp)) {
            existing.time_out = record.time_out;
            existing.time_out_timestamp = newTimeOut;
          }
        }
      }
    });

    // Convert map to array and sort
    const all = Array.from(recordMap.values()).sort((a, b) => 
      new Date(b.date_str).getTime() - new Date(a.date_str).getTime()
    );

    console.log(`📊 Student ${id} attendance: ${confirmed.length} confirmed + ${pending.length} pending = ${all.length} merged records (showing latest time_in and time_out per session)`);

    res.json(all);
  } catch (err) {
    console.error('getStudentAttendance error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/students/:id/attendance/:recordId/hide ───────────────
// Parent hides an attendance record from their view (does NOT delete from DB)
export async function hideAttendanceRecord(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id, recordId } = req.params;
    const recordType = ((req.query.type as string) || 'confirmed') as 'confirmed' | 'pending';

    if (!req.user?.profileId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const parentId = req.user.profileId;

    // Verify this student belongs to this parent
    const [linkRows] = await pool.execute(
      'SELECT id FROM parent_student WHERE parent_id = ? AND student_id = ?',
      [parentId, id]
    ) as any[];
    if (!(linkRows as any[]).length) {
      res.status(403).json({ error: 'This student is not linked to your account' });
      return;
    }

    await pool.execute(
      `INSERT IGNORE INTO parent_hidden_attendance (parent_id, record_id, record_type)
       VALUES (?, ?, ?)`,
      [parentId, String(recordId), recordType]
    );

    res.json({ success: true, message: 'Record hidden from your view' });
  } catch (err) {
    console.error('hideAttendanceRecord error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/students/:id/sms-logs ──────────────────────────────────────
export async function getStudentSmsLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    // Get SMS logs for this student
    const [logs] = await pool.execute(
      `SELECT 
        id, student_name, parent_name, phone_number, message, 
        status, provider, sent_at, created_at
       FROM sms_logs 
       WHERE student_name = (SELECT name FROM students WHERE id = ?)
       ORDER BY created_at DESC
       LIMIT 100`,
      [id]
    ) as any[];
    
    res.json(logs);
  } catch (err) {
    console.error('Error fetching SMS logs:', err);
    res.status(500).json({ error: 'Failed to fetch SMS logs' });
  }
}

// ─── DELETE /api/students/:id/sms-logs/clear ─────────────────────────────
export async function clearStudentSmsLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    
    console.log(`🗑️  Parent clearing SMS history for student ${id}...`);
    
    // Get student name first
    const [students] = await pool.execute(
      'SELECT name FROM students WHERE id = ?',
      [id]
    ) as any[];
    
    if ((students as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }
    
    const studentName = (students as any[])[0].name;
    
    // Count before deletion
    const [countBefore] = await pool.execute(
      'SELECT COUNT(*) as total FROM sms_logs WHERE student_name = ?',
      [studentName]
    ) as any[];
    const totalBefore = (countBefore as any[])[0].total;
    
    // Delete SMS logs for this student only
    const [result] = await pool.execute(
      'DELETE FROM sms_logs WHERE student_name = ?',
      [studentName]
    ) as any[];
    
    console.log(`✅ Deleted ${(result as any).affectedRows} SMS logs for ${studentName}`);
    
    res.json({
      success: true,
      message: 'SMS history cleared successfully',
      deletedCount: (result as any).affectedRows,
      previousCount: totalBefore
    });
  } catch (err) {
    console.error('Error clearing student SMS logs:', err);
    res.status(500).json({ error: 'Failed to clear SMS history' });
  }
}
