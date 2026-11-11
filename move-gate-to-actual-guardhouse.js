const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveToGuardHouse() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Main Gate Entrance Position:\n');
  
  const [before] = await conn.execute(
    `SELECT name, location_name, coordinates, building 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log(`Current: ${before[0].coordinates}`);
  console.log(`Location: ${before[0].location_name}`);
  console.log(`Building: ${before[0].building}\n`);

  console.log('🔄 Moving Main Gate Entrance to Guard House at entrance...\n');

  // Looking at the map, the guard house/entrance is at the southwest
  // Moving from current position (8.4857,124.6565) to guard house
  // Guard house appears to be at approximately: 8.4854,124.6562
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4854,124.6562',
         location_name = 'Gate 1 - Guard House',
         building = 'Guard House'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Main Gate Entrance moved to Guard House');
  console.log('   New coordinates: 8.4854,124.6562');
  console.log('   Location: Gate 1 - Guard House');
  console.log('   Building: Guard House\n');

  const [after] = await conn.execute(
    `SELECT name, location_name, coordinates, building 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  console.log('📍 New Position:');
  console.log(`   ${after[0].coordinates}`);
  console.log(`   ${after[0].location_name}`);
  console.log(`   ${after[0].building}\n`);

  console.log('✅ Done! The red marker should now be at the guard house entrance.');
  console.log('   Refresh the map (Ctrl + Shift + R) to see the new position.\n');

  await conn.end();
}

moveToGuardHouse();
