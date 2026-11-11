"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const kiosksController_1 = require("../controllers/kiosksController");
const router = (0, express_1.Router)();
// ─── Kiosk Management ─────────────────────────────────────────────────
router.get('/', authMiddleware_1.protect, kiosksController_1.getKiosks);
router.post('/', authMiddleware_1.protect, kiosksController_1.createKiosk);
router.post('/:id/ping', authMiddleware_1.protect, kiosksController_1.pingKiosk);
router.put('/:id', authMiddleware_1.protect, kiosksController_1.updateKiosk);
router.delete('/:id', authMiddleware_1.protect, kiosksController_1.deleteKiosk);
exports.default = router;
