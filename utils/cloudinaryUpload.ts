/**
 * Cloudinary Upload Utility
 * Uploads attendance photos to Cloudinary CDN for mobile app access
 */

import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Configure Cloudinary with credentials from environment
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dhhxctw08',
  api_key: process.env.CLOUDINARY_API_KEY || '966894197122486',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'HOKZDDJhRNF7cMaC_lgDSZFtEz8',
});

export interface CloudinaryUploadResult {
  success: boolean;
  url?: string;
  publicId?: string;
  error?: string;
}

/**
 * Upload photo to Cloudinary from local file path
 * @param localPath Local file path (e.g., '/uploads/attendance_photos/scan_123.jpg')
 * @param studentName Student name for folder organization
 * @returns Cloudinary upload result with CDN URL
 */
export async function uploadToCloudinary(
  localPath: string,
  studentName: string
): Promise<CloudinaryUploadResult> {
  try {
    // Convert relative path to absolute
    // Handle both dev (ts-node from root) and prod (node from dist/) modes
    let absolutePath: string;
    if (localPath.startsWith('/uploads/')) {
      if (__dirname.includes('dist')) {
        // Production: dist/utils -> go up 2 levels to root, then into uploads
        absolutePath = path.join(__dirname, '..', '..', localPath.substring(1));  // Remove leading /
      } else {
        // Development: utils -> go up 1 level to root, then into uploads
        absolutePath = path.join(__dirname, '..', localPath.substring(1));  // Remove leading /
      }
    } else {
      absolutePath = localPath;
    }

    // Check if file exists
    if (!fs.existsSync(absolutePath)) {
      console.error(`❌ File not found: ${absolutePath}`);
      return { success: false, error: 'File not found' };
    }

    // Generate folder path based on date and student
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeName = studentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const folderPath = `attendbox/attendance/${year}/${month}/${safeName}`;

    console.log(`☁️  Uploading to Cloudinary: ${localPath}`);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(absolutePath, {
      folder: folderPath,
      resource_type: 'image',
      format: 'jpg',
      transformation: [
        { quality: 'auto:good' }, // Optimize quality/size
        { fetch_format: 'auto' }, // Auto-select best format (WebP, etc.)
      ],
    });

    console.log(`✅ Cloudinary upload success: ${result.secure_url}`);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error: any) {
    console.error('❌ Cloudinary upload failed:', error.message);
    return {
      success: false,
      error: error.message || 'Upload failed',
    };
  }
}

/**
 * Upload photo to Cloudinary from base64 data (alternative method)
 * @param base64Data Base64 encoded image data
 * @param studentName Student name for folder organization
 * @param prefix Filename prefix
 * @returns Cloudinary upload result with CDN URL
 */
export async function uploadBase64ToCloudinary(
  base64Data: string,
  studentName: string,
  prefix: string = 'scan'
): Promise<CloudinaryUploadResult> {
  try {
    // Generate folder path
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const safeName = studentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const folderPath = `attendbox/attendance/${year}/${month}/${safeName}`;

    // Ensure base64 has proper prefix
    const base64WithPrefix = base64Data.startsWith('data:image/')
      ? base64Data
      : `data:image/jpeg;base64,${base64Data}`;

    console.log(`☁️  Uploading base64 to Cloudinary: ${prefix}_${safeName}`);

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(base64WithPrefix, {
      folder: folderPath,
      resource_type: 'image',
      format: 'jpg',
      public_id: `${prefix}_${Date.now()}`,
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' },
      ],
    });

    console.log(`✅ Cloudinary upload success: ${result.secure_url}`);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
    };
  } catch (error: any) {
    console.error('❌ Cloudinary upload failed:', error.message);
    return {
      success: false,
      error: error.message || 'Upload failed',
    };
  }
}

/**
 * Delete photo from Cloudinary
 * @param publicId Cloudinary public ID
 * @returns Success status
 */
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  try {
    await cloudinary.uploader.destroy(publicId);
    console.log(`🗑️  Cloudinary photo deleted: ${publicId}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to delete from Cloudinary:', error);
    return false;
  }
}

export default {
  uploadToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
};
