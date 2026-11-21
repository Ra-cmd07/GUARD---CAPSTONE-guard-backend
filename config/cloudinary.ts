import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dhhxctw08',
  api_key: process.env.CLOUDINARY_API_KEY || '966894197122486',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'HOKZDDJhRNF7cMaC_lgDSZFtEz8',
});

// Create Cloudinary storage for multer (attendance photos)
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    return {
      folder: 'attendbox/scans', // Folder in Cloudinary
      format: 'jpg', // Force JPG format
      public_id: `${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, '')}`, // Unique filename
      transformation: [{ width: 800, height: 800, crop: 'limit' }], // Optimize image size
    };
  },
});

// Create Cloudinary storage for excuse documents (PDF + images)
const excuseDocStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    // Get file extension
    const ext = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    const isPdf = ext === 'pdf';

    return {
      folder: 'attendbox/excuse_documents',
      format: isPdf ? 'pdf' : undefined, // Keep PDF as PDF, auto-detect for images
      public_id: `excuse_${Date.now()}_${file.originalname.replace(/\.[^/.]+$/, '')}`,
      resource_type: isPdf ? 'raw' : 'image', // 'raw' for PDF, 'image' for images
      transformation: isPdf ? undefined : [{ width: 1200, height: 1200, crop: 'limit' }],
    };
  },
});

// Create multer upload middleware for attendance photos
export const uploadToCloudinary = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// Create multer upload middleware for excuse documents
export const uploadExcuseDocument = multer({
  storage: excuseDocStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    // Accept only PDF and image files
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, JPG, JPEG, and PNG files are allowed'));
    }
  },
});

export { cloudinary };
export default cloudinary;
