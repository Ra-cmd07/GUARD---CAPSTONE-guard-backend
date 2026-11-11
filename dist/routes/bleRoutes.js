"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bleBeaconController_1 = require("../controllers/bleBeaconController");
const router = (0, express_1.Router)();
// BLE beacon detection from ESP32 (no auth needed - ESP32 posts directly)
router.post('/beacon-detect', bleBeaconController_1.handleBeaconDetection);
// Get location history (for live map)
router.get('/location-history', bleBeaconController_1.getLocationHistory);
exports.default = router;
