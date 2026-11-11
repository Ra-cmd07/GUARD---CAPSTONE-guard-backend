const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== FIXING BERNIE & FIN SETUP ===\n');

  try {
    // Step 1: Check what role_id = 4 means
    const [roles] = await pool.execute('SELECT * FROM roles WHERE id IN (2, 3, 4)');
    console.log('Roles in system:');
    roles.forEach(r => console.log(`  Role ${r.id}: ${r.name}`));
    console.log('');

    // Step 2: Update Bernie to be a STUDENT (role_id = 2)
    console.log('Step 1: Changing Bernie from Parent to Student...');
    await pool.execute(
      `UPDATE users SET role_id = 2 WHERE username = 'Bernie'`
    );
    console.log('✅ Bernie is now a STUDENT (role_id: 2)\n');

    // Step 3: Update Fin to be a PARENT (role_id = 3)
    console.log('Step 2: Changing Fin to Parent...');
    await pool.execute(
      `UPDATE users SET role_id = 3 WHERE username = 'Fin'`
    );
    console.log('✅ Fin is now a PARENT (role_id: 3)\n');

    // Step 4: Check if Bernie exists as a student
    const [bernieStudent] = await pool.execute(
      `SELECT * FROM students WHERE user_id = (SELECT id FROM users WHERE username = 'Bernie')`
    );

    if (bernieStudent.length === 0) {
      // Create Bernie as student
      console.log('Step 3: Creating Bernie as student record...');
      
      const [bernieUser] = await pool.execute(
        `SELECT id FROM users WHERE username = 'Bernie'`
      );
      const bernieUserId = bernieUser[0].id;

      await pool.execute(
        `INSERT INTO students 
         (user_id, name, lrn, grade, section, gender, is_active) 
         VALUES (?, 'Bernie', '11122233344', 'Grade 10', 'Diamond', 'M', 1)`,
        [bernieUserId]
      );
      console.log('✅ Bernie student record created\n');
    } else {
      console.log('Step 3: Bernie already has student record\n');
    }

    // Step 5: Check if Fin exists as parent
    const [finParent] = await pool.execute(
      `SELECT * FROM parents_teachers WHERE user_id = (SELECT id FROM users WHERE username = 'Fin')`
    );

    if (finParent.length === 0) {
      // Create Fin as parent
      console.log('Step 4: Creating Fin as parent record...');
      
      const [finUser] = await pool.execute(
        `SELECT id FROM users WHERE username = 'Fin'`
      );
      const finUserId = finUser[0].id;

      await pool.execute(
        `INSERT INTO parents_teachers 
         (user_id, name, contact_number) 
         VALUES (?, 'Fin', '0912-345-6789')`,
        [finUserId]
      );
      console.log('✅ Fin parent record created\n');
    } else {
      console.log('Step 4: Fin already has parent record (ID:', finParent[0].id, ')\n');
    }

    // Step 6: Link Bernie (student) to Fin (parent)
    console.log('Step 5: Linking Bernie (student) to Fin (parent)...');
    
    const [bernieStudentFinal] = await pool.execute(
      `SELECT id FROM students WHERE user_id = (SELECT id FROM users WHERE username = 'Bernie')`
    );
    const [finParentFinal] = await pool.execute(
      `SELECT id FROM parents_teachers WHERE user_id = (SELECT id FROM users WHERE username = 'Fin')`
    );

    if (bernieStudentFinal.length > 0 && finParentFinal.length > 0) {
      const bernieStudentId = bernieStudentFinal[0].id;
      const finParentId = finParentFinal[0].id;

      // Update students table with parent link (if column exists)
      try {
        await pool.execute(
          `UPDATE students SET parent_id = ? WHERE id = ?`,
          [finParentId, bernieStudentId]
        );
        console.log('✅ Bernie linked to Fin as parent\n');
      } catch (err) {
        if (err.code === 'ER_BAD_FIELD_ERROR') {
          console.log('⚠️  parent_id column not found in students table');
          console.log('   Linking via parents_teachers.student_id instead...\n');
          
          // Update parent record with student_id
          await pool.execute(
            `UPDATE parents_teachers SET student_id = ? WHERE id = ?`,
            [bernieStudentId, finParentId]
          );
          console.log('✅ Fin linked to Bernie as child\n');
        } else {
          throw err;
        }
      }
    }

    // Step 7: Verify the fix
    console.log('=== VERIFICATION ===\n');
    
    const [users] = await pool.execute(
      `SELECT id, username, role_id FROM users WHERE username IN ('Bernie', 'Fin')`
    );
    
    console.log('Users:');
    users.forEach(u => {
      const roleType = u.role_id === 2 ? 'STUDENT ✅' : u.role_id === 3 ? 'PARENT ✅' : `Role ${u.role_id}`;
      console.log(`  ${u.username}: ${roleType}`);
    });
    console.log('');

    const [bernieS] = await pool.execute(
      `SELECT s.id, s.name, s.lrn, s.grade, s.section 
       FROM students s 
       JOIN users u ON s.user_id = u.id 
       WHERE u.username = 'Bernie'`
    );
    
    if (bernieS.length > 0) {
      const s = bernieS[0];
      console.log('Bernie (Student):');
      console.log(`  ID: ${s.id}`);
      console.log(`  Name: ${s.name}`);
      console.log(`  LRN: ${s.lrn}`);
      console.log(`  Grade: ${s.grade}`);
      console.log(`  Section: ${s.section}`);
      console.log('');
    }

    const [finP] = await pool.execute(
      `SELECT p.id, p.name, p.contact_number 
       FROM parents_teachers p 
       JOIN users u ON p.user_id = u.id 
       WHERE u.username = 'Fin'`
    );
    
    if (finP.length > 0) {
      const p = finP[0];
      console.log('Fin (Parent):');
      console.log(`  ID: ${p.id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  Phone: ${p.contact_number}`);
      console.log('');
    }

    console.log('✅ Bernie & Fin setup restored!');
    console.log('   Bernie = Student');
    console.log('   Fin = Parent of Bernie');

  } catch (err) {
    console.error('❌ Error:', err.message);
  }

  await pool.end();
})();
