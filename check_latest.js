const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });
  
  console.log('=== MOST RECENT ATTENDANCE RECORD ===\n');
  
  const [rows] = await pool.execute(
    "SELECT id, student_name, photo_path, status, created_at FROM attendance ORDER BY id DESC LIMIT 1"
  );
  
  const record = rows[0];
  console.log(`ID: ${record.id}`);
  console.log(`Student: ${record.student_name}`);
  console.log(`Status: ${record.status}`);
  console.log(`Photo Path: ${record.photo_path}`);
  console.log(`Created: ${record.created_at}`);
  
  await pool.end();
})();
