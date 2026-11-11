const mysql = require('mysql2/promise');

async function diagnoseTeacherPortal() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Diagnosing Teacher Portal Issue...\n');

    // 1. Check what date the frontend is requesting
    const today = new Date().toISOString().split('T')[0];
    console.log('1️⃣ Today\'s date:', today);
    
    // 2. Check Mat's teacher record
    console.log('\n2️⃣ Mat\'s Teacher Record:');
    const [teachers] = await pool.execute(
      'SELECT id, name, section FROM teachers WHERE id = 1'
    );
    console.log(JSON.stringify(teachers, null, 2));
    const teacherSection = teachers[0]?.section;
    const sectionPart = teacherSection?.split('-').pop()?.trim() || teacherSection;
    
    console.log('   Teacher section:', teacherSection);
    console.log('   Section part extracted:', sectionPart);

    // 3. Check ALL attendance records
    console.log('\n3️⃣ ALL Attendance Records:');
    const [allAttendance] = await pool.execute(
      'SELECT id, student_id, student_name, grade, section, date, status FROM attendance ORDER BY id DESC LIMIT 10'
    );
    console.log(JSON.stringify(allAttendance, null, 2));

    // 4. Check attendance for TODAY
    console.log('\n4️⃣ Attendance for TODAY (' + today + '):');
    const [todayAttendance] = await pool.execute(
      'SELECT id, student_name, grade, section, date, status FROM attendance WHERE date = ?',
      [today]
    );
    console.log(JSON.stringify(todayAttendance, null, 2));

    if (todayAttendance.length === 0) {
      console.log('   ❌ NO ATTENDANCE RECORDS FOR TODAY!');
      console.log('   💡 This is why teacher portal is empty.');
      console.log('\n   📅 Attendance exists for these dates:');
      const [dates] = await pool.execute(
        'SELECT DISTINCT date, COUNT(*) as count FROM attendance GROUP BY date ORDER BY date DESC LIMIT 5'
      );
      console.log(JSON.stringify(dates, null, 2));
    }

    // 5. Test the flexible matching query for TODAY
    console.log('\n5️⃣ Testing Flexible Query for TODAY:');
    const [flexibleMatch] = await pool.execute(
      `SELECT id, student_name, section, date, status
       FROM attendance
       WHERE date = ?
       AND (section = ? OR section = ? OR section LIKE ? OR teacher_id = ?)`,
      [today, teacherSection, sectionPart, `%${sectionPart}%`, 1]
    );
    console.log('   Query params:', [today, teacherSection, sectionPart, `%${sectionPart}%`, 1]);
    console.log('   Results:', JSON.stringify(flexibleMatch, null, 2));

    // 6. Test for ANY date with Bernie
    console.log('\n6️⃣ Bernie\'s Latest Attendance:');
    const [bernieLatest] = await pool.execute(
      'SELECT id, student_name, grade, section, date, status FROM attendance WHERE student_id = 1 ORDER BY id DESC LIMIT 1'
    );
    console.log(JSON.stringify(bernieLatest, null, 2));

    // 7. Check if backend is using the updated code
    console.log('\n7️⃣ Backend Status Check:');
    console.log('   ⚠️  Did you restart the backend?');
    console.log('   Command: cd guard-backend && npm run dev');
    console.log('   Should see: "🚀 AttendBox API running at http://0.0.0.0:5000"');

    // 8. Recommendations
    console.log('\n📋 RECOMMENDATIONS:\n');
    
    if (todayAttendance.length === 0) {
      console.log('✅ SOLUTION 1: Record attendance for today');
      console.log('   1. Go to kiosk: http://localhost:5173/kiosk');
      console.log('   2. Click QR button');
      console.log('   3. Scan Bernie\'s QR code');
      console.log('   4. Wait for success screen');
      console.log('   5. Refresh teacher portal\n');
    }
    
    console.log('✅ SOLUTION 2: Change date filter in teacher portal');
    console.log('   1. In teacher portal, click the date picker');
    console.log('   2. Select the date with attendance (check dates above)');
    console.log('   3. Click Refresh button\n');
    
    console.log('✅ SOLUTION 3: Verify backend restarted');
    console.log('   1. Check terminal running backend');
    console.log('   2. Should show: "🚀 AttendBox API running"');
    console.log('   3. If not, restart: cd guard-backend && npm run dev\n');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

diagnoseTeacherPortal();
