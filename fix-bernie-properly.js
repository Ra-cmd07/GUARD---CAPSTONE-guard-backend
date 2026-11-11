const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== FIXING BERNIE & FIN PROPERLY ===\n');

  // Check roles
  const [roles] = await pool.execute('SELECT * FROM roles');
  console.log('System roles:');
  roles.forEach(r => console.log(`  ${r.id}: ${r.name}`));
  
  const studentRoleId = roles.find(r => r.name.toLowerCase() === 'student').id;
  const parentRoleId = roles.find(r => r.name.toLowerCase() === 'parent').id;
  
  console.log(`\nStudent role ID: ${studentRoleId}`);
  console.log(`Parent role ID: ${parentRoleId}\n`);

  // Step 1: Fix Bernie user (should be student)
  console.log('Step 1: Setting Bernie as STUDENT...');
  await pool.execute(
    `UPDATE users SET role_id = ? WHERE username = 'Bernie'`,
    [studentRoleId]
  );
  console.log('✅ Bernie user role updated to STUDENT\n');

  // Step 2: Fix Fin user (should be parent)
  console.log('Step 2: Setting Fin as PARENT...');
  await pool.execute(
    `UPDATE users SET role_id = ? WHERE username = 'Fin'`,
    [parentRoleId]
  );
  console.log('✅ Fin user role updated to PARENT\n');

  // Step 3: Check Bernie's student record
  const [bernieUser] = await pool.execute(
    `SELECT id FROM users WHERE username = 'Bernie'`
  );
  const bernieUserId = bernieUser[0].id;

  const [bernieStudent] = await pool.execute(
    `SELECT * FROM students WHERE user_id = ?`,
    [bernieUserId]
  );

  let bernieStudentId;

  if (bernieStudent.length === 0) {
    console.log('Step 3: Creating Bernie student record...');
    const [result] = await pool.execute(
      `INSERT INTO students 
       (user_id, name, lrn, grade, section, gender, is_active) 
       VALUES (?, 'Bernie', '11122233344', 'Grade 10', 'Diamond', 'M', 1)`,
      [bernieUserId]
    );
    bernieStudentId = result.insertId;
    console.log(`✅ Bernie student record created (ID: ${bernieStudentId})\n`);
  } else {
    bernieStudentId = bernieStudent[0].id;
    const currentName = bernieStudent[0].name;
    
    if (currentName !== 'Bernie') {
      console.log(`Step 3: Bernie's student record has name "${currentName}"...`);
      console.log('   Updating to "Bernie"...');
      await pool.execute(
        `UPDATE students SET name = 'Bernie' WHERE id = ?`,
        [bernieStudentId]
      );
      console.log('✅ Student name updated to Bernie\n');
    } else {
      console.log(`Step 3: Bernie student record exists (ID: ${bernieStudentId}) ✅\n`);
    }
  }

  // Step 4: Check Fin's parent record
  const [finUser] = await pool.execute(
    `SELECT id FROM users WHERE username = 'Fin'`
  );
  const finUserId = finUser[0].id;

  const [finParent] = await pool.execute(
    `SELECT * FROM parents_teachers WHERE user_id = ?`,
    [finUserId]
  );

  let finParentId;

  if (finParent.length === 0) {
    console.log('Step 4: Creating Fin parent record...');
    const [result] = await pool.execute(
      `INSERT INTO parents_teachers 
       (user_id, name, contact_number) 
       VALUES (?, 'Fin', '0912-345-6789')`,
      [finUserId]
    );
    finParentId = result.insertId;
    console.log(`✅ Fin parent record created (ID: ${finParentId})\n`);
  } else {
    finParentId = finParent[0].id;
    console.log(`Step 4: Fin parent record exists (ID: ${finParentId}) ✅\n`);
  }

  // Step 5: Link them
  console.log('Step 5: Linking Bernie (student) to Fin (parent)...');
  await pool.execute(
    `UPDATE parents_teachers SET student_id = ? WHERE id = ?`,
    [bernieStudentId, finParentId]
  );
  console.log('✅ Fin linked to Bernie as parent\n');

  // Verification
  console.log('=== FINAL VERIFICATION ===\n');

  const [verifyUsers] = await pool.execute(
    `SELECT u.username, u.role_id, r.name as role_name 
     FROM users u 
     JOIN roles r ON u.role_id = r.id 
     WHERE u.username IN ('Bernie', 'Fin')`
  );

  console.log('Users:');
  verifyUsers.forEach(u => {
    console.log(`  ${u.username}: ${u.role_name} (role_id: ${u.role_id})`);
  });
  console.log('');

  const [verifyBernie] = await pool.execute(
    `SELECT s.id, s.name, s.lrn, s.grade, s.section, s.gender 
     FROM students s 
     WHERE s.user_id = ?`,
    [bernieUserId]
  );

  if (verifyBernie.length > 0) {
    const s = verifyBernie[0];
    console.log('Bernie (Student Record):');
    console.log(`  Student ID: ${s.id}`);
    console.log(`  Name: ${s.name}`);
    console.log(`  LRN: ${s.lrn || 'Not set'}`);
    console.log(`  Grade: ${s.grade || 'Not set'}`);
    console.log(`  Section: ${s.section || 'Not set'}`);
    console.log(`  Gender: ${s.gender || 'Not set'}`);
    console.log('');
  }

  const [verifyFin] = await pool.execute(
    `SELECT p.id, p.name, p.contact_number, p.student_id, s.name as child_name 
     FROM parents_teachers p 
     LEFT JOIN students s ON p.student_id = s.id 
     WHERE p.user_id = ?`,
    [finUserId]
  );

  if (verifyFin.length > 0) {
    const p = verifyFin[0];
    console.log('Fin (Parent Record):');
    console.log(`  Parent ID: ${p.id}`);
    console.log(`  Name: ${p.name}`);
    console.log(`  Phone: ${p.contact_number}`);
    console.log(`  Child: ${p.child_name || 'None'} (Student ID: ${p.student_id || 'None'})`);
    console.log('');
  }

  console.log('✅ RESTORATION COMPLETE!');
  console.log('   Bernie = Student');
  console.log('   Fin = Parent of Bernie');
  console.log('');
  console.log('Now Fin can log in and view Bernie\'s attendance! 🎉');

  await pool.end();
})();
