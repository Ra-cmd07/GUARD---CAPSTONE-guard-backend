import { Router } from 'express';
import {
  getAllBuildings,
  getBuildingFloors,
  getFloorRooms,
  getRoomFloorPlan,
  getRoomStudents
} from '../controllers/buildingController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication
router.use(protect);

// Building routes
router.get('/buildings', getAllBuildings);
router.get('/buildings/:id/floors', getBuildingFloors);

// Floor routes
router.get('/buildings/floors/:floorId/rooms', getFloorRooms);

// Room routes
router.get('/buildings/rooms/:roomId/floor-plan', getRoomFloorPlan);
router.get('/buildings/rooms/:roomId/students', getRoomStudents);

export default router;
