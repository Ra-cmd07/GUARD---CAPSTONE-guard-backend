const mysql = require('mysql2/promise');
require('dotenv').config();

async function insertFloorPlan() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  console.log('📐 Inserting floor plan...\n');

  // Insert floor plan for Room 1, Floor 1
  await connection.query(`
    INSERT INTO room_floor_plans (room_id, image_path, zoom_level, opacity)
    SELECT 
      br.id,
      'classroom-floorplan.png',
      30,
      0.80
    FROM building_rooms br
    JOIN building_floors bf ON bf.id = br.floor_id
    JOIN buildings b ON b.id = bf.building_id
    WHERE b.name = 'Library'
      AND bf.floor_number = 1
      AND br.room_number = 1
    LIMIT 1
  `);

  console.log('✅ Floor plan inserted successfully\n');

  // Verify
  const [rows] = await connection.query(`
    SELECT 
      rfp.id,
      rfp.image_path,
      rfp.zoom_level,
      rfp.opacity,
      br.room_name,
      bf.floor_name,
      b.name as building_name
    FROM room_floor_plans rfp
    JOIN building_rooms br ON br.id = rfp.room_id
    JOIN building_floors bf ON bf.id = br.floor_id
    JOIN buildings b ON b.id = bf.building_id
  `);

  console.log('📊 Floor Plans:');
  console.table(rows);

  await connection.end();
  process.exit(0);
}

insertFloorPlan().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
