// Diagnose why Kiosk isn't detecting BLE
import pool from './lib/db';

async function diagnose() {
  console.log('\n🔍 KIOSK BLE DIAGNOSTIC\n');
  
  try {
    // Check 1: Pending detections in database
    console.log('━'.repeat(60));
    console.log('CHECK 1: Database - Pending Detections');
    console.log('━'.repeat(60));
    
    const [pending]: any = await pool.execute(
      `SELECT id, student_name, status, 
       DATE_FORMAT(detected_at, '%Y-%m-%d %H:%i:%s') as detected_time,
       TIMESTAMPDIFF(SECOND, detected_at, NOW()) as seconds_ago
       FROM ble_detections 
       WHERE status = 'pending'
       ORDER BY id DESC 
       LIMIT 5`
    );
    
    if (pending.length === 0) {
      console.log('❌ NO pending detections found!');
      console.log('   → ESP32 may not be sending data');
      console.log('   → Or backend not storing in ble_detections table\n');
    } else {
      console.log('✅ Found', pending.length, 'pending detection(s):');
      console.table(pending);
      console.log('');
    }
    
    // Check 2: Recent BLE from ESP32
    console.log('━'.repeat(60));
    console.log('CHECK 2: All BLE Detections (Last 5)');
    console.log('━'.repeat(60));
    
    const [allBle]: any = await pool.execute(
      `SELECT id, student_name, status,
       DATE_FORMAT(detected_at, '%Y-%m-%d %H:%i:%s') as detected_time,
       TIMESTAMPDIFF(SECOND, detected_at, NOW()) as seconds_ago
       FROM ble_detections 
       ORDER BY id DESC 
       LIMIT 5`
    );
    
    if (allBle.length > 0) {
      console.table(allBle);
      console.log('');
    } else {
      console.log('❌ NO BLE detections at all!');
      console.log('   → ESP32 not sending data');
      console.log('   → Or backend code not updated\n');
    }
    
    // Summary
    console.log('━'.repeat(60));
    console.log('SUMMARY & NEXT STEPS');
    console.log('━'.repeat(60));
    
    if (pending.length > 0) {
      console.log('✅ System is working - detections are being stored!');
      console.log('\n📋 To fix Kiosk:');
      console.log('   1. Open: http://localhost:5173/kiosk');
      console.log('   2. Press: Ctrl + Shift + R (hard refresh)');
      console.log('   3. Click "BLE token" button');
      console.log('   4. Should show approval screen!\n');
      
      console.log('💡 OR use the restart script:');
      console.log('   Double-click: RESTART_EVERYTHING.bat\n');
    } else {
      console.log('⚠️  No pending detections found');
      console.log('\n📋 To generate a detection:');
      console.log('   1. Place BLE beacon near ESP32');
      console.log('   2. Wait for ESP32 to detect');
      console.log('   3. Run this diagnostic again\n');
    }
    
  } catch (error) {
    console.error('\n❌ Diagnostic error:', error);
  } finally {
    await pool.end();
  }
}

diagnose();
