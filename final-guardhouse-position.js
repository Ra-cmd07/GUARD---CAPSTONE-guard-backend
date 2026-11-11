const mysql = require('mysql2/promise');
require('dotenv').config();

async function setFinalPosition() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('🎯 Setting Main Gate Entrance to guard house at western entrance\n');

  // Based on the map, moving to far west at entrance
  // Coordinates: 8.4849,124.6540
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4849,124.6540'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Main Gate Entrance coordinates updated');
  console.log('   Position: 8.4849,124.6540');
  console.log('   (Western entrance - guard house area)\n');
  
  console.log('📝 To see changes:');
  console.log('   1. Close ALL browser tabs');
  console.log('   2. Clear cache (Ctrl+Shift+Delete → Cached images)');
  console.log('   3. Reopen Parent Portal → Location tab\n');

  await conn.end();
}

setFinalPosition();
