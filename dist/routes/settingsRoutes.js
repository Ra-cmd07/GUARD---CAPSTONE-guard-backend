"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const db_1 = __importDefault(require("../lib/db"));
const router = (0, express_1.Router)();
/**
 * GET /api/settings/permissions
 * Get current permission settings
 */
router.get('/permissions', authMiddleware_1.protect, async (req, res) => {
    try {
        const [rows] = await db_1.default.query('SELECT setting_key, setting_value FROM system_settings WHERE setting_key = ?', ['allow_teacher_id_generation']);
        const settings = rows;
        const allowTeacherIDGeneration = settings.length > 0
            ? settings[0].setting_value === 'true'
            : false;
        res.json({
            allow_teacher_id_generation: allowTeacherIDGeneration,
        });
    }
    catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Failed to fetch settings' });
    }
});
/**
 * POST /api/settings/permissions
 * Update permission settings (Admin only)
 */
router.post('/permissions', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), async (req, res) => {
    try {
        const { allow_teacher_id_generation } = req.body;
        if (typeof allow_teacher_id_generation !== 'boolean') {
            return res.status(400).json({ error: 'Invalid setting value' });
        }
        const userId = req.user?.id;
        const value = allow_teacher_id_generation ? 'true' : 'false';
        // Insert or update setting
        await db_1.default.query(`INSERT INTO system_settings (setting_key, setting_value, updated_by, updated_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE 
       setting_value = VALUES(setting_value),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`, ['allow_teacher_id_generation', value, userId]);
        res.json({
            success: true,
            allow_teacher_id_generation,
            message: 'Settings updated successfully',
        });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Failed to update settings' });
    }
});
exports.default = router;
