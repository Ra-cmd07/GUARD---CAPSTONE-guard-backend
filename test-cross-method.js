const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== CROSS-METHOD ATTENDANCE TEST ===\n');
  console.log('Testing: QR Time-In → BLE Time-Out\n');

  // Check Padios attendance today
  const today = new Date().toISOString().split('T')[0];
  
  const [attendance] = await pool.execute(
    `SELECT id, scan_method, status, time_in, time_out, date
     FROM attendance 
     WHERE student_id = 1 AND date = ?
     ORDER BY id ASC`,
    [today]
  );

  if (attendance.length === 0) {
    console.log('❌ No attendance records for Padios today');
    console.log('   Recommendation: Test this scenario:\n');
    console.log('   1. Scan QR first → Should create Time-In or Late');
    console.log('   2. Scan BLE next → Should either:');
    console.log('      a) UPDATE same record with time_out (current BLE behavior)');
    console.log('      b) INSERT new record with Time-Out (current QR behavior)\n');
  } else {
    console.log(`Found ${attendance.length} attendance record(s) for Padios today:\n`);
    
    attendance.forEach((a, idx) => {
      console.log(`Record ${idx + 1}:`);
      console.log(`  ID: ${a.id}`);
      console.log(`  Method: ${a.scan_method}`);
      console.log(`  Status: ${a.status}`);
      console.log(`  Time In: ${a.time_in || 'NULL'}`);
      console.log(`  Time Out: ${a.time_out || 'NULL'}`);
      console.log('');
    });

    // Analysis
    const methods = attendance.map(a => a.scan_method);
    const statuses = attendance.map(a => a.status);
    
    console.log('=== ANALYSIS ===');
    console.log(`Methods used: ${[...new Set(methods)].join(', ')}`);
    console.log(`Statuses: ${[...new Set(statuses)].join(', ')}`);
    
    if (attendance.length === 1 && attendance[0].time_in && attendance[0].time_out) {
      console.log('✅ SINGLE RECORD with both time_in and time_out');
      console.log('   This means BLE UPDATED the QR record');
    } else if (attendance.length >= 2) {
      console.log('✅ MULTIPLE RECORDS');
      console.log('   This means each method created separate records');
    } else if (attendance.length === 1 && !attendance[0].time_out) {
      console.log('⚠️  SINGLE RECORD with only time_in');
      console.log('   Time-Out not recorded yet');
    }
  }

  await pool.end();
})();
