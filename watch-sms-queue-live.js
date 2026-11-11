const mysql = require('mysql2/promise');

let lastCheckId = 0;

async function watchSMSQueue() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n👀 WATCHING SMS QUEUE LIVE...');
  console.log('Scan at the kiosk and see if SMS appears here!\n');

  setInterval(async () => {
    try {
      const [rows] = await connection.execute(
        `SELECT id, phone_number, LEFT(message, 50) as msg, status, 
                retry_count, created_at, sent_at
         FROM sms_queue 
         WHERE id > ?
         ORDER BY id ASC`,
        [lastCheckId]
      );

      if (rows.length > 0) {
        console.log(`\n🆕 NEW SMS DETECTED (${rows.length}):`);
        rows.forEach(sms => {
          console.log(`   ID: ${sms.id}`);
          console.log(`   Phone: ${sms.phone_number}`);
          console.log(`   Message: ${sms.msg}...`);
          console.log(`   Status: ${sms.status}`);
          console.log(`   Created: ${sms.created_at}`);
          console.log(`   ---`);
          lastCheckId = Math.max(lastCheckId, sms.id);
        });
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  }, 1000); // Check every second

  // Also show current pending count
  setInterval(async () => {
    try {
      const [count] = await connection.execute(
        `SELECT COUNT(*) as pending FROM sms_queue WHERE status = 'pending'`
      );
      process.stdout.write(`\r⏳ Pending SMS: ${count[0].pending}  (Last ID: ${lastCheckId})    `);
    } catch (err) {
      // Ignore
    }
  }, 1000);
}

watchSMSQueue().catch(console.error);

// Keep alive
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopped watching');
  process.exit();
});
