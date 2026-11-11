import { Response } from 'express';
import path from 'path';
import fs from 'fs';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';

// ─── POST /api/scan-photos ────────────────────────────────────────────
export async function uploadScanPhoto(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { student_name, status, photo_base64 } = req.body;

    if (!photo_base64 || !student_name) {
      res.status(400).json({ error: 'student_name and photo_base64 are required' });
      return;
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'scans');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean base64 string
    const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');
    const filename   = `scan_${Date.now()}_${student_name.replace(/\s+/g, '_')}.jpg`;
    const filepath   = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);

    const photoPath = `/uploads/scans/${filename}`;

    await pool.execute(
      'INSERT INTO scan_photos (student_name, status, photo_path) VALUES (?, ?, ?)',
      [student_name, status || null, photoPath]
    );

    res.status(201).json({ message: 'Photo saved', path: photoPath });
  } catch (err) {
    console.error('uploadScanPhoto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/scan-photos?student_name= ──────────────────────────────
export async function getScanPhotos(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { student_name } = req.query;
    let query  = 'SELECT * FROM scan_photos';
    let params: any[] = [];

    if (student_name) {
      query  += ' WHERE student_name LIKE ?';
      params  = [`%${student_name}%`];
    }

    query += ' ORDER BY captured_at DESC LIMIT 100';

    const [rows] = await pool.execute(query, params) as any[];
    res.json(rows);
  } catch (err) {
    console.error('getScanPhotos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}