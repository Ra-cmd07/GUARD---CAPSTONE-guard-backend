/**
 * Test kiosk scan to verify SMS queueing
 */

const http = require('http');

const scanData = JSON.stringify({
  scan_method: 'BLE',
  identifier: '51:00:24:06:00:C4',  // Kurt's BLE MAC
  kiosk_id: 1
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/kiosk/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': scanData.length
  }
};

console.log('🧪 Testing kiosk BLE scan...');
console.log('📱 Scanning Kurt\'s BLE MAC: 51:00:24:06:00:C4\n');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('✅ Response Status:', res.statusCode);
    
    if (res.statusCode === 201) {
      const response = JSON.parse(data);
      console.log('📊 Response Data:');
      console.log('   Student:', response.student_name);
      console.log('   Status:', response.status);
      console.log('   Date:', response.date);
      console.log('   Time:', response.time);
      console.log('   SMS Results:', response.sms);
      console.log('\n✅ Attendance recorded!');
      console.log('\n📡 Now check:');
      console.log('   curl http://localhost:5000/api/gsm/pending');
      console.log('   Should show new SMS in queue!');
    } else {
      console.log('❌ Error:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
  console.log('\n💡 Make sure backend is running:');
  console.log('   cd guard-backend');
  console.log('   npm run dev');
});

req.write(scanData);
req.end();
