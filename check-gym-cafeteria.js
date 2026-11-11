const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkLocations() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Gymnasium and Cafeteria Locations:\n');
  
  const [rows] = await conn.execute(
    `SELECT beacon_id, name, location_name, coordinates 
     FROM ble_beacons 
     WHERE name LIKE '%Gymnasium%' OR name LIKE '%Cafeteria%'
     ORDER BY name`
  );

  rows.forEach(r => {
    console.log(`${r.name}`);
    console.log(`  Location: ${r.location_name}`);
    console.log(`  Coordinates: ${r.coordinates}`);
    console.log('');
  });

  await conn.end();
}

checkLocations();
