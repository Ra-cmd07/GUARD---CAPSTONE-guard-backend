"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
// All notification routes require authentication
router.use(authMiddleware_1.protect);
// GET  /api/notifications          — get all notifications for logged-in user
router.get('/', notificationController_1.getNotifications);
// PATCH /api/notifications/read-all — mark all as read (must be before :id route)
router.patch('/read-all', notificationController_1.markAllRead);
// PATCH /api/notifications/:id/read — mark one as read
router.patch('/:id/read', notificationController_1.markOneRead);
exports.default = router;
