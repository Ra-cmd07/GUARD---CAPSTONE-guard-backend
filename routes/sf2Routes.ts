import { Router } from 'express';
import { protect, requireRole } from '../middleware/authMiddleware';
import {
  generateSF2,
  getSF2Preview,
  getCoordinationStatus,
  getSF2History,
  inspectTemplate,
  sf2Upload,
} from '../controllers/sf2Controller';

const router = Router();

// All SF2 routes require authentication
router.use(protect);

// Generate SF2 — adviser uploads blank template + picks month/year
router.post('/generate',
  requireRole('teacher', 'admin'),
  sf2Upload.single('template'),
  generateSF2,
);

// Preview attendance data before generating
router.get('/preview',             requireRole('teacher', 'admin'), getSF2Preview);

// Coordination status — how many days each subject teacher recorded
router.get('/coordination-status', requireRole('teacher', 'admin'), getCoordinationStatus);

// History of generated SF2s
router.get('/history',             requireRole('teacher', 'admin'), getSF2History);

// Diagnostic: inspect template cell layout to find correct header positions
router.post('/inspect-template',
  requireRole('teacher', 'admin'),
  sf2Upload.single('template'),
  inspectTemplate,
);

export default router;
