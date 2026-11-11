// ============================================================================
// MANUAL BEACON POSITION TOOL
// ============================================================================
// This tool lets you manually set the exact coordinates for Main Gate Entrance
// 
// HOW TO USE:
// 1. Right-click on the map where you want the marker
// 2. Browser will show coordinates in the URL or console
// 3. Run: node manual-move-beacon.js LATITUDE LONGITUDE
// 
// EXAMPLE:
// node manual-move-beacon.js 8.4845 124.6535
// ============================================================================

const mysql = require('mysql2/promise');
require('dotenv').config();

async function manualMove() {
  const args = process.argv.slice(2);
  
  if (args.length !== 2) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║   MANUAL BEACON POSITION TOOL                                  ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📍 Current Main Gate Entrance Position:\n');
    
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guard_db',
    });
    
    const [current] = await conn.execute(
      'SELECT name, coordinates FROM ble_beacons WHERE name LIKE "%Main Gate%"'
    );
    
    console.log(`   ${current[0].coordinates}\n`);
    console.log('─'.repeat(65));
    console.log('\n🎯 HOW TO MOVE IT:\n');
    console.log('1. Look at the map on your browser');
    console.log('2. Find where you want the marker (Guard House)');
    console.log('3. Estimate or right-click to get coordinates\n');
    console.log('THEN RUN:\n');
    console.log('   node manual-move-beacon.js LATITUDE LONGITUDE\n');
    console.log('EXAMPLES:\n');
    console.log('   node manual-move-beacon.js 8.4845 124.6535');
    console.log('   node manual-move-beacon.js 8.4848 124.6538\n');
    console.log('─'.repeat(65));
    console.log('\n💡 TIP: Guard house is at the WEST (left) entrance.');
    console.log('   Try decreasing the LONGITUDE (2nd number) to move WEST.\n');
    
    await conn.end();
    return;
  }

  const latitude = parseFloat(args[0]);
  const longitude = parseFloat(args[1]);
  
  if (isNaN(latitude) || isNaN(longitude)) {
    console.log('❌ Error: Invalid coordinates. Use numbers like: 8.4845 124.6535');
    return;
  }
  
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });
  
  console.log('\n🎯 Moving Main Gate Entrance...\n');
  console.log(`   New coordinates: ${latitude}, ${longitude}\n`);
  
  await conn.execute(
    `UPDATE ble_beacons 
     SET coordinates = ?
     WHERE name LIKE '%Main Gate%'`,
    [`${latitude},${longitude}`]
  );
  
  console.log('✅ Position updated!\n');
  console.log('🔄 To see changes:');
  console.log('   1. Refresh browser (Ctrl + Shift + R)');
  console.log('   2. Or close browser completely and reopen\n');
  
  await conn.end();
}

manualMove().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
