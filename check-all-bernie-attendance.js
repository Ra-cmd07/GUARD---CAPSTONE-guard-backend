const mysql = require('mysql2/promise');

async function checkAllBernieAttendance() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking ALL Bernie Attendance Records...\n');

    const [rows] = await pool.execute(
      `SELECT 
        id,
        student_name,
        DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
        date as date_raw,
        status,
        time_in,
        time_out,
        scan_method,
        timestamp
       FROM attendance 
       WHERE student_id = 1 
       ORDER BY id DESC`
    );

    console.log(`Found ${rows.length} records:\n`);
    console.log(JSON.stringify(rows, null, 2));

    if (rows.length === 1) {
      console.log('\n⚠️  Only 1 attendance record found!');
      console.log('   The parent portal is correctly showing "Absent" for other dates.');
      console.log('   Bernie only has attendance for June 15/16.');
    }

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

checkAllBernieAttendance();
