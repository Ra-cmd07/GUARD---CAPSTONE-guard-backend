const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('\n🔍 Checking Rae Anthony\'s latest attendance photo...\n');

    // Get latest attendance with photo
    const [rows] = await pool.execute(`
      SELECT 
        id,
        student_name,
        status,
        scan_method,
        photo_path,
        DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as time
      FROM attendance 
      WHERE student_name = 'Rae Anthony'
      ORDER BY id DESC 
      LIMIT 3
    `);

    console.log('📋 Latest Attendance Records:\n');
    rows.forEach((r, i) => {
      console.log(`${i + 1}. ID: ${r.id} | ${r.status} | ${r.scan_method} | ${r.time}`);
      if (r.photo_path) {
        console.log(`   Photo: ${r.photo_path}`);
        
        // Check if URL is valid Cloudinary format
        if (r.photo_path.startsWith('https://res.cloudinary.com/')) {
          console.log('   ✅ Valid Cloudinary URL');
          
          // Check if it has the full path structure
          if (r.photo_path.includes('/attendbox/scans/')) {
            console.log('   ✅ Has correct folder structure');
          } else {
            console.log('   ⚠️  Missing folder structure!');
          }
        } else if (r.photo_path.startsWith('http')) {
          console.log('   ⚠️  HTTP URL (not Cloudinary)');
        } else {
          console.log('   ⚠️  Relative path (needs base URL)');
        }
      } else {
        console.log('   ❌ NO PHOTO PATH');
      }
      console.log('');
    });

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
