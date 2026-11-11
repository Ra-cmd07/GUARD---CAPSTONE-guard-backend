"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const kioskController_1 = require("../controllers/kioskController");
const router = (0, express_1.Router)();
// Kiosk routes are intentionally unauthenticated — the kiosk is a trusted device
router.post('/scan', kioskController_1.kioskScan);
router.get('/ping/:kioskId', kioskController_1.kioskPing);
router.get('/list', kioskController_1.getKioskList);
router.get('/recent-scans', kioskController_1.getRecentScans);
// ESP32 Auto-Registration (called by ESP32 on boot)
router.post('/register-esp32', kioskController_1.registerESP32);
// Kiosk password protection
router.post('/verify-password', kioskController_1.verifyKioskPassword);
router.get('/login-attempts', kioskController_1.getLoginAttempts);
// Kiosk settings management
router.get('/settings', kioskController_1.getKioskSettings);
router.post('/settings', kioskController_1.updateKioskSettings);
// Current attendance status (who's in/out)
router.get('/current-status', kioskController_1.getCurrentAttendanceStatus);
exports.default = router;
