import { Router } from 'express';
import { kioskScan, kioskPing, getKioskList, getRecentScans, registerESP32, verifyKioskPassword, getLoginAttempts, getKioskSettings, updateKioskSettings, getCurrentAttendanceStatus } from '../controllers/kioskController';

const router = Router();

// Kiosk routes are intentionally unauthenticated — the kiosk is a trusted device
router.post('/scan',           kioskScan);
router.get('/ping/:kioskId',   kioskPing);
router.get('/list',            getKioskList);
router.get('/recent-scans',    getRecentScans);

// ESP32 Auto-Registration (called by ESP32 on boot)
router.post('/register-esp32', registerESP32);

// Kiosk password protection
router.post('/verify-password', verifyKioskPassword);
router.get('/login-attempts',   getLoginAttempts);

// Kiosk settings management
router.get('/settings',  getKioskSettings);
router.post('/settings', updateKioskSettings);

// Current attendance status (who's in/out)
router.get('/current-status', getCurrentAttendanceStatus);

export default router;
