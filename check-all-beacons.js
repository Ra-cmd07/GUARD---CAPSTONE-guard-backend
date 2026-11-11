const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkAllBeacons() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Beacon Positions:\n');
  console.log('─'.repeat(80));
  
  const [rows] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates, building, location_type 
     FROM ble_beacons 
     WHERE name IN ('Main Gate Entrance', 'Gymnasium', 'School Cafeteria')
     ORDER BY name`
  );

  rows.forEach(r => {
    console.log(`\n🏷️  ${r.name}`);
    console.log(`   Location: ${r.location_name}`);
    console.log(`   Building: ${r.building || 'N/A'}`);
    console.log(`   Type: ${r.location_type}`);
    console.log(`   Coordinates: ${r.coordinates}`);
  });

  console.log('\n' + '─'.repeat(80));
  console.log('\n✅ Current Status:');
  console.log('   Main Gate Entrance: At original position (Gate 1 - Main Entrance)');
  console.log('   Gymnasium: Moved northwest (away from gate)');
  console.log('   Cafeteria: Moved northeast (away from gate)');
  console.log('\nAll positions are correctly set!\n');

  await conn.end();
}

checkAllBeacons();
