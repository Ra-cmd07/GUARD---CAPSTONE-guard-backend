require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixBeaconCoordinates() {
  console.log('🔧 Fixing beacon coordinates to proper campus location...\n');

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    // Update all beacons to correct coordinates (on land, not in sea!)
    const updates = [
      {
        beacon_id: 'BEACON_GATE1',
        name: 'Main Gate Entrance',
        location_name: 'Gate 1 - Main Entrance',
        coordinates: '8.4857,124.6565',
        location_type: 'gate',
        building: 'Main Building',
        floor: 'Ground'
      },
      {
        beacon_id: 'BEACON_GATE2',
        name: 'Back Gate',
        location_name: 'Gate 2 - Back Entrance',
        coordinates: '8.4860,124.6570',
        location_type: 'gate',
        building: 'Main Building',
        floor: 'Ground'
      },
      {
        beacon_id: 'BEACON_ROOM201',
        name: 'Grade 7 Classroom',
        location_name: 'Room 201 - Grade 7 Section 1',
        coordinates: '8.4855,124.6568',
        location_type: 'classroom',
        building: 'Academic Building',
        floor: '2nd Floor'
      },
      {
        beacon_id: 'BEACON_CAFETERIA',
        name: 'School Cafeteria',
        location_name: 'Cafeteria',
        coordinates: '8.4858,124.6566',
        location_type: 'cafeteria',
        building: 'Cafeteria Building',
        floor: 'Ground'
      },
      {
        beacon_id: 'BEACON_LIBRARY',
        name: 'School Library',
        location_name: 'Library',
        coordinates: '8.4856,124.6569',
        location_type: 'library',
        building: 'Academic Building',
        floor: '1st Floor'
      },
      {
        beacon_id: 'BEACON_GYM',
        name: 'Gymnasium',
        location_name: 'Gymnasium',
        coordinates: '8.4859,124.6564',
        location_type: 'gym',
        building: 'Sports Complex',
        floor: 'Ground'
      }
    ];

    for (const beacon of updates) {
      await connection.execute(
        `UPDATE ble_beacons 
         SET name = ?, 
             location_name = ?, 
             coordinates = ?,
             location_type = ?,
             building = ?,
             floor = ?
         WHERE beacon_id = ?`,
        [
          beacon.name,
          beacon.location_name,
          beacon.coordinates,
          beacon.location_type,
          beacon.building,
          beacon.floor,
          beacon.beacon_id
        ]
      );
      console.log(`✅ Updated ${beacon.beacon_id}: ${beacon.coordinates}`);
    }

    // Verify the updates
    console.log('\n📍 Current beacon coordinates after fix:\n');
    const [beacons] = await connection.execute(
      'SELECT beacon_id, location_name, coordinates, location_type FROM ble_beacons ORDER BY beacon_id'
    );

    beacons.forEach(beacon => {
      console.log(`${beacon.beacon_id.padEnd(20)} | ${beacon.location_name.padEnd(30)} | ${beacon.coordinates}`);
    });

    console.log('\n✅ All beacons are now on land (campus location)!');
    console.log('🔄 Refresh your parent dashboard to see the updated map.');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

fixBeaconCoordinates();
