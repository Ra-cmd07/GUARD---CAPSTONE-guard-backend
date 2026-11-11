const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupRfidTable() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  try {
    const conn = await pool.getConnection();

    console.log('Creating RFID_LOGS table...');
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS RFID_LOGS (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(100) NOT NULL,
        USTP_CDO VARCHAR(100) NOT NULL DEFAULT 'Inside',
        timestamp DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    try {
      await conn.execute(
        `ALTER TABLE RFID_LOGS 
         CHANGE COLUMN room_name USTP_CDO VARCHAR(100) NOT NULL DEFAULT 'Inside'`
      );
      console.log('✅ Renamed room_name to USTP_CDO');
    } catch (err) {
      if (err.message && err.message.includes("Can't DROP")) {
        // ignore if column does not exist or cannot be renamed
      }
    }

    console.log('✅ RFID_LOGS table created successfully');
    // Create tag mapping table
    console.log('Ensuring rfid_tags mapping table exists...');
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS rfid_tags (
        id INT AUTO_INCREMENT PRIMARY KEY,
        uid VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    // Seed known tags
    const seeds = [
      ['A3:7B:E5:2C', 'Rae'],
      ['5C:D0:F9:03', 'Mat']
    ];

    for (const s of seeds) {
      try {
        await conn.execute(
          `INSERT INTO rfid_tags (uid, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
          s
        );
      } catch (e) {
        // ignore individual seed failures
      }
    }
    // Ensure RFID_LOGS has a student_name column to store mapped student/tag names
    try {
      await conn.execute(
        `ALTER TABLE RFID_LOGS
         ADD COLUMN IF NOT EXISTS student_name VARCHAR(255) NULL AFTER USTP_CDO`
      );
    } catch (e) {
      // Some MySQL versions do not support IF NOT EXISTS for ADD COLUMN; fall back
      try {
        await conn.execute(`ALTER TABLE RFID_LOGS ADD COLUMN student_name VARCHAR(255) NULL AFTER USTP_CDO`);
      } catch (err) {
        // ignore if already exists or cannot be added
      }
    }

    conn.release();
    await pool.end();
  } catch (err) {
    console.error('❌ Setup error:', err.message || err);
    process.exit(1);
  }
}

setupRfidTable();
