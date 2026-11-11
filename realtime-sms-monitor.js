const mysql = require('mysql2/promise');

let connection;
let lastSmsId = 0;

async function init() {
  connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  // Get latest SMS ID
  const [rows] = await connection.execute(
    'SELECT MAX(id) as max_id FROM sms_queue'
  );
  lastSmsId = rows[0].max_id || 0;
  
  console.clear();
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║         REAL-TIME SMS MONITOR - KIOSK TO ESP32                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`📊 Starting from SMS ID: ${lastSmsId}`);
  console.log('👀 Watching for new SMS...\n');
  console.log('🎯 NOW SCAN AT YOUR KIOSK and watch what happens!\n');
  console.log('─────────────────────────────────────────────────────────────────\n');
}

async function monitor() {
  try {
    // Check for NEW SMS
    const [newSms] = await connection.execute(
      `SELECT id, phone_number, message, status, created_at, sent_at
       FROM sms_queue 
       WHERE id > ?
       ORDER BY id ASC`,
      [lastSmsId]
    );

    if (newSms.length > 0) {
      for (const sms of newSms) {
        const created = new Date(sms.created_at);
        console.log(`\n🆕 SMS ID ${sms.id} CREATED!`);
        console.log(`   📞 Phone: ${sms.phone_number}`);
        console.log(`   📝 Message: ${sms.message.substring(0, 60)}...`);
        console.log(`   ⏰ Created at: ${created.toLocaleTimeString()}`);
        console.log(`   📊 Status: ${sms.status}`);
        
        if (sms.status === 'pending') {
          console.log(`   ⏳ Status: PENDING - ESP32 should pick this up within 2 seconds!`);
        } else if (sms.status === 'sent') {
          const sent = new Date(sms.sent_at);
          const duration = (sent - created) / 1000;
          console.log(`   ✅ Already SENT in ${duration.toFixed(1)} seconds!`);
        }
        
        lastSmsId = sms.id;
      }
      console.log('\n─────────────────────────────────────────────────────────────────\n');
    }

    // Check for status updates
    const [updates] = await connection.execute(
      `SELECT id, status, sent_at, error_message
       FROM sms_queue 
       WHERE id > ? - 5 AND status != 'pending'
       ORDER BY id DESC
       LIMIT 5`,
      [lastSmsId]
    );

    // Show live status
    const [pending] = await connection.execute(
      `SELECT COUNT(*) as count FROM sms_queue WHERE status = 'pending'`
    );
    
    process.stdout.write(`\r⏳ Pending: ${pending[0].count} | Last ID: ${lastSmsId} | Time: ${new Date().toLocaleTimeString()}     `);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
  }
}

init().then(() => {
  // Monitor every 500ms for instant detection
  setInterval(monitor, 500);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Monitor stopped');
  process.exit();
});
