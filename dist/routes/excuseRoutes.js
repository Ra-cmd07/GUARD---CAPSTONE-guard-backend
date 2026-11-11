"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const excuseController_1 = require("../controllers/excuseController");
const router = express_1.default.Router();
router.use(authMiddleware_1.protect);
// ─── Parent routes ────────────────────────────────────────────────────
// POST /api/excuse/parent         — parent submits excuse
router.post('/parent', excuseController_1.submitExcuse);
// GET  /api/excuse/parent         — parent views their requests
router.get('/parent', excuseController_1.getParentExcuseRequests);
// ─── Teacher routes ───────────────────────────────────────────────────
// GET   /api/excuse/teacher?status=pending|all  — teacher views requests
router.get('/teacher', excuseController_1.getTeacherExcuseRequests);
// PATCH /api/excuse/teacher/:id   — teacher approves or rejects
router.patch('/teacher/:id', excuseController_1.resolveExcuseRequest);
// DELETE /api/excuse/teacher/:id  — teacher deletes a request
router.delete('/teacher/:id', excuseController_1.deleteExcuseRequest);
exports.default = router;
