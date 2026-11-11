import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function testLogin() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'attendbox_db',
  });

  console.log('\n✅ Connected to database\n');

  // Check if admin user exists
  const [rows] = await conn.execute(
    `SELECT u.id, u.username, u.password, u.is_active, r.name AS role
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.username = 'admin'`
  ) as any[];

  if ((rows as any[]).length === 0) {
    console.log('❌ Admin user NOT found in database!');
    console.log('Creating admin user...');
    
    const hash = await bcrypt.hash('admin123', 10);
    await conn.execute(
      `INSERT INTO users (id, username, password, role_id, is_active) VALUES (1, 'admin', ?, 1, 1)`,
      [hash]
    );
    console.log('✅ Admin user created!');
  } else {
    const user = (rows as any[])[0];
    console.log('✅ Admin user found:');
    console.log('   ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Role:', user.role);
    console.log('   Active:', user.is_active);
    
    // Test password
    const match = await bcrypt.compare('admin123', user.password);
    console.log('   Password match:', match ? '✅ YES' : '❌ NO');
    
    if (!match) {
      console.log('\n⚠️  Password does not match! Resetting password to "admin123"...');
      const hash = await bcrypt.hash('admin123', 10);
      await conn.execute(
        'UPDATE users SET password = ? WHERE username = ?',
        [hash, 'admin']
      );
      console.log('✅ Password reset complete!');
    }
  }

  await conn.end();
  console.log('\n✅ Test complete!\n');
}

testLogin().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
