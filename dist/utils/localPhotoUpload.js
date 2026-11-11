"use strict";
/**
 * Local Photo Upload Utility
 * Saves attendance photos to local uploads folder instead of Cloudinary
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.savePhotoLocally = savePhotoLocally;
exports.deletePhotoLocally = deletePhotoLocally;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
/**
 * Save base64 photo to local uploads folder
 * @param base64Data Base64 encoded image data (without data:image/jpeg;base64, prefix)
 * @param studentName Student name for filename
 * @param prefix Filename prefix (e.g., 'ble', 'rfid', 'scan')
 * @returns Relative path to saved photo (e.g., '/uploads/attendance_photos/ble_1234567890_John_Doe.jpg')
 */
async function savePhotoLocally(base64Data, studentName, prefix = 'scan') {
    try {
        // Create uploads directory if it doesn't exist
        const uploadsDir = path_1.default.join(__dirname, '..', 'uploads', 'attendance_photos');
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        // Generate unique filename
        const timestamp = Date.now();
        const safeName = studentName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
        const filename = `${prefix}_${timestamp}_${safeName}.jpg`;
        const filepath = path_1.default.join(uploadsDir, filename);
        // Convert base64 to buffer and save
        const imageBuffer = Buffer.from(base64Data, 'base64');
        fs_1.default.writeFileSync(filepath, imageBuffer);
        // Return relative path that frontend can use
        const relativePath = `/uploads/attendance_photos/${filename}`;
        console.log(`📸 Photo saved locally: ${relativePath}`);
        return relativePath;
    }
    catch (error) {
        console.error('❌ Failed to save photo locally:', error);
        throw error;
    }
}
/**
 * Delete photo from local storage
 * @param photoPath Path to photo (e.g., '/uploads/attendance_photos/scan_123.jpg')
 */
function deletePhotoLocally(photoPath) {
    try {
        if (!photoPath || !photoPath.startsWith('/uploads/')) {
            return; // Not a local photo path
        }
        const filepath = path_1.default.join(__dirname, '..', photoPath.replace('/uploads/', 'uploads/'));
        if (fs_1.default.existsSync(filepath)) {
            fs_1.default.unlinkSync(filepath);
            console.log(`🗑️ Photo deleted: ${photoPath}`);
        }
    }
    catch (error) {
        console.error('❌ Failed to delete photo:', error);
    }
}
