"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const recentAttendanceController_1 = require("../controllers/recentAttendanceController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
/**
 * GET /api/attendance/recent-detailed
 * Returns last 7 days of attendance with:
 * - Subject teacher + subject name
 * - Adviser name
 * - Parents with phone numbers
 */
router.get('/recent-detailed', authMiddleware_1.protect, recentAttendanceController_1.getRecentAttendanceDetailed);
exports.default = router;
