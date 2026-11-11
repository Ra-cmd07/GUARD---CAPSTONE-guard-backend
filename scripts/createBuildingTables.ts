import pool from '../lib/db';
import fs from 'fs';
import path from 'path';

async function createBuildingTables() {
  try {
    console.log('📦 Creating building/floor/room tables...');
    
    const sqlPath = path.join(__dirname, '../../CREATE_BUILDING_FLOOR_ROOM_TABLES.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Split by semicolon and filter empty statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      if (statement.trim()) {
        await pool.query(statement);
        console.log('✅ Executed:', statement.substring(0, 50) + '...');
      }
    }
    
    console.log('🎉 All tables created successfully!');
    
    // Verify the data
    const [buildings] = await pool.query('SELECT * FROM buildings');
    const [floors] = await pool.query('SELECT * FROM building_floors');
    const [rooms] = await pool.query('SELECT * FROM building_rooms');
    
    console.log('\n📊 Summary:');
    console.log(`  Buildings: ${(buildings as any[]).length}`);
    console.log(`  Floors: ${(floors as any[]).length}`);
    console.log(`  Rooms: ${(rooms as any[]).length}`);
    
    console.log('\n🏢 Buildings:');
    console.log(buildings);
    
    console.log('\n🏢 Floors:');
    console.log(floors);
    
    console.log('\n🚪 Rooms:');
    console.log(rooms);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating tables:', error);
    process.exit(1);
  }
}

createBuildingTables();
