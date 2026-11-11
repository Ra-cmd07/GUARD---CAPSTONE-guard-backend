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
      SELECT id, student_name, photo_path, status,
             DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as time 
      FROM attendance 
      WHERE student_name = 'Bernie'
      ORDER BY id DESC 
      LIMIT 10
    `);
    
    console.log('\n📸 Bernie\'s recent attendance photos:\n');
    rows.forEach((r, i) => {
      console.log(`${i + 1}. ID: ${r.id} | ${r.status} | ${r.time}`);
      if (r.photo_path) {
        console.log(`   Photo: ${r.photo_path}`);
        // Check URL format
        if (r.photo_path.includes('attendbox/scans')) {
          console.log('   ✅ Has correct folder structure');
        } else {
          console.log('   ⚠️  Missing folder structure!');
        }
      } else {
        console.log('   ❌ No photo');
      }
      console.log('');
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
})();
