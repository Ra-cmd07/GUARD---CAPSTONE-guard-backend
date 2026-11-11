/**
 * GSM SMS Queue Routes
 * Routes for ESP32 + SIM800L GSM module integration
 */

import express from 'express';
import {
  queueSMS,
  getPendingSMS,
  acknowledgeSMS,
  markSMSFailed,
  getSMSQueueStatus
} from '../controllers/gsmController';

const router = express.Router();

// Queue SMS for sending (called by kiosk backend)
router.post('/queue', queueSMS);

// Get pending SMS (polled by ESP32)
router.get('/pending', getPendingSMS);

// Mark SMS as sent (called by ESP32)
router.post('/ack/:id', acknowledgeSMS);

// Mark SMS as failed (called by ESP32)
router.post('/failed/:id', markSMSFailed);

// Get SMS queue status (monitoring)
router.get('/status', getSMSQueueStatus);

export default router;
