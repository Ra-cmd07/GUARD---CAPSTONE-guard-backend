"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const buildingController_1 = require("../controllers/buildingController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.protect);
// Building routes
router.get('/buildings', buildingController_1.getAllBuildings);
router.get('/buildings/:id/floors', buildingController_1.getBuildingFloors);
// Floor routes
router.get('/buildings/floors/:floorId/rooms', buildingController_1.getFloorRooms);
// Room routes
router.get('/buildings/rooms/:roomId/floor-plan', buildingController_1.getRoomFloorPlan);
router.get('/buildings/rooms/:roomId/students', buildingController_1.getRoomStudents);
exports.default = router;
