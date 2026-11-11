import { Router } from 'express';
import {
  getPendingDetections,
  approveDetection,
  rejectDetection,
} from '../controllers/bleApprovalController';

const router = Router();

// Get pending BLE detections
router.get('/pending', getPendingDetections);

// Approve a detection and record attendance
router.post('/approve/:id', approveDetection);

// Reject a detection (don't record attendance)
router.post('/reject/:id', rejectDetection);

export default router;
