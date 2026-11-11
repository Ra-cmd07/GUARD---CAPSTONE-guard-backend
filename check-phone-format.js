/**
 * Check phone number format in database
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkPhoneFormat() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  console.log('📞 Checking phone number formats in database...\n');

  // Check parents table
  const [parents] = await pool.query(
    `SELECT id, name, contact FROM parents LIMIT 10`
  );

  console.log('📋 Parents table:');
  parents.forEach(p => {
    const format = p.contact.startsWith('+63') ? '✅ International' : 
                   p.contact.startsWith('09') ? '⚠️  Local (needs +63)' : 
                   '❌ Invalid';
    console.log(`  ${p.name}: ${p.contact} ${format}`);
  });

  console.log('\n');

  // Check recent SMS queue
  const [smsQueue] = await pool.query(
    `SELECT id, phone_number, status, created_at 
     FROM sms_queue 
     ORDER BY created_at DESC 
     LIMIT 10`
  );

  console.log('📨 Recent SMS queue:');
  smsQueue.forEach(sms => {
    const format = sms.phone_number.startsWith('+63') ? '✅ International' : 
                   sms.phone_number.startsWith('09') ? '⚠️  Local' :
                   sms.phone_number.startsWith('63') ? '⚠️  Missing +' : 
                   '❌ Invalid';
    console.log(`  ID ${sms.id}: ${sms.phone_number} ${format} [${sms.status}]`);
  });

  console.log('\n');

  // Check for Kurt's parent specifically
  const [kurtParent] = await pool.query(
    `SELECT p.name, p.contact, s.name as student_name
     FROM parents p
     JOIN parent_student ps ON p.id = ps.parent_id
     JOIN students s ON ps.student_id = s.id
     WHERE s.name LIKE '%Kurt%'`
  );

  if (kurtParent.length > 0) {
    console.log('👤 Kurt\'s parent:');
    kurtParent.forEach(p => {
      const format = p.contact.startsWith('+63') ? '✅ Correct format' : 
                     '❌ Needs +63 prefix';
      console.log(`  ${p.name}: ${p.contact} ${format}`);
      
      if (!p.contact.startsWith('+63')) {
        const fixed = '+63' + p.contact.substring(1);
        console.log(`  📝 Should be: ${fixed}`);
      }
    });
  }

  await pool.end();
}

checkPhoneFormat().catch(console.error);
