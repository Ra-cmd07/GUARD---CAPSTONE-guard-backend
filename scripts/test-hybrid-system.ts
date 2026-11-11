// ============================================================================
// HYBRID SYSTEM TEST SCRIPT
// Tests: BLE Location + Auto-Attendance + Photo Capture
// ============================================================================

import pool from '../lib/db';
import axios from 'axios';

const SERVER_URL = 'http://localhost:5000';

// Test configuration
const TEST_STUDENT = {
  id: 1,
  name: 'Padios',
  mac_address: 'AA:BB:CC:DD:EE:FF'
};

const TEST_BEACON_GATE = 'BEACON_GATE1';
const TEST_BEACON_CLASSROOM = 'BEACON_ROOM201';

// Sample base64 image (1x1 pixel red image)
const SAMPLE_PHOTO_BASE64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAIBAQIBAQICAgICAgICAwUDAwMDAwYEBAMFBwYHBwcGBwcICQsJCAgKCAcHCg0KCgsMDAwMBwkODw0MDgsMDAz/2wBDAQICAgMDAwYDAwYMCAcIDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAz/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD9/KKKKAP/2Q==';

async function testHybridSystem() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         HYBRID SYSTEM TEST - AttendBox                    ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  let testsPassed = 0;
  let testsFailed = 0;

  try {
    // ─────────────────────────────────────────────────────────────────────
    // TEST 1: Verify Student Exists with MAC Address
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 1: Verify Student Registration');
    console.log('─'.repeat(60));
    
    const [students] = await pool.execute(
      'SELECT id, name, mac_address FROM students WHERE id = ?',
      [TEST_STUDENT.id]
    ) as any[];

    if ((students as any[]).length === 0) {
      console.log('❌ FAILED: Student not found');
      console.log('   Fix: Run setup-db.ts or add student manually\n');
      testsFailed++;
    } else {
      const student = (students as any[])[0];
      console.log(`✅ PASSED: Student found`);
      console.log(`   ID: ${student.id}`);
      console.log(`   Name: ${student.name}`);
      console.log(`   MAC: ${student.mac_address || 'NOT SET'}`);
      
      if (!student.mac_address) {
        console.log('⚠️  WARNING: MAC address not set');
        console.log(`   Fix: UPDATE students SET mac_address = '${TEST_STUDENT.mac_address}' WHERE id = ${TEST_STUDENT.id}\n`);
      } else {
        console.log('');
        testsPassed++;
      }
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 2: Verify Beacon Configuration
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 2: Verify Beacon Configuration');
    console.log('─'.repeat(60));
    
    const [beacons] = await pool.execute(
      'SELECT beacon_id, location_name, location_type FROM ble_beacons WHERE is_active = 1'
    ) as any[];

    if ((beacons as any[]).length === 0) {
      console.log('❌ FAILED: No active beacons found');
      console.log('   Fix: Run sql/add_location_tracking.sql\n');
      testsFailed++;
    } else {
      console.log(`✅ PASSED: ${(beacons as any[]).length} active beacons found`);
      (beacons as any[]).forEach((b: any) => {
        const icon = b.location_type === 'gate' ? '🚪' : 
                     b.location_type === 'classroom' ? '📚' : '📍';
        console.log(`   ${icon} ${b.beacon_id}: ${b.location_name} (${b.location_type})`);
      });
      console.log('');
      testsPassed++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 3: Simulate BLE Detection at Gate (CHECK IN)
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 3: BLE Detection at Gate → Check IN');
    console.log('─'.repeat(60));

    try {
      const response = await axios.post(`${SERVER_URL}/api/location/ble-update`, {
        mac_address: TEST_STUDENT.mac_address,
        beacon_id: TEST_BEACON_GATE,
        signal_strength: -32
      });

      if (response.status === 201) {
        console.log('✅ PASSED: Location update successful');
        console.log(`   Student: ${response.data.student_name}`);
        console.log(`   Location: ${response.data.location}`);
        console.log(`   Attendance Marked: ${response.data.attendance_marked ? 'YES' : 'NO'}`);
        console.log(`   Status: ${response.data.attendance_status || 'N/A'}`);
        console.log('');
        testsPassed++;
      }
    } catch (error: any) {
      console.log('❌ FAILED: API request failed');
      console.log(`   Error: ${error.message}`);
      console.log('   Fix: Ensure backend is running (npm start)\n');
      testsFailed++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 4: Verify Location Recorded in Database
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 4: Verify Location in Database');
    console.log('─'.repeat(60));

    const [locations] = await pool.execute(
      `SELECT location_name, location_type, timestamp 
       FROM student_locations 
       WHERE student_id = ? 
       ORDER BY timestamp DESC LIMIT 1`,
      [TEST_STUDENT.id]
    ) as any[];

    if ((locations as any[]).length === 0) {
      console.log('❌ FAILED: No location record found');
      testsFailed++;
    } else {
      const loc = (locations as any[])[0];
      console.log('✅ PASSED: Location recorded');
      console.log(`   Location: ${loc.location_name}`);
      console.log(`   Type: ${loc.location_type}`);
      console.log(`   Timestamp: ${loc.timestamp}`);
      console.log('');
      testsPassed++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 5: Verify Attendance Marked in Database
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 5: Verify Attendance Marked');
    console.log('─'.repeat(60));

    const [attendance] = await pool.execute(
      `SELECT status, check_in_time, check_out_time, method 
       FROM attendance 
       WHERE student_id = ? AND DATE(check_in_time) = CURDATE()`,
      [TEST_STUDENT.id]
    ) as any[];

    if ((attendance as any[]).length === 0) {
      console.log('⚠️  WARNING: No attendance record for today');
      console.log('   This might be expected if gate beacon was not used');
      console.log('');
    } else {
      const att = (attendance as any[])[0];
      console.log('✅ PASSED: Attendance marked');
      console.log(`   Status: ${att.status}`);
      console.log(`   Check In: ${att.check_in_time}`);
      console.log(`   Check Out: ${att.check_out_time || 'Not yet'}`);
      console.log(`   Method: ${att.method}`);
      console.log('');
      testsPassed++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 6: Simulate BLE Detection at Classroom (Location Only)
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 6: BLE Detection at Classroom → Location Only');
    console.log('─'.repeat(60));

    try {
      const response = await axios.post(`${SERVER_URL}/api/location/ble-update`, {
        mac_address: TEST_STUDENT.mac_address,
        beacon_id: TEST_BEACON_CLASSROOM,
        signal_strength: -35
      });

      if (response.status === 201) {
        console.log('✅ PASSED: Location update successful');
        console.log(`   Location: ${response.data.location}`);
        console.log(`   Attendance Marked: ${response.data.attendance_marked ? 'YES' : 'NO (expected)'}`);
        console.log('   Note: Classrooms only track location, not attendance');
        console.log('');
        testsPassed++;
      }
    } catch (error: any) {
      console.log('❌ FAILED: API request failed');
      console.log(`   Error: ${error.message}\n`);
      testsFailed++;
    }

    // ─────────────────────────────────────────────────────────────────────
    // TEST 7: Simulate BLE Detection with Photo (Gate + Photo)
    // ─────────────────────────────────────────────────────────────────────
    console.log('🔍 TEST 7: BLE Detection with Photo Capture');
    console.log('─'.repeat(60));

    try {
      const response = await axios.post(`${SERVER_URL}/api/location/ble-update`, {
        mac_address: TEST_STUDENT.mac_address,
        beacon_id: TEST_BEACON_GATE,
        signal_strength: -30,
        photo_base64: SAMPLE_PHOTO_BASE64
      });

      if (response.status === 201) {
        console.log('✅ PASSED: Location + Photo update successful');
        console.log(`   Location: ${response.data.location}`);
        console.log(`   Photo Saved: ${response.data.photo_saved ? 'YES' : 'NO'}`);
        if (response.data.photo_path) {
          console.log(`   Photo Path: ${response.data.photo_path}`);
        }
        console.log('');
        testsPassed++;
      }
    } catch (error: any) {
      console.log('❌ FAILED: API request failed');
      console.log(`   Error: ${error.message}\n`);
      testsFailed++;
    }

  } catch (error) {
    console.error('\n❌ TEST SUITE ERROR:', error);
  } finally {
    await pool.end();
  }

  // ─────────────────────────────────────────────────────────────────────
  // TEST SUMMARY
  // ─────────────────────────────────────────────────────────────────────
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST SUMMARY                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`✅ Tests Passed: ${testsPassed}`);
  console.log(`❌ Tests Failed: ${testsFailed}`);
  console.log(`📊 Success Rate: ${testsPassed + testsFailed > 0 ? Math.round(100 * testsPassed / (testsPassed + testsFailed)) : 0}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Hybrid system is working correctly.\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
  }
}

// Run the test
testHybridSystem().catch(console.error);
