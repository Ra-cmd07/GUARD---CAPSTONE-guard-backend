/**
 * Check Kurtt's attendance records to see actual status values
 */

const mysql = require('mysql2/promise');

async function checkStatus() {
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
    
    console.log('📋 Kurtt\'s attendance records for today:');
    console.log('Date:', today);
    console.log('');
    
    const [records] = await connection.execute(
      `SELECT id, student_id, student_name, status, time_in, time_out, date, scan_method
       FROM attendance 
       WHERE student_id = 3 AND date = ? 
       ORDER BY id DESC`,
      [today]
    );
    
    if (records.length === 0) {
      console.log('❌ No records found for today!');
    } else {
      console.table(records);
      
      console.log('\n🔍 Status Analysis:');
      records.forEach((r, i) => {
        console.log(`\nRecord ${i + 1}:`);
        console.log(`  ID: ${r.id}`);
        console.log(`  Status: "${r.status}" (length: ${r.status?.length || 0})`);
        console.log(`  Status (uppercase): "${r.status?.toUpperCase()}"`);
        console.log(`  Time-In: ${r.time_in || 'NULL'}`);
        console.log(`  Time-Out: ${r.time_out || 'NULL'}`);
        console.log(`  Most recent time: ${r.time_out || r.time_in}`);
      });
      
      console.log('\n📊 Most Recent Record:');
      const sorted = [...records].sort((a, b) => {
        const timeA = a.time_out || a.time_in || '00:00:00';
        const timeB = b.time_out || b.time_in || '00:00:00';
        return timeB.localeCompare(timeA);
      });
      
      const latest = sorted[0];
      console.log(`  Status: "${latest.status}"`);
      console.log(`  Time: ${latest.time_out || latest.time_in}`);
      console.log(`  Should show ON CAMPUS: ${latest.status?.toUpperCase() === 'TIME-IN' || latest.status?.toUpperCase() === 'LATE'}`);
      console.log(`  Should show OFF CAMPUS: ${latest.status?.toUpperCase() === 'TIME-OUT'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

checkStatus();
