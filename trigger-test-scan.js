const http = require('http');

async function triggerTestScan() {
  console.log('\n🧪 TRIGGERING TEST SCAN FOR KURT...\n');
  
  const postData = JSON.stringify({
    scan_method: 'BLE',
    identifier: '51:00:24:06:00:C4', // Kurt's BLE MAC
    kiosk_id: 1
  });
  
  const options = {
    hostname: '10.194.43.63',
    port: 5000,
    path: '/api/kiosk/scan',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': postData.length
    }
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('✅ Scan successful!');
      console.log('Response:', JSON.parse(data));
      
      console.log('\n📡 NOW CHECK YOUR ESP32 SERIAL MONITOR!');
      console.log('   Within 2-5 seconds you should see:');
      console.log('   - "📡 New SMS from backend: 1"');
      console.log('   - "📤 Sending SMS..."');
      console.log('   - "✅ SMS sent successfully!"');
      console.log('   - Back to "Waiting for kiosk scans..."');
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });
  
  req.write(postData);
  req.end();
}

triggerTestScan();
