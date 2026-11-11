import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import {
  getDashboardStats,
  getUsers,
  getUserById,
  createUser,
  updateUser,
  resetPassword,
  toggleUserStatus,
  getKiosks,
  createKiosk,
  updateKiosk,
  getSmsLogs,
  getLoginLogs,
  clearSmsLogs,
  addParentToStudent,
  getSchoolSettings,
  updateSchoolSettings,
  uploadStudentPhoto,
  removeStudentPhoto,
  uploadSchoolLogo,
  getSchoolLogo,
  removeSchoolLogo,
} from '../controllers/adminController';
import {
  getSMSQueue,
  clearSMSQueue,
  deleteSMS,
  resetSMSQueue
} from '../controllers/adminSMSController';

const router = Router();
const admin  = [protect, requireRole('admin')];

router.get('/dashboard',           ...admin, getDashboardStats);
router.get('/users',               ...admin, getUsers);
router.get('/users/:id',           ...admin, getUserById);
router.post('/users',              ...admin, createUser);
router.put('/users/:id',           ...admin, updateUser);
router.post('/users/:id/reset-password', ...admin, resetPassword);
router.patch('/users/:id/toggle-status', ...admin, toggleUserStatus);
router.post('/students/:id/add-parent', ...admin, addParentToStudent);
router.post('/students/:id/upload-photo', ...admin, uploadStudentPhoto);
router.delete('/students/:id/photo', ...admin, removeStudentPhoto);

// School logo management
router.post('/school-logo/upload', ...admin, uploadSchoolLogo);
router.get('/school-logo',         ...admin, getSchoolLogo);
router.delete('/school-logo',      ...admin, removeSchoolLogo);

router.get('/kiosks',              ...admin, getKiosks);
router.post('/kiosks',             ...admin, createKiosk);
router.put('/kiosks/:id',          ...admin, updateKiosk);

router.get('/sms-logs',            ...admin, getSmsLogs);
router.delete('/sms-logs/clear',   ...admin, clearSmsLogs);
router.get('/login-logs',          ...admin, getLoginLogs);

// SMS Queue Management
router.get('/sms-queue',           ...admin, getSMSQueue);
router.delete('/sms-queue',        ...admin, clearSMSQueue);
router.delete('/sms-queue/:id',    ...admin, deleteSMS);
router.post('/sms-queue/reset',    ...admin, resetSMSQueue);

// School settings
router.get('/school-settings',     ...admin, getSchoolSettings);
router.put('/school-settings',     ...admin, updateSchoolSettings);

export default router;
