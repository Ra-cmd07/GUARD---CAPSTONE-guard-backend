const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔧 Fixing time format in attendance table...\n');
    
    // Get all attendance records with time_in
    const [records] = await pool.execute(
      'SELECT id, time_in, time_out FROM attendance WHERE time_in IS NOT NULL OR time_out IS NOT NULL'
    );
    
    console.log(`Found ${records.length} records to fix\n`);
    
    let fixed = 0;
    
    for (const record of records) {
      let needsUpdate = false;
      let newTimeIn = record.time_in;
      let newTimeOut = record.time_out;
      
      // Fix time_in if it doesn't have AM/PM
      if (record.time_in && !record.time_in.includes('AM') && !record.time_in.includes('PM')) {
        const parts = record.time_in.split(':');
        const hour24 = parseInt(parts[0]);
        const minutes = parts[1] || '00';
        const seconds = parts[2] || '00';
        const hour12 = hour24 % 12 || 12;
        const ampm = hour24 < 12 ? 'AM' : 'PM';
        newTimeIn = `${hour12}:${minutes}:${seconds} ${ampm}`;
        needsUpdate = true;
      }
      
      // Fix time_out if it doesn't have AM/PM
      if (record.time_out && !record.time_out.includes('AM') && !record.time_out.includes('PM')) {
        const parts = record.time_out.split(':');
        const hour24 = parseInt(parts[0]);
        const minutes = parts[1] || '00';
        const seconds = parts[2] || '00';
        const hour12 = hour24 % 12 || 12;
        const ampm = hour24 < 12 ? 'AM' : 'PM';
        newTimeOut = `${hour12}:${minutes}:${seconds} ${ampm}`;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await pool.execute(
          'UPDATE attendance SET time_in = ?, time_out = ? WHERE id = ?',
          [newTimeIn, newTimeOut, record.id]
        );
        
        console.log(`✅ Record ${record.id}:`);
        if (record.time_in !== newTimeIn) {
          console.log(`   time_in: ${record.time_in} → ${newTimeIn}`);
        }
        if (record.time_out !== newTimeOut) {
          console.log(`   time_out: ${record.time_out} → ${newTimeOut}`);
        }
        fixed++;
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} records!`);
    console.log('📊 All attendance times now have AM/PM format');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
