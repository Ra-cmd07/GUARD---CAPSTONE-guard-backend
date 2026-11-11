// Test the recent attendance API
import pool from './lib/db';
import axios from 'axios';

async function testRecentAPI() {
  console.log('\n🧪 Testing Recent Attendance API\n');
  
  try {
    // Check what's in database
    console.log('📊 Database Check:');
    const [rows]: any = await pool.execute(
      `SELECT id, student_name, status, scan_method, 
       DATE_FORMAT(timestamp, '%Y-%m-%d %H:%i:%s') as time_recorded,
       TIMESTAMPDIFF(SECOND, timestamp, NOW()) as seconds_ago
       FROM attendance 
       WHERE scan_method = 'BLE'
       ORDER BY id DESC 
       LIMIT 3`
    );
    
    if (rows.length === 0) {
      console.log('❌ No BLE attendance records found!');
      console.log('   Run ESP32 to create a record first.\n');
    } else {
      console.table(rows);
      console.log('');
    }
    
    // Test API endpoint
    console.log('🌐 API Test:');
    console.log('   GET /api/attendance/recent?method=BLE&seconds=60\n');
    
    try {
      const response = await axios.get('http://localhost:5000/api/attendance/recent?method=BLE&seconds=60');
      
      if (response.data && response.data.length > 0) {
        console.log('✅ API Response (Found', response.data.length, 'record(s)):');
        console.log(JSON.stringify(response.data[0], null, 2));
        console.log('');
        
        console.log('📋 Kiosk Will Display:');
        console.log('   Student:', response.data[0].student_name);
        console.log('   Status:', response.data[0].status);
        console.log('   Time:', response.data[0].time_in || response.data[0].time_out);
        console.log('   Seconds ago:', response.data[0].seconds_ago);
        console.log('');
        
        if (response.data[0].seconds_ago > 60) {
          console.log('⚠️  WARNING: Record is older than 60 seconds!');
          console.log('   Kiosk may not show it unless you increase time window.');
          console.log('');
        } else {
          console.log('✅ Record is recent enough - Kiosk should show it!');
          console.log('');
        }
      } else {
        console.log('❌ API returned empty array!');
        console.log('   Possible issues:');
        console.log('   1. No BLE attendance in last 60 seconds');
        console.log('   2. Backend not running');
        console.log('   3. Wrong database');
        console.log('');
      }
    } catch (apiErr: any) {
      console.error('❌ API Error:', apiErr.message);
      if (apiErr.code === 'ECONNREFUSED') {
        console.log('   Backend server is not running!');
        console.log('   Start with: npm run dev');
      }
      console.log('');
    }
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

testRecentAPI();
