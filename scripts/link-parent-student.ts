// Link parent to student
import pool from '../lib/db';

async function linkParentToStudent() {
  try {
    console.log('\n🔗 Linking parent to student...');
    
    // Link parent Finnan (id=1) to student Padios (id=1)
    await pool.execute(
      'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
      [1, 1, 'Parent']
    );
    
    console.log('✅ Successfully linked parent "Finnan" to student "Padios"');
    console.log('\n👉 Parent "Fin" can now login and see Padios attendance!\n');
    
    await pool.end();
  } catch (err: any) {
    if (err.code === 'ER_DUP_ENTRY') {
      console.log('✅ Parent and student are already linked!');
    } else {
      console.error('Error:', err);
    }
    await pool.end();
  }
}

linkParentToStudent();
