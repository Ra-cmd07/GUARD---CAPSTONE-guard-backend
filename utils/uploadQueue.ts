/**
 * Background Upload Queue
 * Processes Cloudinary uploads asynchronously without blocking kiosk responses
 */

import pool from '../lib/db';
import { uploadToCloudinary } from './cloudinaryUpload';

interface UploadJob {
  attendanceId: number;
  localPath: string;
  studentName: string;
  retries: number;
}

class UploadQueue {
  private queue: UploadJob[] = [];
  private processing = false;
  private maxRetries = 3;
  private retryDelay = 5000; // 5 seconds
  private processingInterval = 2000; // Check every 2 seconds

  /**
   * Add photo upload job to queue
   */
  public enqueue(attendanceId: number, localPath: string, studentName: string): void {
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
  private async startProcessing(): Promise<void> {
    if (this.processing) return;

    this.processing = true;
    console.log('🚀 Upload queue processor started');

    while (true) {
      try {
        // Process next job if available
        if (this.queue.length > 0) {
          const job = this.queue.shift()!;
          await this.processJob(job);
        }

        // Wait before checking for next job
        await this.sleep(this.processingInterval);
      } catch (error) {
        console.error('❌ Upload queue error:', error);
        await this.sleep(this.processingInterval);
      }
    }
  }

  /**
   * Process a single upload job
   */
  private async processJob(job: UploadJob): Promise<void> {
    const { attendanceId, localPath, studentName, retries } = job;

    try {
      console.log(`⚙️  Processing upload: Attendance #${attendanceId} (Attempt ${retries + 1}/${this.maxRetries})`);

      // Upload to Cloudinary
      const result = await uploadToCloudinary(localPath, studentName);

      if (result.success && result.url) {
        // Update attendance table (if record exists there)
        const [attResult] = await pool.execute(
          `UPDATE attendance 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE id = ?`,
          [result.url, attendanceId]
        ) as any[];

        // Also update partial_attendance table (if record is still there)
        const [partialResult] = await pool.execute(
          `UPDATE partial_attendance 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE id = ?`,
          [result.url, attendanceId]
        ) as any[];

        // Also update scan_photos table if exists
        await pool.execute(
          `UPDATE scan_photos 
           SET cloudinary_url = ?, 
               cloudinary_uploaded = TRUE 
           WHERE attendance_id = ?`,
          [result.url, attendanceId]
        );

        const updated = (attResult as any).affectedRows + (partialResult as any).affectedRows;
        console.log(`✅ Upload complete: Attendance #${attendanceId} → ${result.url} (Updated ${updated} record(s))`);
      } else {
        // Upload failed, retry if possible
        throw new Error(result.error || 'Upload failed');
      }
    } catch (error: any) {
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
      } else {
        console.error(`❌ Max retries reached for Attendance #${attendanceId}. Upload failed permanently.`);
        
        // Mark as failed in database (optional)
        try {
          await pool.execute(
            `UPDATE attendance 
             SET cloudinary_uploaded = FALSE 
             WHERE id = ?`,
            [attendanceId]
          );
        } catch (dbError) {
          console.error('Failed to update database:', dbError);
        }
      }
    }
  }

  /**
   * Get queue status
   */
  public getStatus(): { queueSize: number; processing: boolean } {
    return {
      queueSize: this.queue.length,
      processing: this.processing,
    };
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const uploadQueue = new UploadQueue();

export default uploadQueue;
