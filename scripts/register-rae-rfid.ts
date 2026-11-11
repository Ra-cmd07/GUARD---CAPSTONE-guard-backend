// Register RFID for Rae Anthony
import pool from '../lib/db';

async function registerRaeRFID() {
  console.log('\n🔧 Registering RFID for Rae Anthony...\n');

  try {
    // Update Rae Anthony's RFID UID
    const [updateResult] = await pool.execute(
      `UPDATE students 
       SET rfid_uid = ?, updated_at = NOW()
       WHERE id = 2`,
      ['5C:D0:F9:03']
    ) as any[];

    console.log(`✅ Updated ${(updateResult as any).affectedRows} record(s)`);

    // Verify the update
    const [student]: any = await pool.execute(
      `SELECT id, name, lrn, rfid_uid, mac_address, grade, section, is_active
       FROM students WHERE id = 2`
    );

    console.log('\n📋 Student Record:');
    console.table(student);

    // Verify parent link
    const [parentLink]: any = await pool.execute(
      `SELECT 
         ps.id,
         s.name AS student_name,
         p.name AS parent_name,
         p.contact_number,
         ps.relationship
       FROM parent_student ps
       JOIN students s ON ps.student_id = s.id
       JOIN parents_teachers p ON ps.parent_id = p.id
       WHERE s.id = 2`
    );

    console.log('\n👨‍👩‍👧 Parent Link:');
    console.table(parentLink);

    console.log('\n✅ SUCCESS!');
    console.log('━'.repeat(60));
    console.log('Student: Rae Anthony');
    console.log('RFID UID: 5C:D0:F9:03');
    console.log('Parent: Raenn');
    console.log('Status: Ready for attendance!');
    console.log('━'.repeat(60));

    console.log('\n🧪 Test Instructions:');
    console.log('1. Make sure backend is running (npm run dev)');
    console.log('2. Tap RFID card 5C:D0:F9:03 on reader');
    console.log('3. Should see: "✅ Rae Anthony → Time-In (AM)"');
    console.log('4. SMS will be sent to Raenn\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

registerRaeRFID();
