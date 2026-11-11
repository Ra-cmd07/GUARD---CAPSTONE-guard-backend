import { Router } from 'express';
import { 
  detectRFID, 
  getPendingRFID, 
  approveRFID, 
  rejectRFID 
} from '../controllers/rfidApprovalController';

const router = Router();

// RFID approval routes (unauthenticated for ESP32 and kiosk)
router.post('/detect',       detectRFID);      // ESP32 sends detection
router.get('/pending',        getPendingRFID);  // Kiosk polls for pending
router.post('/approve/:id',   approveRFID);     // Kiosk approves
router.post('/reject/:id',    rejectRFID);      // Kiosk rejects

export default router;
