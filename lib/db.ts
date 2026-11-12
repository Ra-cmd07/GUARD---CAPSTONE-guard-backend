import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

console.log('🔌 PostgreSQL configuration:');
console.log(`  Using DATABASE_URL: ${process.env.DATABASE_URL ? '✓ Set' : '✗ Not set'}`);
console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);

// Test connection on startup
pool.connect()
  .then(client => {
    console.log('✅ PostgreSQL connected successfully');
    client.release();
  })
  .catch(err => {
    console.error('❌ PostgreSQL connection failed:', err.message);
    process.exit(1);
  });

// Compatibility wrapper to match mysql2 interface
const execute = async (query: string, values?: any[]) => {
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    return [result.rows, result.fields];
  } finally {
    client.release();
  }
};

const query = async (sql: string, values?: any[]) => {
  const [rows] = await execute(sql, values);
  return rows;
};

export default {
  execute,
  query,
  pool
};