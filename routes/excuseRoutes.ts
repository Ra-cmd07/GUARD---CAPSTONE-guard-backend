import express from 'express';
import { protect } from '../middleware/authMiddleware';
import {
  submitExcuse,
  getParentExcuseRequests,
  getTeacherExcuseRequests,
  resolveExcuseRequest,
  deleteExcuseRequest,
} from '../controllers/excuseController';

const router = express.Router();
router.use(protect);

// ─── Parent routes ────────────────────────────────────────────────────
// POST /api/excuse/parent         — parent submits excuse
router.post('/parent', submitExcuse);
// GET  /api/excuse/parent         — parent views their requests
router.get('/parent', getParentExcuseRequests);

// ─── Teacher routes ───────────────────────────────────────────────────
// GET   /api/excuse/teacher?status=pending|all  — teacher views requests
router.get('/teacher', getTeacherExcuseRequests);
// PATCH /api/excuse/teacher/:id   — teacher approves or rejects
router.patch('/teacher/:id', resolveExcuseRequest);
// DELETE /api/excuse/teacher/:id  — teacher deletes a request
router.delete('/teacher/:id', deleteExcuseRequest);

export default router;
