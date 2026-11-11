"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.login = login;
exports.register = register;
exports.getMe = getMe;
exports.changePassword = changePassword;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const db_1 = __importDefault(require("../lib/db"));
const auth_1 = require("../lib/auth");
// ─── POST /api/auth/login ─────────────────────────────────────────────
// Accepts username + password, auto-detects role, returns JWT
async function login(req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        // Look up user with role name
        const [rows] = await db_1.default.execute(`SELECT u.id, u.username, u.password, u.is_active, r.name AS role
       FROM users u
       JOIN roles r ON r.id = u.role_id
       WHERE u.username = ?`, [username]);
        const user = rows[0];
        if (!user) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        if (!user.is_active) {
            res.status(403).json({ error: 'Account is deactivated. Contact administrator.' });
            return;
        }
        const match = await bcryptjs_1.default.compare(password, user.password);
        if (!match) {
            res.status(401).json({ error: 'Invalid username or password' });
            return;
        }
        const role = user.role;
        // Fetch role-specific profile
        let profile = null;
        let profileId;
        if (role === 'teacher') {
            const [tRows] = await db_1.default.execute('SELECT * FROM teachers WHERE user_id = ?', [user.id]);
            profile = tRows[0] || null;
            profileId = profile?.id;
        }
        else if (role === 'parent') {
            const [pRows] = await db_1.default.execute('SELECT * FROM parents WHERE user_id = ?', [user.id]);
            profile = pRows[0] || null;
            profileId = profile?.id;
        }
        else if (role === 'student') {
            const [sRows] = await db_1.default.execute('SELECT * FROM students WHERE user_id = ?', [user.id]);
            profile = sRows[0] || null;
            profileId = profile?.id;
        }
        const token = (0, auth_1.signToken)({ id: user.id, username: user.username, role, profileId });
        // Log the login
        try {
            await db_1.default.execute(`INSERT INTO login_logs (user_id, username, role, ip_address, success)
         VALUES (?, ?, ?, ?, 1)`, [user.id, user.username, role, req.ip || null]);
        }
        catch { /* non-fatal */ }
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                role,
                profileId,
                profile,
            },
        });
    }
    catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/auth/register  (admin-only or open if no admin exists) ─
async function register(req, res) {
    try {
        const { username, password, role = 'teacher', name, age, gender, section, contact, address, subject, room, schedule, relationship, employee_id, } = req.body;
        if (!username || !password || !name) {
            res.status(400).json({ error: 'username, password, and name are required' });
            return;
        }
        const validRoles = ['admin', 'teacher', 'parent', 'student'];
        if (!validRoles.includes(role)) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }
        // Check duplicate username
        const [existing] = await db_1.default.execute('SELECT id FROM users WHERE username = ?', [username]);
        if (existing.length > 0) {
            res.status(400).json({ error: 'Username already taken' });
            return;
        }
        // Get role id
        const [roleRows] = await db_1.default.execute('SELECT id FROM roles WHERE name = ?', [role]);
        const roleId = roleRows[0]?.id;
        if (!roleId) {
            res.status(400).json({ error: 'Role not found' });
            return;
        }
        const hashed = await bcryptjs_1.default.hash(password, 10);
        const conn = await db_1.default.getConnection();
        try {
            await conn.beginTransaction();
            const [userResult] = await conn.execute('INSERT INTO users (username, password, role_id) VALUES (?, ?, ?)', [username, hashed, roleId]);
            const userId = userResult.insertId;
            if (role === 'teacher') {
                await conn.execute(`INSERT INTO teachers (user_id, name, employee_id, age, gender, section, subject, room, schedule, contact, address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, name, employee_id || null, age || null, gender || null,
                    section || null, subject || null, room || null, schedule || null,
                    contact || null, address || null]);
            }
            else if (role === 'parent') {
                await conn.execute('INSERT INTO parents (user_id, name, relationship, contact, address) VALUES (?, ?, ?, ?, ?)', [userId, name, relationship || null, contact || null, address || null]);
            }
            else if (role === 'admin') {
                // No separate profile table for admin — user row suffices
            }
            await conn.commit();
            res.status(201).json({ message: 'Registered successfully', userId });
        }
        catch (e) {
            await conn.rollback();
            throw e;
        }
        finally {
            conn.release();
        }
    }
    catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/auth/me ─────────────────────────────────────────────────
async function getMe(req, res) {
    try {
        const { id, role, profileId } = req.user;
        const [rows] = await db_1.default.execute(`SELECT u.id, u.username, u.is_active, r.name AS role
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.id = ?`, [id]);
        const user = rows[0];
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        let profile = null;
        if (role === 'teacher' && profileId) {
            const [t] = await db_1.default.execute('SELECT * FROM teachers WHERE id = ?', [profileId]);
            profile = t[0] || null;
        }
        else if (role === 'parent' && profileId) {
            const [p] = await db_1.default.execute('SELECT * FROM parents WHERE id = ?', [profileId]);
            profile = p[0] || null;
        }
        else if (role === 'student' && profileId) {
            const [s] = await db_1.default.execute('SELECT * FROM students WHERE id = ?', [profileId]);
            profile = s[0] || null;
        }
        res.json({ ...user, profileId, profile });
    }
    catch (err) {
        console.error('getMe error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── POST /api/auth/change-password ──────────────────────────────────
async function changePassword(req, res) {
    try {
        const { oldPassword, newPassword } = req.body;
        const userId = req.user.id;
        if (!oldPassword || !newPassword) {
            res.status(400).json({ error: 'oldPassword and newPassword are required' });
            return;
        }
        const [rows] = await db_1.default.execute('SELECT password FROM users WHERE id = ?', [userId]);
        const user = rows[0];
        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const match = await bcryptjs_1.default.compare(oldPassword, user.password);
        if (!match) {
            res.status(401).json({ error: 'Incorrect current password' });
            return;
        }
        const hashed = await bcryptjs_1.default.hash(newPassword, 10);
        await db_1.default.execute('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
        res.json({ message: 'Password changed successfully' });
    }
    catch (err) {
        console.error('changePassword error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
