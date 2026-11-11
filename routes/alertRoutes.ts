import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getAdminAlerts,
  getTeacherAlerts,
  getParentAlerts,
  dismissAlert,
  manualRunCheck,
} from '../controllers/attendanceAlertController';

const router = express.Router();
router.use(protect);

// GET  /api/alerts/admin           — admin: view all at-risk students
router.get('/admin',   getAdminAlerts);
// GET  /api/alerts/teacher         — teacher: view at-risk in their section
router.get('/teacher', getTeacherAlerts);
// GET  /api/alerts/parent          — parent: check if their child is at risk
router.get('/parent',  getParentAlerts);
// PATCH /api/alerts/:id/dismiss    — admin or parent dismisses an alert
router.patch('/:id/dismiss', dismissAlert);
// POST /api/alerts/run-check       — manually trigger threshold check
router.post('/run-check', manualRunCheck);

export default router;
