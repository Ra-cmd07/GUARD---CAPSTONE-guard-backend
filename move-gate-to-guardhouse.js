const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveMainGate() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Main Gate Entrance Location:\n');
  
  const [before] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates, building 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  before.forEach(r => {
    console.log(`${r.name}`);
    console.log(`  Location: ${r.location_name}`);
    console.log(`  Building: ${r.building || 'N/A'}`);
    console.log(`  Coordinates: ${r.coordinates}`);
    console.log('');
  });

  console.log('🔄 Moving Main Gate Entrance to Guard House...\n');

  // Based on the map, the guard house appears to be at the entrance
  // Moving slightly to better represent the guard house position
  // Current: 8.4857,124.6565
  // New: Slightly adjusted to guard house position
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4856,124.6564',
         location_name = 'Gate 1 - Guard House',
         building = 'Guard House'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Main Gate Entrance moved to Guard House');
  console.log('   New coordinates: 8.4856,124.6564');
  console.log('   New location name: Gate 1 - Guard House');
  console.log('   Building: Guard House');

  console.log('\n📍 Updated Location:\n');
  
  const [after] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates, building 
     FROM ble_beacons 
     WHERE name LIKE '%Main Gate%'`
  );

  after.forEach(r => {
    console.log(`${r.name}`);
    console.log(`  Location: ${r.location_name}`);
    console.log(`  Building: ${r.building || 'N/A'}`);
    console.log(`  Coordinates: ${r.coordinates}`);
    console.log('');
  });

  console.log('✅ Done! Refresh the map to see the new position.');
  console.log('   Main Gate Entrance is now at the Guard House location.');
  console.log('   (Press Ctrl + Shift + R to clear browser cache)\n');

  await conn.end();
}

moveMainGate();
