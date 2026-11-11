// ============================================================================
// Test BLE Detection and Attendance Recording
// ============================================================================

import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function testBleDetection() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║          BLE Detection & Attendance Test                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Test BLE detection for Padios (MAC: F7:6C:A5:11:0A:F7)
    console.log('📡 Sending BLE detection to backend...');
    console.log('   MAC Address: F7:6C:A5:11:0A:F7');
    console.log('   Beacon ID: BEACON_GATE1');
    console.log('   RSSI: -30 dBm');
    
    const response = await axios.post(`${BASE_URL}/location/ble-update`, {
      mac_address: 'F7:6C:A5:11:0A:F7',
      beacon_id: 'BEACON_GATE1',
      signal_strength: -30,
    });

    console.log('\n✅ Backend Response:');
    console.log('   Status:', response.status);
    console.log('   Student:', response.data.student_name);
    console.log('   Location:', response.data.location);
    console.log('   Attendance Marked:', response.data.attendance_marked ? '✅ YES' : '❌ NO');
    
    if (response.data.attendance_marked) {
      console.log('   Attendance Status:', response.data.attendance_status);
      console.log('   Attendance ID:', response.data.attendance_id);
    }

    console.log('\n📋 Full Response:');
    console.log(JSON.stringify(response.data, null, 2));

  } catch (error: any) {
    console.error('\n❌ Error:', error.response?.data || error.message);
  }
}

testBleDetection();
