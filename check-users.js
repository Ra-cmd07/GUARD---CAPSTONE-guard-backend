const mysql = require('mysql2/promise');

(async () => {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  const [users] = await connection.execute(
    'SELECT username, role_id FROM users WHERE username IN (?, ?, ?) LIMIT 10',
    ['student1', 'parent1', 'admin']
  );

  console.log('\nAvailable test users:');
  users.forEach(u => {
    console.log(`  Username: ${u.username}, Role ID: ${u.role_id}`);
  });

  console.log('\nAll passwords are: 12345678\n');

  await connection.end();
})();
