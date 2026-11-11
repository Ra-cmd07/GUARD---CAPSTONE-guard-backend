const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    const [rows] = await pool.execute(`
      SELECT id, student_name, photo_path, scan_method, status, 
             DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as time 
      FROM attendance 
      WHERE photo_path IS NOT NULL 
      ORDER BY id DESC 
      LIMIT 5
    `);
    
    console.log('\n📸 Recent attendance records with photos:');
    console.log(JSON.stringify(rows, null, 2));
    
    // Check if any photo_path starts with http (Cloudinary) or local path
    rows.forEach(r => {
      if (r.photo_path) {
        if (r.photo_path.startsWith('http')) {
          console.log(`\n✅ ${r.student_name}: Cloudinary URL - ${r.photo_path.substring(0, 50)}...`);
        } else {
          console.log(`\n📂 ${r.student_name}: Local path - ${r.photo_path}`);
        }
      }
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
