const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('=== CHECKING BERNIE & FIN SETUP ===\n');

  // Check users table
  console.log('--- USERS TABLE ---');
  const [users] = await pool.execute(
    `SELECT id, username, role_id FROM users 
     WHERE username IN ('Bernie', 'Fin', 'bernie', 'fin')
     ORDER BY id`
  );
  
  if (users.length > 0) {
    console.log('Found users:');
    users.forEach(u => {
      console.log(`  User ID: ${u.id} | Username: ${u.username} | Role: ${u.role_id} (1=admin, 2=student, 3=parent)`);
    });
  } else {
    console.log('  No Bernie or Fin found in users table');
  }
  console.log('');

  // Check students table
  console.log('--- STUDENTS TABLE ---');
  const [students] = await pool.execute(
    `SELECT id, user_id, name, lrn, grade, section, gender 
     FROM students 
     WHERE name IN ('Bernie', 'Fin') OR user_id IN (SELECT id FROM users WHERE username IN ('Bernie', 'Fin', 'bernie', 'fin'))
     ORDER BY id`
  );
  
  if (students.length > 0) {
    console.log('Found students:');
    students.forEach(s => {
      console.log(`  Student ID: ${s.id} | User ID: ${s.user_id} | Name: ${s.name} | LRN: ${s.lrn} | Grade: ${s.grade} | Section: ${s.section}`);
    });
  } else {
    console.log('  No Bernie or Fin found in students table');
  }
  console.log('');

  // Check parents_teachers table
  console.log('--- PARENTS TABLE ---');
  const [parents] = await pool.execute(
    `SELECT id, user_id, name, contact_number 
     FROM parents_teachers 
     WHERE name IN ('Bernie', 'Fin') OR user_id IN (SELECT id FROM users WHERE username IN ('Bernie', 'Fin', 'bernie', 'fin'))
     ORDER BY id`
  );
  
  if (parents.length > 0) {
    console.log('Found parents:');
    parents.forEach(p => {
      console.log(`  Parent ID: ${p.id} | User ID: ${p.user_id} | Name: ${p.name} | Phone: ${p.contact_number}`);
    });
  } else {
    console.log('  No Bernie or Fin found in parents table');
  }
  console.log('');

  // Check student-parent links
  console.log('--- STUDENT-PARENT LINKS ---');
  const [links] = await pool.execute(
    `SELECT spl.id, spl.student_id, s.name as student_name, 
     spl.parent_id, p.name as parent_name
     FROM student_parent_links spl
     JOIN students s ON spl.student_id = s.id
     JOIN parents_teachers p ON spl.parent_id = p.id
     WHERE s.name IN ('Bernie', 'Fin') OR p.name IN ('Bernie', 'Fin')
     ORDER BY spl.id`
  );
  
  if (links.length > 0) {
    console.log('Found links:');
    links.forEach(l => {
      console.log(`  Link ID: ${l.id} | Student: ${l.student_name} (ID: ${l.student_id}) → Parent: ${l.parent_name} (ID: ${l.parent_id})`);
    });
  } else {
    console.log('  No links found between Bernie and Fin');
  }
  console.log('');

  console.log('=== EXPECTED SETUP ===');
  console.log('Bernie = STUDENT (role_id: 2)');
  console.log('Fin = PARENT (role_id: 3)');
  console.log('Link: Bernie (student) → Fin (parent)');

  await pool.end();
})();
