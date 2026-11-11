/**
 * Verify BLE Detection was saved to database
 */

const mysql = require('mysql2/promise');

async function verifyDetection() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🔌 Connected to database\n');

  try {
    // Get latest 5 detections
    const [detections] = await connection.execute(
      `SELECT id, student_id, student_name, mac_address, rssi, 
              beacon_id, location_name, status, detected_at
       FROM ble_detections 
       ORDER BY detected_at DESC 
       LIMIT 5`
    );

    console.log('📋 Latest BLE Detections:');
    console.table(detections);

    // Count pending
    const [pending] = await connection.execute(
      `SELECT COUNT(*) as count FROM ble_detections WHERE status = 'pending'`
    );

    console.log(`\n⏳ Pending detections: ${pending[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

verifyDetection();
