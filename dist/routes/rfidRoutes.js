"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rfidController_1 = require("../controllers/rfidController");
const router = (0, express_1.Router)();
router.post('/', rfidController_1.createRfidLog);
router.get('/logs', rfidController_1.getRfidLogs);
router.get('/dashboard', rfidController_1.getRfidDashboard);
exports.default = router;
