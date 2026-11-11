const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('\n📊 Checking Rae Anthony SMS Status...\n');

    // Get Rae Anthony's recent attendance
    const [attendance] = await pool.execute(`
      SELECT id, student_name, status, scan_method, 
             DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as time
      FROM attendance 
      WHERE student_name = 'Rae Anthony'
      ORDER BY id DESC 
      LIMIT 5
    `);

    console.log('📋 Recent Attendance Records:');
    attendance.forEach(a => {
      console.log(`   ${a.id} | ${a.status} | ${a.scan_method} | ${a.time}`);
    });

    // Check SMS logs for these attendance IDs
    console.log('\n📱 SMS Logs for These Records:');
    
    for (const att of attendance) {
      const [sms] = await pool.execute(`
        SELECT * FROM sms_logs 
        WHERE attendance_id = ?
      `, [att.id]);

      if (sms.length > 0) {
        console.log(`\n   Attendance ID ${att.id}:`);
        sms.forEach(s => {
          console.log(`   ✅ SMS sent to ${s.parent_name} (${s.phone_number})`);
          console.log(`      Status: ${s.status}`);
          console.log(`      Message: ${s.message}`);
        });
      } else {
        console.log(`\n   Attendance ID ${att.id}: ❌ NO SMS SENT`);
      }
    }

    // Check parent info
    console.log('\n👨‍👩‍👦 Parent Information:');
    const [student] = await pool.execute(
      'SELECT id FROM students WHERE name = ?',
      ['Rae Anthony']
    );

    if (student.length > 0) {
      const studentId = student[0].id;
      
      const [parents] = await pool.execute(`
        SELECT p.name, p.contact, ps.relationship
        FROM parent_student ps
        JOIN parents p ON ps.parent_id = p.id
        WHERE ps.student_id = ?
      `, [studentId]);

      if (parents.length === 0) {
        console.log('   ❌ NO PARENTS LINKED!');
      } else {
        parents.forEach(p => {
          console.log(`   ${p.name} (${p.relationship})`);
          console.log(`   Contact: ${p.contact || 'NO CONTACT NUMBER'}`);
        });
      }
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
