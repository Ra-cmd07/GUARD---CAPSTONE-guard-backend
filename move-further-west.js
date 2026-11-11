const mysql = require('mysql2/promise');
require('dotenv').config();

async function moveFurtherWest() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('📍 Current Position:\n');
  
  const [before] = await conn.execute(
    `SELECT name, coordinates FROM ble_beacons WHERE name LIKE '%Main Gate%'`
  );

  console.log(`   ${before[0].coordinates}\n`);

  console.log('🎯 Moving FURTHER WEST to guard house entrance...\n');

  // Moving much further west (lower longitude number)
  // Guard house at entrance should be around: 8.4852,124.6545
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = '8.4852,124.6545'
     WHERE name LIKE '%Main Gate%'`
  );
  
  console.log('✅ Moved to: 8.4852,124.6545 (far west - guard house entrance)');
  console.log('   This should be at the left side of the map, at the entrance\n');
  console.log('🔄 Clear browser cache completely:');
  console.log('   1. Press Ctrl + Shift + Delete');
  console.log('   2. Clear cached images and files');
  console.log('   3. Then reload the page\n');

  await conn.end();
}

moveFurtherWest();
