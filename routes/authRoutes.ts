import { Router } from 'express';
import { register, login, getMe, changePassword } from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

router.post('/login',           login);
router.post('/register',        register);
router.get('/me',               protect, getMe);
router.post('/change-password', protect, changePassword);

export default router;
