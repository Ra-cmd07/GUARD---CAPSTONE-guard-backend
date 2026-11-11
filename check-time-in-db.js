const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking ACTUAL database content for record 77...\n');
    
    const [rows] = await pool.execute(
      `SELECT id, student_name, date, time_in, time_out, LENGTH(time_in) as time_in_length
       FROM attendance 
       WHERE id = 77`
    );
    
    console.log('📊 Record 77:');
    console.table(rows);
    
    const record = rows[0];
    console.log('\n📝 Detailed time_in analysis:');
    console.log(`Value: "${record.time_in}"`);
    console.log(`Length: ${record.time_in_length} characters`);
    console.log(`Has AM: ${record.time_in.includes('AM')}`);
    console.log(`Has PM: ${record.time_in.includes('PM')}`);
    
    if (!record.time_in.includes('AM') && !record.time_in.includes('PM')) {
      console.log('\n❌ PROBLEM: time_in does NOT have AM/PM');
      console.log('   Attempting to fix NOW...\n');
      
      // Fix it
      const parts = record.time_in.split(':');
      const hour24 = parseInt(parts[0]);
      const minutes = parts[1] || '00';
      const seconds = parts[2] || '00';
      const hour12 = hour24 % 12 || 12;
      const ampm = hour24 < 12 ? 'AM' : 'PM';
      const newTime = `${hour12}:${minutes}:${seconds} ${ampm}`;
      
      await pool.execute(
        'UPDATE attendance SET time_in = ? WHERE id = 77',
        [newTime]
      );
      
      console.log(`✅ Updated: "${record.time_in}" → "${newTime}"`);
      
      // Verify
      const [verify] = await pool.execute('SELECT time_in FROM attendance WHERE id = 77');
      console.log(`\n✅ Verified: "${verify[0].time_in}"`);
    } else {
      console.log('\n✅ time_in already has AM/PM');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
