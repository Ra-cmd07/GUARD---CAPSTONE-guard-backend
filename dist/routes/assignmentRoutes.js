"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const assignmentController_1 = require("../controllers/assignmentController");
const router = express_1.default.Router();
const admin = [authMiddleware_1.protect, (0, authMiddleware_1.requireRole)('admin')];
router.get('/', ...admin, assignmentController_1.getAssignments);
router.get('/grouped', ...admin, assignmentController_1.getAssignmentsGrouped);
router.get('/metadata', ...admin, assignmentController_1.getAssignmentsMetadata);
router.post('/', ...admin, assignmentController_1.createAssignment);
router.put('/:id', ...admin, assignmentController_1.updateAssignment);
router.patch('/section-adviser', ...admin, assignmentController_1.updateSectionAdviser);
router.patch('/section-students', ...admin, assignmentController_1.updateSectionStudents);
router.delete('/:id', ...admin, assignmentController_1.deleteAssignment);
exports.default = router;
