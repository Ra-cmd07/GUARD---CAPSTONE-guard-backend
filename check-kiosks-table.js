const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkKiosksTable() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardmap_db',
  });

  try {
    const [rows] = await connection.execute('SHOW TABLES LIKE "kiosks"');
    console.log('Tables:', rows);
    
    if (rows.length > 0) {
      const [desc] = await connection.execute('DESCRIBE kiosks');
      console.log('Columns:');
      console.table(desc);
    } else {
      console.log('❌ Kiosks table does not exist');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await connection.end();
  }
}

checkKiosksTable();
