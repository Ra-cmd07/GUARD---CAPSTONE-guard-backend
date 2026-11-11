const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== CHECKING FOR PADIOS STUDENTS ===\n');

  // Check students table
  const [students] = await pool.execute(
    `SELECT id, name, lrn, grade, section, gender, 
     mac_address, rfid_uid, qr_code 
     FROM students 
     WHERE name LIKE '%Padios%'`
  );

  console.log(`Found ${students.length} student(s) named "Padios":\n`);
  students.forEach(s => {
    console.log(`Student ID: ${s.id}`);
    console.log(`  Name: ${s.name}`);
    console.log(`  LRN: ${s.lrn || 'NULL'}`);
    console.log(`  Grade: ${s.grade || 'NULL'}`);
    console.log(`  Section: ${s.section || 'NULL'}`);
    console.log(`  Gender: ${s.gender || 'NULL'}`);
    console.log(`  BLE MAC: ${s.mac_address || 'NULL'}`);
    console.log(`  RFID UID: ${s.rfid_uid || 'NULL'}`);
    console.log(`  QR Code: ${s.qr_code ? 'Has QR' : 'NULL'}`);
    console.log('');
  });

  // Check attendance records
  console.log('\n=== RECENT PADIOS ATTENDANCE RECORDS ===\n');
  const [attendance] = await pool.execute(
    `SELECT id, student_id, student_name, scan_method, 
     lrn, grade, section, gender, kiosk_id, 
     status, date, time_in
     FROM attendance 
     WHERE student_name LIKE '%Padios%'
     ORDER BY id DESC 
     LIMIT 10`
  );

  console.log(`Found ${attendance.length} recent attendance record(s):\n`);
  attendance.forEach(a => {
    console.log(`Attendance ID: ${a.id}`);
    console.log(`  Student ID: ${a.student_id}`);
    console.log(`  Name: ${a.student_name}`);
    console.log(`  Method: ${a.scan_method}`);
    console.log(`  LRN: ${a.lrn || 'NULL ❌'}`);
    console.log(`  Grade: ${a.grade || 'NULL ❌'}`);
    console.log(`  Section: ${a.section || 'NULL ❌'}`);
    console.log(`  Gender: ${a.gender || 'NULL ❌'}`);
    console.log(`  Kiosk ID: ${a.kiosk_id || 'NULL ❌'}`);
    console.log(`  Status: ${a.status}`);
    console.log(`  Date: ${a.date}`);
    console.log(`  Time: ${a.time_in}`);
    console.log('');
  });

  await pool.end();
})();
