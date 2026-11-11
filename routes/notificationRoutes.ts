import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  getNotifications,
  markOneRead,
  markAllRead,
} from '../controllers/notificationController';

const router = express.Router();

// All notification routes require authentication
router.use(protect);

// GET  /api/notifications          — get all notifications for logged-in user
router.get('/', getNotifications);

// PATCH /api/notifications/read-all — mark all as read (must be before :id route)
router.patch('/read-all', markAllRead);

// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', markOneRead);

export default router;
