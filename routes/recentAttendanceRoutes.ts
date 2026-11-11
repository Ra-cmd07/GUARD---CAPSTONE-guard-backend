import { Router } from 'express';
import { getRecentAttendanceDetailed } from '../controllers/recentAttendanceController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/attendance/recent-detailed
 * Returns last 7 days of attendance with:
 * - Subject teacher + subject name
 * - Adviser name
 * - Parents with phone numbers
 */
router.get('/recent-detailed', protect, getRecentAttendanceDetailed);

export default router;
