"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const reportsController_1 = require("../controllers/reportsController");
const router = (0, express_1.Router)();
// ─── Reports ──────────────────────────────────────────────────────────
router.get('/attendance-trend', authMiddleware_1.protect, reportsController_1.getAttendanceTrend);
router.get('/daily-summary', authMiddleware_1.protect, reportsController_1.getDailySummary);
exports.default = router;
