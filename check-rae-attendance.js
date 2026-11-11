// Check Rae Anthony Reyes attendance records
const mysql = require('mysql2/promise');

async function checkRaeAttendance() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n🔍 Looking for student: Reyes, Rae Anthony\n');
  
  // Find the student
  const [students] = await connection.execute(
    'SELECT id, name, lrn FROM students WHERE name LIKE ?',
    ['%Reyes, Rae Anthony%']
  );
  
  if (students.length === 0) {
    console.log('❌ Student not found');
    await connection.end();
    return;
  }
  
  console.log('✅ Found student:');
  console.table(students);
  
  const studentId = students[0].id;
  
  // Check attendance table (verified records)
  console.log('\n📋 VERIFIED ATTENDANCE (attendance table):');
  const [attendance] = await connection.execute(
    `SELECT id, date, session, status, time_in, time_out, created_at 
     FROM attendance 
     WHERE student_id = ? 
     ORDER BY date DESC, created_at DESC
     LIMIT 10`,
    [studentId]
  );
  console.table(attendance);
  
  // Check partial_attendance table (pending verification)
  console.log('\n⏳ PENDING ATTENDANCE (partial_attendance table):');
  const [partial] = await connection.execute(
    `SELECT id, date, session, status, time_in, time_out, scanned_at, created_at 
     FROM partial_attendance 
     WHERE student_id = ? 
     ORDER BY date DESC, scanned_at DESC
     LIMIT 10`,
    [studentId]
  );
  console.table(partial);
  
  // Check today's records specifically
  const today = '2026-11-11';
  console.log(`\n📅 TODAY'S RECORDS (${today}):`);
  
  console.log('\nVerified (attendance):');
  const [todayVerified] = await connection.execute(
    `SELECT id, session, status, time_in, time_out, created_at 
     FROM attendance 
     WHERE student_id = ? AND date = ?
     ORDER BY created_at`,
    [studentId, today]
  );
  console.table(todayVerified);
  
  console.log('\nPending (partial_attendance):');
  const [todayPending] = await connection.execute(
    `SELECT id, session, status, time_in, time_out, scanned_at 
     FROM partial_attendance 
     WHERE student_id = ? AND date = ?
     ORDER BY scanned_at`,
    [studentId, today]
  );
  console.table(todayPending);
  
  await connection.end();
}

checkRaeAttendance().catch(console.error);
