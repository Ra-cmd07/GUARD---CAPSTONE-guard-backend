// Reset parent password
import bcrypt from 'bcryptjs';
import pool from '../lib/db';

async function resetParentPassword() {
  try {
    const username = 'Fin';
    const newPassword = 'parent123';
    
    console.log(`\n🔐 Resetting password for parent: ${username}`);
    
    // Hash the new password
    const hashed = await bcrypt.hash(newPassword, 10);
    
    // Update the password
    await pool.execute(
      'UPDATE users SET password = ? WHERE username = ?',
      [hashed, username]
    );
    
    console.log(`✅ Password reset successfully!`);
    console.log(`\n📋 Login credentials:`);
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${newPassword}`);
    console.log(`\n👉 Try logging in now!\n`);
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

resetParentPassword();
