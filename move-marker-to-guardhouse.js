const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveMarkerToGuardHouse() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Red Circle Position:\n');
  
  const [before] = await conn.execute(
    `SELECT name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log(`   Current: ${before[0].coordinates}`);
  console.log(`   (Center of campus area)\n`);

  console.log('🎯 Moving red circle to Guard House at entrance gate...\n');

  // Based on the map, the guard house is at the southwest entrance
  // Near "JM CCD Dormitories", "Primary" labels (bottom-left area)
  // Approximate coordinates for guard house at entrance: 8.4850,124.6556
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4850,124.6556'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Red circle moved to Guard House entrance');
  console.log('   New coordinates: 8.4850,124.6556');
  console.log('   (Southwest corner - at the actual gate entrance)\n');

  const [after] = await conn.execute(
    `SELECT name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log('📍 New Red Circle Position:');
  console.log(`   ${after[0].coordinates}`);
  console.log(`   Location: ${after[0].location_name}\n`);

  console.log('✅ The red marker should now appear at:');
  console.log('   - Southwest corner (bottom-left of map)');
  console.log('   - Near the guard house building');
  console.log('   - At the main entrance gate area');
  console.log('\n🔄 Hard refresh (Ctrl + Shift + R) to see the new position!\n');

  await conn.end();
}

moveMarkerToGuardHouse();
