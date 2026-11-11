const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    // Teacher details
    const username = 'floor_adviser';
    const password = '12345678';
    const name = 'Ms. Sofia Martinez';
    const section = 'Floor';  // Rae Anthony's section
    const subject = 'Mathematics';
    const room = 'Room 101';
    const contact = '09123456789';
    const employeeId = 'TCHR-2026-001';

    console.log('\n👨‍🏫 Creating teacher for section:', section);
    console.log('   Name:', name);
    console.log('   Username:', username);
    console.log('   Password:', password);

    // Check if username exists
    const [existCheck] = await conn.execute(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existCheck.length > 0) {
      console.log('❌ Username already exists');
      await conn.rollback();
      await conn.release();
      await pool.end();
      return;
    }

    // Get teacher role ID
    const [roleRows] = await conn.execute(
      'SELECT id FROM roles WHERE name = ?',
      ['teacher']
    );
    const teacherRoleId = roleRows[0].id;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user account
    const [userResult] = await conn.execute(
      'INSERT INTO users (username, password, role_id, created_by) VALUES (?, ?, ?, ?)',
      [username, hashedPassword, teacherRoleId, 1] // created_by admin (ID 1)
    );
    const userId = userResult.insertId;

    console.log('✅ User account created (ID:', userId + ')');

    // Create teacher profile
    const [teacherResult] = await conn.execute(
      `INSERT INTO teachers (user_id, name, employee_id, section, subject, room, contact, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, name, employeeId, section, subject, room, contact, 1]
    );
    const teacherId = teacherResult.insertId;

    console.log('✅ Teacher profile created (ID:', teacherId + ')');

    // Check students in this section
    const [students] = await conn.execute(
      'SELECT id, name FROM students WHERE section = ?',
      [section]
    );

    console.log(`\n📚 Students in section "${section}": ${students.length}`);
    students.forEach(s => {
      console.log(`   - ${s.name}`);
    });

    await conn.commit();
    console.log('\n✅ Teacher created successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('   Username:', username);
    console.log('   Password:', password);
    console.log('   Section:', section);

  } catch (err) {
    await conn.rollback();
    console.error('❌ Error:', err.message);
  } finally {
    await conn.release();
    await pool.end();
  }
})();
