"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const messageController_1 = require("../controllers/messageController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
// ─── Teacher routes ───────────────────────────────────────────────────
router.post('/teacher', messageController_1.sendMessage);
router.get('/teacher', messageController_1.getTeacherMessages);
// ─── Parent routes ────────────────────────────────────────────────────
router.get('/parent', messageController_1.getParentMessages);
router.patch('/parent/:id/read', messageController_1.markMessageRead);
router.delete('/parent/:id', messageController_1.deleteParentMessage);
exports.default = router;
