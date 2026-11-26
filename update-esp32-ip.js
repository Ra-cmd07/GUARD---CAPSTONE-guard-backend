require('dotenv').config();
const mysql = require('mysql2/promise');

async function updateESP32IP() {
  // ═══════════════════════════════════════════════════════════════
  // CHANGE THIS IP TO YOUR ESP32'S IP ADDRESS
  // Get it from Serial Monitor after uploading the sketch
  // ═══════════════════════════════════════════════════════════════
  const NEW_ESP32_IP = '192.168.1.100';  // ← CHANGE THIS!
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    console.log('\n═══════════════════════════════════════');
    console.log('   ESP32 IP Address Update Tool');
    console.log('═══════════════════════════════════════\n');
    
    // Show current configuration
    const [current] = await connection.query(
      'SELECT id, name, location, gate, esp32_ip FROM kiosks WHERE id = 1'
    );
    
    if (current.length === 0) {
      console.log('❌ No kiosk found with id = 1');
      console.log('   Run: node add-kiosks-table.js first');
      return;
    }
    
    console.log('📊 Current configuration:');
    console.table(current);
    
    if (current[0].esp32_ip === NEW_ESP32_IP) {
      console.log('✅ IP address is already set to', NEW_ESP32_IP);
      console.log('   No update needed!\n');
      return;
    }
    
    // Update IP address
    console.log(`\n🔄 Updating ESP32 IP address...`);
    console.log(`   Old IP: ${current[0].esp32_ip || '(not set)'}`);
    console.log(`   New IP: ${NEW_ESP32_IP}\n`);
    
    await connection.execute(
      'UPDATE kiosks SET esp32_ip = ? WHERE id = 1',
      [NEW_ESP32_IP]
    );
    
    // Show updated configuration
    const [updated] = await connection.query(
      'SELECT id, name, location, gate, esp32_ip FROM kiosks WHERE id = 1'
    );
    
    console.log('✅ Updated configuration:');
    console.table(updated);
    
    console.log('\n═══════════════════════════════════════');
    console.log('✅ ESP32 IP address updated successfully!');
    console.log('═══════════════════════════════════════\n');
    
    console.log('📝 Next steps:');
    console.log('   1. Test connection: http://' + NEW_ESP32_IP + '/status');
    console.log('   2. Test scan: http://' + NEW_ESP32_IP + '/scan');
    console.log('   3. Try BLE scan on web kiosk\n');
    
  } catch (error) {
    console.error('\n❌ Error updating IP:', error.message);
    console.error('\nTroubleshooting:');
    console.error('  1. Check database credentials in .env file');
    console.error('  2. Make sure database is running');
    console.error('  3. Check kiosks table exists: node check-kiosks-table.js\n');
  } finally {
    await connection.end();
  }
}

// Show usage if IP not changed
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('\n╔══════════════════════════════════════════════════════════╗');
console.log('║          ESP32 IP Address Update Tool                   ║');
console.log('╚══════════════════════════════════════════════════════════╝\n');
console.log('Instructions:');
console.log('  1. Upload ESP32_WEB_KIOSK_BLE_SCANNER_DUAL_MODE.ino');
console.log('  2. Open Serial Monitor (115200 baud)');
console.log('  3. Copy the IP address shown');
console.log('  4. Edit this file: update-esp32-ip.js');
console.log('  5. Change NEW_ESP32_IP to your ESP32 IP');
console.log('  6. Run: node update-esp32-ip.js\n');

readline.question('Ready to update IP? (y/n): ', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    updateESP32IP().finally(() => readline.close());
  } else {
    console.log('\nCancelled. Edit NEW_ESP32_IP in this file first!\n');
    readline.close();
  }
});
