import { Router } from 'express';
import { protect } from '../middleware/authMiddleware';
import { uploadScanPhoto, getScanPhotos } from '../controllers/scanPhotoController';

const router = Router();

router.get('/',  protect, getScanPhotos);
router.post('/', protect, uploadScanPhoto);

export default router;