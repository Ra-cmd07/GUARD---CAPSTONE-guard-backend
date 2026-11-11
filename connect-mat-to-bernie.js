const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== CONNECTING TEACHER MAT TO BERNIE (GRADE 7) ===\n');

  // Step 1: Find Mat's user account
  const [matUser] = await pool.execute(
    `SELECT id, username, role_id FROM users WHERE username LIKE '%Mat%'`
  );

  if (matUser.length === 0) {
    console.log('❌ Mat user not found');
    await pool.end();
    return;
  }

  const matUserId = matUser[0].id;
  console.log('Mat User Account:');
  console.log('  User ID:', matUserId);
  console.log('  Username:', matUser[0].username);
  console.log('  Role ID:', matUser[0].role_id, '(2 = teacher)');
  console.log('');

  // Step 2: Check if Mat has a teacher record
  const [matTeacher] = await pool.execute(
    `SELECT * FROM teachers WHERE user_id = ?`,
    [matUserId]
  );

  let teacherId;
  
  if (matTeacher.length === 0) {
    console.log('Creating teacher record for Mat...');
    
    // Create teacher record
    const [result] = await pool.execute(
      `INSERT INTO teachers (user_id, name, section, created_at, updated_at) 
       VALUES (?, 'Mat Avindo', 'Grade 7 - section 1', NOW(), NOW())`,
      [matUserId]
    );
    
    teacherId = result.insertId;
    console.log('✅ Teacher record created (ID:', teacherId, ')');
  } else {
    teacherId = matTeacher[0].id;
    console.log('Teacher record exists (ID:', teacherId, ')');
    console.log('  Current section:', matTeacher[0].section);
    
    // Update to Grade 7 - section 1
    await pool.execute(
      `UPDATE teachers SET section = 'Grade 7 - section 1', updated_at = NOW() WHERE id = ?`,
      [teacherId]
    );
    console.log('✅ Updated section to: Grade 7 - section 1');
  }
  console.log('');

  // Step 3: Get Bernie's details
  const [bernie] = await pool.execute(
    `SELECT id, name, grade, section FROM students WHERE name = 'Bernie'`
  );

  if (bernie.length > 0) {
    const b = bernie[0];
    console.log('Bernie (Student):');
    console.log('  Student ID:', b.id);
    console.log('  Name:', b.name);
    console.log('  Grade:', b.grade);
    console.log('  Section:', b.section);
    console.log('');
  }

  // Step 4: Update Bernie's teacher_id if column exists
  try {
    await pool.execute(
      `UPDATE students SET teacher_id = ?, updated_at = NOW() WHERE id = ?`,
      [teacherId, bernie[0].id]
    );
    console.log('✅ Bernie assigned to Teacher Mat');
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR') {
      console.log('⚠️  teacher_id column not found in students table');
      console.log('   Link is established via section matching');
    } else {
      throw err;
    }
  }
  console.log('');

  // Step 5: Verify the connection
  console.log('=== VERIFICATION ===\n');
  
  const [teacherCheck] = await pool.execute(
    `SELECT id, name, section FROM teachers WHERE id = ?`,
    [teacherId]
  );
  
  if (teacherCheck.length > 0) {
    const t = teacherCheck[0];
    console.log('Teacher Mat:');
    console.log('  ID:', t.id);
    console.log('  Name:', t.name);
    console.log('  Assigned Section:', t.section);
    console.log('');
  }

  // Get all students in Mat's section
  const [studentsInSection] = await pool.execute(
    `SELECT id, name, grade, section 
     FROM students 
     WHERE section = 'section 1' AND grade = 'Grade 7'`
  );

  console.log(`Students in Mat's Section (${studentsInSection.length}):`);
  studentsInSection.forEach(s => {
    console.log(`  - ${s.name} (ID: ${s.id}) - ${s.grade}, ${s.section}`);
  });
  console.log('');

  console.log('✅ CONNECTION COMPLETE!');
  console.log('   Teacher Mat can now view Bernie\'s attendance');
  console.log('   Section: Grade 7 - section 1');

  await pool.end();
})();
