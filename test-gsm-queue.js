/**
 * Test Script: Queue a test SMS message
 * This simulates what happens when a student scans at the kiosk
 */

const http = require('http');

const testData = JSON.stringify({
  phone_number: '+639536812353',
  message: 'ATTENDBOX TEST: Kurt Sigada has arrived at school at 8:15 AM. Date: 2026-06-30.',
  student_id: 1,
  attendance_id: 999,
  priority: 'normal'
});

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/gsm/queue',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': testData.length
  }
};

console.log('🧪 Testing SMS Queue...');
console.log('📱 Sending test SMS to: +639536812353');

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('\n✅ Response Status:', res.statusCode);
    console.log('📊 Response Data:', JSON.parse(data));
    console.log('\n✅ SMS queued successfully!');
    console.log('📡 ESP32 can now poll: GET /api/gsm/pending');
    console.log('📊 Check status: GET /api/gsm/status');
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error);
});

req.write(testData);
req.end();
