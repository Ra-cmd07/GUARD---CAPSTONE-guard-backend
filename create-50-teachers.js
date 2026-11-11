require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function create50Teachers() {
  console.log('👨‍🏫 Creating 50 teacher users and assigning students...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    // Hash the password once (same for all teachers)
    const password = '12345678';
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('🔐 Password hashed successfully\n');

    // Filipino teacher names
    const firstNames = [
      'Maria', 'Jose', 'Juan', 'Ana', 'Pedro', 'Rosa', 'Carlos', 'Elena', 'Luis', 'Sofia',
      'Miguel', 'Carmen', 'Antonio', 'Isabel', 'Ramon', 'Teresa', 'Roberto', 'Patricia', 'Fernando', 'Laura',
      'Ricardo', 'Diana', 'Eduardo', 'Monica', 'Rafael', 'Cristina', 'Javier', 'Beatriz', 'Manuel', 'Victoria',
      'Oscar', 'Gabriela', 'Sergio', 'Natalia', 'Diego', 'Valeria', 'Felipe', 'Adriana', 'Andres', 'Paula',
      'Jorge', 'Melissa', 'Gabriel', 'Sandra', 'Daniel', 'Lucia', 'Raul', 'Angela', 'Marcos', 'Veronica'
    ];

    const lastNames = [
      'Santos', 'Reyes', 'Cruz', 'Garcia', 'Ramos', 'Mendoza', 'Torres', 'Flores', 'Gonzales', 'Rivera',
      'Castillo', 'Aquino', 'Mercado', 'Villanueva', 'Morales', 'Bautista', 'Dela Cruz', 'Fernandez', 'Lopez', 'Martinez'
    ];

    const grades = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
    const sections = ['Section A', 'Section B', 'Section C', 'Section D'];
    const subjects = [
      'Mathematics', 'English', 'Science', 'Filipino', 'Social Studies', 
      'Physical Education', 'Computer Science', 'Arts', 'Music', 'Values Education'
    ];
    const rooms = ['Room 101', 'Room 102', 'Room 201', 'Room 202', 'Room 301', 'Room 302', 'Room 401', 'Room 402'];

    let successCount = 0;
    let errorCount = 0;
    const teacherIds = [];

    // Create 50 teachers
    for (let i = 1; i <= 50; i++) {
      try {
        const firstName = firstNames[i - 1];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        const fullName = `${firstName} ${lastName}`;
        const username = `teacher${i}`;
        const employeeId = `EMP2026${String(i).padStart(3, '0')}`;
        
        // Assign grade and section (distribute evenly)
        const grade = grades[Math.floor((i - 1) / 8) % grades.length];
        const section = sections[Math.floor((i - 1) / 2) % sections.length];
        const sectionFull = `${grade} - ${section}`;
        
        const subject = subjects[Math.floor(Math.random() * subjects.length)];
        const room = rooms[Math.floor(Math.random() * rooms.length)];
        const contact = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;
        const address = 'Cagayan de Oro City';

        // Step 1: Insert into users table FIRST (role_id = 2 for teacher)
        const [userResult] = await connection.execute(
          `INSERT INTO users (username, password, role_id, is_active)
           VALUES (?, ?, 2, 1)`,
          [username, hashedPassword]
        );

        const userId = userResult.insertId;

        // Step 2: Insert into teachers table with user_id
        const [teacherResult] = await connection.execute(
          `INSERT INTO teachers (user_id, name, employee_id, section, subject, room, contact, address)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [userId, fullName, employeeId, sectionFull, subject, room, contact, address]
        );

        const teacherId = teacherResult.insertId;
        teacherIds.push({ id: teacherId, section: sectionFull, name: fullName });

        console.log(
          `✅ ${String(i).padStart(2, '0')}. ${username.padEnd(12)} | ` +
          `${fullName.padEnd(25)} | ${sectionFull.padEnd(20)} | ${subject}`
        );
        successCount++;

      } catch (error) {
        console.error(`❌ ${String(i).padStart(2, '0')}. Error: ${error.message}`);
        errorCount++;
      }
    }

    console.log('\n' + '═'.repeat(100));
    console.log('📊 Teacher Creation Summary:');
    console.log('═'.repeat(100));
    console.log(`✅ Successfully created: ${successCount} teachers`);
    console.log(`❌ Failed: ${errorCount} teachers`);

    // Now assign students to teachers based on matching grade/section
    console.log('\n🔗 Assigning students to teachers...\n');

    let assignmentCount = 0;

    for (const teacher of teacherIds) {
      // Find students that match this teacher's section
      const [students] = await connection.execute(
        `SELECT s.id, s.name, s.grade, s.section
         FROM students s
         WHERE CONCAT(s.grade, ' - ', s.section) = ?
         AND s.user_id IN (SELECT id FROM users WHERE username LIKE 'student%')`,
        [teacher.section]
      );

      if (students.length > 0) {
        // Update students to link them to this teacher
        for (const student of students) {
          await connection.execute(
            `UPDATE students SET teacher_id = ? WHERE id = ?`,
            [teacher.id, student.id]
          );
          assignmentCount++;
        }

        console.log(
          `   ${teacher.name.padEnd(25)} → ${students.length} student(s) in ${teacher.section}`
        );
      }
    }

    console.log('\n' + '═'.repeat(100));
    console.log('📊 Final Summary:');
    console.log('═'.repeat(100));
    console.log(`👨‍🏫 Teachers created: ${successCount}`);
    console.log(`👨‍🎓 Students assigned: ${assignmentCount}`);
    console.log(`📝 Username format: teacher1, teacher2, ... teacher${successCount}`);
    console.log(`🔑 Password (all): 12345678`);
    console.log(`👤 Role: Teacher (role_id = 2)`);
    
    console.log('\n📋 Sample Login Credentials:');
    console.log('─'.repeat(100));
    console.log('Username: teacher1  | Password: 12345678');
    console.log('Username: teacher2  | Password: 12345678');
    console.log('Username: teacher3  | Password: 12345678');
    console.log('...');
    console.log(`Username: teacher${successCount} | Password: 12345678`);
    console.log('═'.repeat(100));

    // Verify some teacher-student assignments
    console.log('\n🔍 Verification - Sample Teacher-Student Assignments:');
    console.log('─'.repeat(100));
    
    const [verifyAssignments] = await connection.execute(`
      SELECT 
        t.name as teacher_name,
        t.section as teacher_section,
        COUNT(s.id) as student_count,
        GROUP_CONCAT(s.name SEPARATOR ', ') as students
      FROM teachers t
      LEFT JOIN students s ON t.id = s.teacher_id
      WHERE t.user_id IN (SELECT id FROM users WHERE username LIKE 'teacher%')
      GROUP BY t.id, t.name, t.section
      HAVING student_count > 0
      ORDER BY t.section
      LIMIT 10
    `);

    verifyAssignments.forEach(assignment => {
      const studentList = assignment.students 
        ? (assignment.students.length > 60 
          ? assignment.students.substring(0, 60) + '...' 
          : assignment.students)
        : 'None';
      
      console.log(
        `${assignment.teacher_name.padEnd(25)} | ${assignment.teacher_section.padEnd(20)} | ` +
        `${assignment.student_count} students: ${studentList}`
      );
    });

    console.log('─'.repeat(100));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    await connection.end();
  }
}

create50Teachers();
