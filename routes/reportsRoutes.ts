import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getAttendanceTrend,
  getDailySummary,
} from '../controllers/reportsController';

const router = Router();

// ─── Reports ──────────────────────────────────────────────────────────
router.get('/attendance-trend', protect, getAttendanceTrend);
router.get('/daily-summary',    protect, getDailySummary);

export default router;
