const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== REGISTERING KURT FOR BLE ===\n');

  // Find Kurt
  const [students] = await pool.execute(
    `SELECT id, name, lrn, grade, section, gender, mac_address, rfid_uid 
     FROM students 
     WHERE name LIKE '%Kurt%'`
  );

  if (students.length === 0) {
    console.log('❌ No student named Kurt found in database');
    console.log('   Please create Kurt first using the admin panel\n');
    await pool.end();
    return;
  }

  const kurt = students[0];
  
  console.log('Found Kurt:');
  console.log('  ID:', kurt.id);
  console.log('  Name:', kurt.name);
  console.log('  LRN:', kurt.lrn || 'NULL');
  console.log('  Grade:', kurt.grade || 'NULL');
  console.log('  Section:', kurt.section || 'NULL');
  console.log('  Gender:', kurt.gender || 'NULL');
  console.log('  Current BLE MAC:', kurt.mac_address || 'NULL (not registered)');
  console.log('  RFID:', kurt.rfid_uid || 'NULL');
  console.log('');

  // BLE MAC from ESP32 scanner (strongest signal)
  const bleMac = '51:00:24:06:00:C4';
  
  console.log('Registering BLE MAC:', bleMac);
  console.log('  Signal strength: -29 RSSI (very strong!)');
  console.log('  Distance: 0.01m (very close)\n');

  // Update Kurt's MAC address
  const [result] = await pool.execute(
    `UPDATE students 
     SET mac_address = ?, updated_at = NOW() 
     WHERE id = ?`,
    [bleMac, kurt.id]
  );

  if (result.affectedRows > 0) {
    console.log('✅ SUCCESS! Kurt registered for BLE');
    console.log('   Student ID:', kurt.id);
    console.log('   BLE MAC:', bleMac);
    console.log('');
    console.log('Kurt can now use BLE for attendance! 🎉');
    console.log('');
    console.log('To test:');
    console.log('  1. Open kiosk');
    console.log('  2. Click BLE button');
    console.log('  3. ESP32 should detect Kurt\'s beacon');
    console.log('  4. Auto-approve should mark attendance');
  } else {
    console.log('❌ Update failed');
  }

  await pool.end();
})();
