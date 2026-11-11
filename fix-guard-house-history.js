const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixLocationHistory() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guard_db',
  });

  console.log('🔍 Checking for "Gate 1 - Guard House" records...\n');
  
  const [guardHouseRecords] = await conn.execute(
    `SELECT COUNT(*) as count FROM student_locations 
     WHERE location_name = 'Gate 1 - Guard House'`
  );

  const count = guardHouseRecords[0].count;
  console.log(`Found ${count} records with "Gate 1 - Guard House"\n`);

  if (count > 0) {
    console.log('🔄 Updating records to "Gate 1 - Main Entrance"...\n');
    
    // Update the location_name in historical records
    await conn.execute(
      `UPDATE student_locations 
       SET location_name = 'Gate 1 - Main Entrance'
       WHERE location_name = 'Gate 1 - Guard House'`
    );

    console.log(`✅ Updated ${count} records`);
    console.log('   Changed: "Gate 1 - Guard House" → "Gate 1 - Main Entrance"\n');
  } else {
    console.log('✅ No records found with "Gate 1 - Guard House"\n');
  }

  // Also check and fix building column
  const [guardHouseBuilding] = await conn.execute(
    `SELECT COUNT(*) as count FROM student_locations sl
     JOIN ble_beacons bb ON sl.beacon_id = bb.beacon_id
     WHERE bb.name LIKE '%Main Gate%' AND sl.location_name = 'Gate 1 - Main Entrance'`
  );

  console.log('✅ Location history records corrected!');
  console.log('   Refresh the Location tab to see updated history.\n');

  await conn.end();
}

fixLocationHistory();
