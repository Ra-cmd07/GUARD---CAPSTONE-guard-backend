"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cloudinary = exports.uploadToCloudinary = void 0;
const cloudinary_1 = require("cloudinary");
Object.defineProperty(exports, "cloudinary", { enumerable: true, get: function () { return cloudinary_1.v2; } });
const multer_storage_cloudinary_1 = require("multer-storage-cloudinary");
const multer_1 = __importDefault(require("multer"));
// Configure Cloudinary
cloudinary_1.v2.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dhhxctw08',
    api_key: process.env.CLOUDINARY_API_KEY || '966894197122486',
    api_secret: process.env.CLOUDINARY_API_SECRET || 'HOKZDDJhRNF7cMaC_lgDSZFtEz8',
});
// Create Cloudinary storage for multer
const storage = new multer_storage_cloudinary_1.CloudinaryStorage({
    cloudinary: cloudinary_1.v2,
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
exports.uploadToCloudinary = (0, multer_1.default)({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});
exports.default = cloudinary_1.v2;
