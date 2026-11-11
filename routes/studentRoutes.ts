import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import {
  getStudents,
  createStudent,
  getStudentById,
  updateStudent,
  getStudentAttendance,
  hideAttendanceRecord,
  getStudentSmsLogs,
  clearStudentSmsLogs,
} from '../controllers/studentController';

const router = Router();

router.get('/',                  protect, getStudents);
router.post('/',                 protect, requireRole('admin','teacher'), createStudent);
router.get('/:id',               protect, getStudentById);
router.put('/:id',               protect, requireRole('admin','teacher'), updateStudent);
router.get('/:id/attendance',    protect, getStudentAttendance);
router.delete('/:id/attendance/:recordId/hide', protect, hideAttendanceRecord);
router.get('/:id/sms-logs',      protect, getStudentSmsLogs);
router.delete('/:id/sms-logs/clear', protect, clearStudentSmsLogs);

export default router;
