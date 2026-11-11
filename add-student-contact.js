require('dotenv').config();
const mysql = require('mysql2/promise');

async function addStudentContactColumn() {
  console.log('🔧 Adding contact column to students table...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    // Check if column already exists
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = ? 
       AND TABLE_NAME = 'students' 
       AND COLUMN_NAME = 'contact'`,
      [process.env.DB_NAME || 'attendbox_db']
    );

    if (columns.length > 0) {
      console.log('ℹ️  Contact column already exists in students table.');
      console.log('✅ No changes needed.\n');
    } else {
      // Add contact column
      await connection.execute(
        `ALTER TABLE students 
         ADD COLUMN contact VARCHAR(20) DEFAULT NULL COMMENT 'Student contact number' 
         AFTER section`
      );

      console.log('✅ Contact column added successfully!\n');

      // Update existing students with random contact numbers (optional)
      const [students] = await connection.execute('SELECT id, name FROM students');
      
      console.log(`📱 Generating contact numbers for ${students.length} existing students...\n`);
      
      for (const student of students) {
        const contact = `09${Math.floor(Math.random() * 900000000 + 100000000)}`;
        await connection.execute(
          'UPDATE students SET contact = ? WHERE id = ?',
          [contact, student.id]
        );
        console.log(`   ${student.id}. ${student.name.padEnd(30)} → ${contact}`);
      }

      console.log('\n✅ All students now have contact numbers!');
    }

    // Show updated table structure
    console.log('\n📋 Updated students table structure:\n');
    const [structure] = await connection.execute('DESCRIBE students');
    
    console.log('Column Name'.padEnd(20) + ' | Type'.padEnd(20) + ' | Null | Key | Default');
    console.log('─'.repeat(80));
    
    structure.forEach(col => {
      console.log(
        col.Field.padEnd(20) + ' | ' +
        col.Type.padEnd(18) + ' | ' +
        col.Null.padEnd(4) + ' | ' +
        (col.Key || '').padEnd(3) + ' | ' +
        (col.Default || 'NULL')
      );
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

addStudentContactColumn();
