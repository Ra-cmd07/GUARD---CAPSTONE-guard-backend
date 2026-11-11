// Add test location data for student Padios
import pool from '../lib/db';

async function addTestLocation() {
  try {
    console.log('\n📍 Adding test location data for Padios...\n');

    // 1. Update student with MAC address
    await pool.execute(
      'UPDATE students SET mac_address = ? WHERE id = ?',
      ['AA:BB:CC:DD:EE:FF', 1]
    );
    console.log('✅ Added MAC address to Padios');

    // 2. Mark all previous locations as inactive
    await pool.execute(
      'UPDATE student_locations SET is_active = 0 WHERE student_id = ?',
      [1]
    );

    // 3. Insert current location at Gate 1
    await pool.execute(
      `INSERT INTO student_locations 
       (student_id, student_name, mac_address, beacon_id, location_name, location_type, coordinates)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [1, 'Padios', 'AA:BB:CC:DD:EE:FF', 'BEACON_GATE1', 'Gate 1 - Main Entrance', 'gate', '8.4857,124.6565']
    );
    console.log('✅ Added current location: Gate 1 - Main Entrance');

    // 4. Insert some historical locations
    const history = [
      { beacon: 'BEACON_ROOM201', name: 'Room 201 - Grade 7 Section 1', type: 'classroom', coords: '8.4855,124.6568', mins: 120 },
      { beacon: 'BEACON_CAFETERIA', name: 'Cafeteria', type: 'cafeteria', coords: '8.4858,124.6566', mins: 180 },
      { beacon: 'BEACON_GATE1', name: 'Gate 1 - Main Entrance', type: 'gate', coords: '8.4857,124.6565', mins: 240 },
    ];

    for (const loc of history) {
      const timestamp = new Date(Date.now() - loc.mins * 60 * 1000);
      await pool.execute(
        `INSERT INTO student_locations 
         (student_id, student_name, mac_address, beacon_id, location_name, location_type, coordinates, timestamp, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [1, 'Padios', 'AA:BB:CC:DD:EE:FF', loc.beacon, loc.name, loc.type, loc.coords, timestamp, 0]
      );
    }
    console.log('✅ Added location history (last 4 hours)');

    // 5. Verify
    const [current] = await pool.execute(
      'SELECT * FROM v_student_current_location WHERE student_id = ?',
      [1]
    ) as any[];

    console.log('\n📍 Current Location:');
    console.table(current);

    console.log('\n🎉 Test location data added successfully!');
    console.log('\n👉 Now login as parent "Fin" and go to Location tab to see the map!\n');

    await pool.end();
  } catch (err) {
    console.error('❌ Error:', err);
    await pool.end();
    process.exit(1);
  }
}

addTestLocation();
