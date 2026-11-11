/**
 * Local Photo Upload Utility
 * Saves attendance photos to local uploads folder instead of Cloudinary
 */

import fs from 'fs';
import path from 'path';

/**
 * Save base64 photo to local uploads folder
 * @param base64Data Base64 encoded image data (without data:image/jpeg;base64, prefix)
 * @param studentName Student name for filename
 * @param prefix Filename prefix (e.g., 'ble', 'rfid', 'scan')
 * @returns Relative path to saved photo (e.g., '/uploads/attendance_photos/ble_1234567890_John_Doe.jpg')
 */
export async function savePhotoLocally(
  base64Data: string, 
  studentName: string, 
  prefix: string = 'scan'
): Promise<string> {
  try {
    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(__dirname, '..', 'uploads', 'attendance_photos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const safeName = studentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${prefix}_${timestamp}_${safeName}.jpg`;
    const filepath = path.join(uploadsDir, filename);

    // Convert base64 to buffer and save
    const imageBuffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync(filepath, imageBuffer);

    // Return relative path that frontend can use
    const relativePath = `/uploads/attendance_photos/${filename}`;
    
    console.log(`📸 Photo saved locally: ${relativePath}`);
    
    return relativePath;
  } catch (error) {
    console.error('❌ Failed to save photo locally:', error);
    throw error;
  }
}

/**
 * Delete photo from local storage
 * @param photoPath Path to photo (e.g., '/uploads/attendance_photos/scan_123.jpg')
 */
export function deletePhotoLocally(photoPath: string): void {
  try {
    if (!photoPath || !photoPath.startsWith('/uploads/')) {
      return; // Not a local photo path
    }

    const filepath = path.join(__dirname, '..', photoPath.replace('/uploads/', 'uploads/'));
    
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`🗑️ Photo deleted: ${photoPath}`);
    }
  } catch (error) {
    console.error('❌ Failed to delete photo:', error);
  }
}
