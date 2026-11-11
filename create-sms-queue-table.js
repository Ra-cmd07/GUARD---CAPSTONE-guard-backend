/**
 * Create SMS Queue Table for GSM Integration
 * Run this once: node create-sms-queue-table.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function createSMSQueueTable() {
  let connection;
  
  try {
    // Connect to database
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guardmap_db'
    });

    console.log('✅ Connected to database');

    // Create sms_queue table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS sms_queue (
        id INT AUTO_INCREMENT PRIMARY KEY,
        phone_number VARCHAR(20) NOT NULL COMMENT 'Phone number in +639XXXXXXXXX format',
        message TEXT NOT NULL COMMENT 'SMS message content',
        student_id INT NULL COMMENT 'Reference to student',
        attendance_id INT NULL COMMENT 'Reference to attendance record',
        priority ENUM('high', 'normal', 'low') DEFAULT 'normal' COMMENT 'SMS priority',
        status ENUM('pending', 'sent', 'failed', 'cancelled') DEFAULT 'pending' COMMENT 'SMS status',
        retry_count INT DEFAULT 0 COMMENT 'Number of send attempts',
        error_message TEXT NULL COMMENT 'Error message if failed',
        created_at DATETIME NOT NULL COMMENT 'When SMS was queued',
        sent_at DATETIME NULL COMMENT 'When SMS was successfully sent',
        last_retry_at DATETIME NULL COMMENT 'Last retry attempt timestamp',
        
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_phone_number (phone_number),
        INDEX idx_student_id (student_id),
        INDEX idx_attendance_id (attendance_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.execute(createTableSQL);
    console.log('✅ SMS queue table created successfully!');

    // Verify table exists
    const [rows] = await connection.execute('SHOW TABLES LIKE "sms_queue"');
    if (rows.length > 0) {
      console.log('✅ Table verified: sms_queue exists');
      
      // Show table structure
      const [columns] = await connection.execute('DESCRIBE sms_queue');
      console.log('\n📋 Table Structure:');
      console.table(columns);
    }

    console.log('\n🎉 Setup complete! You can now:');
    console.log('1. Restart your backend server (npm run dev)');
    console.log('2. Upload kiosk_gsm_sms.ino to ESP32');
    console.log('3. Test by scanning at kiosk website');
    console.log('4. Parent will receive SMS automatically! 📱');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✅ Database connection closed');
    }
  }
}

// Run the script
createSMSQueueTable();
