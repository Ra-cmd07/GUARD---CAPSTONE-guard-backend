/**
 * Setup ble_detections table for ESP32 BLE Token attendance
 * This table is required for the /api/ble/detect endpoint to work
 */

const mysql = require('mysql2/promise');

async function setupBleDetectionsTable() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🔌 Connected to database');

  try {
    // Check if table exists
    const [tables] = await connection.execute(
      `SHOW TABLES LIKE 'ble_detections'`
    );

    if (tables.length > 0) {
      console.log('✅ ble_detections table already exists');
      
      // Show table structure
      const [columns] = await connection.execute(
        `DESCRIBE ble_detections`
      );
      console.log('\n📋 Current table structure:');
      console.table(columns);
      
      await connection.end();
      return;
    }

    console.log('📝 Creating ble_detections table...');

    // Create table
    await connection.execute(`
      CREATE TABLE ble_detections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        student_name VARCHAR(100) NOT NULL,
        mac_address VARCHAR(17) NOT NULL,
        rssi INT DEFAULT NULL,
        distance DECIMAL(10, 2) DEFAULT NULL,
        kiosk_id INT DEFAULT 1,
        gate_name VARCHAR(50) DEFAULT 'Main Gate',
        status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME DEFAULT NULL,
        attendance_id INT DEFAULT NULL,
        
        INDEX idx_student_id (student_id),
        INDEX idx_status (status),
        INDEX idx_created_at (created_at),
        INDEX idx_mac_address (mac_address),
        
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Table created successfully!');

    // Show table structure
    const [columns] = await connection.execute(
      `DESCRIBE ble_detections`
    );
    console.log('\n📋 Table structure:');
    console.table(columns);

    console.log('\n🎉 Setup complete! ESP32 can now POST to /api/ble/detect');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await connection.end();
  }
}

setupBleDetectionsTable()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
