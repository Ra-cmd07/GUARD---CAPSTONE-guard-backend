import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import pool from '../lib/db';
import { createNotification } from './notificationController';

// Role name → role_id map (matches roles table)
const ROLE_ID: Record<string, number> = {
  admin:   1,
  teacher: 2,
  parent:  3,
  student: 4,
};

// ─── POST /admin/announcements ────────────────────────────────────────
export async function createAnnouncement(req: AuthRequest, res: Response) {
  try {
    const adminUserId = req.user?.id;
    if (!adminUserId) return res.status(401).json({ error: 'Unauthorized' });

    const { title, body, target_roles, send_sms } = req.body;

    if (!title?.trim() || !body?.trim())
      return res.status(400).json({ error: 'title and body are required' });

    if (!Array.isArray(target_roles) || target_roles.length === 0)
      return res.status(400).json({ error: 'target_roles must be a non-empty array' });

    const validRoles = target_roles.filter((r: string) => ROLE_ID[r]);
    if (!validRoles.length)
      return res.status(400).json({ error: 'No valid roles specified' });

    // Insert announcement record
    const [result]: any = await pool.query(
      `INSERT INTO announcements (admin_id, title, body, target_roles, send_sms, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [adminUserId, title.trim(), body.trim(), JSON.stringify(validRoles), send_sms ? 1 : 0]
    );

    // Fan out: create in-app notification for every user in target roles
    let notifiedCount = 0;
    for (const roleName of validRoles) {
      const roleId = ROLE_ID[roleName];
      const [users]: any = await pool.query(
        'SELECT id FROM users WHERE role_id = ? AND is_active = 1',
        [roleId]
      );
      for (const u of users) {
        await createNotification(
          u.id,
          `📢 ${title.trim()}`,
          body.trim(),
          'info',
          undefined
        );
        notifiedCount++;
      }
    }

    // Optional SMS: queue to all parents in target_roles
    if (send_sms && validRoles.includes('parent')) {
      const smsText = `AttendBox Announcement: ${title.trim()}. ${body.trim()}`.slice(0, 160);
      const [parentUsers]: any = await pool.query(
        `SELECT p.contact FROM parents p
         JOIN users u ON u.id = p.user_id
         WHERE u.is_active = 1 AND p.contact IS NOT NULL AND p.contact != ''`
      );
      for (const p of parentUsers) {
        await pool.query(
          `INSERT INTO sms_queue (phone_number, message, priority, status, created_at)
           VALUES (?, ?, 'normal', 'pending', NOW())`,
          [p.contact, smsText]
        );
      }
    }

    res.status(201).json({
      success: true,
      message: `Announcement published — ${notifiedCount} users notified`,
      announcementId: result.insertId,
      notifiedCount,
    });
  } catch (err) {
    console.error('Error creating announcement:', err);
    res.status(500).json({ error: 'Failed to create announcement' });
  }
}

// ─── GET /admin/announcements ─────────────────────────────────────────
export async function getAnnouncements(req: AuthRequest, res: Response) {
  try {
    const [rows]: any = await pool.query(
      `SELECT a.id, a.title, a.body, a.target_roles, a.send_sms, a.created_at,
              u.username AS admin_username
       FROM announcements a
       JOIN users u ON u.id = a.admin_id
       ORDER BY a.created_at DESC
       LIMIT 50`
    );

    // Parse JSON target_roles from DB
    const parsed = rows.map((r: any) => ({
      ...r,
      target_roles: typeof r.target_roles === 'string'
        ? JSON.parse(r.target_roles)
        : r.target_roles,
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Error fetching announcements:', err);
    res.status(500).json({ error: 'Failed to fetch announcements' });
  }
}

export default { createAnnouncement, getAnnouncements };
