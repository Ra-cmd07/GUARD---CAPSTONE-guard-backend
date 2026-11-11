/**
 * Test Backend Startup
 * Quick test to see if backend starts without errors
 */

console.log('🧪 Testing backend startup...\n');

// Test 1: Check if database credentials are set
console.log('Test 1: Environment Variables');
require('dotenv').config();

const requiredVars = ['DB_HOST', 'DB_USER', 'DB_NAME'];
const missing = requiredVars.filter(v => !process.env[v]);

if (missing.length > 0) {
  console.log('⚠️  Missing env vars:', missing.join(', '));
  console.log('   Check your .env file\n');
} else {
  console.log('✅ Environment variables configured\n');
}

// Test 2: Check database connection
console.log('Test 2: Database Connection');
const mysql = require('mysql2/promise');

async function testDatabase() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'guardmap_db'
    });

    console.log('✅ Database connection successful');

    // Check if sms_queue table exists
    const [tables] = await connection.execute(
      "SHOW TABLES LIKE 'sms_queue'"
    );

    if (tables.length > 0) {
      console.log('✅ SMS queue table exists');
      console.log('   GSM integration ready!\n');
    } else {
      console.log('⚠️  SMS queue table not found');
      console.log('   Run: node create-sms-queue-table.js\n');
    }

    await connection.end();

    console.log('🎉 Backend should start successfully!');
    console.log('   Run: npm run dev\n');

  } catch (error) {
    console.error('❌ Database error:', error.message);
    console.log('\n💡 Troubleshooting:');
    console.log('   1. Check MySQL is running');
    console.log('   2. Verify .env database credentials');
    console.log('   3. Ensure guardmap_db database exists\n');
  }
}

testDatabase();
