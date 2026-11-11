const mysql = require('mysql2/promise');

async function clearSMSLogs() {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking for SMS tables...\n');

    // Check if sms_logs table exists
    const [tables] = await pool.execute(
      "SHOW TABLES LIKE '%sms%'"
    );
    
    console.log('SMS-related tables found:');
    console.log(JSON.stringify(tables, null, 2));

    if (tables.length === 0) {
      console.log('\n❌ No SMS tables found in database.');
      console.log('   SMS logs might be stored in a different table or generated dynamically.');
      
      // Check for possible tables
      console.log('\n🔍 Checking all tables...');
      const [allTables] = await pool.execute('SHOW TABLES');
      console.log('Available tables:', allTables.map((t) => Object.values(t)[0]).join(', '));
      
      return;
    }

    // If sms_logs table exists, clear it
    const tableName = Object.values(tables[0])[0];
    console.log(`\n📋 Found SMS table: ${tableName}`);
    
    // Count records before deletion
    const [count] = await pool.execute(
      `SELECT COUNT(*) as count FROM ${tableName}`
    );
    const recordCount = count[0].count;
    
    console.log(`   Records in table: ${recordCount}`);
    
    if (recordCount === 0) {
      console.log('   ✅ Table is already empty!');
      return;
    }

    // Clear the table
    await pool.execute(`DELETE FROM ${tableName}`);
    console.log(`\n✅ Cleared ${recordCount} records from ${tableName}`);
    console.log('   SMS Notification Logs are now empty.');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await pool.end();
  }
}

clearSMSLogs();
