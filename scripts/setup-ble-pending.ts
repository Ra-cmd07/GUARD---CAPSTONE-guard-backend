// Setup BLE Pending Approval System
import pool from '../lib/db';
import fs from 'fs';
import path from 'path';

async function setupBlePending() {
  console.log('\n🔧 Setting up BLE Pending Approval System\n');
  
  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, '../sql/create_ble_pending_system.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0);
    
    for (const statement of statements) {
      if (statement.trim().startsWith('--') || statement.trim().length === 0) continue;
      await pool.execute(statement);
    }
    
    console.log('✅ Created ble_detections table');
    
    // Verify table exists
    const [tables]: any = await pool.execute("SHOW TABLES LIKE 'ble_detections'");
    if (tables.length > 0) {
      console.log('✅ Table verified');
      
      // Show structure
      const [structure]: any = await pool.execute('DESCRIBE ble_detections');
      console.log('\n📋 Table Structure:');
      console.table(structure.map((col: any) => ({
        Field: col.Field,
        Type: col.Type,
        Null: col.Null,
        Key: col.Key,
        Default: col.Default
      })));
    }
    
    console.log('\n✅ BLE Pending Approval System ready!');
    console.log('   ESP32 → Pending → Kiosk Approval → Attendance');
    
  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await pool.end();
  }
}

setupBlePending();
