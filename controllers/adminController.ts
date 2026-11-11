import { Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../lib/db';
import { AuthRequest } from '../middleware/authMiddleware';
import path from 'path';
import fs from 'fs';
import { RowDataPacket } from 'mysql2';

// ─── GET /api/admin/dashboard ─────────────────────────────────────────
export async function getDashboardStats(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [[stats]] = await pool.execute('SELECT * FROM v_dashboard_stats') as any[];

    const [recentLogs] = await pool.execute(
      `SELECT 
        a.id, 
        a.student_name, 
        a.grade, 
        a.section, 
        a.timestamp,
        a.scan_method, 
        a.status, 
        a.photo_path,
        a.student_id
       FROM attendance a
       INNER JOIN (
         SELECT student_id, MAX(timestamp) as max_timestamp
         FROM attendance
         GROUP BY student_id
       ) latest ON a.student_id = latest.student_id 
                AND a.timestamp = latest.max_timestamp
       ORDER BY a.timestamp DESC
       LIMIT 200`
    ) as any[];

    const [activeKiosks] = await pool.execute(
      `SELECT id, name, location, gate, is_active, last_ping
       FROM kiosks WHERE is_active = 1`
    ) as any[];

    res.json({ stats, recentLogs, activeKiosks });
  } catch (err) {
    console.error('getDashboardStats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/users ─────────────────────────────────────────────
export async function getUsers(req: AuthRequest, res: Response): Promise<void> {
  try {
    const role = req.query.role as string | undefined;
    let query = `
      SELECT u.id, u.username, u.is_active, r.name AS role,
             u.created_at, u.updated_at,
             COALESCE(s.name, t.name, p.name) AS name,
             s.lrn, s.grade, s.section, s.preferred_method,
             s.photo_path AS photo,
             s.id AS student_profile_id
      FROM users u
      JOIN roles r ON r.id = u.role_id
      LEFT JOIN students s ON s.user_id = u.id
      LEFT JOIN teachers t ON t.user_id = u.id
      LEFT JOIN parents  p ON p.user_id = u.id
    `;
    const params: any[] = [];
    if (role) { query += ' WHERE r.name = ?'; params.push(role); }
    query += ' ORDER BY u.created_at DESC';

    const [rows] = await pool.execute(query, params) as any[];
    
    // For students, fetch their parents/guardians
    const users = rows as any[];
    for (const user of users) {
      if (user.role === 'student' && user.student_profile_id) {
        const [parents] = await pool.execute(
          `SELECT p.id, p.name, p.contact, ps.relationship
           FROM parent_student ps
           JOIN parents p ON ps.parent_id = p.id
           WHERE ps.student_id = ?`,
          [user.student_profile_id]
        ) as any[];
        user.parents = parents;
      }
    }
    
    res.json(users);
  } catch (err) {
    console.error('getUsers error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/users/:id ─────────────────────────────────────────
export async function getUserById(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const [rows] = await pool.execute(
      `SELECT u.id, u.username, u.is_active, r.name AS role, u.created_at
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`,
      [id]
    ) as any[];
    const user = (rows as any[])[0];
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    let profile: any = null;
    if (user.role === 'teacher') {
      const [t] = await pool.execute('SELECT * FROM teachers WHERE user_id = ?', [id]) as any[];
      profile = (t as any[])[0] || null;
    } else if (user.role === 'parent') {
      const [p] = await pool.execute('SELECT * FROM parents WHERE user_id = ?', [id]) as any[];
      profile = (p as any[])[0] || null;
      if (profile) {
        const [children] = await pool.execute(
          `SELECT s.* FROM students s
           JOIN parent_student ps ON ps.student_id = s.id
           WHERE ps.parent_id = ?`, [profile.id]
        ) as any[];
        profile.children = children;
      }
    } else if (user.role === 'student') {
      const [s] = await pool.execute('SELECT * FROM students WHERE user_id = ?', [id]) as any[];
      profile = (s as any[])[0] || null;
    }

    res.json({ ...user, profile });
  } catch (err) {
    console.error('getUserById error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/admin/users ────────────────────────────────────────────
export async function createUser(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      username, password, role,
      name, age, gender, section, contact, address,
      subject, room, schedule, relationship, employee_id,
      lrn, grade, mac_address, rfid_uid,
      parents, // Array of parent accounts for students
    } = req.body;

    if (!username || !password || !role || !name) {
      res.status(400).json({ error: 'username, password, role, and name are required' });
      return;
    }

    const [existCheck] = await conn.execute('SELECT id FROM users WHERE username = ?', [username]) as any[];
    if ((existCheck as any[]).length > 0) {
      res.status(400).json({ error: 'Username already taken' });
      return;
    }

    const [roleRows] = await conn.execute('SELECT id FROM roles WHERE name = ?', [role]) as any[];
    const roleId = (roleRows as any[])[0]?.id;
    if (!roleId) { res.status(400).json({ error: 'Invalid role' }); return; }

    const hashed = await bcrypt.hash(password, 10);
    const [ur] = await conn.execute(
      'INSERT INTO users (username, password, role_id, created_by) VALUES (?, ?, ?, ?)',
      [username, hashed, roleId, req.user!.id]
    ) as any[];
    const userId = (ur as any).insertId;

    let profileId: number | null = null;

    if (role === 'teacher') {
      const [tr] = await conn.execute(
        `INSERT INTO teachers (user_id, name, employee_id, age, gender, section, subject, room, schedule, contact, address, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, name, employee_id || null, age || null, gender || null,
         section || null, subject || null, room || null, schedule || null,
         contact || null, address || null, req.user!.id]
      ) as any[];
      profileId = (tr as any).insertId;
    } else if (role === 'parent') {
      const [pr] = await conn.execute(
        'INSERT INTO parents (user_id, name, relationship, contact, address, created_by) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name, relationship || null, contact || null, address || null, req.user!.id]
      ) as any[];
      profileId = (pr as any).insertId;
    } else if (role === 'student') {
      if (!lrn) { res.status(400).json({ error: 'LRN is required for students' }); return; }
      const {
        last_name, first_name, middle_name,
      } = req.body;
      // Assemble full name from parts if provided, otherwise use name field
      const fullName = (last_name && first_name)
        ? `${last_name}, ${first_name}${middle_name ? ` ${middle_name}` : ''}`
        : name;
      const [sr] = await conn.execute(
        `INSERT INTO students
           (user_id, lrn, name, last_name, first_name, middle_name,
            gender, grade, section, mac_address, rfid_uid, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, lrn, fullName,
         last_name || null, first_name || null, middle_name || null,
         gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : (gender || null),
         grade || null, section || null, mac_address || null, rfid_uid || null,
         req.user!.id]
      ) as any[];
      profileId = (sr as any).insertId;

      // Create parent accounts if provided
      const createdParents = [];
      if (Array.isArray(parents) && parents.length > 0) {
        const [parentRoleRows] = await conn.execute('SELECT id FROM roles WHERE name = ?', ['parent']) as any[];
        const parentRoleId = (parentRoleRows as any[])[0]?.id;

        for (const parent of parents) {
          if (!parent.username || !parent.name || !parent.password) continue;

          // Check if parent username already exists
          const [parentExistCheck] = await conn.execute(
            'SELECT id FROM users WHERE username = ?',
            [parent.username]
          ) as any[];
          
          if ((parentExistCheck as any[]).length > 0) {
            console.log(`Skipping parent ${parent.username} - username already exists`);
            continue;
          }

          // Create parent user account
          const parentHashed = await bcrypt.hash(parent.password, 10);
          const [parentUserResult] = await conn.execute(
            'INSERT INTO users (username, password, role_id, created_by) VALUES (?, ?, ?, ?)',
            [parent.username, parentHashed, parentRoleId, req.user!.id]
          ) as any[];
          const parentUserId = (parentUserResult as any).insertId;

          // Create parent profile
          const [parentProfileResult] = await conn.execute(
            'INSERT INTO parents (user_id, name, contact, address, created_by) VALUES (?, ?, ?, ?, ?)',
            [parentUserId, parent.name, parent.contact || null, address || null, req.user!.id]
          ) as any[];
          const parentId = (parentProfileResult as any).insertId;

          // Link parent to student
          await conn.execute(
            'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
            [parentId, profileId, parent.relationship || 'Parent']
          );

          createdParents.push({
            username: parent.username,
            name: parent.name,
            relationship: parent.relationship,
          });
        }
      }

      await conn.commit();
      res.status(201).json({ 
        message: 'Student and parent accounts created successfully', 
        userId, 
        profileId,
        parentsCreated: createdParents.length,
        parents: createdParents,
      });
      return;
    }

    await conn.commit();
    res.status(201).json({ message: 'User created', userId, profileId });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Duplicate entry (LRN or username already exists)' });
      return;
    }
    console.error('createUser error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// ─── PUT /api/admin/users/:id ─────────────────────────────────────────
export async function updateUser(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const {
      name, age, gender, section, contact, address,
      subject, room, schedule, relationship, employee_id,
      lrn, grade, mac_address, rfid_uid, is_active,
    } = req.body;

    const [rows] = await conn.execute(
      `SELECT u.id, r.name AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?`, [id]
    ) as any[];
    const user = (rows as any[])[0];
    if (!user) { res.status(404).json({ error: 'User not found' }); return; }

    if (is_active !== undefined) {
      await conn.execute(
        'UPDATE users SET is_active = ?, updated_by = ? WHERE id = ?',
        [is_active ? 1 : 0, req.user!.id, id]
      );
    }

    if (user.role === 'teacher') {
      await conn.execute(
        `UPDATE teachers SET name=?, employee_id=?, age=?, gender=?, section=?, subject=?, room=?, schedule=?, contact=?, address=?, updated_by=?
         WHERE user_id=?`,
        [name, employee_id || null, age || null, gender || null, section || null,
         subject || null, room || null, schedule || null, contact || null, address || null,
         req.user!.id, id]
      );
    } else if (user.role === 'parent') {
      await conn.execute(
        'UPDATE parents SET name=?, relationship=?, contact=?, address=?, updated_by=? WHERE user_id=?',
        [name, relationship || null, contact || null, address || null, req.user!.id, id]
      );
    } else if (user.role === 'student') {
      const { last_name, first_name, middle_name,
              birthdate, birth_place, mother_tongue, ip_ethnic, religion,
              address_street, barangay, municipality, province, sf1_remarks } = req.body;
      const fullName = (last_name && first_name)
        ? `${last_name}, ${first_name}${middle_name ? ` ${middle_name}` : ''}`
        : name;
      await conn.execute(
        `UPDATE students
         SET name=?, last_name=?, first_name=?, middle_name=?,
             lrn=?, gender=?, grade=?, section=?, mac_address=?, rfid_uid=?,
             birthdate=?, birth_place=?, mother_tongue=?, ip_ethnic=?, religion=?,
             address_street=?, barangay=?, municipality=?, province=?, sf1_remarks=?,
             updated_by=?
         WHERE user_id=?`,
        [fullName,
         last_name || null, first_name || null, middle_name || null,
         lrn || null,
         gender === 'Male' ? 'M' : gender === 'Female' ? 'F' : (gender || null),
         grade || null, section || null, mac_address || null, rfid_uid || null,
         birthdate      || null, birth_place    || null,
         mother_tongue  || null, ip_ethnic      || null, religion       || null,
         address_street || null, barangay       || null,
         municipality   || null, province       || null, sf1_remarks    || null,
         req.user!.id, id]
      );
    }

    await conn.commit();
    res.json({ message: 'User updated' });
  } catch (err) {
    await conn.rollback();
    console.error('updateUser error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// ─── POST /api/admin/users/:id/reset-password ─────────────────────────
export async function resetPassword(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id }          = req.params;
    const { newPassword } = req.body;
    if (!newPassword) { res.status(400).json({ error: 'newPassword is required' }); return; }

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.execute(
      'UPDATE users SET password = ?, updated_by = ? WHERE id = ?',
      [hashed, req.user!.id, id]
    );
    res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PATCH /api/admin/users/:id/toggle-status ─────────────────────────
export async function toggleUserStatus(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    await pool.execute(
      'UPDATE users SET is_active = NOT is_active, updated_by = ? WHERE id = ?',
      [req.user!.id, id]
    );
    const [rows] = await pool.execute('SELECT is_active FROM users WHERE id = ?', [id]) as any[];
    const active = (rows as any[])[0]?.is_active;
    res.json({ message: `User ${active ? 'activated' : 'deactivated'}`, is_active: active });
  } catch (err) {
    console.error('toggleUserStatus error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/kiosks ────────────────────────────────────────────
export async function getKiosks(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute('SELECT * FROM kiosks ORDER BY name') as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/admin/kiosks ───────────────────────────────────────────
export async function createKiosk(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { name, location, gate, ip_address } = req.body;
    if (!name) { res.status(400).json({ error: 'name is required' }); return; }
    const [r] = await pool.execute(
      'INSERT INTO kiosks (name, location, gate, ip_address, created_by) VALUES (?, ?, ?, ?, ?)',
      [name, location || null, gate || null, ip_address || null, req.user!.id]
    ) as any[];
    res.status(201).json({ id: (r as any).insertId, message: 'Kiosk created' });
  } catch (err) {
    console.error('createKiosk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PUT /api/admin/kiosks/:id ────────────────────────────────────────
export async function updateKiosk(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, location, gate, ip_address, is_active } = req.body;
    await pool.execute(
      'UPDATE kiosks SET name=?, location=?, gate=?, ip_address=?, is_active=?, updated_by=? WHERE id=?',
      [name, location || null, gate || null, ip_address || null,
       is_active !== undefined ? (is_active ? 1 : 0) : 1, req.user!.id, id]
    );
    res.json({ message: 'Kiosk updated' });
  } catch (err) {
    console.error('updateKiosk error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/sms-logs ──────────────────────────────────────────
export async function getSmsLogs(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM sms_logs ORDER BY created_at DESC LIMIT 200'
    ) as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/login-logs ────────────────────────────────────────
export async function getLoginLogs(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM login_logs ORDER BY logged_at DESC LIMIT 200'
    ) as any[];
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/admin/students/:id/add-parent ─────────────────────────
export async function addParentToStudent(req: AuthRequest, res: Response): Promise<void> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id: studentId } = req.params;
    const { username, password, name, relationship, contact, address } = req.body;

    if (!username || !password || !name) {
      res.status(400).json({ error: 'username, password, and name are required' });
      return;
    }

    // Verify student exists
    const [studentCheck] = await conn.execute(
      'SELECT id, name FROM students WHERE id = ?',
      [studentId]
    ) as any[];

    if ((studentCheck as any[]).length === 0) {
      res.status(404).json({ error: 'Student not found' });
      return;
    }

    // Check if username already exists
    const [existCheck] = await conn.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    ) as any[];

    if ((existCheck as any[]).length > 0) {
      res.status(400).json({ error: 'Username already taken' });
      return;
    }

    // Get parent role ID
    const [roleRows] = await conn.execute(
      'SELECT id FROM roles WHERE name = ?',
      ['parent']
    ) as any[];
    const parentRoleId = (roleRows as any[])[0]?.id;

    // Create user account
    const hashedPassword = await bcrypt.hash(password, 10);
    const [userResult] = await conn.execute(
      'INSERT INTO users (username, password, role_id, created_by) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, parentRoleId, req.user!.id]
    ) as any[];
    const userId = (userResult as any).insertId;

    // Create parent profile
    const [parentResult] = await conn.execute(
      'INSERT INTO parents (user_id, name, contact, address, created_by) VALUES (?, ?, ?, ?, ?)',
      [userId, name, contact || null, address || null, req.user!.id]
    ) as any[];
    const parentId = (parentResult as any).insertId;

    // Link parent to student
    await conn.execute(
      'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
      [parentId, studentId, relationship || 'Parent']
    );

    await conn.commit();
    res.status(201).json({
      message: 'Parent account created and linked successfully',
      parentId,
      parentUsername: username,
      linkedToStudent: (studentCheck as any[])[0].name,
    });
  } catch (err: any) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      res.status(400).json({ error: 'Username already exists' });
      return;
    }
    console.error('addParentToStudent error:', err);
    res.status(500).json({ error: 'Server error' });
  } finally {
    conn.release();
  }
}

// ─── GET /api/admin/school-settings ──────────────────────────────────
export async function getSchoolSettings(_req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute('SELECT * FROM school_settings WHERE id = 1') as any[];
    res.json((rows as any[])[0] || {});
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── PUT /api/admin/school-settings ──────────────────────────────────
export async function updateSchoolSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { school_id, region, division, district, school_name, school_year, school_head_name } = req.body;
    await pool.execute(
      `INSERT INTO school_settings (id, school_id, region, division, district, school_name, school_year, school_head_name)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         school_id        = VALUES(school_id),
         region           = VALUES(region),
         division         = VALUES(division),
         district         = VALUES(district),
         school_name      = VALUES(school_name),
         school_year      = VALUES(school_year),
         school_head_name = VALUES(school_head_name)`,
      [
        school_id        || null,
        region           || null,
        division         || null,
        district         || null,
        school_name      || null,
        school_year      || null,
        school_head_name || null,
      ]
    );
    res.json({ message: 'School settings updated' });
  } catch (err) {
    console.error('updateSchoolSettings error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/admin/sms-logs/clear ─────────────────────────────────
export async function clearSmsLogs(req: AuthRequest, res: Response): Promise<void> {
  try {
    console.log(`🗑️  Admin ${req.user?.username} clearing SMS history...`);
    
    // Count before deletion
    const [countBefore] = await pool.execute('SELECT COUNT(*) as total FROM sms_logs') as any[];
    const totalBefore = (countBefore as any[])[0].total;
    
    // Delete all SMS logs
    const [result] = await pool.execute('DELETE FROM sms_logs') as any[];
    
    console.log(`✅ Deleted ${(result as any).affectedRows} SMS log records`);
    
    res.json({
      success: true,
      message: 'SMS history cleared successfully',
      deletedCount: (result as any).affectedRows,
      previousCount: totalBefore
    });
  } catch (err) {
    console.error('clearSmsLogs error:', err);
    res.status(500).json({ error: 'Failed to clear SMS history' });
  }
}


// ─── POST /api/admin/students/:id/upload-photo ────────────────────────
export async function uploadStudentPhoto(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { photo_base64 } = req.body;

    if (!photo_base64) {
      res.status(400).json({ error: 'photo_base64 is required' });
      return;
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'students');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean base64 string
    const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');
    const filename   = `student_${id}_${Date.now()}.jpg`;
    const filepath   = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);

    const photoPath = `/uploads/students/${filename}`;

    // Update students table with photo path (id is user_id)
    await pool.execute(
      'UPDATE students SET photo_path = ? WHERE user_id = ?',
      [photoPath, id]
    );

    res.status(200).json({ 
      message: 'Photo uploaded successfully', 
      path: photoPath 
    });
  } catch (err) {
    console.error('uploadStudentPhoto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/admin/students/:id/photo ────────────────────────────
export async function removeStudentPhoto(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    // Get current photo path from students table
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT photo_path FROM students WHERE user_id = ?',
      [id]
    );

    if (rows.length > 0 && rows[0].photo_path) {
      const photoPath = path.join(__dirname, '..', rows[0].photo_path.replace(/^\//, ''));
      // Delete file if exists
      if (fs.existsSync(photoPath)) {
        fs.unlinkSync(photoPath);
      }
    }

    // Remove photo path from database
    await pool.execute(
      'UPDATE students SET photo_path = NULL WHERE user_id = ?',
      [id]
    );

    res.status(200).json({ message: 'Photo removed successfully' });
  } catch (err) {
    console.error('removeStudentPhoto error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /api/admin/school-logo/upload ────────────────────────────
export async function uploadSchoolLogo(req: AuthRequest, res: Response): Promise<void> {
  try {
    const { logo_base64 } = req.body;

    if (!logo_base64) {
      res.status(400).json({ error: 'logo_base64 is required' });
      return;
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(__dirname, '..', process.env.UPLOAD_DIR || 'uploads', 'school');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Clean base64 string
    const base64Data = logo_base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer     = Buffer.from(base64Data, 'base64');
    const filename   = `school_logo_${Date.now()}.png`;
    const filepath   = path.join(uploadsDir, filename);

    fs.writeFileSync(filepath, buffer);

    const logoPath = `/uploads/school/${filename}`;

    // Update or insert school logo path in system_settings
    await pool.execute(
      `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ('school_logo', ?, NOW())
       ON DUPLICATE KEY UPDATE setting_value = ?, updated_at = NOW()`,
      [logoPath, logoPath]
    );

    res.status(200).json({ 
      message: 'School logo uploaded successfully', 
      path: logoPath 
    });
  } catch (err) {
    console.error('uploadSchoolLogo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── GET /api/admin/school-logo ────────────────────────────
export async function getSchoolLogo(req: AuthRequest, res: Response): Promise<void> {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['school_logo']
    );

    const logoPath = rows.length > 0 ? rows[0].setting_value : null;
    res.status(200).json({ logo: logoPath });
  } catch (err) {
    console.error('getSchoolLogo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}

// ─── DELETE /api/admin/school-logo ────────────────────────────
export async function removeSchoolLogo(req: AuthRequest, res: Response): Promise<void> {
  try {
    // Get current logo path
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT setting_value FROM system_settings WHERE setting_key = ?',
      ['school_logo']
    );

    if (rows.length > 0 && rows[0].setting_value) {
      const logoPath = path.join(__dirname, '..', rows[0].setting_value.replace(/^\//, ''));
      // Delete file if exists
      if (fs.existsSync(logoPath)) {
        fs.unlinkSync(logoPath);
      }
    }

    // Remove logo path from database
    await pool.execute(
      'DELETE FROM system_settings WHERE setting_key = ?',
      ['school_logo']
    );

    res.status(200).json({ message: 'School logo removed successfully' });
  } catch (err) {
    console.error('removeSchoolLogo error:', err);
    res.status(500).json({ error: 'Server error' });
  }
}
