import { Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';
import { emitAssignmentChange } from '../src/websocket/socketHandler';

// Cache for runtime schema checks to avoid querying information_schema on every request
let _subjectTeacherColumnCache: { has?: boolean; ts?: number } = {};
let _sessionColumnCache: { has?: boolean; ts?: number } = {};

async function hasSubjectTeacherColumn(): Promise<boolean> {
  const now = Date.now();
  if (_subjectTeacherColumnCache.ts && now - (_subjectTeacherColumnCache.ts || 0) < 60_000) {
    return !!_subjectTeacherColumnCache.has;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assignments' AND COLUMN_NAME = 'subject_teacher_id'`
    ) as any[];
    const has = rows && rows[0] && Number(rows[0].cnt) > 0;
    _subjectTeacherColumnCache = { has, ts: now };
    return has;
  } catch (err) {
    console.warn('Could not determine subject_teacher_id column existence, assuming false', err);
    _subjectTeacherColumnCache = { has: false, ts: now };
    return false;
  }
}

async function hasSessionColumn(): Promise<boolean> {
  const now = Date.now();
  if (_sessionColumnCache.ts && now - (_sessionColumnCache.ts || 0) < 60_000) {
    return !!_sessionColumnCache.has;
  }
  try {
    const [rows] = await pool.execute(
      `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assignments' AND COLUMN_NAME = 'session'`
    ) as any[];
    const has = rows && rows[0] && Number(rows[0].cnt) > 0;
    _sessionColumnCache = { has, ts: now };
    return has;
  } catch (err) {
    console.warn('Could not determine session column existence, assuming false', err);
    _sessionColumnCache = { has: false, ts: now };
    return false;
  }
}

export async function getAssignments(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeSubjectTeacher = await hasSubjectTeacherColumn();
    const includeSession        = await hasSessionColumn();

    const sessionCol   = includeSession        ? ', a.session'              : ", 'AM' AS session";
    const subjectCols  = includeSubjectTeacher
      ? `, a.subject_teacher_id,
                st.name AS subject_teacher_name,
                su.username AS subject_teacher_username`
      : `, NULL AS subject_teacher_id,
                NULL AS subject_teacher_name,
                NULL AS subject_teacher_username`;
    const subjectJoins = includeSubjectTeacher
      ? `LEFT JOIN teachers st ON st.id = a.subject_teacher_id
         LEFT JOIN users su ON su.id = st.user_id`
      : '';
    const subjectGroup = includeSubjectTeacher
      ? ', a.subject_teacher_id, st.name, su.username'
      : '';

    const [rows] = await pool.execute(
      `SELECT a.id, a.year_level, a.strand, a.track, a.section, a.subject
              ${sessionCol}
              ${subjectCols},
              a.teacher_id,
              t.name AS adviser_name,
              u.username AS adviser_username,
              COUNT(asg.student_id) AS student_count
       FROM assignments a
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN users u ON u.id = t.user_id
       ${subjectJoins}
       LEFT JOIN assignment_students asg ON asg.assignment_id = a.id
       GROUP BY a.id, a.year_level, a.strand, a.track, a.section, a.subject,
                a.teacher_id, t.name, u.username ${subjectGroup}
       ORDER BY a.year_level, a.strand, a.track, a.section, a.subject`,
      []
    ) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getAssignments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /admin/assignments/grouped ─────────────────────────────────
// Returns assignments grouped by (year_level + strand + track + section)
// Each group = one "class block" in Image 1 layout
export async function getAssignmentsGrouped(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const includeSession = await hasSessionColumn();
    const sessionCol     = includeSession ? ', a.session' : ", 'AM' AS session";

    const [rows] = await pool.execute(
      `SELECT a.id, a.year_level, a.strand, a.track, a.section, a.subject
              ${sessionCol},
              a.teacher_id,
              t.name AS adviser_name,
              u.username AS adviser_username,
              a.subject_teacher_id,
              st.name AS subject_teacher_name,
              su.username AS subject_teacher_username,
              COUNT(DISTINCT asg.student_id) AS student_count,
              GROUP_CONCAT(DISTINCT asg.student_id ORDER BY asg.student_id SEPARATOR ',') AS student_ids_csv
       FROM assignments a
       LEFT JOIN teachers t ON t.id = a.teacher_id
       LEFT JOIN users u ON u.id = t.user_id
       LEFT JOIN teachers st ON st.id = a.subject_teacher_id
       LEFT JOIN users su ON su.id = st.user_id
       LEFT JOIN assignment_students asg ON asg.assignment_id = a.id
       GROUP BY a.id, a.year_level, a.strand, a.track, a.section, a.subject,
                a.teacher_id, t.name, u.username,
                a.subject_teacher_id, st.name, su.username
       ORDER BY a.year_level, a.strand, a.track, a.section, a.subject`,
      []
    ) as any[];

    // Parse student_ids_csv into arrays
    const rowsWithIds = (rows as any[]).map((r) => ({
      ...r,
      session:       r.session       || 'AM',
      student_ids:   r.student_ids_csv ? r.student_ids_csv.split(',').map(Number) : [],
      student_count: Number(r.student_count),
    }));

    // Group by section key
    const groups: Record<string, any> = {};
    for (const row of rowsWithIds) {
      const key = `${row.year_level}|${row.strand || ''}|${row.track || ''}|${row.section}`;
      if (!groups[key]) {
        groups[key] = {
          key,
          year_level:       row.year_level,
          strand:           row.strand,
          track:            row.track,
          section:          row.section,
          adviser_id:       row.teacher_id,
          adviser_name:     row.adviser_name,
          adviser_username: row.adviser_username,
          subjects: [],
        };
      }
      groups[key].subjects.push({
        id:                        row.id,
        subject:                   row.subject,
        session:                   row.session,
        subject_teacher_id:        row.subject_teacher_id,
        subject_teacher_name:      row.subject_teacher_name,
        subject_teacher_username:  row.subject_teacher_username,
        student_count:             row.student_count,
        student_ids:               row.student_ids,
      });
    }

    res.json(Object.values(groups));
  } catch (err) {
    console.error('getAssignmentsGrouped error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function getAssignmentsMetadata(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [teacherRows] = await pool.execute(
      `SELECT t.id, t.name, u.username
       FROM teachers t
       LEFT JOIN users u ON u.id = t.user_id
       ORDER BY t.name`
    ) as any[];

    const [studentRows] = await pool.execute(
      `SELECT s.id, s.lrn, s.name, s.grade, s.section,
              GROUP_CONCAT(asg.assignment_id ORDER BY asg.assignment_id SEPARATOR ',') AS assignment_ids
       FROM students s
       LEFT JOIN assignment_students asg ON asg.student_id = s.id
       WHERE s.is_active = 1
       GROUP BY s.id
       ORDER BY s.name`
    ) as any[];

    const students = studentRows.map((student: any) => ({
      ...student,
      assignment_ids: student.assignment_ids ? student.assignment_ids.split(',').map((id: string) => Number(id)) : [],
      assignment_id: student.assignment_ids ? Number(student.assignment_ids.split(',')[0]) : null,
    }));

    res.json({ teachers: teacherRows, students });
  } catch (err) {
    console.error('getAssignmentsMetadata error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

export async function createAssignment(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { year_level, strand, track, section, subject, teacher_id, subject_teacher_id, student_ids, session } = req.body;

    if (!year_level || !section || !subject) {
      res.status(400).json({ error: 'year_level, section, and subject are required' });
      return;
    }

    const includeSubjectTeacher = await hasSubjectTeacherColumn();
    const includeSession        = await hasSessionColumn();

    // Determine session value: advisers default to BOTH, subject teachers default to AM
    const sessionVal = session || (subject_teacher_id ? 'AM' : 'BOTH');

    let result: any;
    if (includeSubjectTeacher && includeSession) {
      [result] = await conn.execute(
        `INSERT INTO assignments
           (year_level, strand, track, section, subject, teacher_id, subject_teacher_id, session, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, subject_teacher_id || null, sessionVal, req.user!.id]
      ) as any[];
    } else if (includeSubjectTeacher) {
      [result] = await conn.execute(
        `INSERT INTO assignments
           (year_level, strand, track, section, subject, teacher_id, subject_teacher_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, subject_teacher_id || null, req.user!.id]
      ) as any[];
    } else {
      [result] = await conn.execute(
        `INSERT INTO assignments
           (year_level, strand, track, section, subject, teacher_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, req.user!.id]
      ) as any[];
    }

    const assignmentId = (result as any).insertId;

    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const values = student_ids.map((studentId: number) => [assignmentId, studentId, req.user!.id]);
      await conn.query(
        `INSERT IGNORE INTO assignment_students (assignment_id, student_id, created_by)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    
    // Broadcast assignment change via WebSocket
    emitAssignmentChange({
      action: 'created',
      assignmentId: assignmentId,
      section: section,
      subject: subject,
      timestamp: new Date(),
    });
    
    res.status(201).json({ message: 'Assignment created', id: assignmentId });
  } catch (err) {
    await conn.rollback();
    console.error('createAssignment error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

export async function updateAssignment(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { year_level, strand, track, section, subject, teacher_id, subject_teacher_id, student_ids, session } = req.body;

    if (!year_level || !section || !subject) {
      res.status(400).json({ error: 'year_level, section, and subject are required' });
      return;
    }

    const includeSubjectTeacher = await hasSubjectTeacherColumn();
    const includeSession        = await hasSessionColumn();
    const sessionVal            = session || (subject_teacher_id ? 'AM' : 'BOTH');

    if (includeSubjectTeacher && includeSession) {
      await conn.execute(
        `UPDATE assignments
         SET year_level = ?, strand = ?, track = ?, section = ?, subject = ?,
             teacher_id = ?, subject_teacher_id = ?, session = ?, updated_by = ?
         WHERE id = ?`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, subject_teacher_id || null, sessionVal, req.user!.id, id]
      );
    } else if (includeSubjectTeacher) {
      await conn.execute(
        `UPDATE assignments
         SET year_level = ?, strand = ?, track = ?, section = ?, subject = ?,
             teacher_id = ?, subject_teacher_id = ?, updated_by = ?
         WHERE id = ?`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, subject_teacher_id || null, req.user!.id, id]
      );
    } else {
      await conn.execute(
        `UPDATE assignments
         SET year_level = ?, strand = ?, track = ?, section = ?, subject = ?,
             teacher_id = ?, updated_by = ?
         WHERE id = ?`,
        [year_level, strand || null, track || null, section, subject,
         teacher_id || null, req.user!.id, id]
      );
    }

    await conn.execute(
      'DELETE FROM assignment_students WHERE assignment_id = ?',
      [id]
    );

    if (Array.isArray(student_ids) && student_ids.length > 0) {
      const values = student_ids.map((studentId: number) => [id, studentId, req.user!.id]);
      await conn.query(
        `INSERT IGNORE INTO assignment_students (assignment_id, student_id, created_by)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    
    // Broadcast assignment change via WebSocket
    emitAssignmentChange({
      action: 'updated',
      assignmentId: Number(id),
      section: section,
      subject: subject,
      timestamp: new Date(),
    });
    
    res.json({ message: 'Assignment updated' });
  } catch (err) {
    await conn.rollback();
    console.error('updateAssignment error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

export async function deleteAssignment(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await pool.execute('DELETE FROM assignments WHERE id = ?', [id]);
    
    // Broadcast assignment change via WebSocket
    emitAssignmentChange({
      action: 'deleted',
      assignmentId: Number(id),
      timestamp: new Date(),
    });
    
    res.json({ message: 'Assignment deleted' });
  } catch (err) {
    console.error('deleteAssignment error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /admin/assignments/section-adviser ────────────────────────
// Updates adviser (teacher_id) for ALL rows matching a given section block
export async function updateSectionAdviser(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { year_level, strand, track, section, adviser_id } = req.body;
    if (!year_level || !section) {
      res.status(400).json({ error: 'year_level and section are required' });
      return;
    }
    await pool.execute(
      `UPDATE assignments
       SET teacher_id = ?, updated_by = ?
       WHERE year_level = ?
         AND (strand IS NULL AND ? IS NULL OR strand = ?)
         AND (track IS NULL AND ? IS NULL OR track = ?)
         AND section = ?`,
      [
        adviser_id || null, req.user!.id,
        year_level,
        strand || null, strand || null,
        track || null, track || null,
        section,
      ]
    );
    
    // Broadcast assignment change via WebSocket
    emitAssignmentChange({
      action: 'updated',
      section: section,
      timestamp: new Date(),
    });
    
    res.json({ message: 'Adviser updated for section' });
  } catch (err) {
    console.error('updateSectionAdviser error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /admin/assignments/section-students ───────────────────────
// Sets the shared student roster for ALL assignment rows in a section.
// Deletes existing assignment_students for all rows in the section,
// then re-inserts the new list for every row. This enforces one shared
// student group per section across all subjects.
export async function updateSectionStudents(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { year_level, strand, track, section, student_ids } = req.body;
    if (!year_level || !section) {
      res.status(400).json({ error: 'year_level and section are required' });
      return;
    }

    // Get all assignment IDs for this section
    const [asgRows] = await conn.execute(
      `SELECT id FROM assignments
       WHERE year_level = ?
         AND (strand IS NULL AND ? IS NULL OR strand = ?)
         AND (track IS NULL AND ? IS NULL OR track = ?)
         AND section = ?`,
      [
        year_level,
        strand || null, strand || null,
        track || null, track || null,
        section,
      ]
    ) as any[];

    const assignmentIds = (asgRows as any[]).map((r: any) => r.id);
    if (assignmentIds.length === 0) {
      res.json({ message: 'No assignments found for this section', updated: 0 });
      return;
    }

    // Delete all existing student links for this section
    for (const asgId of assignmentIds) {
      await conn.execute(
        'DELETE FROM assignment_students WHERE assignment_id = ?',
        [asgId]
      );
    }

    // Re-insert students for all assignment rows in this section
    if (Array.isArray(student_ids) && student_ids.length > 0) {
      for (const asgId of assignmentIds) {
        const values = student_ids.map((studentId: number) => [asgId, studentId, req.user!.id]);
        await conn.query(
          `INSERT IGNORE INTO assignment_students (assignment_id, student_id, created_by)
           VALUES ?`,
          [values]
        );
      }
    }

    await conn.commit();
    
    // Broadcast assignment change via WebSocket
    emitAssignmentChange({
      action: 'updated',
      section: section,
      timestamp: new Date(),
    });
    
    res.json({
      message: `Student roster updated for section ${section}`,
      assignments_updated: assignmentIds.length,
      students_count: Array.isArray(student_ids) ? student_ids.length : 0,
    });
  } catch (err) {
    await conn.rollback();
    console.error('updateSectionStudents error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}
