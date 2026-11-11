// ============================================================================
// CLEAR ALL LOCATION HISTORY DATA
// ============================================================================
// This script removes all BLE location tracking history
// Run: node clear-location-history.js
// ============================================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

async function clearLocationHistory() {
  let connection;
  
  try {
    console.log('🔌 Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guard_db',
    });

    console.log('✅ Connected!\n');

    // Check current record counts
    console.log('📊 Current Location History:');
    console.log('─'.repeat(60));
    
    const [locationCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM student_locations'
    );
    console.log(`   student_locations: ${locationCount[0].count} records`);
    
    const [detectionCount] = await connection.execute(
      'SELECT COUNT(*) as count FROM ble_detections'
    );
    console.log(`   ble_detections: ${detectionCount[0].count} records`);
    
    console.log('');

    // Confirm deletion
    console.log('⚠️  WARNING: This will DELETE ALL location history data!');
    console.log('   This includes:');
    console.log('   - All student location tracking records');
    console.log('   - All BLE detection history (pending/approved/rejected)');
    console.log('');
    console.log('   This will NOT affect:');
    console.log('   ✓ BLE beacon configurations');
    console.log('   ✓ Student/parent data');
    console.log('   ✓ Attendance records');
    console.log('   ✓ SMS logs');
    console.log('');

    // Prompt for confirmation
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    await new Promise((resolve) => {
      readline.question('Type "YES" to confirm deletion: ', async (answer) => {
        if (answer.toUpperCase() === 'YES') {
          console.log('');
          console.log('🗑️  Clearing location history...');
          console.log('─'.repeat(60));

          // Clear student_locations
          await connection.execute('TRUNCATE TABLE student_locations');
          console.log('✅ student_locations table cleared');

          // Clear ble_detections
          await connection.execute('TRUNCATE TABLE ble_detections');
          console.log('✅ ble_detections table cleared');

          console.log('');
          console.log('🎉 Location history successfully cleared!');
          console.log('');
          console.log('📍 Map will now show:');
          console.log('   - All BLE beacon locations (still visible)');
          console.log('   - No student location markers (until new detection)');
          console.log('   - Empty location history table');
          console.log('');
        } else {
          console.log('❌ Deletion cancelled.');
        }
        readline.close();
        resolve();
      });
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('🔌 Database connection closed.');
    }
  }
}

clearLocationHistory();
