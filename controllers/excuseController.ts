import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import pool from '../lib/db';
import { createNotification } from './notificationController';
import { format } from 'date-fns';
import { buildTeacherRoleLabel } from './teacherController';

// ─── Helper: get parent row from DB ──────────────────────────────────
async function getParentRow(userId: number): Promise<any | null> {
  const [rows]: any = await pool.query(
    `SELECT p.id, p.user_id, p.name, p.contact
     FROM parents p WHERE p.user_id = ? LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ─── Helper: get teacher for a student's section ──────────────────────
async function getTeacherForStudent(studentId: number): Promise<any | null> {
  const [rows]: any = await pool.query(
    `SELECT t.id, t.user_id, t.name, t.section
     FROM teachers t
     JOIN students s ON LOWER(s.section) = LOWER(t.section)
     WHERE s.id = ?
     LIMIT 1`,
    [studentId]
  );
  return rows.length > 0 ? rows[0] : null;
}

// ─── POST /parent/excuse ──────────────────────────────────────────────
// Parent submits an excuse for their child's absence
export async function submitExcuse(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { student_id, date, reason, attendance_id } = req.body;

    if (!student_id || !date || !reason?.trim())
      return res.status(400).json({ error: 'student_id, date, and reason are required' });

    const parent = await getParentRow(userId);
    if (!parent) return res.status(404).json({ error: 'Parent profile not found' });

    // Verify this parent is linked to this student
    const [link]: any = await pool.query(
      `SELECT id FROM parent_student WHERE parent_id = ? AND student_id = ?`,
      [parent.id, student_id]
    );
    if (!link.length) return res.status(403).json({ error: 'Not authorized for this student' });

    // Find the teacher for this student
    const teacher = await getTeacherForStudent(student_id);

    // Check no duplicate pending request for same student + date
    const [existing]: any = await pool.query(
      `SELECT id FROM excuse_requests
       WHERE student_id = ? AND date = ? AND status = 'pending'`,
      [student_id, date]
    );
    if (existing.length)
      return res.status(409).json({ error: 'A pending excuse request already exists for this date' });

    // Get student name
    const [studentRows]: any = await pool.query(
      `SELECT name FROM students WHERE id = ?`, [student_id]
    );
    const studentName = studentRows[0]?.name || 'Student';

    // Insert excuse request
    const [result]: any = await pool.query(
      `INSERT INTO excuse_requests
         (student_id, parent_id, teacher_id, attendance_id, date, reason, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
      [student_id, parent.id, teacher?.id || null, attendance_id || null, date, reason.trim()]
    );

    // Notify the teacher via in-app notification
    if (teacher?.user_id) {
      await createNotification(
        teacher.user_id,
        '📋 New Excuse Request',
        `${parent.name} submitted an excuse for ${studentName} on ${format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}`,
        'info',
        '/teacher'
      );
    }

    res.status(201).json({
      success: true,
      message: 'Excuse request submitted successfully',
      excuseId: result.insertId,
    });
  } catch (error) {
    console.error('Error submitting excuse:', error);
    res.status(500).json({ error: 'Failed to submit excuse request' });
  }
}

// ─── GET /parent/excuse-requests ─────────────────────────────────────
// Parent views their submitted excuse requests
export async function getParentExcuseRequests(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const parent = await getParentRow(userId);
    if (!parent) return res.status(404).json({ error: 'Parent profile not found' });

    const [rows]: any = await pool.query(
      `SELECT er.id, er.student_id,
              DATE_FORMAT(er.date, '%Y-%m-%d') AS date,
              er.reason,
              er.status, er.teacher_note, er.created_at, er.resolved_at,
              s.name AS student_name,
              t.name AS teacher_name
       FROM excuse_requests er
       JOIN students  s ON s.id = er.student_id
       LEFT JOIN teachers t ON t.id = er.teacher_id
       WHERE er.parent_id = ?
       ORDER BY er.created_at DESC
       LIMIT 50`,
      [parent.id]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching excuse requests:', error);
    res.status(500).json({ error: 'Failed to fetch excuse requests' });
  }
}

// ─── GET /teacher/excuse-requests ────────────────────────────────────
// Teacher views pending excuse requests for their class.
// For advisers: matches by section.
// For subject teachers: matches by assignment_id (students in that assignment).
export async function getTeacherExcuseRequests(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [tRows]: any = await pool.query(
      `SELECT id, name, section FROM teachers WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher profile not found' });
    const teacher = tRows[0];

    const statusFilter = (req.query.status as string) || 'pending';
    const assignmentId = req.query.assignment_id ? Number(req.query.assignment_id) : null;

    let rows: any[];

    if (assignmentId) {
      // ── Subject teacher mode: fetch requests for students in this specific assignment ──
      rows = (await pool.query(
        `SELECT er.id, er.student_id,
                DATE_FORMAT(er.date, '%Y-%m-%d') AS date,
                er.reason,
                er.status, er.teacher_note, er.created_at, er.resolved_at,
                s.name AS student_name, s.lrn, s.section,
                p.name AS parent_name, p.contact AS parent_contact
         FROM excuse_requests er
         JOIN students s ON s.id = er.student_id
         JOIN assignment_students asg ON asg.student_id = s.id
         LEFT JOIN parents p ON p.id = er.parent_id
         WHERE asg.assignment_id = ?
           AND (? = 'all' OR er.status = ?)
         GROUP BY er.id
         ORDER BY er.status ASC, er.created_at DESC`,
        [assignmentId, statusFilter, statusFilter]
      ) as any[])[0];
    } else {
      // ── Adviser mode: fetch requests for ALL students in any of this teacher's advisory assignments ──
      rows = (await pool.query(
        `SELECT er.id, er.student_id,
                DATE_FORMAT(er.date, '%Y-%m-%d') AS date,
                er.reason,
                er.status, er.teacher_note, er.created_at, er.resolved_at,
                s.name AS student_name, s.lrn, s.section,
                p.name AS parent_name, p.contact AS parent_contact
         FROM excuse_requests er
         JOIN students s ON s.id = er.student_id
         JOIN assignment_students asg ON asg.student_id = s.id
         JOIN assignments a ON a.id = asg.assignment_id
         LEFT JOIN parents p ON p.id = er.parent_id
         WHERE a.teacher_id = ?
           AND (? = 'all' OR er.status = ?)
         GROUP BY er.id
         ORDER BY er.status ASC, er.created_at DESC`,
        [teacher.id, statusFilter, statusFilter]
      ) as any[])[0];
    }

    const pendingCount = rows.filter((r: any) => r.status === 'pending').length;
    res.json({ requests: rows, pendingCount });
  } catch (error) {
    console.error('Error fetching teacher excuse requests:', error);
    res.status(500).json({ error: 'Failed to fetch excuse requests' });
  }
}

// ─── PATCH /teacher/excuse-requests/:id ──────────────────────────────
// Teacher approves or rejects an excuse request
export async function resolveExcuseRequest(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { id } = req.params;
    const { action, teacher_note } = req.body; // action: 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action))
      return res.status(400).json({ error: "action must be 'approve' or 'reject'" });

    // Get the excuse request
    const [excuseRows]: any = await pool.query(
      `SELECT er.*, s.name AS student_name, s.section,
              p.user_id AS parent_user_id, p.name AS parent_name, p.contact AS parent_contact
       FROM excuse_requests er
       JOIN students s ON s.id = er.student_id
       JOIN parents  p ON p.id = er.parent_id
       WHERE er.id = ?`,
      [id]
    );
    if (!excuseRows.length) return res.status(404).json({ error: 'Excuse request not found' });
    const excuse = excuseRows[0];

    if (excuse.status !== 'pending') {
      // Allow re-resolving only if explicitly forced (e.g., changing from approved→rejected)
      const force = req.body.force === true;
      if (!force)
        return res.status(409).json({
          error: 'This request has already been resolved',
          currentStatus: excuse.status,
        });
    }

    // Verify teacher owns this section
    const [tRows]: any = await pool.query(
      `SELECT id, name, section FROM teachers WHERE user_id = ? LIMIT 1`,
      [userId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found' });

    // Allow if teacher is the adviser (via assignments) OR subject teacher assigned to this student
    const [authCheck]: any = await pool.query(
      `SELECT asg.id FROM assignment_students asg
       JOIN assignments a ON a.id = asg.assignment_id
       WHERE asg.student_id = ?
         AND (a.teacher_id = ? OR a.subject_teacher_id = ?)
       LIMIT 1`,
      [excuse.student_id, tRows[0].id, tRows[0].id]
    );
    if (!authCheck.length)
      return res.status(403).json({ error: 'This student is not in your class' });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // Update excuse request status
    await pool.query(
      `UPDATE excuse_requests
       SET status = ?, teacher_note = ?, resolved_at = NOW()
       WHERE id = ?`,
      [newStatus, teacher_note || null, id]
    );

    // If APPROVED → set attendance status to 'Excused'
    if (action === 'approve') {
      const roleLabel = await buildTeacherRoleLabel(tRows[0].id, excuse.section);
      const excuseNote = `Excused by ${tRows[0].name} (${roleLabel})`;

      // Get full student info for potential INSERT
      const [studentRows]: any = await pool.query(
        `SELECT id, name, lrn, gender, grade, section FROM students WHERE id = ? LIMIT 1`,
        [excuse.student_id]
      );
      const student = studentRows[0];

      console.log(`[Excuse Approve] teacher=${tRows[0].name}, student=${student?.name}, section=${excuse.section}, date=${excuse.date}, attendance_id=${excuse.attendance_id}`);

      try {
        if (excuse.attendance_id) {
          console.log(`[Excuse Approve] Updating attendance id=${excuse.attendance_id} → Excused`);
          await pool.query(
            `UPDATE attendance
             SET status = 'Excused', is_overridden = 1,
                 teacher_id = ?, teacher_name = ?,
                 notes = CONCAT(IFNULL(notes,''), ' | ', ?)
             WHERE id = ?`,
            [tRows[0].id, tRows[0].name, excuseNote, excuse.attendance_id]
          );
        } else {
          // Look for an existing attendance record on that date
          const [attRows]: any = await pool.query(
            `SELECT id FROM attendance
             WHERE student_id = ? AND DATE(CONVERT_TZ(date,'+00:00','+08:00')) = ?
             LIMIT 1`,
            [excuse.student_id, excuse.date]
          );

          if (attRows.length) {
            console.log(`[Excuse Approve] Updating found attendance id=${attRows[0].id} → Excused`);
            await pool.query(
              `UPDATE attendance
               SET status = 'Excused', is_overridden = 1,
                   teacher_id = ?, teacher_name = ?,
                   notes = CONCAT(IFNULL(notes,''), ' | ', ?)
               WHERE id = ?`,
              [tRows[0].id, tRows[0].name, excuseNote, attRows[0].id]
            );
          } else if (student) {
            console.log(`[Excuse Approve] No attendance record found — inserting new Excused record`);
            await pool.query(
              `INSERT INTO attendance
                 (student_id, student_name, lrn, gender, grade, section,
                  scan_method, status, session, date,
                  teacher_id, teacher_name, is_overridden, notes)
               VALUES (?, ?, ?, ?, ?, ?, 'Manual', 'Excused', 'AM', ?,
                       ?, ?, 1, ?)`,
              [
                student.id, student.name, student.lrn, student.gender,
                student.grade, student.section,
                excuse.date,
                tRows[0].id, tRows[0].name,
                excuseNote,
              ]
            );
          }
        }
      } catch (attErr: any) {
        console.error('[Excuse Approve] Attendance update/insert failed:', attErr.message, attErr.sqlMessage || '');
        // Don't fail the whole request — excuse is still approved, attendance update is best-effort
      }
    }

    // Notify parent via in-app notification
    const actionText = action === 'approve' ? '✅ Approved' : '❌ Rejected';
    // Safely convert date — it may come back as a Date object or string from MySQL
    const rawDate = excuse.date instanceof Date
      ? excuse.date.toISOString().split('T')[0]
      : String(excuse.date).split('T')[0];
    const dateStr = format(new Date(rawDate + 'T00:00:00'), 'MMM d, yyyy');

    if (excuse.parent_user_id) {
      await createNotification(
        excuse.parent_user_id,
        `${actionText}: Excuse for ${excuse.student_name}`,
        action === 'approve'
          ? `Your excuse request for ${excuse.student_name} on ${dateStr} was approved.${teacher_note ? ' Note: ' + teacher_note : ''}`
          : `Your excuse request for ${excuse.student_name} on ${dateStr} was rejected.${teacher_note ? ' Reason: ' + teacher_note : ''}`,
        action === 'approve' ? 'info' : 'warning',
        '/parent'
      );
    }

    res.json({
      success: true,
      message: `Excuse request ${newStatus}`,
      status: newStatus,
    });
  } catch (error) {
    console.error('Error resolving excuse request:', error);
    res.status(500).json({ error: 'Failed to resolve excuse request' });
  }
}

export default {
  submitExcuse,
  getParentExcuseRequests,
  getTeacherExcuseRequests,
  resolveExcuseRequest,
  deleteExcuseRequest,
};
export async function deleteExcuseRequest(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Verify teacher owns this section
    const [tRows]: any = await pool.query(
      'SELECT id, section FROM teachers WHERE user_id = ? LIMIT 1', [userId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found' });

    // Allow if adviser for the section OR subject teacher assigned to the student
    const [excuseRows]: any = await pool.query(
      `SELECT er.id, er.student_id, s.section FROM excuse_requests er
       JOIN students s ON s.id = er.student_id
       WHERE er.id = ?`,
      [id]
    );
    if (!excuseRows.length)
      return res.status(404).json({ error: 'Excuse request not found' });

    // Allow if adviser (via assignments) OR subject teacher assigned to this student
    const [asgCheck]: any = await pool.query(
      `SELECT asg.id FROM assignment_students asg
       JOIN assignments a ON a.id = asg.assignment_id
       WHERE asg.student_id = ?
         AND (a.teacher_id = ? OR a.subject_teacher_id = ?)
       LIMIT 1`,
      [excuseRows[0].student_id, tRows[0].id, tRows[0].id]
    );
    if (!asgCheck.length)
      return res.status(404).json({ error: 'Excuse request not found or not in your class' });

    await pool.query('DELETE FROM excuse_requests WHERE id = ?', [id]);

    res.json({ success: true, message: 'Excuse request deleted' });
  } catch (error) {
    console.error('Error deleting excuse request:', error);
    res.status(500).json({ error: 'Failed to delete excuse request' });
  }
}
