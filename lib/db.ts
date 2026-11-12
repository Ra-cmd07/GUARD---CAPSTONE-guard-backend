import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'attendbox_db',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  timezone:           '+08:00', // Philippine Time
});

console.log('🔌 MySQL configuration:');
console.log(`  host: ${process.env.DB_HOST || '127.0.0.1'}`);
console.log(`  port: ${process.env.DB_PORT || '3306'}`);
console.log(`  user: ${process.env.DB_USER || 'root'}`);
console.log(`  database: ${process.env.DB_NAME || 'attendbox_db'}`);

// Test connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected successfully');
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  });

export default pool;