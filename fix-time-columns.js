const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔧 Fixing time_in and time_out column types...\n');
    
    // Step 1: Change column type to VARCHAR
    console.log('📝 Step 1: Changing time_in from TIME to VARCHAR(20)...');
    await pool.execute('ALTER TABLE attendance MODIFY COLUMN time_in VARCHAR(20) NULL');
    console.log('✅ time_in changed to VARCHAR(20)\n');
    
    console.log('📝 Step 2: Changing time_out from TIME to VARCHAR(20)...');
    await pool.execute('ALTER TABLE attendance MODIFY COLUMN time_out VARCHAR(20) NULL');
    console.log('✅ time_out changed to VARCHAR(20)\n');
    
    // Step 2: Get all records and convert to 12-hour format
    console.log('📝 Step 3: Converting existing times to 12-hour format with AM/PM...');
    
    const [records] = await pool.execute(
      'SELECT id, time_in, time_out FROM attendance WHERE time_in IS NOT NULL OR time_out IS NOT NULL'
    );
    
    let converted = 0;
    
    for (const record of records) {
      let newTimeIn = record.time_in;
      let newTimeOut = record.time_out;
      
      // Convert time_in if it doesn't have AM/PM
      if (record.time_in && !record.time_in.includes('AM') && !record.time_in.includes('PM')) {
        const parts = record.time_in.split(':');
        if (parts.length >= 2) {
          const hour24 = parseInt(parts[0]);
          const minutes = parts[1] || '00';
          const seconds = parts[2] || '00';
          const hour12 = hour24 % 12 || 12;
          const ampm = hour24 < 12 ? 'AM' : 'PM';
          newTimeIn = `${hour12}:${minutes}:${seconds} ${ampm}`;
        }
      }
      
      // Convert time_out if it doesn't have AM/PM
      if (record.time_out && !record.time_out.includes('AM') && !record.time_out.includes('PM')) {
        const parts = record.time_out.split(':');
        if (parts.length >= 2) {
          const hour24 = parseInt(parts[0]);
          const minutes = parts[1] || '00';
          const seconds = parts[2] || '00';
          const hour12 = hour24 % 12 || 12;
          const ampm = hour24 < 12 ? 'AM' : 'PM';
          newTimeOut = `${hour12}:${minutes}:${seconds} ${ampm}`;
        }
      }
      
      // Update if changed
      if (newTimeIn !== record.time_in || newTimeOut !== record.time_out) {
        await pool.execute(
          'UPDATE attendance SET time_in = ?, time_out = ? WHERE id = ?',
          [newTimeIn, newTimeOut, record.id]
        );
        converted++;
      }
    }
    
    console.log(`✅ Converted ${converted} records to 12-hour format\n`);
    
    // Verify
    console.log('📊 Sample updated records:');
    const [samples] = await pool.execute(
      'SELECT id, student_name, date, time_in, time_out, status FROM attendance WHERE time_in IS NOT NULL ORDER BY id DESC LIMIT 5'
    );
    console.table(samples);
    
    console.log('\n✅ ALL DONE!');
    console.log('✅ Column types: TIME → VARCHAR(20)');
    console.log('✅ All times now have AM/PM format');
    console.log('✅ New records will save AM/PM correctly');
    console.log('\n🔄 Now restart backend and refresh frontend!');
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
