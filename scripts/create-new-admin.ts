import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
dotenv.config();

async function createNewAdmin() {
  const conn = await mysql.createConnection({
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER     || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME     || 'attendbox_db',
  });

  console.log('\n🔧 Creating new admin account...\n');

  // New credentials
  const newUsername = 'adminuser';
  const newPassword = 'Admin@2026';

  // Check if username already exists
  const [existing] = await conn.execute(
    'SELECT id FROM users WHERE username = ?',
    [newUsername]
  ) as any[];

  if ((existing as any[]).length > 0) {
    console.log(`⚠️  Username "${newUsername}" already exists. Updating password...`);
    const hash = await bcrypt.hash(newPassword, 10);
    await conn.execute(
      'UPDATE users SET password = ?, is_active = 1 WHERE username = ?',
      [hash, newUsername]
    );
    console.log('✅ Password updated!');
  } else {
    // Create new admin user
    const hash = await bcrypt.hash(newPassword, 10);
    await conn.execute(
      `INSERT INTO users (username, password, role_id, is_active) VALUES (?, ?, 1, 1)`,
      [newUsername, hash]
    );
    console.log('✅ New admin account created!');
  }

  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('   ========================');
  console.log(`   Username: ${newUsername}`);
  console.log(`   Password: ${newPassword}`);
  console.log('   ========================\n');

  await conn.end();
  console.log('✅ Done!\n');
}

createNewAdmin().catch(err => {
  console.error('❌ Failed:', err.message);
  process.exit(1);
});
