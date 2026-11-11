import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import { Request, Response } from 'express';
import pool from '../lib/db';

const router = Router();

/**
 * GET /api/settings/permissions
 * Get current permission settings
 */
router.get('/permissions', protect, async (req: Request, res: Response) => {
  try {
    const [rows] = await pool.query(
      'SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ?',
      ['allow_teacher_id_generation']
    );

    const settings = rows as any[];
    const allowTeacherIDGeneration = settings.length > 0 
      ? settings[0].setting_value === 'true'
      : false;

    res.json({
      allow_teacher_id_generation: allowTeacherIDGeneration,
    });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * POST /api/settings/permissions
 * Update permission settings (Admin only)
 */
router.post('/permissions', protect, requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const { allow_teacher_id_generation } = req.body;

    if (typeof allow_teacher_id_generation !== 'boolean') {
      return res.status(400).json({ error: 'Invalid setting value' });
    }

    const userId = (req as any).user?.id;
    const value = allow_teacher_id_generation ? 'true' : 'false';

    // Insert or update setting
    await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
       setting_value = VALUES(setting_value),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
      ['allow_teacher_id_generation', value, userId]
    );

    res.json({
      success: true,
      allow_teacher_id_generation,
      message: 'Settings updated successfully',
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

export default router;
