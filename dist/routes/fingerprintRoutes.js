"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const fingerprintController_1 = require("../controllers/fingerprintController");
const router = (0, express_1.Router)();
// ── Public (authenticated) ─────────────────────────────────────────────
router.get('/locations', authMiddleware_1.protect, fingerprintController_1.getLocations);
router.get('/locations/:id/samples', authMiddleware_1.protect, fingerprintController_1.getLocationSamples);
router.get('/predict', authMiddleware_1.protect, fingerprintController_1.predictLocation);
router.get('/distance-cal', authMiddleware_1.protect, fingerprintController_1.getDistanceCal);
router.get('/correct-distance', authMiddleware_1.protect, fingerprintController_1.correctDistance);
router.get('/room-zones', authMiddleware_1.protect, fingerprintController_1.getRoomZones);
router.get('/student-status', authMiddleware_1.protect, fingerprintController_1.getStudentStatus);
router.get('/room-events', authMiddleware_1.protect, fingerprintController_1.getRoomEvents);
// ── Internal (no auth — called from trilateration server) ──────────────
router.post('/detect-zone', fingerprintController_1.detectZone);
// ── Admin only ─────────────────────────────────────────────────────────
router.post('/locations', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.createLocation);
router.post('/capture', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.captureFingerprint);
router.delete('/locations/:id', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.deleteLocation);
router.post('/distance-cal', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.captureDistanceCal);
router.delete('/distance-cal/:anchor_id', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.deleteDistanceCal);
router.post('/room-zones', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.captureRoomZone);
router.delete('/room-zones/:id', authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin'), fingerprintController_1.deleteRoomZone);
exports.default = router;
