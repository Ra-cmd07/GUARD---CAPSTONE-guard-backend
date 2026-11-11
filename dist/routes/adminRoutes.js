"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const adminController_1 = require("../controllers/adminController");
const adminSMSController_1 = require("../controllers/adminSMSController");
const router = (0, express_1.Router)();
const admin = [authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin')];
router.get('/dashboard', ...admin, adminController_1.getDashboardStats);
router.get('/users', ...admin, adminController_1.getUsers);
router.get('/users/:id', ...admin, adminController_1.getUserById);
router.post('/users', ...admin, adminController_1.createUser);
router.put('/users/:id', ...admin, adminController_1.updateUser);
router.post('/users/:id/reset-password', ...admin, adminController_1.resetPassword);
router.patch('/users/:id/toggle-status', ...admin, adminController_1.toggleUserStatus);
router.post('/students/:id/add-parent', ...admin, adminController_1.addParentToStudent);
router.post('/students/:id/upload-photo', ...admin, adminController_1.uploadStudentPhoto);
router.delete('/students/:id/photo', ...admin, adminController_1.removeStudentPhoto);
// School logo management
router.post('/school-logo/upload', ...admin, adminController_1.uploadSchoolLogo);
router.get('/school-logo', ...admin, adminController_1.getSchoolLogo);
router.delete('/school-logo', ...admin, adminController_1.removeSchoolLogo);
router.get('/kiosks', ...admin, adminController_1.getKiosks);
router.post('/kiosks', ...admin, adminController_1.createKiosk);
router.put('/kiosks/:id', ...admin, adminController_1.updateKiosk);
router.get('/sms-logs', ...admin, adminController_1.getSmsLogs);
router.delete('/sms-logs/clear', ...admin, adminController_1.clearSmsLogs);
router.get('/login-logs', ...admin, adminController_1.getLoginLogs);
// SMS Queue Management
router.get('/sms-queue', ...admin, adminSMSController_1.getSMSQueue);
router.delete('/sms-queue', ...admin, adminSMSController_1.clearSMSQueue);
router.delete('/sms-queue/:id', ...admin, adminSMSController_1.deleteSMS);
router.post('/sms-queue/reset', ...admin, adminSMSController_1.resetSMSQueue);
// School settings
router.get('/school-settings', ...admin, adminController_1.getSchoolSettings);
router.put('/school-settings', ...admin, adminController_1.updateSchoolSettings);
exports.default = router;
