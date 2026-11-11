const mysql = require('mysql2/promise');

async function checkPendingSMS() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n📊 CHECKING SMS QUEUE STATUS...\n');

  // Check all SMS in last hour
  const [allSMS] = await connection.execute(
    `SELECT id, phone_number, LEFT(message, 60) as msg, status, 
            retry_count, created_at, sent_at, error_message
     FROM sms_queue 
     WHERE created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)
     ORDER BY created_at DESC`
  );

  console.log('Recent SMS (last hour):');
  console.table(allSMS);

  // Check specifically pending
  const [pending] = await connection.execute(
    `SELECT id, phone_number, LEFT(message, 60) as msg, status, 
            retry_count, created_at
     FROM sms_queue 
     WHERE status = 'pending'
     ORDER BY created_at DESC`
  );

  console.log('\n⏳ PENDING SMS (what ESP32 should see):');
  if (pending.length === 0) {
    console.log('   ✅ No pending SMS - all have been sent!');
    console.log('   ℹ️  This is why ESP32 shows "Waiting for kiosk scans..."');
  } else {
    console.table(pending);
    console.log(`\n   📡 ESP32 should pick up ${pending.length} pending SMS`);
  }

  await connection.end();
}

checkPendingSMS().catch(console.error);
