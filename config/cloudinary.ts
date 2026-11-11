import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import multer from 'multer';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dhhxctw08',
  api_key: process.env.CLOUDINARY_API_KEY || '966894197122486',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'HOKZDDJhRNF7cMaC_lgDSZFtEz8',
});

// Create Cloudinary storage for multer
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

// Create multer upload middleware
export const uploadToCloudinary = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

export { cloudinary };
export default cloudinary;
