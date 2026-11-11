import { Router } from 'express';
import {
  handleBeaconDetection,
  getLocationHistory
} from '../controllers/bleBeaconController';

const router = Router();

// BLE beacon detection from ESP32 (no auth needed - ESP32 posts directly)
router.post('/beacon-detect', handleBeaconDetection);

// Get location history (for live map)
router.get('/location-history', getLocationHistory);

export default router;
