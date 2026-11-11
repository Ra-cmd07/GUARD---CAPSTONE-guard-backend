"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = sendMessage;
exports.getTeacherMessages = getTeacherMessages;
exports.getParentMessages = getParentMessages;
exports.markMessageRead = markMessageRead;
exports.deleteParentMessage = deleteParentMessage;
const db_1 = __importDefault(require("../lib/db"));
const notificationController_1 = require("./notificationController");
// ─── POST /teacher/messages ───────────────────────────────────────────
// Teacher sends a message to a student's parent
async function sendMessage(req, res) {
    try {
        const senderUserId = req.user?.id;
        if (!senderUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const { student_id, subject, body } = req.body;
        if (!student_id || !subject?.trim() || !body?.trim())
            return res.status(400).json({ error: 'student_id, subject, and body are required' });
        // Get teacher info
        const [tRows] = await db_1.default.query('SELECT id, name, section FROM teachers WHERE user_id = ? LIMIT 1', [senderUserId]);
        if (!tRows.length)
            return res.status(404).json({ error: 'Teacher profile not found' });
        const teacher = tRows[0];
        // Get student info
        const [sRows] = await db_1.default.query('SELECT id, name, section FROM students WHERE id = ?', [student_id]);
        if (!sRows.length)
            return res.status(404).json({ error: 'Student not found' });
        const student = sRows[0];
        // Verify teacher can message this student's parent:
        // - Adviser: section must match
        // - Subject teacher: must have an assignment linking them to this student
        const sectionMatch = teacher.section &&
            teacher.section.toLowerCase() === student.section.toLowerCase();
        if (!sectionMatch) {
            // Check if teacher has an assignment for this student (subject teacher path)
            const [asgRows] = await db_1.default.query(`SELECT a.id FROM assignments a
         JOIN assignment_students asg ON asg.assignment_id = a.id
         WHERE (a.teacher_id = ? OR a.subject_teacher_id = ?)
           AND asg.student_id = ?
         LIMIT 1`, [teacher.id, teacher.id, student_id]);
            if (!asgRows.length) {
                return res.status(403).json({ error: 'This student is not in your class' });
            }
        }
        // Find parent(s) linked to this student
        const [parentRows] = await db_1.default.query(`SELECT p.id AS parent_id, p.user_id AS parent_user_id, p.name AS parent_name, p.contact
       FROM parent_student ps
       JOIN parents p ON p.id = ps.parent_id
       WHERE ps.student_id = ?`, [student_id]);
        if (!parentRows.length)
            return res.status(404).json({ error: 'No parent/guardian linked to this student' });
        // Send message to each parent
        const insertedIds = [];
        for (const parent of parentRows) {
            const [result] = await db_1.default.query(`INSERT INTO messages
           (sender_id, sender_role, recipient_parent_id, student_id, subject, body, created_at)
         VALUES (?, 'teacher', ?, ?, ?, ?, NOW())`, [senderUserId, parent.parent_id, student_id, subject.trim(), body.trim()]);
            insertedIds.push(result.insertId);
            // In-app notification for parent
            await (0, notificationController_1.createNotification)(parent.parent_user_id, `📩 Message from ${teacher.name}`, `Re: ${student.name} — "${subject.trim()}"`, 'info', '/parent');
            // Queue SMS to parent
            if (parent.contact) {
                const smsText = `AttendBox: Message from ${teacher.name} re: ${student.name}: "${subject.trim()}". Login to AttendBox to read the full message.`;
                await db_1.default.query(`INSERT INTO sms_queue (phone_number, message, student_id, priority, status, created_at)
           VALUES (?, ?, ?, 'normal', 'pending', NOW())`, [parent.contact, smsText.slice(0, 160), student_id]);
            }
        }
        res.status(201).json({
            success: true,
            message: `Message sent to ${parentRows.length} parent(s)`,
            messageIds: insertedIds,
        });
    }
    catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Failed to send message' });
    }
}
// ─── GET /teacher/messages ────────────────────────────────────────────
// Teacher views all messages they sent
async function getTeacherMessages(req, res) {
    try {
        const senderUserId = req.user?.id;
        if (!senderUserId)
            return res.status(401).json({ error: 'Unauthorized' });
        const [rows] = await db_1.default.query(`SELECT m.id, m.student_id, m.subject, m.body, m.is_read, m.created_at,
              s.name  AS student_name,
              p.name  AS parent_name,
              p.contact AS parent_contact
       FROM messages m
       JOIN students s ON s.id = m.student_id
       JOIN parents  p ON p.id = m.recipient_parent_id
       WHERE m.sender_id = ?
       ORDER BY m.created_at DESC
       LIMIT 100`, [senderUserId]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching teacher messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
}
// ─── GET /parent/messages ─────────────────────────────────────────────
// Parent views messages received from teachers
async function getParentMessages(req, res) {
    try {
        const userId = req.user?.id;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        // Get parent row
        const [pRows] = await db_1.default.query('SELECT id FROM parents WHERE user_id = ? LIMIT 1', [userId]);
        if (!pRows.length)
            return res.status(404).json({ error: 'Parent profile not found' });
        const parentId = pRows[0].id;
        const [rows] = await db_1.default.query(`SELECT m.id, m.sender_id, m.subject, m.body, m.is_read, m.created_at,
              s.name  AS student_name,
              t.name  AS teacher_name
       FROM messages m
       JOIN students s ON s.id = m.student_id
       JOIN teachers t ON t.user_id = m.sender_id
       WHERE m.recipient_parent_id = ?
         AND (m.deleted_by_parent IS NULL OR m.deleted_by_parent = 0)
       ORDER BY m.is_read ASC, m.created_at DESC
       LIMIT 100`, [parentId]);
        const unreadCount = rows.filter((r) => !r.is_read).length;
        res.json({ messages: rows, unreadCount });
    }
    catch (error) {
        console.error('Error fetching parent messages:', error);
        res.status(500).json({ error: 'Failed to fetch messages' });
    }
}
// ─── PATCH /parent/messages/:id/read ─────────────────────────────────
// Parent marks a message as read
async function markMessageRead(req, res) {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const [pRows] = await db_1.default.query('SELECT id FROM parents WHERE user_id = ? LIMIT 1', [userId]);
        if (!pRows.length)
            return res.status(404).json({ error: 'Parent not found' });
        await db_1.default.query('UPDATE messages SET is_read = 1 WHERE id = ? AND recipient_parent_id = ?', [id, pRows[0].id]);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error marking message read:', error);
        res.status(500).json({ error: 'Failed to update message' });
    }
}
// ─── DELETE /parent/messages/:id ─────────────────────────────────────
// Parent soft-deletes a message (hides from their inbox)
async function deleteParentMessage(req, res) {
    try {
        const userId = req.user?.id;
        const { id } = req.params;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const [pRows] = await db_1.default.query('SELECT id FROM parents WHERE user_id = ? LIMIT 1', [userId]);
        if (!pRows.length)
            return res.status(404).json({ error: 'Parent not found' });
        const parentId = pRows[0].id;
        // Verify message belongs to this parent
        const [msgRows] = await db_1.default.query('SELECT id FROM messages WHERE id = ? AND recipient_parent_id = ?', [id, parentId]);
        if (!msgRows.length) {
            return res.status(404).json({ error: 'Message not found' });
        }
        await db_1.default.query('UPDATE messages SET deleted_by_parent = 1 WHERE id = ? AND recipient_parent_id = ?', [id, parentId]);
        res.json({ success: true, message: 'Message deleted' });
    }
    catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ error: 'Failed to delete message' });
    }
}
exports.default = { sendMessage, getTeacherMessages, getParentMessages, markMessageRead, deleteParentMessage };
