"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const teacherController_1 = require("../controllers/teacherController");
const router = express_1.default.Router();
// All teacher routes require authentication
router.use(authMiddleware_1.protect);
// Get teacher's assigned classes and students
router.get('/classes', teacherController_1.getTeacherClasses);
// Get today's attendance summary for teacher's class
router.get('/attendance/today', teacherController_1.getTodayAttendanceSummary);
// ── NEW: Full class roster with kiosk scan status ─────────────────────
// GET /api/teacher/attendance/roster?date=2025-07-15&session=AM
router.get('/attendance/roster', teacherController_1.getAttendanceRoster);
// ── NEW: Confirm a student from roster into Final Attendance List ─────
// POST /api/teacher/attendance/confirm
// Body: { student_id, session, status?, date? }
// Enforces: student must have a kiosk scan to be confirmable
router.post('/attendance/confirm', teacherController_1.confirmAttendance);
// ── NEW: Auto-mark absent for session cutoff ──────────────────────────
// POST /api/teacher/attendance/auto-absent
// Body: { session, date? }
router.post('/attendance/auto-absent', teacherController_1.autoMarkAbsent);
// Mark manual attendance
router.post('/attendance/manual', teacherController_1.markManualAttendance);
// Add note to attendance record
router.post('/attendance/note', teacherController_1.addAttendanceNote);
// Excuse absence
router.post('/attendance/excuse', teacherController_1.excuseAbsence);
// Get all subject assignments for the logged-in teacher
router.get('/subject-assignments', teacherController_1.getTeacherSubjectAssignments);
// Get attendance for a specific assignment (subject+section)
router.get('/subject-attendance', teacherController_1.getSubjectAttendance);
// Verify / accept a partial attendance entry → moves to Final
router.post('/attendance/verify', teacherController_1.verifyPartialAttendance);
exports.default = router;
