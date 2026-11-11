// Quick script to check student data and attendance
import pool from '../lib/db';

async function checkStudentData() {
  try {
    console.log('\n=== Checking Student Data ===\n');

    // Check all students
    const [students] = await pool.execute(
      'SELECT id, user_id, lrn, name, grade, section FROM students'
    ) as any[];
    
    console.log(`Total students in database: ${(students as any[]).length}`);
    
    if ((students as any[]).length === 0) {
      console.log('\n❌ No students found in database!');
      console.log('👉 You need to register students first using the Teacher Dashboard or Admin Dashboard\n');
      await pool.end();
      return;
    }

    console.log('\n📋 Students:');
    for (const s of students as any[]) {
      console.log(`  - ID: ${s.id}, LRN: ${s.lrn}, Name: ${s.name}, User ID: ${s.user_id || 'NOT LINKED'}`);
    }

    // Check attendance records
    const [attendance] = await pool.execute(
      'SELECT student_id, student_name, status, date, time_in FROM attendance ORDER BY date DESC LIMIT 10'
    ) as any[];

    console.log(`\n📊 Total attendance records: ${(attendance as any[]).length}`);
    
    if ((attendance as any[]).length === 0) {
      console.log('\n❌ No attendance records found!');
      console.log('👉 Students need to scan their QR codes at the kiosk\n');
    } else {
      console.log('\n📋 Recent Attendance:');
      for (const a of attendance as any[]) {
        console.log(`  - ${a.student_name} (ID: ${a.student_id}) - ${a.status} on ${a.date} at ${a.time_in || 'N/A'}`);
      }
    }

    // Check which students have user accounts for login
    const [usersLinked] = await pool.execute(`
      SELECT s.id, s.name, s.lrn, u.username, u.is_active
      FROM students s
      JOIN users u ON u.id = s.user_id
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'student')
    `) as any[];

    console.log(`\n👤 Students with login accounts: ${(usersLinked as any[]).length}`);
    if ((usersLinked as any[]).length > 0) {
      for (const u of usersLinked as any[]) {
        console.log(`  - ${u.name} (${u.username}) - ${u.is_active ? '✅ Active' : '❌ Inactive'}`);
      }
    } else {
      console.log('❌ No students have user accounts to login!');
      console.log('👉 To allow students to login:');
      console.log('   1. Admin must create student user accounts');
      console.log('   2. Link user accounts to student records (set user_id in students table)\n');
    }

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

checkStudentData();
