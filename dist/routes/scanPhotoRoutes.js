"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const scanPhotoController_1 = require("../controllers/scanPhotoController");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.protect, scanPhotoController_1.getScanPhotos);
router.post('/', authMiddleware_1.protect, scanPhotoController_1.uploadScanPhoto);
exports.default = router;
