import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import {
  getAttendance,
  createAttendance,
  updateAttendance,
  deleteAttendance,
  getAttendanceStats,
  getOverrideLogs,
  getRecentAttendance,
} from '../controllers/attendanceController';

const router = Router();

router.get('/',          protect, getAttendance);
router.post('/',         protect, createAttendance);
router.patch('/:id',     protect, requireRole('admin','teacher'), updateAttendance);
router.delete('/:id',    protect, requireRole('admin'), deleteAttendance);
router.get('/stats',     protect, getAttendanceStats);
router.get('/overrides', protect, requireRole('admin','teacher'), getOverrideLogs);
router.get('/recent',    getRecentAttendance); // Public endpoint for kiosk polling

export default router;
