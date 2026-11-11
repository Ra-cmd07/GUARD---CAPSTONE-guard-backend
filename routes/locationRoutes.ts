import { Router } from 'express';
import {
  updateBleLocation,
  updateBleLocationBatch,
  getLiveStudentLocations,
  getStudentLocation,
  getBeacons,
  deactivateStudentLocation,
  clearStudentLocationHistory,
  updateTrilaterationPosition,
} from '../controllers/locationController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// Real-time BLE location updates
router.post('/ble-update', updateBleLocation);
router.post('/ble-batch', updateBleLocationBatch);
router.post('/trilateration-update', updateTrilaterationPosition);  // NEW: For trilateration server

// Get live student positions
router.get('/students-live', protect, getLiveStudentLocations);

// Get specific student location (for parent dashboard)
router.get('/student/:id', getStudentLocation);

// Get all beacons
router.get('/beacons', getBeacons);

// Deactivate student location
router.post('/deactivate/:studentId', protect, deactivateStudentLocation);

// Clear student location history
router.delete('/student/:id/clear', protect, clearStudentLocationHistory);

export default router;
