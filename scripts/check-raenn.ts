// Check Raenn's record and find correct parent table
import pool from '../lib/db';

async function checkRaenn() {
  console.log('\n🔍 Checking database structure...\n');

  try {
    // Check parents_teachers table
    console.log('📋 Checking parents_teachers table:');
    const [pt]: any = await pool.execute(
      'SELECT * FROM parents_teachers WHERE name LIKE "%Raenn%"'
    );
    console.table(pt);

    // Check if parents table exists
    console.log('\n📋 Checking if parents table exists:');
    try {
      const [p]: any = await pool.execute(
        'SELECT * FROM parents WHERE name LIKE "%Raenn%" LIMIT 1'
      );
      console.table(p);
    } catch (e: any) {
      console.log('❌ parents table does not exist or has no Raenn record');
    }

    // Check parent_student foreign key
    console.log('\n🔗 Checking parent_student table structure:');
    const [fk]: any = await pool.execute(
      `SELECT 
         CONSTRAINT_NAME,
         COLUMN_NAME,
         REFERENCED_TABLE_NAME,
         REFERENCED_COLUMN_NAME
       FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = 'attendbox_db'
       AND TABLE_NAME = 'parent_student'
       AND REFERENCED_TABLE_NAME IS NOT NULL`
    );
    console.table(fk);

    // Check existing parent-student links
    console.log('\n👨‍👩‍👧 Existing parent-student links:');
    const [links]: any = await pool.execute(
      'SELECT * FROM parent_student LIMIT 5'
    );
    console.table(links);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkRaenn();
