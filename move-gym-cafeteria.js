const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveBeacons() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Locations:\n');
  
  const [before] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Gymnasium%' OR name LIKE '%Cafeteria%' OR name LIKE '%Main Gate%'
     ORDER BY name`
  );

  before.forEach(r => {
    console.log(`${r.name}: ${r.coordinates}`);
  });

  console.log('\n🔄 Moving beacons farther from Main Gate...\n');

  // Current Main Gate: 8.4857,124.6565
  // Move Gymnasium northwest (away from gate)
  // Move Cafeteria northeast (away from gate)
  
  // Gymnasium - move northwest (more north, less east)
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4867,124.6555' 
     WHERE name LIKE '%Gymnasium%'`
  );
  console.log('✅ Gymnasium moved to: 8.4867,124.6555 (northwest)');

  // School Cafeteria - move northeast (more north, more east)
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4868,124.6575' 
     WHERE name LIKE '%Cafeteria%'`
  );
  console.log('✅ School Cafeteria moved to: 8.4868,124.6575 (northeast)');

  console.log('\n📍 New Locations:\n');
  
  const [after] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Gymnasium%' OR name LIKE '%Cafeteria%' OR name LIKE '%Main Gate%'
     ORDER BY name`
  );

  after.forEach(r => {
    console.log(`${r.name}: ${r.coordinates}`);
  });

  console.log('\n✅ Done! Refresh the map to see the new positions.');
  console.log('   (Press Ctrl + Shift + R to clear browser cache)\n');

  await conn.end();
}

moveBeacons();
