// Check Bernie's attendance records
const mysql = require('mysql2/promise');

async function checkBerniesAttendance() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n🔍 Looking for student: Alonzo, Bernie A\n');
  
  // Find the student
  const [students] = await connection.execute(
    'SELECT id, name, lrn FROM students WHERE name LIKE ?',
    ['%Alonzo, Bernie%']
  );
  
  if (students.length === 0) {
    console.log('❌ Student not found');
    await connection.end();
    return;
  }
  
  console.log('✅ Found student:');
  console.table(students);
  
  const studentId = students[0].id;
  const today = '2026-11-11';
  
  // Check confirmed attendance (attendance table)
  console.log('\n📋 CONFIRMED ATTENDANCE (attendance table):');
  const [confirmed] = await connection.execute(
    `SELECT id, date, session, status, time_in, time_out, created_at, timestamp
     FROM attendance 
     WHERE student_id = ? AND date = ?
     ORDER BY created_at`,
    [studentId, today]
  );
  console.table(confirmed);
  
  // Check pending attendance (partial_attendance table)
  console.log('\n⏳ PENDING ATTENDANCE (partial_attendance table):');
  const [pending] = await connection.execute(
    `SELECT id, date, session, status, time_in, time_out, scanned_at, created_at
     FROM partial_attendance 
     WHERE student_id = ? AND date = ?
     ORDER BY scanned_at`,
    [studentId, today]
  );
  console.table(pending);
  
  console.log('\n🔍 ANALYSIS:');
  console.log(`Total confirmed records: ${confirmed.length}`);
  console.log(`Total pending records: ${pending.length}`);
  
  // Check which has time_in and time_out
  confirmed.forEach((rec, idx) => {
    console.log(`\nConfirmed #${idx + 1}:`);
    console.log(`  Time-In: ${rec.time_in || 'NULL'}`);
    console.log(`  Time-Out: ${rec.time_out || 'NULL'}`);
    console.log(`  Status: ${rec.status}`);
  });
  
  pending.forEach((rec, idx) => {
    console.log(`\nPending #${idx + 1}:`);
    console.log(`  Time-In: ${rec.time_in || 'NULL'}`);
    console.log(`  Time-Out: ${rec.time_out || 'NULL'}`);
    console.log(`  Status: ${rec.status}`);
  });
  
  await connection.end();
}

checkBerniesAttendance().catch(console.error);
