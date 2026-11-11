"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const attendanceController_1 = require("../controllers/attendanceController");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.protect, attendanceController_1.getAttendance);
router.post('/', authMiddleware_1.protect, attendanceController_1.createAttendance);
router.patch('/:id', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin', 'teacher'), attendanceController_1.updateAttendance);
router.delete('/:id', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), attendanceController_1.deleteAttendance);
router.get('/stats', authMiddleware_1.protect, attendanceController_1.getAttendanceStats);
router.get('/overrides', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin', 'teacher'), attendanceController_1.getOverrideLogs);
router.get('/recent', attendanceController_1.getRecentAttendance); // Public endpoint for kiosk polling
exports.default = router;
