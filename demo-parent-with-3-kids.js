require('dotenv').config();
const mysql = require('mysql2/promise');

async function demoParentWith3Kids() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    console.log('👨‍👩‍👧‍👦 Demo: Parent with 3 Children\n');

    // Let's use parent47 (Javier Gonzales) as an example
    const parentUsername = 'parent47';
    
    // Get parent47's info
    const [parentUser] = await connection.execute(
      'SELECT id FROM users WHERE username = ?',
      [parentUsername]
    );

    if (parentUser.length === 0) {
      console.log('❌ Parent not found!');
      return;
    }

    const [parentProfile] = await connection.execute(
      'SELECT * FROM parents WHERE user_id = ?',
      [parentUser[0].id]
    );

    const parentId = parentProfile[0].id;
    const parentName = parentProfile[0].name;

    console.log(`✅ Parent: ${parentName} (${parentUsername})`);
    console.log(`   Parent ID: ${parentId}\n`);

    // Show current children
    console.log('📋 Current Children:');
    const [currentKids] = await connection.execute(`
      SELECT s.id, s.name, s.grade, s.section, ps.relationship
      FROM parent_student ps
      INNER JOIN students s ON ps.student_id = s.id
      WHERE ps.parent_id = ?
    `, [parentId]);

    if (currentKids.length > 0) {
      currentKids.forEach((kid, i) => {
        console.log(`   ${i + 1}. ${kid.name} (${kid.grade} ${kid.section}) - ${kid.relationship}`);
      });
    } else {
      console.log('   (None yet)');
    }

    // Let's add 2 more children to make it 3 total
    console.log('\n🔧 Adding 2 more children...\n');

    // Find 2 students that don't have this parent yet
    const [availableStudents] = await connection.execute(`
      SELECT s.id, s.name, s.grade, s.section, u.username
      FROM students s
      INNER JOIN users u ON s.user_id = u.id
      WHERE u.username LIKE 'student%'
      AND s.id NOT IN (
        SELECT student_id FROM parent_student WHERE parent_id = ?
      )
      LIMIT 2
    `, [parentId]);

    if (availableStudents.length < 2) {
      console.log('⚠️  Not enough available students to add');
      return;
    }

    // Add first child (as son/daughter)
    const child1 = availableStudents[0];
    await connection.execute(
      'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
      [parentId, child1.id, 'Father']
    );
    console.log(`✅ Added: ${child1.name} (${child1.grade} ${child1.section}) as child #2`);

    // Add second child (as son/daughter)
    const child2 = availableStudents[1];
    await connection.execute(
      'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
      [parentId, child2.id, 'Father']
    );
    console.log(`✅ Added: ${child2.name} (${child2.grade} ${child2.section}) as child #3`);

    // Show updated children list
    console.log('\n📋 Updated Children List:');
    const [updatedKids] = await connection.execute(`
      SELECT s.id, s.name, s.grade, s.section, ps.relationship, u.username
      FROM parent_student ps
      INNER JOIN students s ON ps.student_id = s.id
      INNER JOIN users u ON s.user_id = u.id
      WHERE ps.parent_id = ?
      ORDER BY s.name
    `, [parentId]);

    updatedKids.forEach((kid, i) => {
      console.log(
        `   ${i + 1}. ${kid.name.padEnd(25)} | ${kid.grade.padEnd(10)} ${kid.section.padEnd(10)} | ` +
        `${kid.username.padEnd(12)} | ${kid.relationship}`
      );
    });

    console.log('\n' + '═'.repeat(100));
    console.log('🎉 SUCCESS!');
    console.log('═'.repeat(100));
    console.log(`✅ ${parentName} now has ${updatedKids.length} children in the system`);
    console.log(`📱 Login as ${parentUsername} (password: 12345678) to see all ${updatedKids.length} children in the dashboard`);
    console.log('═'.repeat(100));

    // Show what the parent dashboard will display
    console.log('\n📺 Parent Dashboard Preview:');
    console.log('─'.repeat(100));
    console.log('When parent47 logs in, they will see:');
    console.log('');
    updatedKids.forEach((kid, i) => {
      console.log(`Child ${i + 1}:`);
      console.log(`  Name: ${kid.name}`);
      console.log(`  Grade: ${kid.grade} ${kid.section}`);
      console.log(`  Relationship: ${kid.relationship}`);
      console.log('  Actions: View Attendance | View Location | SMS History');
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

demoParentWith3Kids();
