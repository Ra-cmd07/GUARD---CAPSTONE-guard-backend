const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== TESTING PARENT PORTAL FIX ===\n');

  // Step 1: Get Fin's parent record
  const [finUser] = await pool.execute(
    `SELECT id FROM users WHERE username = 'Fin'`
  );
  const finUserId = finUser[0].id;

  const [finParent] = await pool.execute(
    `SELECT id, student_id, name FROM parents_teachers WHERE user_id = ?`,
    [finUserId]
  );

  if (finParent.length === 0) {
    console.log('❌ Fin has no parent record');
    await pool.end();
    return;
  }

  const parentId = finParent[0].id;
  const studentId = finParent[0].student_id;

  console.log('Fin Parent Record:');
  console.log('  Parent ID (profileId):', parentId);
  console.log('  User ID:', finUserId);
  console.log('  Linked Student ID:', studentId);
  console.log('');

  // Step 2: Test the query that the API would use
  console.log('=== SIMULATING API QUERY ===\n');
  console.log('Query: SELECT student_id FROM parents_teachers WHERE id = ? AND student_id IS NOT NULL');
  console.log('Params:', [parentId]);
  console.log('');

  const [parentQuery] = await pool.execute(
    'SELECT student_id FROM parents_teachers WHERE id = ? AND student_id IS NOT NULL',
    [parentId]
  );

  if (parentQuery.length === 0) {
    console.log('❌ Query returned no results - Parent portal would show empty');
    await pool.end();
    return;
  }

  const linkedStudentId = parentQuery[0].student_id;
  console.log('✅ Found student_id:', linkedStudentId);
  console.log('');

  // Step 3: Get student details
  const [students] = await pool.execute(
    `SELECT id, lrn, name, gender, grade, section FROM students WHERE id = ?`,
    [linkedStudentId]
  );

  if (students.length > 0) {
    const s = students[0];
    console.log('Student Details (what parent would see):');
    console.log('  ID:', s.id);
    console.log('  Name:', s.name);
    console.log('  LRN:', s.lrn);
    console.log('  Grade:', s.grade);
    console.log('  Section:', s.section);
    console.log('');
  }

  // Step 4: Get attendance for this student
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 6);
  const fromStr = from.toISOString().split('T')[0];
  const toStr = today.toISOString().split('T')[0];

  console.log('=== TESTING ATTENDANCE QUERY ===');
  console.log('Date range:', fromStr, 'to', toStr);
  console.log('');

  const [attendance] = await pool.execute(
    `SELECT * FROM attendance 
     WHERE student_id = ? 
     AND date >= ? 
     AND date <= ?
     ORDER BY date DESC, id DESC`,
    [linkedStudentId, fromStr, toStr]
  );

  console.log(`Found ${attendance.length} attendance record(s):`);
  if (attendance.length === 0) {
    console.log('  ⚠️  No attendance records in the past 7 days');
  } else {
    attendance.forEach((a, i) => {
      console.log(`  ${i + 1}. Date: ${a.date} | Status: ${a.status} | Method: ${a.scan_method} | Time: ${a.time_in || a.time_out}`);
    });
  }
  console.log('');

  console.log('=== SUMMARY ===');
  if (parentQuery.length > 0 && students.length > 0) {
    console.log('✅ Parent portal fix is working!');
    console.log('   Fin can now see Bernie\'s attendance');
  } else {
    console.log('❌ Something is still wrong');
  }

  await pool.end();
})();
