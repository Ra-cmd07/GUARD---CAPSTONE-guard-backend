// Reset parent Fin's password
import bcrypt from 'bcryptjs';
import pool from '../lib/db';

async function resetFinPassword() {
  try {
    console.log('\n🔐 Resetting password for parent "Fin"...');
    
    const newPassword = 'fin123';
    const hashed = await bcrypt.hash(newPassword, 10);
    
    await pool.execute(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashed, 'Fin']
    );
    
    console.log(`✅ Password reset successfully!`);
    console.log(`   Username: Fin`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n👉 You can now login at the frontend with these credentials.\n`);
    
    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err);
    await pool.end();
    process.exit(1);
  }
}

resetFinPassword();
