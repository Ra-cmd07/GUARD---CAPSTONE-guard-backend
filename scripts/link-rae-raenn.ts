// Link Rae Anthony (student) with Raenn (parent)
import pool from '../lib/db';

async function linkRaeToRaenn() {
  console.log('\n🔗 Linking Rae Anthony with parent Raenn...\n');

  try {
    // Check if link already exists
    const [existing]: any = await pool.execute(
      'SELECT * FROM parent_student WHERE parent_id = 7 AND student_id = 2'
    );

    if ((existing as any[]).length > 0) {
      console.log('ℹ️  Link already exists!');
    } else {
      // Create the link
      await pool.execute(
        `INSERT INTO parent_student (parent_id, student_id, relationship)
         VALUES (7, 2, 'Parent')`
      );
      console.log('✅ Parent link created!');
    }

    // Verify the link
    const [result]: any = await pool.execute(
      `SELECT 
         ps.id,
         p.name AS parent_name,
         p.contact_number,
         s.name AS student_name,
         s.rfid_uid,
         ps.relationship
       FROM parent_student ps
       JOIN parents_teachers p ON ps.parent_id = p.id
       JOIN students s ON ps.student_id = s.id
       WHERE ps.student_id = 2`
    );

    console.log('\n📋 Complete Link:');
    console.table(result);

    console.log('\n✅ SUCCESS!');
    console.log('━'.repeat(60));
    console.log('Student: Rae Anthony');
    console.log('RFID: 5C:D0:F9:03');
    console.log('Parent: Raenn');
    console.log('Relationship: Parent');
    console.log('Status: Fully configured!');
    console.log('━'.repeat(60));

    console.log('\n🧪 Test Now:');
    console.log('1. Tap RFID card 5C:D0:F9:03');
    console.log('2. ESP32 should show: "✅ Rae Anthony → Time-In"');
    console.log('3. SMS will be sent to Raenn');
    console.log('4. Check parent portal to verify\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

linkRaeToRaenn();
