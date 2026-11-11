"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rfidApprovalController_1 = require("../controllers/rfidApprovalController");
const router = (0, express_1.Router)();
// RFID approval routes (unauthenticated for ESP32 and kiosk)
router.post('/detect', rfidApprovalController_1.detectRFID); // ESP32 sends detection
router.get('/pending', rfidApprovalController_1.getPendingRFID); // Kiosk polls for pending
router.post('/approve/:id', rfidApprovalController_1.approveRFID); // Kiosk approves
router.post('/reject/:id', rfidApprovalController_1.rejectRFID); // Kiosk rejects
exports.default = router;
