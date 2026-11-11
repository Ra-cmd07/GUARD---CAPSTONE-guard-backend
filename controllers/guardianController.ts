import { Request, Response } from 'express';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── POST /api/guardians ──────────────────────────────────────────────
export async function createGuardian(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { student_id, student_name, role, name, contact_number } = req.body;

    if (!name) {
      res.status(400).json({ error: 'name is required' });
      return;
    }

    // Resolve student_id from student_name if not provided
    let resolvedStudentId = student_id;
    if (!resolvedStudentId && student_name) {
      const [rows] = await pool.execute(
        'SELECT id FROM students WHERE name LIKE ? LIMIT 1', [`%${student_name}%`]
      ) as any[];
      resolvedStudentId = (rows as any[])[0]?.id;
    }

    if (!resolvedStudentId) {
      res.status(400).json({ error: 'student_id or a valid student_name is required' });
      return;
    }

    const [result] = await pool.execute(
      'INSERT INTO parents_teachers (student_id, role, name, contact_number) VALUES (?, ?, ?, ?)',
      [resolvedStudentId, role || 'Guardian', name, contact_number || null]
    ) as any[];

    res.status(201).json({
      id:      (result as any).insertId,
      message: 'Guardian registered successfully',
    });
  } catch (err) {
    console.error('createGuardian error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/guardians?student_name=&student_id= ─────────────────────
export async function getGuardians(req: Request, res: Response): Promise<void> {
  try {
    const { student_name, student_id } = req.query;

    let query  = 'SELECT pt.*, s.name AS student_name FROM parents_teachers pt JOIN students s ON s.id = pt.student_id';
    const params: any[] = [];

    if (student_id) {
      query  += ' WHERE pt.student_id = ?';
      params.push(student_id);
    } else if (student_name) {
      query  += ' WHERE s.name LIKE ?';
      params.push(`%${student_name}%`);
    }

    query += ' ORDER BY pt.created_at DESC';

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getGuardians error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
