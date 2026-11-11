"use strict";
/**
 * GSM SMS Queue Routes
 * Routes for ESP32 + SIM800L GSM module integration
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const gsmController_1 = require("../controllers/gsmController");
const router = express_1.default.Router();
// Queue SMS for sending (called by kiosk backend)
router.post('/queue', gsmController_1.queueSMS);
// Get pending SMS (polled by ESP32)
router.get('/pending', gsmController_1.getPendingSMS);
// Mark SMS as sent (called by ESP32)
router.post('/ack/:id', gsmController_1.acknowledgeSMS);
// Mark SMS as failed (called by ESP32)
router.post('/failed/:id', gsmController_1.markSMSFailed);
// Get SMS queue status (monitoring)
router.get('/status', gsmController_1.getSMSQueueStatus);
exports.default = router;
