const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db',
    multipleStatements: true
  });

  try {
    console.log('📦 Reading migration file...');
    const sqlFile = path.join(__dirname, 'sql', 'add_preferred_method_column.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    console.log('🔄 Running migration...');
    await connection.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('Added columns:');
    console.log('  - preferred_method ENUM("QR", "BLE", "RFID")');
    console.log('  - idx_students_preferred_method INDEX');
  } catch (error) {
    if (error.code === 'ER_DUP_FIELDNAME') {
      console.log('⚠️  Column already exists - skipping migration');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    await connection.end();
  }
}

runMigration().catch(console.error);
