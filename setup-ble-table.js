const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupBleTable() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardmap_db',
  });

  try {
    const conn = await pool.getConnection();

    // Add UNIQUE constraint to students.mac_address
    console.log('Adding UNIQUE constraint to students.mac_address...');
    try {
      await conn.execute(
        `ALTER TABLE students ADD UNIQUE KEY uk_mac_address (mac_address)`
      );
      console.log('✅ UNIQUE constraint added to mac_address');
    } catch (err) {
      if (err.message.includes('Duplicate key name')) {
        console.log('⚠️  UNIQUE constraint already exists');
      } else {
        throw err;
      }
    }

    // Create BLEPROXY table
    console.log('Creating BLEPROXY table...');
    await conn.execute(
      `CREATE TABLE IF NOT EXISTS BLEPROXY (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_name VARCHAR(100) NOT NULL,
        mac_address VARCHAR(50) NOT NULL,
        distance DECIMAL(8,2) NOT NULL,
        rssi INT NOT NULL,
        timestamp DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_bleproxy_mac FOREIGN KEY (mac_address) 
          REFERENCES students(mac_address) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    console.log('✅ BLEPROXY table created successfully');

    conn.release();
    await pool.end();
    console.log('✅ Setup complete!');
  } catch (err) {
    console.error('❌ Setup error:', err.message);
    process.exit(1);
  }
}

setupBleTable();
