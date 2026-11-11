"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const anchorController_1 = require("../controllers/anchorController");
const router = (0, express_1.Router)();
/**
 * Anchor Configuration Routes (for ESP32 Plug and Play)
 */
// Get whitelist of students this anchor can detect
router.get('/:anchorId/whitelist', anchorController_1.getAnchorWhitelist);
// Get anchor room configuration
router.get('/:anchorId/info', anchorController_1.getAnchorInfo);
exports.default = router;
