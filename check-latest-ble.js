const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  // Get the VERY LATEST attendance
  const [att] = await pool.execute(
    `SELECT * FROM attendance ORDER BY id DESC LIMIT 1`
  );

  if (att.length > 0) {
    const a = att[0];
    console.log('=== LATEST ATTENDANCE RECORD ===\n');
    console.log(`ID: ${a.id}`);
    console.log(`Student ID: ${a.student_id}`);
    console.log(`Student Name: ${a.student_name}`);
    console.log(`Method: ${a.scan_method}`);
    console.log(`LRN: ${a.lrn || 'NULL ❌'}`);
    console.log(`Gender: ${a.gender || 'NULL ❌'}`);
    console.log(`Grade: ${a.grade || 'NULL ❌'}`);
    console.log(`Section: ${a.section || 'NULL ❌'}`);
    console.log(`Kiosk ID: ${a.kiosk_id || 'NULL ❌'}`);
    console.log(`Status: ${a.status}`);
    console.log(`Session: ${a.session}`);
    console.log(`Date: ${a.date}`);
    console.log(`Time In: ${a.time_in}`);
    console.log(`Time Out: ${a.time_out || 'NULL'}`);
    console.log(`Created: ${a.created_at}`);
    console.log(`Photo: ${a.photo_path || 'NULL'}`);
    
    // Get corresponding detection if BLE
    if (a.scan_method === 'BLE') {
      console.log('\n=== CORRESPONDING BLE DETECTION ===\n');
      const [det] = await pool.execute(
        `SELECT * FROM ble_detections WHERE attendance_id = ?`,
        [a.id]
      );
      if (det.length > 0) {
        const d = det[0];
        console.log(`Detection ID: ${d.id}`);
        console.log(`Student ID from detection: ${d.student_id}`);
        console.log(`Kiosk ID from detection: ${d.kiosk_id || 'NULL'}`);
        console.log(`MAC: ${d.mac_address}`);
        console.log(`Status: ${d.status}`);
        console.log(`Detected: ${d.detected_at}`);
        console.log(`Approved: ${d.approved_at}`);
      }
    }
  }

  await pool.end();
})();
