const mysql = require('mysql2/promise');

async function checkRoles() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('📋 Checking roles table...\n');

  const [roles] = await connection.execute('SELECT * FROM roles');
  
  console.log('Available roles:');
  roles.forEach(role => {
    console.log(`  - ID: ${role.id} | Name: ${role.name}`);
  });

  await connection.end();
}

checkRoles().catch(console.error);
