"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const announcementController_1 = require("../controllers/announcementController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
// POST /api/announcements   — admin publishes announcement
router.post('/', announcementController_1.createAnnouncement);
// GET  /api/announcements   — admin views past announcements
router.get('/', announcementController_1.getAnnouncements);
exports.default = router;
