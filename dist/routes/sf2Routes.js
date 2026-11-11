"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const sf2Controller_1 = require("../controllers/sf2Controller");
const router = (0, express_1.Router)();
// All SF2 routes require authentication
router.use(authMiddleware_1.protect);
// Generate SF2 — adviser uploads blank template + picks month/year
router.post('/generate', (0, authMiddleware_1.requireRole)('teacher', 'admin'), sf2Controller_1.sf2Upload.single('template'), sf2Controller_1.generateSF2);
// Preview attendance data before generating
router.get('/preview', (0, authMiddleware_1.requireRole)('teacher', 'admin'), sf2Controller_1.getSF2Preview);
// Coordination status — how many days each subject teacher recorded
router.get('/coordination-status', (0, authMiddleware_1.requireRole)('teacher', 'admin'), sf2Controller_1.getCoordinationStatus);
// History of generated SF2s
router.get('/history', (0, authMiddleware_1.requireRole)('teacher', 'admin'), sf2Controller_1.getSF2History);
// Diagnostic: inspect template cell layout to find correct header positions
router.post('/inspect-template', (0, authMiddleware_1.requireRole)('teacher', 'admin'), sf2Controller_1.sf2Upload.single('template'), sf2Controller_1.inspectTemplate);
exports.default = router;
