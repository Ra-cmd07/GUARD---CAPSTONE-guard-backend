"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const attendanceAlertController_1 = require("../controllers/attendanceAlertController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
// GET  /api/alerts/admin           — admin: view all at-risk students
router.get('/admin', attendanceAlertController_1.getAdminAlerts);
// GET  /api/alerts/teacher         — teacher: view at-risk in their section
router.get('/teacher', attendanceAlertController_1.getTeacherAlerts);
// GET  /api/alerts/parent          — parent: check if their child is at risk
router.get('/parent', attendanceAlertController_1.getParentAlerts);
// PATCH /api/alerts/:id/dismiss    — admin or parent dismisses an alert
router.patch('/:id/dismiss', attendanceAlertController_1.dismissAlert);
// POST /api/alerts/run-check       — manually trigger threshold check
router.post('/run-check', attendanceAlertController_1.manualRunCheck);
exports.default = router;
