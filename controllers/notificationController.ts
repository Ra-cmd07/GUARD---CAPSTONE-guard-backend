import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import pool from '../lib/db';

// ─── Helper: create a notification (callable from other controllers) ──
export async function createNotification(
  userId: number,
  title: string,
  message: string,
  type: 'info' | 'warning' | 'alert' = 'info',
  link?: string
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO notifications (user_id, title, message, type, link, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, title, message, type, link || null]
    );
  } catch (err) {
    console.error('❌ createNotification error:', err);
  }
}

// ─── GET /notifications ───────────────────────────────────────────────
// Returns all notifications for the logged-in user (unread first)
export async function getNotifications(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const [rows]: any = await pool.query(
      `SELECT id, title, message, type, is_read, link, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY is_read ASC, created_at DESC
       LIMIT 50`,
      [userId]
    );

    const unreadCount = rows.filter((r: any) => !r.is_read).length;

    res.json({ notifications: rows, unreadCount });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
}

// ─── PATCH /notifications/:id/read ───────────────────────────────────
// Marks a single notification as read
export async function markOneRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE id = ? AND user_id = ?`,
      [id, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking notification read:', error);
    res.status(500).json({ error: 'Failed to update notification' });
  }
}

// ─── PATCH /notifications/read-all ───────────────────────────────────
// Marks ALL notifications for logged-in user as read
export async function markAllRead(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    await pool.query(
      `UPDATE notifications SET is_read = 1
       WHERE user_id = ? AND is_read = 0`,
      [userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
}

export default { getNotifications, markOneRead, markAllRead, createNotification };
