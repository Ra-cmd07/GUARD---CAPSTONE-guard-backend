const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveToRealGuardHouse() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Position:\n');
  
  const [before] = await conn.execute(
    `SELECT name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log(`   ${before[0].coordinates} (currently near Student Lounge)\n`);

  console.log('🔄 Moving to ACTUAL Guard House at main entrance gate...\n');

  // Looking at the map, the guard house is at the SOUTHWEST entrance
  // Near the main road (Rio Hondo Avenue/M. Natividad Road area)
  // This should be around: 8.4851,124.6558 (southwest corner, at entrance)
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4851,124.6558',
         location_name = 'Gate 1 - Guard House',
         building = 'Guard House'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Moved to Guard House at main entrance gate');
  console.log('   New coordinates: 8.4851,124.6558 (southwest entrance)');
  console.log('   This is at the actual gate/entrance area near the main road\n');

  const [after] = await conn.execute(
    `SELECT name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log('📍 New Position:');
  console.log(`   ${after[0].coordinates}`);
  console.log(`   Location: ${after[0].location_name}\n`);

  console.log('✅ The red marker should now be at the southwest entrance gate.');
  console.log('   Hard refresh (Ctrl + Shift + R) to see it at the guard house!\n');

  await conn.end();
}

moveToRealGuardHouse();
