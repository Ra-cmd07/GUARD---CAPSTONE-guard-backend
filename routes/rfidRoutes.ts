import { Router } from 'express';
import { createRfidLog, getRfidLogs, getRfidDashboard } from '../controllers/rfidController';

const router = Router();

router.post('/', createRfidLog);
router.get('/logs', getRfidLogs);
router.get('/dashboard', getRfidDashboard);

export default router;
