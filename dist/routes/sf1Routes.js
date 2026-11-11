"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const sf1Controller_1 = require("../controllers/sf1Controller");
const router = express_1.default.Router();
// GET  /api/sf1/preview  — preview what students would fill the SF1
router.get('/preview', authMiddleware_1.protect, sf1Controller_1.getSF1Preview);
// POST /api/sf1/generate — generate filled SF1 using stored template
router.post('/generate', authMiddleware_1.protect, sf1Controller_1.sf1Upload.single('template'), sf1Controller_1.generateSF1);
// POST /api/sf1/upload-template — upload custom SF1 template
router.post('/upload-template', authMiddleware_1.protect, sf1Controller_1.sf1Upload.single('template'), sf1Controller_1.uploadSF1Template);
// GET /api/sf1/download-template — download current SF1 template
router.get('/download-template', authMiddleware_1.protect, sf1Controller_1.downloadSF1Template);
// DELETE /api/sf1/reset-template — reset to default template
router.delete('/reset-template', authMiddleware_1.protect, sf1Controller_1.resetSF1Template);
exports.default = router;
