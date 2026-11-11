const mysql = require('mysql2/promise');
require('dotenv').config();

async function run() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardmap_db',
    waitForConnections: true,
    connectionLimit: 5,
  });

  const mappings = [
    ['A3:7B:E5:2C', 'Rae'],
    ['5C:D0:F9:03', 'Mat']
  ];

  const conn = await pool.getConnection();
  try {
    for (const [uid, name] of mappings) {
      console.log(`Ensuring mapping ${uid} -> ${name}`);
      await conn.execute(
        `INSERT INTO rfid_tags (uid, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)`,
        [uid, name]
      );

      const [updateResult] = await conn.execute(
        `UPDATE RFID_LOGS SET student_name = ? WHERE UPPER(uid) = UPPER(?)`,
        [name, uid]
      );

      console.log(`Updated RFID_LOGS for ${uid}:`, updateResult && updateResult.affectedRows ? `${updateResult.affectedRows} rows` : '0 rows');
    }

    // Show verification samples
    const [tags] = await conn.execute(`SELECT uid, name FROM rfid_tags WHERE UPPER(uid) IN (UPPER(?), UPPER(?))`, [mappings[0][0], mappings[1][0]]);
    console.log('rfid_tags rows:', tags);

    const [logs] = await conn.execute(`SELECT id, uid, student_name, timestamp FROM RFID_LOGS WHERE UPPER(uid) IN (UPPER(?), UPPER(?)) ORDER BY timestamp DESC LIMIT 20`, [mappings[0][0], mappings[1][0]]);
    console.log('RFID_LOGS sample rows:', logs);

    console.log('Done.');
  } catch (err) {
    console.error('Error running mapping script:', err);
    process.exitCode = 1;
  } finally {
    conn.release();
    await pool.end();
  }
}

run();
