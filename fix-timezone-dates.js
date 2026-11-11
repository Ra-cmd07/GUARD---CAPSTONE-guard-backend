const mysql = require('mysql2/promise');

async function fixTimezoneDates() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔧 Fixing timezone dates in attendance table...\n');

    // Get all attendance records
    const [records] = await pool.execute(
      'SELECT id, date, timestamp FROM attendance ORDER BY id'
    );

    console.log(`Found ${records.length} attendance records\n`);

    let updated = 0;
    for (const record of records) {
      const oldDate = record.date;
      
      // Convert UTC date to Philippines date (UTC+8)
      const utcDate = new Date(oldDate);
      const phDate = new Date(utcDate.getTime() + (8 * 60 * 60 * 1000));
      const newDate = phDate.toISOString().split('T')[0];
      
      if (oldDate.toISOString().split('T')[0] !== newDate) {
        console.log(`Record ${record.id}:`);
        console.log(`  Old: ${oldDate.toISOString().split('T')[0]}`);
        console.log(`  New: ${newDate}`);
        
        // Update the date
        await pool.execute(
          'UPDATE attendance SET date = ? WHERE id = ?',
          [newDate, record.id]
        );
        updated++;
      }
    }

    console.log(`\n✅ Updated ${updated} records to Philippines timezone`);
    console.log('   All dates are now in UTC+8 (Philippines time)');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

fixTimezoneDates();
