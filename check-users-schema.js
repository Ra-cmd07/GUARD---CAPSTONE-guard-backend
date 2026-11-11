const mysql = require('mysql2/promise');

async function checkSchema() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('📋 Checking users table structure...\n');

  const [columns] = await connection.execute('DESCRIBE users');
  
  console.log('Columns in users table:');
  columns.forEach(col => {
    console.log(`  - ${col.Field} (${col.Type}) ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Key ? `[${col.Key}]` : ''}`);
  });

  await connection.end();
}

checkSchema().catch(console.error);
