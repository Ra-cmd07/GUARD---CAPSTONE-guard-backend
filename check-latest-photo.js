const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    // Get latest Bernie record
    const [rows] = await pool.execute(
      `SELECT id, student_name, photo_path, date, status, scan_method, timestamp 
       FROM attendance 
       WHERE student_name = 'Bernie' 
       ORDER BY id DESC 
       LIMIT 1`
    );

    console.log('Latest Bernie Attendance Record:');
    console.log(JSON.stringify(rows[0], null, 2));

    if (rows[0] && rows[0].photo_path) {
      console.log('\n✅ Photo Path EXISTS:', rows[0].photo_path);
      
      // Check if it's a Cloudinary URL
      if (rows[0].photo_path.startsWith('http')) {
        console.log('✅ This is a Cloudinary URL');
        console.log('🌐 Try opening it in browser:', rows[0].photo_path);
      } else {
        console.log('⚠️ This is a local path');
      }
    } else {
      console.log('\n❌ NO PHOTO PATH - Record has no photo!');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
