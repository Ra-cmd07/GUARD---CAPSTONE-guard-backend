const mysql = require('mysql2/promise');

async function checkCurrentDates() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking current dates in database...\n');

    const [records] = await pool.execute(
      `SELECT 
        id, 
        student_id,
        student_name,
        date, 
        DATE_FORMAT(date, '%Y-%m-%d') as date_formatted,
        time_in,
        timestamp,
        status
       FROM attendance 
       WHERE student_id = 1 
       ORDER BY id DESC`
    );

    console.log('Bernie\'s attendance records:');
    console.log(JSON.stringify(records, null, 2));

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

checkCurrentDates();
