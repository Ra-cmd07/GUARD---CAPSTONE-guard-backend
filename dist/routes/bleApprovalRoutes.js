"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bleApprovalController_1 = require("../controllers/bleApprovalController");
const router = (0, express_1.Router)();
// Get pending BLE detections
router.get('/pending', bleApprovalController_1.getPendingDetections);
// Approve a detection and record attendance
router.post('/approve/:id', bleApprovalController_1.approveDetection);
// Reject a detection (don't record attendance)
router.post('/reject/:id', bleApprovalController_1.rejectDetection);
exports.default = router;
