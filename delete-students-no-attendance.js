const mysql = require('mysql2/promise');

async function deleteStudentsWithNoAttendance() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🗑️  Finding and deleting students with no attendance records...\n');

  try {
    // Find students who have NEVER scanned (no attendance records)
    const [studentsWithNoAttendance] = await connection.execute(`
      SELECT s.id, s.user_id, s.name, s.lrn 
      FROM students s
      LEFT JOIN attendance a ON s.id = a.student_id
      WHERE a.id IS NULL
    `);

    if (studentsWithNoAttendance.length === 0) {
      console.log('✅ No students found without attendance records!');
      console.log('   All students have at least one scan.\n');
      await connection.end();
      return;
    }

    console.log(`Found ${studentsWithNoAttendance.length} students without any attendance:\n`);
    
    // Show the students to be deleted
    studentsWithNoAttendance.forEach((s, i) => {
      console.log(`${i + 1}. ${s.name} (LRN: ${s.lrn}, ID: ${s.id})`);
    });

    console.log('\n⚠️  WARNING: This will permanently delete these students!');
    console.log('━'.repeat(60));

    // Extract IDs
    const studentIds = studentsWithNoAttendance.map(s => s.id);
    const userIds = studentsWithNoAttendance.map(s => s.user_id).filter(id => id !== null);

    // Delete in correct order to avoid foreign key constraints

    // 1. Delete parent-student relationships
    if (studentIds.length > 0) {
      await connection.execute(
        `DELETE FROM parent_student WHERE student_id IN (${studentIds.join(',')})`
      );
      console.log('✅ Deleted parent-student relationships');
    }

    // 2. Delete BLE detections (if any)
    if (studentIds.length > 0) {
      await connection.execute(
        `DELETE FROM ble_detections WHERE student_id IN (${studentIds.join(',')})`
      );
      console.log('✅ Deleted BLE detections');
    }

    // 3. Delete student records
    if (studentIds.length > 0) {
      await connection.execute(
        `DELETE FROM students WHERE id IN (${studentIds.join(',')})`
      );
      console.log('✅ Deleted student records');
    }

    // 4. Delete user accounts
    if (userIds.length > 0) {
      await connection.execute(
        `DELETE FROM users WHERE id IN (${userIds.join(',')})`
      );
      console.log('✅ Deleted user accounts');
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`✅ Successfully deleted ${studentsWithNoAttendance.length} students with no attendance!`);
    console.log('═══════════════════════════════════════════════════');

    // Show remaining students
    const [remaining] = await connection.execute('SELECT COUNT(*) as count FROM students');
    console.log(`\n📊 Remaining students: ${remaining[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await connection.end();
}

deleteStudentsWithNoAttendance().catch(console.error);
