/**
 * Test ESP32 BLE Detection Endpoint
 * Simulates what ESP32 sends to /api/ble/detect
 */

const http = require('http');

function testBleDetection() {
  const payload = JSON.stringify({
    student_id: 1,
    student_name: 'Bernie',
    mac: 'F7:6C:A5:11:0A:F7',
    rssi: -45,
    distance: 0.30,
    kiosk_id: 1,
    gate_name: 'Main Gate'
  });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/ble/detect',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  console.log('🧪 Testing BLE Detection Endpoint...');
  console.log('📤 Payload:', payload);
  console.log('');

  const req = http.request(options, (res) => {
    console.log('📊 Status Code:', res.statusCode);
    console.log('📋 Headers:', JSON.stringify(res.headers, null, 2));
    console.log('');

    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      console.log('📥 Response:', responseData);
      
      try {
        const json = JSON.parse(responseData);
        if (res.statusCode === 201 && json.success) {
          console.log('\n✅ SUCCESS! Detection recorded.');
          console.log(`   Detection ID: ${json.id}`);
          console.log(`   Student: ${json.student_name} (ID: ${json.student_id})`);
          console.log(`   Status: ${json.status}`);
        } else {
          console.log('\n❌ FAILED!');
          console.log('   Error:', json.error || 'Unknown error');
        }
      } catch (e) {
        console.log('\n❌ Invalid JSON response:', e.message);
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Request failed:', error.message);
  });

  req.write(payload);
  req.end();
}

// Run test
testBleDetection();
