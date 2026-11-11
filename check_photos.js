const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });
  
  console.log('=== CHECKING MOST RECENT KURTT ATTENDANCE RECORDS ===\n');
  
  const [rows] = await pool.execute(
    "SELECT id, student_name, photo_path, date, time_in, time_out, status, scan_method, created_at FROM attendance WHERE student_name='Kurtt' ORDER BY id DESC LIMIT 3"
  );
  
  rows.forEach((row, i) => {
    console.log(`\n--- Record ${i + 1} (ID: ${row.id}) ---`);
    console.log(`Date: ${row.date}`);
    console.log(`Status: ${row.status}`);
    console.log(`Time In: ${row.time_in || 'N/A'}`);
    console.log(`Time Out: ${row.time_out || 'N/A'}`);
    console.log(`Method: ${row.scan_method}`);
    console.log(`Photo Path: ${row.photo_path || 'NULL'}`);
    console.log(`Created: ${row.created_at}`);
  });
  
  await pool.end();
})();
