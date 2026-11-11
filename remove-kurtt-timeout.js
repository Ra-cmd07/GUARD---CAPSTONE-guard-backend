/**
 * Remove Kurtt's Time-Out to test ON CAMPUS status
 * This will make Kurtt appear as ON CAMPUS in Parent Portal
 */

const mysql = require('mysql2/promise');

async function removeTimeOut() {
  const connection = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🔌 Connected to database\n');

  try {
    const today = new Date().toISOString().split('T')[0];
    
    // Show current records
    console.log('📋 Current attendance records for Kurtt today:');
    const [current] = await connection.execute(
      `SELECT id, student_id, student_name, status, time_in, time_out, date 
       FROM attendance 
       WHERE student_id = 3 AND date = ? 
       ORDER BY time_in DESC`,
      [today]
    );
    console.table(current);
    
    // Find Time-Out record
    const [timeouts] = await connection.execute(
      `SELECT id FROM attendance 
       WHERE student_id = 3 AND date = ? AND status = 'Time-Out'
       ORDER BY id DESC LIMIT 1`,
      [today]
    );
    
    if (timeouts.length === 0) {
      console.log('\n✅ No Time-Out record found - Kurtt should already show ON CAMPUS!');
      await connection.end();
      return;
    }
    
    const timeoutId = timeouts[0].id;
    console.log(`\n🗑️  Deleting Time-Out record ID: ${timeoutId}`);
    
    await connection.execute(
      `DELETE FROM attendance WHERE id = ?`,
      [timeoutId]
    );
    
    console.log('✅ Time-Out record deleted!');
    
    // Show updated records
    console.log('\n📋 Updated attendance records:');
    const [updated] = await connection.execute(
      `SELECT id, student_id, student_name, status, time_in, time_out, date 
       FROM attendance 
       WHERE student_id = 3 AND date = ? 
       ORDER BY time_in DESC`,
      [today]
    );
    console.table(updated);
    
    console.log('\n🎉 Kurtt should now show as ON CAMPUS in Parent Portal!');
    console.log('   Refresh the browser to see the change.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

removeTimeOut();
