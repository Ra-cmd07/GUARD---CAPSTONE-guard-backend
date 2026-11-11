"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSMSQueue = getSMSQueue;
exports.clearSMSQueue = clearSMSQueue;
exports.deleteSMS = deleteSMS;
exports.resetSMSQueue = resetSMSQueue;
const db_1 = __importDefault(require("../lib/db"));
/**
 * GET /api/admin/sms-queue
 * View all pending SMS in queue
 */
async function getSMSQueue(req, res) {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const [rows] = await db_1.default.query(`SELECT 
        sq.id,
        sq.phone_number,
        sq.message,
        sq.student_id,
        sq.status,
        sq.priority,
        sq.created_at,
        sq.sent_at,
        s.name AS student_name
      FROM sms_queue sq
      LEFT JOIN students s ON s.id = sq.student_id
      ORDER BY sq.created_at DESC
      LIMIT 100`);
        const pending = rows.filter((r) => r.status === 'pending').length;
        const sent = rows.filter((r) => r.status === 'sent').length;
        const failed = rows.filter((r) => r.status === 'failed').length;
        res.json({
            total: rows.length,
            pending,
            sent,
            failed,
            queue: rows
        });
    }
    catch (error) {
        console.error('Error fetching SMS queue:', error);
        res.status(500).json({ error: 'Failed to fetch SMS queue' });
    }
}
/**
 * DELETE /api/admin/sms-queue
 * Clear all SMS from queue (admin only)
 */
async function clearSMSQueue(req, res) {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { status } = req.query; // Optional: clear only specific status
        let query = 'DELETE FROM sms_queue';
        let params = [];
        if (status === 'pending') {
            query += ' WHERE status = ?';
            params = ['pending'];
        }
        else if (status === 'sent') {
            query += ' WHERE status = ?';
            params = ['sent'];
        }
        else if (status === 'failed') {
            query += ' WHERE status = ?';
            params = ['failed'];
        }
        const [result] = await db_1.default.query(query, params);
        res.json({
            success: true,
            message: `Deleted ${result.affectedRows} SMS from queue`,
            deletedCount: result.affectedRows
        });
    }
    catch (error) {
        console.error('Error clearing SMS queue:', error);
        res.status(500).json({ error: 'Failed to clear SMS queue' });
    }
}
/**
 * DELETE /api/admin/sms-queue/:id
 * Delete specific SMS by ID
 */
async function deleteSMS(req, res) {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        const { id } = req.params;
        const [result] = await db_1.default.query('DELETE FROM sms_queue WHERE id = ?', [id]);
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'SMS not found' });
        }
        res.json({
            success: true,
            message: `SMS ID ${id} deleted`
        });
    }
    catch (error) {
        console.error('Error deleting SMS:', error);
        res.status(500).json({ error: 'Failed to delete SMS' });
    }
}
/**
 * POST /api/admin/sms-queue/reset
 * Reset SMS queue table (delete all + reset auto-increment)
 */
async function resetSMSQueue(req, res) {
    try {
        // Check if user is admin
        if (req.user?.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        // Delete all rows
        await db_1.default.query('DELETE FROM sms_queue');
        // Reset auto-increment
        await db_1.default.query('ALTER TABLE sms_queue AUTO_INCREMENT = 1');
        res.json({
            success: true,
            message: 'SMS queue completely reset (all data deleted, ID counter reset to 1)'
        });
    }
    catch (error) {
        console.error('Error resetting SMS queue:', error);
        res.status(500).json({ error: 'Failed to reset SMS queue' });
    }
}
exports.default = {
    getSMSQueue,
    clearSMSQueue,
    deleteSMS,
    resetSMSQueue
};
