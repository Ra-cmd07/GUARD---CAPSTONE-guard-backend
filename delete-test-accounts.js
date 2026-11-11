const mysql = require('mysql2/promise');

async function deleteTestAccounts() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🗑️  Deleting existing test accounts (student1-50, parent1-50)...\n');

  try {
    // Get all student user IDs
    const [studentUsers] = await connection.execute(
      `SELECT id FROM users WHERE username LIKE 'student%' AND username REGEXP '^student[0-9]+$'`
    );
    
    // Get all parent user IDs
    const [parentUsers] = await connection.execute(
      `SELECT id FROM users WHERE username LIKE 'parent%' AND username REGEXP '^parent[0-9]+$'`
    );
    
    const studentUserIds = studentUsers.map(u => u.id);
    const parentUserIds = parentUsers.map(u => u.id);
    
    console.log(`Found ${studentUserIds.length} student accounts`);
    console.log(`Found ${parentUserIds.length} parent accounts\n`);

    if (studentUserIds.length === 0 && parentUserIds.length === 0) {
      console.log('✅ No test accounts to delete!');
      await connection.end();
      return;
    }

    // Delete in correct order to avoid foreign key constraints
    
    // 1. Delete parent_student relationships
    if (studentUserIds.length > 0) {
      await connection.execute(
        `DELETE ps FROM parent_student ps
         JOIN students s ON ps.student_id = s.id
         WHERE s.user_id IN (${studentUserIds.join(',')})`
      );
      console.log('✅ Deleted parent-student relationships');
    }

    // 2. Delete attendance records
    if (studentUserIds.length > 0) {
      await connection.execute(
        `DELETE a FROM attendance a
         JOIN students s ON a.student_id = s.id
         WHERE s.user_id IN (${studentUserIds.join(',')})`
      );
      console.log('✅ Deleted attendance records');
    }

    // 3. Delete BLE detections
    if (studentUserIds.length > 0) {
      await connection.execute(
        `DELETE b FROM ble_detections b
         JOIN students s ON b.student_id = s.id
         WHERE s.user_id IN (${studentUserIds.join(',')})`
      );
      console.log('✅ Deleted BLE detections');
    }

    // 4. Delete SMS logs
    if (studentUserIds.length > 0) {
      await connection.execute(
        `DELETE FROM sms_logs WHERE student_name LIKE 'Maria %' OR student_name LIKE 'Jose %'`
      );
      console.log('✅ Deleted SMS logs');
    }

    // 5. Delete students
    if (studentUserIds.length > 0) {
      await connection.execute(
        `DELETE FROM students WHERE user_id IN (${studentUserIds.join(',')})`
      );
      console.log('✅ Deleted student records');
    }

    // 6. Delete parents
    if (parentUserIds.length > 0) {
      await connection.execute(
        `DELETE FROM parents WHERE user_id IN (${parentUserIds.join(',')})`
      );
      console.log('✅ Deleted parent records');
    }

    // 7. Delete user accounts (both students and parents)
    const allUserIds = [...studentUserIds, ...parentUserIds];
    if (allUserIds.length > 0) {
      await connection.execute(
        `DELETE FROM users WHERE id IN (${allUserIds.join(',')})`
      );
      console.log('✅ Deleted user accounts');
    }

    console.log('\n═══════════════════════════════════════════════════');
    console.log('✅ All test accounts deleted successfully!');
    console.log('═══════════════════════════════════════════════════');
    console.log('\n💡 Now you can run: node create-50-students.js\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await connection.end();
}

deleteTestAccounts().catch(console.error);
