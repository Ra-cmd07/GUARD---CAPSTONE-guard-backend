"use strict";
/**
 * Background Upload Queue
 * Processes Cloudinary uploads asynchronously without blocking kiosk responses
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadQueue = void 0;
const db_1 = __importDefault(require("../lib/db"));
const cloudinaryUpload_1 = require("./cloudinaryUpload");
class UploadQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        this.processingInterval = 2000; // Check every 2 seconds
    }
    /**
     * Add photo upload job to queue
     */
    enqueue(attendanceId, localPath, studentName) {
        this.queue.push({
            attendanceId,
            localPath,
            studentName,
            retries: 0,
        });
        console.log(`📥 Upload queued: Attendance #${attendanceId} (Queue size: ${this.queue.length})`);
        // Start processing if not already running
        if (!this.processing) {
            this.startProcessing();
        }
    }
    /**
     * Start processing queue (runs continuously in background)
     */
    async startProcessing() {
        if (this.processing)
            return;
        this.processing = true;
        console.log('🚀 Upload queue processor started');
        while (true) {
            try {
                // Process next job if available
                if (this.queue.length > 0) {
                    const job = this.queue.shift();
                    await this.processJob(job);
                }
                // Wait before checking for next job
                await this.sleep(this.processingInterval);
            }
            catch (error) {
                console.error('❌ Upload queue error:', error);
                await this.sleep(this.processingInterval);
            }
        }
    }
    /**
     * Process a single upload job
     */
    async processJob(job) {
        const { attendanceId, localPath, studentName, retries } = job;
        try {
            console.log(`⚙️  Processing upload: Attendance #${attendanceId} (Attempt ${retries + 1}/${this.maxRetries})`);
            // Upload to Cloudinary
            const result = await (0, cloudinaryUpload_1.uploadToCloudinary)(localPath, studentName);
            if (result.success && result.url) {
                // Update attendance table (if record exists there)
                const [attResult] = await db_1.default.execute(`UPDATE attendance 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE id = ?`, [result.url, attendanceId]);
                // Also update partial_attendance table (if record is still there)
                const [partialResult] = await db_1.default.execute(`UPDATE partial_attendance 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE id = ?`, [result.url, attendanceId]);
                // Also update scan_photos table if exists
                await db_1.default.execute(`UPDATE scan_photos 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE attendance_id = ?`, [result.url, attendanceId]);
                const updated = attResult.affectedRows + partialResult.affectedRows;
                console.log(`✅ Upload complete: Attendance #${attendanceId} → ${result.url} (Updated ${updated} record(s))`);
            }
            else {
                // Upload failed, retry if possible
                throw new Error(result.error || 'Upload failed');
            }
        }
        catch (error) {
            console.error(`❌ Upload failed for Attendance #${attendanceId}:`, error.message);
            // Retry if under max retries
            if (retries < this.maxRetries) {
                console.log(`🔄 Retrying in ${this.retryDelay / 1000}s... (${retries + 1}/${this.maxRetries})`);
                setTimeout(() => {
                    this.queue.push({
                        ...job,
                        retries: retries + 1,
                    });
                }, this.retryDelay);
            }
            else {
                console.error(`❌ Max retries reached for Attendance #${attendanceId}. Upload failed permanently.`);
                // Mark as failed in database (optional)
                try {
                    await db_1.default.execute(`UPDATE attendance 
             SET cloudinary_uploaded = FALSE 
             WHERE id = ?`, [attendanceId]);
                }
                catch (dbError) {
                    console.error('Failed to update database:', dbError);
                }
            }
        }
    }
    /**
     * Get queue status
     */
    getStatus() {
        return {
            queueSize: this.queue.length,
            processing: this.processing,
        };
    }
    /**
     * Utility sleep function
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
// Export singleton instance
exports.uploadQueue = new UploadQueue();
exports.default = exports.uploadQueue;
