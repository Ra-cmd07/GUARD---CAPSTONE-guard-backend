const http = require('http');

function checkWhatESP32Sees() {
  console.log('\n🔍 CHECKING WHAT ESP32 SEES WHEN IT POLLS...\n');
  
  const options = {
    hostname: '10.194.43.63',
    port: 5000,
    path: '/api/gsm/pending?kiosk_id=1',
    method: 'GET'
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        console.log('Response from /api/gsm/pending:');
        console.log(JSON.stringify(parsed, null, 2));
        
        if (Array.isArray(parsed)) {
          console.log(`\n📊 ESP32 sees: ${parsed.length} pending SMS`);
          if (parsed.length === 0) {
            console.log('\n⚠️  PROBLEM: No pending SMS found!');
            console.log('   This is why ESP32 shows "Waiting for kiosk scans..."');
            console.log('\n   Possible causes:');
            console.log('   1. SMS already marked as "sent" or "failed"');
            console.log('   2. SMS not being created in database');
            console.log('   3. Wrong kiosk_id filter');
          } else {
            console.log('\n✅ ESP32 SHOULD pick these up and send!');
          }
        }
      } catch (err) {
        console.error('❌ Error parsing response:', err.message);
        console.log('Raw response:', data);
      }
    });
  });
  
  req.on('error', (error) => {
    console.error('❌ Connection error:', error.message);
  });
  
  req.end();
}

// Check immediately
checkWhatESP32Sees();

// Then check every 2 seconds like ESP32 does
console.log('\nWill keep checking every 2 seconds (press Ctrl+C to stop)...\n');
setInterval(checkWhatESP32Sees, 2000);
