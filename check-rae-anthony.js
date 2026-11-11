const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    // Find Rae Anthony
    const [students] = await pool.execute(
      'SELECT * FROM students WHERE name LIKE ?',
      ['%Rae Anthony%']
    );

    if (students.length === 0) {
      console.log('❌ Rae Anthony not found');
      await pool.end();
      return;
    }

    const student = students[0];
    console.log('\n👤 Student:', student.name);
    console.log('   ID:', student.id);
    console.log('   LRN:', student.lrn);
    console.log('   Grade:', student.grade);
    console.log('   Section:', student.section);

    // Check parents in parent_student table (current system)
    const [parents] = await pool.execute(`
      SELECT p.*, ps.relationship
      FROM parent_student ps
      JOIN parents p ON ps.parent_id = p.id
      WHERE ps.student_id = ?
    `, [student.id]);

    console.log('\n📋 Parents (parent_student table):');
    if (parents.length === 0) {
      console.log('   ❌ No parents linked');
    } else {
      parents.forEach(p => {
        console.log(`   - ${p.name} (${p.relationship}) - Contact: ${p.contact || 'N/A'}`);
      });
    }

    // Check old parents_teachers table
    const [oldParents] = await pool.execute(
      'SELECT * FROM parents_teachers WHERE student_id = ?',
      [student.id]
    );

    console.log('\n📋 Parents (parents_teachers table - old):');
    if (oldParents.length === 0) {
      console.log('   ❌ No parents in old table');
    } else {
      oldParents.forEach(p => {
        console.log(`   - ${p.name} (${p.role}) - Contact: ${p.contact_number || 'N/A'}`);
      });
    }

    // Check teacher
    const [teachers] = await pool.execute(
      'SELECT * FROM teachers WHERE section = ?',
      [student.section]
    );

    console.log('\n👨‍🏫 Teacher for section', student.section + ':');
    if (teachers.length === 0) {
      console.log('   ❌ No teacher assigned');
    } else {
      teachers.forEach(t => {
        console.log(`   - ${t.name} - Contact: ${t.contact || 'N/A'}`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
