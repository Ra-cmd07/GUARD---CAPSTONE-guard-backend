// Quick script to check if a student exists by LRN
const mysql = require('mysql2/promise');

async function checkStudent() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('\n🔍 Checking students with long LRNs (11-12 digits)...\n');
  
  const [students] = await connection.execute(
    'SELECT id, name, lrn, is_active FROM students WHERE LENGTH(lrn) >= 11 ORDER BY lrn'
  );
  
  console.log('Students with 11-12 digit LRNs:');
  console.table(students);
  
  console.log('\n📋 All active students:');
  const [allActive] = await connection.execute(
    'SELECT id, name, lrn, is_active FROM students WHERE is_active = 1 ORDER BY name LIMIT 20'
  );
  console.table(allActive);
  
  await connection.end();
}

checkStudent().catch(console.error);
