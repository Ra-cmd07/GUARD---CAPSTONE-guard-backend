"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authMiddleware_1 = require("../middleware/authMiddleware");
const guardianController_1 = require("../controllers/guardianController");
const router = (0, express_1.Router)();
router.get('/', authMiddleware_1.protect, guardianController_1.getGuardians);
router.post('/', authMiddleware_1.protect, guardianController_1.createGuardian);
exports.default = router;
