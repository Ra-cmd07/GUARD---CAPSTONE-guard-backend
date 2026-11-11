"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const locationController_1 = require("../controllers/locationController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Real-time BLE location updates
router.post('/ble-update', locationController_1.updateBleLocation);
router.post('/ble-batch', locationController_1.updateBleLocationBatch);
router.post('/trilateration-update', locationController_1.updateTrilaterationPosition); // NEW: For trilateration server
// Get live student positions
router.get('/students-live', authMiddleware_1.protect, locationController_1.getLiveStudentLocations);
// Get specific student location (for parent dashboard)
router.get('/student/:id', locationController_1.getStudentLocation);
// Get all beacons
router.get('/beacons', locationController_1.getBeacons);
// Deactivate student location
router.post('/deactivate/:studentId', authMiddleware_1.protect, locationController_1.deactivateStudentLocation);
// Clear student location history
router.delete('/student/:id/clear', authMiddleware_1.protect, locationController_1.clearStudentLocationHistory);
exports.default = router;
