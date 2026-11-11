const mysql = require('mysql2/promise');

async function checkParentAttendance() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking Parent Portal Attendance...\n');

    // 1. Check Bernie's actual attendance records
    console.log('1️⃣ Bernie\'s Actual Attendance Records:');
    const [attendance] = await pool.execute(
      `SELECT id, student_id, student_name, date, status, time_in, time_out, scan_method
       FROM attendance 
       WHERE student_id = 1 
       ORDER BY date DESC 
       LIMIT 10`
    );
    console.log(JSON.stringify(attendance, null, 2));

    // 2. Check the date range shown in parent portal
    console.log('\n2️⃣ Dates with Attendance:');
    const [dates] = await pool.execute(
      `SELECT DISTINCT date, COUNT(*) as count
       FROM attendance 
       WHERE student_id = 1
       GROUP BY date 
       ORDER BY date DESC`
    );
    console.log(JSON.stringify(dates, null, 2));

    // 3. Check what the parent portal is likely querying
    console.log('\n3️⃣ Date Range Analysis:');
    const weekStart = '2026-06-11';
    const weekEnd = '2026-06-17';
    console.log(`   Parent portal showing: ${weekStart} to ${weekEnd}`);
    
    const [weekAttendance] = await pool.execute(
      `SELECT date, status, time_in
       FROM attendance 
       WHERE student_id = 1 
       AND date BETWEEN ? AND ?
       ORDER BY date`,
      [weekStart, weekEnd]
    );
    
    if (weekAttendance.length === 0) {
      console.log('   ❌ NO ATTENDANCE in this date range!');
      console.log('   💡 Parent portal generates "Absent" for dates with no records');
    } else {
      console.log('   ✅ Found attendance:');
      console.log(JSON.stringify(weekAttendance, null, 2));
    }

    // 4. Check Fin's parent record
    console.log('\n4️⃣ Fin\'s Parent Record:');
    const [parents] = await pool.execute(
      'SELECT id, name, student_id FROM parents_teachers WHERE id = 1'
    );
    console.log(JSON.stringify(parents, null, 2));

    console.log('\n📋 EXPLANATION:\n');
    console.log('The parent portal shows a week view (Jun 11-17, 2026).');
    console.log('For each date in the week:');
    console.log('  - If attendance exists → Shows actual status');
    console.log('  - If NO attendance → Shows "Absent" (default)');
    console.log('\nBernie\'s attendance records are likely from different dates!');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

checkParentAttendance();
