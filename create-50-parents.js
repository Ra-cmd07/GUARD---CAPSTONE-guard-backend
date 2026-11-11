require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function create50Parents() {
  console.log('👨‍👩‍👧‍👦 Creating 50 parent users and linking to students...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    // Hash the password once (same for all parents)
    const password = '12345678';
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('🔐 Password hashed successfully\n');

    // Get students by their user association
    const [studentsWithUsers] = await connection.execute(
      `SELECT s.id, s.name, s.gender, u.username
       FROM students s
       INNER JOIN users u ON s.user_id = u.id
       WHERE u.username LIKE 'student%'
       ORDER BY u.username
       LIMIT 50`
    );

    if (studentsWithUsers.length === 0) {
      console.log('❌ No students found! Please run create-50-students.js first.');
      return;
    }

    console.log(`✅ Found ${studentsWithUsers.length} students to create parents for\n`);

    // Filipino parent names
    const fatherFirstNames = ['Juan', 'Jose', 'Pedro', 'Carlos', 'Ramon', 'Miguel', 'Luis', 'Antonio', 'Manuel', 'Roberto', 'Fernando', 'Rafael', 'Javier', 'Ricardo', 'Eduardo', 'Felipe', 'Oscar'];
    const motherFirstNames = ['Maria', 'Ana', 'Rosa', 'Elena', 'Sofia', 'Luz', 'Carmen', 'Isabel', 'Teresa', 'Patricia', 'Laura', 'Diana', 'Cristina', 'Beatriz', 'Victoria', 'Monica', 'Gabriela'];
    const lastNames = ['Dela Cruz', 'Santos', 'Reyes', 'Bautista', 'Garcia', 'Ramos', 'Mendoza', 'Torres', 'Flores', 'Gonzales', 'Rivera', 'Castillo', 'Aquino', 'Mercado', 'Villanueva', 'Morales'];

    const relationships = ['Father', 'Mother'];
    const addresses = [
      'Cagayan de Oro City',
      'Iligan City', 
      'Valencia City',
      'Malaybalay City',
      'Gingoog City'
    ];

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < studentsWithUsers.length; i++) {
      const student = studentsWithUsers[i];
      const parentNum = i + 1;

      try {
        // Determine relationship (alternate Father/Mother)
        const relationship = relationships[i % 2];
        const isParentMale = relationship === 'Father';

        // Generate parent name based on relationship
        const parentFirstName = isParentMale 
          ? fatherFirstNames[i % fatherFirstNames.length]
          : motherFirstNames[i % motherFirstNames.length];

        // Extract student's last name (assuming format: "FirstName LastName")
        const studentNameParts = student.name.split(' ');
        const studentLastName = studentNameParts.length > 1 
          ? studentNameParts[studentNameParts.length - 1]
          : lastNames[i % lastNames.length];

        const parentFullName = `${parentFirstName} ${studentLastName}`;
        const username = `parent${parentNum}`;
        const contact = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;
        const address = addresses[i % addresses.length];

        // Step 1: Insert into users table FIRST (role_id = 3 for parent)
        const [userResult] = await connection.execute(
          `INSERT INTO users (username, password, role_id, is_active)
           VALUES (?, ?, 3, 1)`,
          [username, hashedPassword]
        );

        const userId = userResult.insertId;

        // Step 2: Insert into parents table with user_id
        const [parentResult] = await connection.execute(
          `INSERT INTO parents (user_id, name, relationship, contact, address)
           VALUES (?, ?, ?, ?, ?)`,
          [userId, parentFullName, relationship, contact, address]
        );

        const parentId = parentResult.insertId;

        // Step 3: Link parent to student
        await connection.execute(
          `INSERT INTO parent_student (parent_id, student_id, relationship)
           VALUES (?, ?, ?)`,
          [parentId, student.id, relationship]
        );

        console.log(
          `✅ ${String(parentNum).padStart(2, '0')}. ${username.padEnd(12)} | ` +
          `${parentFullName.padEnd(25)} | ${relationship.padEnd(8)} → ${student.name}`
        );
        successCount++;

      } catch (error) {
        console.error(`❌ ${String(parentNum).padStart(2, '0')}. Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '═'.repeat(90));
    console.log('📊 Summary:');
    console.log('═'.repeat(90));
    console.log(`✅ Successfully created: ${successCount} parents`);
    console.log(`❌ Failed: ${errorCount} parents`);
    console.log(`🔗 Parent-Student links: ${successCount}`);
    console.log(`📝 Username format: parent1, parent2, ... parent${studentsWithUsers.length}`);
    console.log(`🔑 Password (all): 12345678`);
    console.log(`👤 Role: Parent (role_id = 3)`);
    console.log(`👨‍👩‍👧‍👦 Relationships: Alternating Father/Mother`);
    console.log('\n📋 Sample Login Credentials:');
    console.log('─'.repeat(90));
    console.log('Username: parent1  | Password: 12345678 | Child: (first student)');
    console.log('Username: parent2  | Password: 12345678 | Child: (second student)');
    console.log('Username: parent3  | Password: 12345678 | Child: (third student)');
    console.log('...');
    console.log(`Username: parent${studentsWithUsers.length} | Password: 12345678 | Child: (last student)`);
    console.log('═'.repeat(90));

    // Verify some links
    console.log('\n🔍 Verification - Sample Parent-Student Links:');
    console.log('─'.repeat(90));
    
    const [verifyLinks] = await connection.execute(`
      SELECT 
        u.username as parent_username,
        p.name as parent_name,
        ps.relationship,
        s.name as student_name,
        su.username as student_username
      FROM parent_student ps
      INNER JOIN parents p ON ps.parent_id = p.id
      INNER JOIN students s ON ps.student_id = s.id
      INNER JOIN users u ON p.user_id = u.id
      INNER JOIN users su ON s.user_id = su.id
      WHERE u.username LIKE 'parent%'
      ORDER BY u.username
      LIMIT 10
    `);

    verifyLinks.forEach(link => {
      console.log(
        `${link.parent_username.padEnd(12)} (${link.parent_name.padEnd(25)}) → ` +
        `${link.relationship.padEnd(8)} of ${link.student_username.padEnd(12)} (${link.student_name})`
      );
    });

    console.log('─'.repeat(90));
    console.log(`... and ${successCount - 10} more links`);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    await connection.end();
  }
}

create50Parents();
