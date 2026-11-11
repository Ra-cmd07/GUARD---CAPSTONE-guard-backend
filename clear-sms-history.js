const mysql = require('mysql2/promise');

async function clearSmsHistory() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🗑️  Clearing SMS History...\n');
  console.log('═'.repeat(60));

  try {
    // Count SMS logs before deletion
    const [countBefore] = await connection.execute(
      'SELECT COUNT(*) as total FROM sms_logs'
    );
    const totalBefore = countBefore[0].total;

    console.log(`📊 Current SMS logs: ${totalBefore} records\n`);

    if (totalBefore === 0) {
      console.log('✅ SMS history is already empty!');
      await connection.end();
      return;
    }

    // Delete all SMS logs
    const [result] = await connection.execute('DELETE FROM sms_logs');
    const deletedCount = result.affectedRows;

    console.log(`✅ Deleted ${deletedCount} SMS log records\n`);

    // Also clear SMS queue (pending/failed SMS)
    const [queueCount] = await connection.execute(
      'SELECT COUNT(*) as total FROM sms_queue'
    );
    const totalQueue = queueCount[0].total;

    if (totalQueue > 0) {
      console.log(`📊 Current SMS queue: ${totalQueue} pending messages\n`);
      const [queueResult] = await connection.execute('DELETE FROM sms_queue');
      console.log(`✅ Cleared ${queueResult.affectedRows} pending SMS from queue\n`);
    }

    console.log('═'.repeat(60));
    console.log('✅ SMS history cleared successfully!');
    console.log('═'.repeat(60));
    console.log('\n📊 Summary:');
    console.log(`   - SMS logs deleted: ${deletedCount}`);
    console.log(`   - SMS queue cleared: ${totalQueue}`);
    console.log(`   - Total cleaned: ${deletedCount + totalQueue}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  await connection.end();
}

clearSmsHistory().catch(console.error);
