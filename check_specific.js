const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });
  
  console.log('=== SEARCHING FOR PHOTO PATH ===\n');
  
  const [rows] = await pool.execute(
    "SELECT id, student_name, photo_path, status, created_at FROM attendance WHERE photo_path LIKE '%1784176607812%'"
  );
  
  if (rows.length > 0) {
    console.log('Found record with that timestamp:');
    rows.forEach(row => {
      console.log(`ID: ${row.id}, Status: ${row.status}, Photo: ${row.photo_path}`);
    });
  } else {
    console.log('No record found with timestamp 1784176607812');
    console.log('\nThis means the frontend is showing OLD cached data!');
  }
  
  await pool.end();
})();
