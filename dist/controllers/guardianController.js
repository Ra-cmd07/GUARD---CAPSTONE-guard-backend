"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGuardian = createGuardian;
exports.getGuardians = getGuardians;
const db_1 = __importDefault(require("../lib/db"));
// ─── POST /api/guardians ──────────────────────────────────────────────
async function createGuardian(req, res) {
    try {
        const { student_id, student_name, role, name, contact_number } = req.body;
        if (!name) {
            res.status(400).json({ error: 'name is required' });
            return;
        }
        // Resolve student_id from student_name if not provided
        let resolvedStudentId = student_id;
        if (!resolvedStudentId && student_name) {
            const [rows] = await db_1.default.execute('SELECT id FROM students WHERE name LIKE ? LIMIT 1', [`%${student_name}%`]);
            resolvedStudentId = rows[0]?.id;
        }
        if (!resolvedStudentId) {
            res.status(400).json({ error: 'student_id or a valid student_name is required' });
            return;
        }
        const [result] = await db_1.default.execute('INSERT INTO parents_teachers (student_id, role, name, contact_number) VALUES (?, ?, ?, ?)', [resolvedStudentId, role || 'Guardian', name, contact_number || null]);
        res.status(201).json({
            id: result.insertId,
            message: 'Guardian registered successfully',
        });
    }
    catch (err) {
        console.error('createGuardian error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
// ─── GET /api/guardians?student_name=&student_id= ─────────────────────
async function getGuardians(req, res) {
    try {
        const { student_name, student_id } = req.query;
        let query = 'SELECT pt.*, s.name AS student_name FROM parents_teachers pt JOIN students s ON s.id = pt.student_id';
        const params = [];
        if (student_id) {
            query += ' WHERE pt.student_id = ?';
            params.push(student_id);
        }
        else if (student_name) {
            query += ' WHERE s.name LIKE ?';
            params.push(`%${student_name}%`);
        }
        query += ' ORDER BY pt.created_at DESC';
        const [rows] = await db_1.default.execute(query, params);
        res.json(rows);
    }
    catch (err) {
        console.error('getGuardians error:', err);
        res.status(500).json({ error: 'Server error' });
    }
}
