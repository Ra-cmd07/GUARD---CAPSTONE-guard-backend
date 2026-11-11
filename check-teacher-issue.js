const mysql = require('mysql2/promise');

async function checkTeacherIssue() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking Teacher Portal Issue...\n');

    // 1. Check Mat's teacher record
    console.log('1️⃣ Mat\'s Teacher Record:');
    const [teachers] = await pool.execute(
      'SELECT id, name, section FROM teachers WHERE id = 1'
    );
    console.log(JSON.stringify(teachers, null, 2));
    const matSection = teachers[0]?.section;
    console.log(`   Mat's section: "${matSection}"\n`);

    // 2. Check Bernie's student record
    console.log('2️⃣ Bernie\'s Student Record:');
    const [students] = await pool.execute(
      'SELECT id, name, grade, section, teacher_id FROM students WHERE id = 1'
    );
    console.log(JSON.stringify(students, null, 2));
    const bernieGrade = students[0]?.grade;
    const bernieSection = students[0]?.section;
    console.log(`   Bernie's grade: "${bernieGrade}"`);
    console.log(`   Bernie's section: "${bernieSection}"\n`);

    // 3. Check attendance records
    console.log('3️⃣ Bernie\'s Attendance Records:');
    const [attendance] = await pool.execute(
      'SELECT id, student_name, grade, section, date, status, scan_method FROM attendance WHERE student_id = 1 ORDER BY id DESC LIMIT 5'
    );
    console.log(JSON.stringify(attendance, null, 2));
    
    if (attendance.length > 0) {
      console.log(`\n   Attendance section format: "${attendance[0].section}"`);
    }

    // 4. Check if sections match
    console.log('\n4️⃣ Section Matching Analysis:');
    console.log(`   Mat's section:       "${matSection}"`);
    console.log(`   Bernie's section:    "${bernieSection}"`);
    console.log(`   Attendance section:  "${attendance[0]?.section || 'N/A'}"`);
    
    // The problem
    console.log('\n❌ PROBLEM IDENTIFIED:');
    console.log(`   Mat's section is "Grade 7 - section 1"`);
    console.log(`   But Bernie's section is just "1"`);
    console.log(`   Attendance query looks for: section = "Grade 7 - section 1"`);
    console.log(`   But attendance has: section = "1"`);
    console.log(`   → NO MATCH! That's why teacher portal is empty!\n`);

    // Solutions
    console.log('✅ SOLUTION OPTIONS:\n');
    console.log('Option 1: Change Mat\'s section to match Bernie\'s');
    console.log('   UPDATE teachers SET section = "1" WHERE id = 1;\n');
    
    console.log('Option 2: Change Bernie\'s section to match Mat\'s');
    console.log('   UPDATE students SET section = "Grade 7 - section 1" WHERE id = 1;\n');
    
    console.log('Option 3: Use LIKE query in backend');
    console.log('   WHERE a.section LIKE CONCAT("%", ?, "%")\n');

    console.log('💡 RECOMMENDED: Option 2 (Change Bernie\'s section)');
    console.log('   This keeps the "Grade X - section Y" format consistent.\n');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

checkTeacherIssue();
