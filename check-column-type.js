const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  try {
    console.log('🔍 Checking attendance table structure...\n');
    
    const [columns] = await pool.execute('DESCRIBE attendance');
    
    console.log('📊 Attendance table columns:');
    console.table(columns);
    
    // Find time_in column
    const timeInCol = columns.find(c => c.Field === 'time_in');
    const timeOutCol = columns.find(c => c.Field === 'time_out');
    
    console.log('\n⚠️  PROBLEM FOUND:');
    console.log(`time_in column type: ${timeInCol.Type}`);
    console.log(`time_out column type: ${timeOutCol.Type}`);
    
    if (timeInCol.Type === 'time' || timeInCol.Type.startsWith('time')) {
      console.log('\n❌ time_in is TIME datatype - it strips AM/PM!');
      console.log('   TIME datatype only stores HH:MM:SS in 24-hour format');
      console.log('   We need to change it to VARCHAR to store "10:16:42 AM"');
      console.log('\n✅ Fix: Change column type from TIME to VARCHAR(20)');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
})();
