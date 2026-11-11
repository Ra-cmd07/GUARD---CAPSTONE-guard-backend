require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkParent29() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    console.log('🔍 Checking parent29 connection...\n');

    // Get parent29 user info
    const [user] = await connection.execute(
      'SELECT * FROM users WHERE username = ?',
      ['parent29']
    );

    if (user.length === 0) {
      console.log('❌ parent29 user not found!');
      return;
    }

    console.log('✅ User found:');
    console.log('   ID:', user[0].id);
    console.log('   Username:', user[0].username);
    console.log('   Role ID:', user[0].role_id);

    // Get parent profile
    const [parent] = await connection.execute(
      'SELECT * FROM parents WHERE user_id = ?',
      [user[0].id]
    );

    if (parent.length === 0) {
      console.log('\n❌ Parent profile not found for this user!');
      return;
    }

    console.log('\n✅ Parent profile found:');
    console.log('   ID:', parent[0].id);
    console.log('   Name:', parent[0].name);
    console.log('   Contact:', parent[0].contact);

    // Check parent-student link
    const [links] = await connection.execute(
      'SELECT * FROM parent_student WHERE parent_id = ?',
      [parent[0].id]
    );

    console.log('\n📋 Parent-Student Links:');
    if (links.length === 0) {
      console.log('   ❌ No students linked to this parent!\n');
      
      // Show which student SHOULD be linked
      console.log('🔧 Should be linked to:');
      const [expectedStudent] = await connection.execute(
        `SELECT s.id, s.name, s.grade, s.section, u.username
         FROM students s
         INNER JOIN users u ON s.user_id = u.id
         WHERE u.username = 'student29'`
      );

      if (expectedStudent.length > 0) {
        console.log('   Student ID:', expectedStudent[0].id);
        console.log('   Student Name:', expectedStudent[0].name);
        console.log('   Username:', expectedStudent[0].username);
        console.log('   Grade:', expectedStudent[0].grade);
        console.log('   Section:', expectedStudent[0].section);

        // Fix the link
        console.log('\n🔧 Creating link...');
        await connection.execute(
          'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
          [parent[0].id, expectedStudent[0].id, 'Father']
        );
        console.log('✅ Link created successfully!');
        console.log('\n🎉 parent29 is now connected to', expectedStudent[0].name);
      } else {
        console.log('   ❌ student29 not found either!');
      }
    } else {
      console.log('   ✅ Found', links.length, 'link(s):');
      for (const link of links) {
        const [student] = await connection.execute(
          'SELECT * FROM students WHERE id = ?',
          [link.student_id]
        );
        console.log(`      → ${student[0].name} (${link.relationship})`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkParent29();
