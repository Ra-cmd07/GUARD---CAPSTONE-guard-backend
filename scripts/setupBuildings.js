const mysql = require('mysql2/promise');
require('dotenv').config();

async function setup() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db',
  });

  console.log('📦 Creating tables...\n');

  // Create buildings table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS buildings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      latitude DECIMAL(10, 8) NOT NULL,
      longitude DECIMAL(11, 8) NOT NULL,
      bounds_north DECIMAL(10, 8) NOT NULL,
      bounds_south DECIMAL(10, 8) NOT NULL,
      bounds_east DECIMAL(11, 8) NOT NULL,
      bounds_west DECIMAL(11, 8) NOT NULL,
      min_zoom INT DEFAULT 18,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Created buildings table');

  // Create floors table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS building_floors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      building_id INT NOT NULL,
      floor_number INT NOT NULL,
      floor_name VARCHAR(50) NOT NULL,
      zoom_level INT DEFAULT 20,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE,
      UNIQUE KEY unique_floor (building_id, floor_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Created building_floors table');

  // Create rooms table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS building_rooms (
      id INT AUTO_INCREMENT PRIMARY KEY,
      floor_id INT NOT NULL,
      room_name VARCHAR(50) NOT NULL,
      room_number INT NOT NULL,
      esp32_ip VARCHAR(45) NOT NULL,
      bounds_north DECIMAL(10, 8) NULL,
      bounds_south DECIMAL(10, 8) NULL,
      bounds_east DECIMAL(11, 8) NULL,
      bounds_west DECIMAL(11, 8) NULL,
      zoom_level INT DEFAULT 25,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (floor_id) REFERENCES building_floors(id) ON DELETE CASCADE,
      UNIQUE KEY unique_room (floor_id, room_number)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Created building_rooms table');

  // Create floor plans table
  await connection.query(`
    CREATE TABLE IF NOT EXISTS room_floor_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      room_id INT NOT NULL,
      image_path VARCHAR(255) NOT NULL,
      zoom_level INT DEFAULT 30,
      opacity DECIMAL(3, 2) DEFAULT 0.80,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (room_id) REFERENCES building_rooms(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('✅ Created room_floor_plans table');

  console.log('\n📦 Inserting data...\n');

  // Insert Library building
  const [buildingResult] = await connection.query(`
    INSERT INTO buildings (name, latitude, longitude, bounds_north, bounds_south, bounds_east, bounds_west, min_zoom)
    VALUES ('Library', 8.4731326, 124.6498873, 8.4732000, 8.4730652, 124.6500000, 124.6497746, 18)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `);
  const buildingId = buildingResult.insertId || (await connection.query(`SELECT id FROM buildings WHERE name='Library'`))[0][0].id;
  console.log('✅ Inserted Library building (ID:', buildingId, ')');

  // Insert Floor 1
  const [floor1Result] = await connection.query(`
    INSERT INTO building_floors (building_id, floor_number, floor_name, zoom_level)
    VALUES (?, 1, 'Floor 1', 20)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `, [buildingId]);
  const floor1Id = floor1Result.insertId || (await connection.query(`SELECT id FROM building_floors WHERE building_id=? AND floor_number=1`, [buildingId]))[0][0].id;
  console.log('✅ Inserted Floor 1 (ID:', floor1Id, ')');

  // Insert Floor 2
  const [floor2Result] = await connection.query(`
    INSERT INTO building_floors (building_id, floor_number, floor_name, zoom_level)
    VALUES (?, 2, 'Floor 2', 20)
    ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)
  `, [buildingId]);
  const floor2Id = floor2Result.insertId || (await connection.query(`SELECT id FROM building_floors WHERE building_id=? AND floor_number=2`, [buildingId]))[0][0].id;
  console.log('✅ Inserted Floor 2 (ID:', floor2Id, ')');

  // Insert rooms for Floor 1
  await connection.query(`
    INSERT INTO building_rooms (floor_id, room_name, room_number, esp32_ip, zoom_level)
    VALUES 
      (?, 'Room 1', 1, '10.67.214.23', 25),
      (?, 'Room 2', 2, '0.0.0.0', 25),
      (?, 'Room 3', 3, '0.0.0.0', 25),
      (?, 'Room 4', 4, '0.0.0.0', 25)
    ON DUPLICATE KEY UPDATE esp32_ip=VALUES(esp32_ip)
  `, [floor1Id, floor1Id, floor1Id, floor1Id]);
  console.log('✅ Inserted 4 rooms for Floor 1');

  // Insert rooms for Floor 2
  await connection.query(`
    INSERT INTO building_rooms (floor_id, room_name, room_number, esp32_ip, zoom_level)
    VALUES 
      (?, 'Room 1', 1, '0.0.0.0', 25),
      (?, 'Room 2', 2, '0.0.0.0', 25),
      (?, 'Room 3', 3, '0.0.0.0', 25),
      (?, 'Room 4', 4, '0.0.0.0', 25)
    ON DUPLICATE KEY UPDATE esp32_ip=VALUES(esp32_ip)
  `, [floor2Id, floor2Id, floor2Id, floor2Id]);
  console.log('✅ Inserted 4 rooms for Floor 2');

  console.log('\n🎉 Setup complete!\n');

  // Show summary
  const [buildings] = await connection.query('SELECT * FROM buildings');
  const [floors] = await connection.query('SELECT * FROM building_floors');
  const [rooms] = await connection.query('SELECT * FROM building_rooms');

  console.log('📊 Summary:');
  console.log(`  Buildings: ${buildings.length}`);
  console.log(`  Floors: ${floors.length}`);
  console.log(`  Rooms: ${rooms.length}\n`);

  console.log('🏢 Rooms:');
  console.table(rooms);

  await connection.end();
  process.exit(0);
}

setup().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
