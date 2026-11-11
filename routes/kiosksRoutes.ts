import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getKiosks,
  pingKiosk,
  createKiosk,
  updateKiosk,
  deleteKiosk,
} from '../controllers/kiosksController';

const router = Router();

// ─── Kiosk Management ─────────────────────────────────────────────────
router.get('/',       protect, getKiosks);
router.post('/',      protect, createKiosk);
router.post('/:id/ping', protect, pingKiosk);
router.put('/:id',    protect, updateKiosk);
router.delete('/:id', protect, deleteKiosk);

export default router;
