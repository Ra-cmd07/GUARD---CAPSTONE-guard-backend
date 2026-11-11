// Fix Berry's LRN to match the QR code
const mysql = require('mysql2/promise');

async function fixBerryLRN() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n🔄 Updating Berry\'s LRN from 221234343555 to 22123343555...\n');
  
  const [result] = await connection.execute(
    'UPDATE students SET lrn = ? WHERE name = ? AND lrn = ?',
    ['22123343555', 'Berry, Kurtt Fan', '221234343555']
  );
  
  console.log('✅ Update result:', result);
  
  // Verify the update
  const [students] = await connection.execute(
    'SELECT id, name, lrn FROM students WHERE name LIKE ?',
    ['%Berry%']
  );
  
  console.log('\n📋 Berry after update:');
  console.table(students);
  
  await connection.end();
}

fixBerryLRN().catch(console.error);
