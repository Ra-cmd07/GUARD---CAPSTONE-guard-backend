import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { createAnnouncement, getAnnouncements } from '../controllers/announcementController';

const router = express.Router();
router.use(protect);

// POST /api/announcements   — admin publishes announcement
router.post('/', createAnnouncement);
// GET  /api/announcements   — admin views past announcements
router.get('/',  getAnnouncements);

export default router;
