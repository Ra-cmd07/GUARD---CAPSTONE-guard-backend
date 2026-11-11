const mysql = require('mysql2/promise');

async function checkPhoneFormats() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('📱 Checking Phone Number Formats\n');
  console.log('═'.repeat(80));

  // Check parent contacts
  const [parents] = await connection.execute(`
    SELECT 
      p.id,
      p.name,
      p.contact,
      s.name as student_name,
      ps.relationship
    FROM parents p
    LEFT JOIN parent_student ps ON p.id = ps.parent_id
    LEFT JOIN students s ON ps.student_id = s.id
    WHERE p.contact IS NOT NULL
    ORDER BY p.id
    LIMIT 20
  `);

  console.log('PARENT CONTACTS:\n');
  
  parents.forEach((p, i) => {
    const contact = p.contact || 'No contact';
    const isValid = contact.startsWith('+63') || contact.startsWith('09');
    const status = isValid ? '✅' : '❌';
    
    console.log(`${i + 1}. ${p.name}`);
    console.log(`   Student: ${p.student_name || 'Not linked'}`);
    console.log(`   Contact: ${contact} ${status}`);
    console.log(`   Relationship: ${p.relationship || 'N/A'}`);
    console.log('');
  });

  console.log('═'.repeat(80));
  console.log('\n✅ Valid formats:');
  console.log('   - +639XXXXXXXXX (international)');
  console.log('   - 09XXXXXXXXX (local)');
  console.log('\n💡 Tip: Use format "0953 681 2353" when entering (system converts automatically)');

  await connection.end();
}

checkPhoneFormats().catch(console.error);
