// List all users, students, and parents to help with linking
import pool from '../lib/db';

async function listUsers() {
  try {
    console.log('\n📋 === USERS ===');
    const [users] = await pool.execute(`
      SELECT u.id, u.username, r.name AS role, u.is_active
      FROM users u
      JOIN roles r ON r.id = u.role_id
      ORDER BY r.name, u.id
    `) as any[];
    console.table(users);

    console.log('\n👨‍🏫 === TEACHERS ===');
    const [teachers] = await pool.execute(`
      SELECT t.id, t.user_id, t.name, t.section, t.subject
      FROM teachers t
      ORDER BY t.id
    `) as any[];
    console.table(teachers);

    console.log('\n👨‍👩‍👧‍👦 === PARENTS ===');
    const [parents] = await pool.execute(`
      SELECT p.id, p.user_id, p.name, p.relationship, p.contact
      FROM parents p
      ORDER BY p.id
    `) as any[];
    console.table(parents);

    console.log('\n👦👧 === STUDENTS ===');
    const [students] = await pool.execute(`
      SELECT s.id, s.user_id, s.lrn, s.name, s.gender, s.grade, s.section
      FROM students s
      ORDER BY s.id
    `) as any[];
    console.table(students);

    console.log('\n🔗 === PARENT-STUDENT LINKS ===');
    const [links] = await pool.execute(`
      SELECT ps.id, ps.parent_id, p.name AS parent_name, 
             ps.student_id, s.name AS student_name, ps.relationship
      FROM parent_student ps
      JOIN parents p ON p.id = ps.parent_id
      JOIN students s ON s.id = ps.student_id
      ORDER BY ps.id
    `) as any[];
    
    if (links.length === 0) {
      console.log('❌ No parent-student relationships found');
    } else {
      console.table(links);
    }

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err);
    await pool.end();
    process.exit(1);
  }
}

listUsers();
