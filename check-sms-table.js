const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    // Check if sms_logs table exists
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE 'sms_logs'"
    );

    if (tables.length > 0) {
      console.log('✅ sms_logs table exists!');
      
      // Show table structure
      const [structure] = await pool.execute('DESCRIBE sms_logs');
      console.log('\n📋 Table Structure:');
      console.table(structure);
      
      // Check existing records
      const [records] = await pool.execute('SELECT * FROM sms_logs LIMIT 5');
      console.log(`\n📊 Records: ${records.length}`);
      if (records.length > 0) {
        console.table(records);
      }
    } else {
      console.log('❌ sms_logs table does NOT exist');
      console.log('\nNeed to create it!');
    }

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
