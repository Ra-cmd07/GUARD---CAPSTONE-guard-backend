const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking what API returns for student attendance...\n');
    
    // Simulate what the API does
    const [rows] = await pool.execute(
      `SELECT id, student_name, date, time_in, time_out, status, scan_method
       FROM attendance 
       WHERE student_id = 1
       ORDER BY date DESC, timestamp DESC
       LIMIT 5`
    );
    
    console.log('📊 Raw database data:');
    console.table(rows);
    
    console.log('\n✅ If time_in shows PM in table above, but frontend shows without PM,');
    console.log('   then backend needs to be restarted!');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
