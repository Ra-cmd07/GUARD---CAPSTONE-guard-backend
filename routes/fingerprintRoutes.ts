import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import {
  getLocations,
  createLocation,
  captureFingerprint,
  deleteLocation,
  getLocationSamples,
  predictLocation,
  captureDistanceCal,
  getDistanceCal,
  deleteDistanceCal,
  correctDistance,
  captureRoomZone,
  getRoomZones,
  deleteRoomZone,
  detectZone,
  getStudentStatus,
  getRoomEvents,
} from '../controllers/fingerprintController';

const router = Router();

// ── Public (authenticated) ─────────────────────────────────────────────
router.get('/locations',             protect, getLocations);
router.get('/locations/:id/samples', protect, getLocationSamples);
router.get('/predict',               protect, predictLocation);
router.get('/distance-cal',          protect, getDistanceCal);
router.get('/correct-distance',      protect, correctDistance);
router.get('/room-zones',            protect, getRoomZones);
router.get('/student-status',        protect, getStudentStatus);
router.get('/room-events',           protect, getRoomEvents);

// ── Internal (no auth — called from trilateration server) ──────────────
router.post('/detect-zone',                               detectZone);

// ── Admin only ─────────────────────────────────────────────────────────
router.post('/locations',                      protect, requireRole('admin'), createLocation);
router.post('/capture',                        protect, requireRole('admin'), captureFingerprint);
router.delete('/locations/:id',                protect, requireRole('admin'), deleteLocation);
router.post('/distance-cal',                   protect, requireRole('admin'), captureDistanceCal);
router.delete('/distance-cal/:anchor_id',      protect, requireRole('admin'), deleteDistanceCal);
router.post('/room-zones',                     protect, requireRole('admin'), captureRoomZone);
router.delete('/room-zones/:id',               protect, requireRole('admin'), deleteRoomZone);

export default router;
