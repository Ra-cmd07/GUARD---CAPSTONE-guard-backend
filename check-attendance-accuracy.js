const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkAttendanceAccuracy() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardmap_db',
  });

  try {
    // Total active students
    const [total] = await conn.execute(
      'SELECT COUNT(*) as count FROM students WHERE is_active = 1'
    );
    console.log('📊 Total Active Students:', total[0].count);

    // Students present today
    const [today] = await conn.execute(
      `SELECT COUNT(DISTINCT student_id) as count 
       FROM attendance 
       WHERE date = CURDATE() 
       AND status IN ('Time-In', 'Late')`
    );
    console.log('✅ Students Present Today:', today[0].count);

    // Calculate percentage
    const percentage = total[0].count > 0 
      ? Math.round((today[0].count / total[0].count) * 100) 
      : 0;
    console.log('📈 Today Attendance Rate:', percentage + '%');

    // Last 7 days
    console.log('\n📅 Last 7 Days Attendance:');
    for (let i = 6; i >= 0; i--) {
      const [dayData] = await conn.execute(
        `SELECT 
          DATE_SUB(CURDATE(), INTERVAL ? DAY) as date,
          COUNT(DISTINCT student_id) as present
         FROM attendance
         WHERE date = DATE_SUB(CURDATE(), INTERVAL ? DAY)
         AND status IN ('Time-In', 'Late')`,
        [i, i]
      );
      
      const present = dayData[0].present || 0;
      const pct = total[0].count > 0 ? Math.round((present / total[0].count) * 100) : 0;
      console.log(`  ${dayData[0].date}: ${present}/${total[0].count} students (${pct}%)`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await conn.end();
  }
}

checkAttendanceAccuracy();
