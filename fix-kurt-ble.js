/**
 * Fix Kurt's BLE MAC address registration
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function fixKurtBLE() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  console.log('🔧 Fixing Kurt\'s BLE registration...\n');

  // Find Kurt
  const [students] = await pool.query(
    `SELECT id, name, lrn, mac_address FROM students WHERE name LIKE '%Kurt%'`
  );

  if (students.length === 0) {
    console.log('❌ Kurt not found in database!');
    await pool.end();
    return;
  }

  const kurt = students[0];
  
  console.log('👤 Student: ' + kurt.name);
  console.log('   LRN: ' + kurt.lrn);
  console.log('   Current MAC: ' + (kurt.mac_address || '(empty)'));
  console.log();

  // Update MAC address
  const newMAC = '51:00:24:06:00:C4';
  
  console.log('📝 Updating MAC address to: ' + newMAC);
  
  const [result] = await pool.query(
    `UPDATE students SET mac_address = ? WHERE id = ?`,
    [newMAC, kurt.id]
  );

  if (result.affectedRows > 0) {
    console.log('✅ Successfully updated!');
    console.log();
    
    // Verify
    const [updated] = await pool.query(
      `SELECT name, lrn, rfid_uid, mac_address FROM students WHERE id = ?`,
      [kurt.id]
    );
    
    const updatedKurt = updated[0];
    console.log('✅ Verification:');
    console.log('   Name: ' + updatedKurt.name);
    console.log('   LRN: ' + updatedKurt.lrn);
    console.log('   RFID: ' + updatedKurt.rfid_uid);
    console.log('   BLE MAC: ' + updatedKurt.mac_address);
    console.log();
    console.log('🎉 Kurt is now registered for BLE attendance!');
    console.log();
    console.log('📱 You can now:');
    console.log('   1. Scan RFID card: 0002310671');
    console.log('   2. Scan QR code: 22123343555');
    console.log('   3. Use BLE MAC: 51:00:24:06:00:C4');
  } else {
    console.log('❌ Update failed!');
  }

  await pool.end();
}

fixKurtBLE().catch(console.error);
