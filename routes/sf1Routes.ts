import express from 'express';
import { protect } from '../middleware/authMiddleware';
import { 
  sf1Upload, 
  generateSF1, 
  getSF1Preview,
  uploadSF1Template,
  downloadSF1Template,
  resetSF1Template
} from '../controllers/sf1Controller';

const router = express.Router();

// GET  /api/sf1/preview  — preview what students would fill the SF1
router.get('/preview', protect, getSF1Preview);

// POST /api/sf1/generate — generate filled SF1 using stored template
router.post('/generate', protect, sf1Upload.single('template'), generateSF1);

// POST /api/sf1/upload-template — upload custom SF1 template
router.post('/upload-template', protect, sf1Upload.single('template'), uploadSF1Template);

// GET /api/sf1/download-template — download current SF1 template
router.get('/download-template', protect, downloadSF1Template);

// DELETE /api/sf1/reset-template — reset to default template
router.delete('/reset-template', protect, resetSF1Template);

export default router;
