const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== DIAGNOSING PARENT PORTAL ISSUE ===\n');

  // Get Fin's info
  const [finUser] = await pool.execute(
    `SELECT id, username, role_id FROM users WHERE username = 'Fin'`
  );

  if (finUser.length === 0) {
    console.log('❌ Fin user not found');
    await pool.end();
    return;
  }

  const finUserId = finUser[0].id;
  console.log('Fin User:');
  console.log('  ID:', finUserId);
  console.log('  Username:', finUser[0].username);
  console.log('  Role:', finUser[0].role_id, '(3 = parent)\n');

  // Get Fin's parent record
  const [finParent] = await pool.execute(
    `SELECT * FROM parents_teachers WHERE user_id = ?`,
    [finUserId]
  );

  if (finParent.length === 0) {
    console.log('❌ Fin has no parent record in parents_teachers table');
    await pool.end();
    return;
  }

  const parentId = finParent[0].id;
  const linkedStudentId = finParent[0].student_id;

  console.log('Fin Parent Record:');
  console.log('  Parent ID:', parentId);
  console.log('  Student ID (linked):', linkedStudentId || 'NULL ❌');
  console.log('  Name:', finParent[0].name);
  console.log('  Phone:', finParent[0].contact_number);
  console.log('');

  if (!linkedStudentId) {
    console.log('❌ PROBLEM: student_id is NULL in parents_teachers table!');
    console.log('   Parent portal cannot find child without this link.\n');
  }

  // Check Bernie's student record
  const [bernieStudent] = await pool.execute(
    `SELECT s.*, u.username 
     FROM students s 
     JOIN users u ON s.user_id = u.id 
     WHERE u.username = 'Bernie'`
  );

  if (bernieStudent.length > 0) {
    const s = bernieStudent[0];
    console.log('Bernie Student Record:');
    console.log('  Student ID:', s.id);
    console.log('  User ID:', s.user_id);
    console.log('  Name:', s.name);
    console.log('  LRN:', s.lrn);
    console.log('');
  }

  // Check Bernie's attendance
  const [bernieAttendance] = await pool.execute(
    `SELECT * FROM attendance WHERE student_id = ? ORDER BY id DESC LIMIT 5`,
    [linkedStudentId || 1]
  );

  console.log(`Bernie's Recent Attendance (${bernieAttendance.length} records):`);
  if (bernieAttendance.length === 0) {
    console.log('  ❌ No attendance records found\n');
  } else {
    bernieAttendance.forEach((a, i) => {
      console.log(`  ${i + 1}. Date: ${a.date} | Status: ${a.status} | Method: ${a.scan_method} | Time: ${a.time_in || a.time_out}`);
    });
    console.log('');
  }

  // Test parent portal query
  console.log('=== TESTING PARENT PORTAL QUERY ===\n');

  if (linkedStudentId) {
    const [portalData] = await pool.execute(
      `SELECT a.*, s.name as student_name, s.lrn, s.grade, s.section
       FROM attendance a
       JOIN students s ON a.student_id = s.id
       WHERE a.student_id = ?
       ORDER BY a.date DESC, a.id DESC
       LIMIT 10`,
      [linkedStudentId]
    );

    console.log('Parent portal would show:', portalData.length, 'records');
    if (portalData.length > 0) {
      console.log('Sample record:');
      console.log('  Student:', portalData[0].student_name);
      console.log('  Date:', portalData[0].date);
      console.log('  Status:', portalData[0].status);
      console.log('  Method:', portalData[0].scan_method);
    }
  } else {
    console.log('❌ Cannot test query - student_id is NULL');
  }

  await pool.end();
})();
