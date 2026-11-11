/**
 * Check Kurt's BLE registration
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkKurtBLE() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  console.log('🔍 Checking Kurt\'s registration...\n');

  // Check Kurt's data
  const [students] = await pool.query(
    `SELECT id, name, lrn, rfid_uid, mac_address, is_active 
     FROM students 
     WHERE name LIKE '%Kurt%'`
  );

  if (students.length === 0) {
    console.log('❌ No student named Kurt found in database!');
    await pool.end();
    return;
  }

  const kurt = students[0];
  
  console.log('👤 Student Found:');
  console.log(`   Name: ${kurt.name}`);
  console.log(`   LRN: ${kurt.lrn}`);
  console.log(`   RFID: ${kurt.rfid_uid || '❌ NOT SET'}`);
  console.log(`   BLE MAC: ${kurt.mac_address || '❌ NOT SET'}`);
  console.log(`   Active: ${kurt.is_active ? '✅ Yes' : '❌ No'}`);
  console.log();

  // Check what's missing
  const issues = [];
  
  if (!kurt.mac_address || kurt.mac_address === '') {
    issues.push('BLE MAC address not set');
    console.log('❌ Issue: BLE MAC address is NOT registered!');
    console.log('   Expected: 51:00:24:06:00:C4');
    console.log('   Current: ' + (kurt.mac_address || '(empty)'));
    console.log();
  } else {
    console.log('✅ BLE MAC address is registered: ' + kurt.mac_address);
    
    // Check format
    const detected = '51:00:24:06:00:C4';
    const stored = kurt.mac_address.toLowerCase().replace(/[:\-]/g, '');
    const detectedNormalized = detected.toLowerCase().replace(/[:\-]/g, '');
    
    console.log('   Detected: ' + detected);
    console.log('   Stored: ' + kurt.mac_address);
    console.log('   Match: ' + (stored === detectedNormalized ? '✅ Yes' : '❌ No'));
    console.log();
    
    if (stored !== detectedNormalized) {
      issues.push('BLE MAC address format mismatch');
    }
  }

  if (!kurt.is_active) {
    issues.push('Student not active');
  }

  // Provide fix
  if (issues.length > 0) {
    console.log('🔧 Fixes needed:');
    issues.forEach(issue => console.log(`   - ${issue}`));
    console.log();
    
    if (!kurt.mac_address || kurt.mac_address === '') {
      console.log('💡 To fix, run this SQL:');
      console.log(`   UPDATE students SET mac_address = '51:00:24:06:00:C4' WHERE id = ${kurt.id};`);
      console.log();
      
      // Offer to fix automatically
      console.log('🤖 Auto-fix available!');
      console.log('   Run: node fix-kurt-ble.js');
    }
  } else {
    console.log('✅ All checks passed! Kurt is properly registered for BLE.');
  }

  await pool.end();
}

checkKurtBLE().catch(console.error);
