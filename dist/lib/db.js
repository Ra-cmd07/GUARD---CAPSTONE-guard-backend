"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promise_1 = __importDefault(require("mysql2/promise"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const pool = promise_1.default.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    timezone: '+08:00', // Philippine Time
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
exports.default = pool;
