// ============================================================================
// CLEAR LOCATION HISTORY - INSTANT (No Confirmation)
// ============================================================================
// Run: node clear-location-now.js
// ============================================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

async function clearNow() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guard_db',
    });

    console.log('✅ Connected!');

    // Get counts before deletion
    const [locationBefore] = await connection.execute(
      'SELECT COUNT(*) as count FROM student_locations'
    );
    const [detectionBefore] = await connection.execute(
      'SELECT COUNT(*) as count FROM ble_detections'
    );

    console.log('');
    console.log('📊 Before Deletion:');
    console.log(`   student_locations: ${locationBefore[0].count} records`);
    console.log(`   ble_detections: ${detectionBefore[0].count} records`);
    console.log('');

    // Clear tables
    console.log('🗑️  Clearing location history...');
    await connection.execute('TRUNCATE TABLE student_locations');
    await connection.execute('TRUNCATE TABLE ble_detections');

    console.log('');
    console.log('✅ Location history cleared!');
    console.log('');
    console.log('📊 After Deletion:');
    console.log('   student_locations: 0 records');
    console.log('   ble_detections: 0 records');
    console.log('');
    console.log('📍 Results:');
    console.log('   ✓ Map will show beacon locations only');
    console.log('   ✓ No student position markers until new detection');
    console.log('   ✓ Location History table will be empty');
    console.log('   ✓ BLE beacon configurations preserved');
    console.log('');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Done!');
    }
  }
}

clearNow();
