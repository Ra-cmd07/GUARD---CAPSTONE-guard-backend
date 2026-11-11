import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { createGuardian, getGuardians } from '../controllers/guardianController';

const router = Router();

router.get('/',  protect, getGuardians);
router.post('/', protect, createGuardian);

export default router;