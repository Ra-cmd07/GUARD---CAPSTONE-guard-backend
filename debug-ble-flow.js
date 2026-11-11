const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== BLE DETECTION FLOW DEBUG ===\n');

  // Check ble_detections table
  const [detections] = await pool.execute(
    `SELECT id, student_id, student_name, mac_address, status, 
     detected_at, approved_at, attendance_id
     FROM ble_detections 
     ORDER BY id DESC 
     LIMIT 5`
  );

  console.log('Recent BLE detections:\n');
  if (detections.length === 0) {
    console.log('❌ No BLE detections found in database');
    console.log('   This means ESP32 is not sending detections to backend\n');
  } else {
    detections.forEach(d => {
      console.log(`Detection ID: ${d.id}`);
      console.log(`  Student ID: ${d.student_id}`);
      console.log(`  Student Name: ${d.student_name}`);
      console.log(`  MAC: ${d.mac_address}`);
      console.log(`  Status: ${d.status}`);
      console.log(`  Detected: ${d.detected_at}`);
      console.log(`  Approved: ${d.approved_at || 'Not approved yet'}`);
      console.log(`  Attendance ID: ${d.attendance_id || 'None'}`);
      console.log('');
    });
  }

  // Check student data in students table
  console.log('=== STUDENT DATA IN DATABASE ===\n');
  const [students] = await pool.execute(
    `SELECT id, name, lrn, gender, grade, section, mac_address
     FROM students 
     WHERE id = 1`
  );

  if (students.length > 0) {
    const s = students[0];
    console.log('Student ID 1 (Padios) details:');
    console.log(`  Name: ${s.name}`);
    console.log(`  LRN: ${s.lrn}`);
    console.log(`  Gender: ${s.gender}`);
    console.log(`  Grade: ${s.grade}`);
    console.log(`  Section: ${s.section}`);
    console.log(`  BLE MAC: ${s.mac_address}`);
    console.log('');
  }

  // Check latest attendance records
  console.log('=== LATEST ATTENDANCE RECORDS (ALL METHODS) ===\n');
  const [attendance] = await pool.execute(
    `SELECT id, student_id, student_name, scan_method,
     lrn, gender, grade, section, kiosk_id,
     status, date, time_in, created_at
     FROM attendance 
     ORDER BY id DESC 
     LIMIT 5`
  );

  attendance.forEach(a => {
    const nullFields = [];
    if (!a.lrn) nullFields.push('lrn');
    if (!a.gender) nullFields.push('gender');
    if (!a.grade) nullFields.push('grade');
    if (!a.section) nullFields.push('section');
    if (!a.kiosk_id) nullFields.push('kiosk_id');

    console.log(`Attendance ID: ${a.id}`);
    console.log(`  Method: ${a.scan_method}`);
    console.log(`  Student: ${a.student_name} (ID: ${a.student_id})`);
    console.log(`  LRN: ${a.lrn || 'NULL ❌'}`);
    console.log(`  Gender: ${a.gender || 'NULL ❌'}`);
    console.log(`  Grade: ${a.grade || 'NULL ❌'}`);
    console.log(`  Section: ${a.section || 'NULL ❌'}`);
    console.log(`  Kiosk ID: ${a.kiosk_id || 'NULL ❌'}`);
    console.log(`  Status: ${a.status}`);
    console.log(`  Date: ${a.date}`);
    console.log(`  Time: ${a.time_in}`);
    console.log(`  Created: ${a.created_at}`);
    
    if (nullFields.length > 0) {
      console.log(`  ⚠️  NULL FIELDS: ${nullFields.join(', ')}`);
    } else {
      console.log(`  ✅ All fields populated`);
    }
    console.log('');
  });

  await pool.end();
})();
