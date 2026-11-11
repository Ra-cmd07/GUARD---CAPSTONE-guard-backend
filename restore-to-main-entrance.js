const mysql = require('mysql2/promise');
require('dotenv').config();

async function restoreToMainEntrance() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Configuration:\n');
  
  const [before] = await conn.execute(
    `SELECT name, location_name, building, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log(`   Location: ${before[0].location_name}`);
  console.log(`   Building: ${before[0].building}`);
  console.log(`   Coordinates: ${before[0].coordinates}\n`);

  console.log('🔄 Restoring to ORIGINAL "Gate 1 - Main Entrance"...\n');

  // Restore to original configuration (Image 2 style)
  await conn.execute(
    `UPDATE ble_beacons 
     SET location_name = 'Gate 1 - Main Entrance',
         building = 'Main Building',
         coordinates = '8.4857,124.6565'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Restored to original configuration');
  console.log('   Location: Gate 1 - Main Entrance');
  console.log('   Building: Main Building');
  console.log('   Coordinates: 8.4857,124.6565\n');

  // Also update existing location history records
  await conn.execute(
    `UPDATE student_locations 
     SET location_name = 'Gate 1 - Main Entrance'
     WHERE location_name = 'Gate 1 - Guard House'`
  );

  console.log('✅ Also updated location history records\n');

  const [after] = await conn.execute(
    `SELECT name, location_name, building, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log('📍 New Configuration (Original Style):');
  console.log(`   Location: ${after[0].location_name}`);
  console.log(`   Building: ${after[0].building}`);
  console.log(`   Coordinates: ${after[0].coordinates}\n`);

  console.log('✅ System restored to original "Gate 1 - Main Entrance"');
  console.log('   No more "Guard House" references');
  console.log('   Refresh browser (Ctrl + Shift + R) to see changes!\n');

  await conn.end();
}

restoreToMainEntrance();
