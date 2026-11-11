import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  sendMessage,
  getTeacherMessages,
  getParentMessages,
  markMessageRead,
  deleteParentMessage,
} from '../controllers/messageController';

const router = express.Router();
router.use(protect);

// ─── Teacher routes ───────────────────────────────────────────────────
router.post('/teacher', sendMessage);
router.get('/teacher',  getTeacherMessages);

// ─── Parent routes ────────────────────────────────────────────────────
router.get('/parent',              getParentMessages);
router.patch('/parent/:id/read',   markMessageRead);
router.delete('/parent/:id',       deleteParentMessage);

export default router;
