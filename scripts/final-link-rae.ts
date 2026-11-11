// Final: Link Rae Anthony (student ID 2) with Raenn (parent ID 2)
import pool from '../lib/db';

async function finalLink() {
  console.log('\n🔗 Creating parent-student link...\n');

  try {
    // Create the link (parent ID 2 = Raenn, student ID 2 = Rae Anthony)
    await pool.execute(
      `INSERT INTO parent_student (parent_id, student_id, relationship)
       VALUES (2, 2, 'Parent')`
    );
    
    console.log('✅ Link created successfully!');

    // Verify the complete setup
    const [result]: any = await pool.execute(
      `SELECT 
         ps.id AS link_id,
         p.name AS parent_name,
         p.contact AS parent_phone,
         s.name AS student_name,
         s.rfid_uid AS student_rfid,
         s.grade,
         s.section,
         ps.relationship
       FROM parent_student ps
       JOIN parents p ON ps.parent_id = p.id
       JOIN students s ON ps.student_id = s.id
       WHERE ps.student_id = 2`
    );

    console.log('\n✅ Complete Setup:');
    console.table(result);

    console.log('\n━'.repeat(60));
    console.log('✅ RAE ANTHONY - FULLY CONFIGURED!');
    console.log('━'.repeat(60));
    console.log('Student: Rae Anthony (ID: 2)');
    console.log('RFID: 5C:D0:F9:03');
    console.log('Parent: Raenn (ID: 2)');
    console.log('Phone: 0967 367 3637');
    console.log('Relationship: Parent');
    console.log('Grade: Grade 8');
    console.log('Section: Floor');
    console.log('Status: ✅ READY FOR ATTENDANCE!');
    console.log('━'.repeat(60));

    console.log('\n🧪 TEST NOW:');
    console.log('1. Make sure backend is running');
    console.log('2. Upload Arduino sketch with IP: 10.188.5.63');
    console.log('3. Tap RFID card: 5C:D0:F9:03');
    console.log('4. ESP32 should show: "✅ Rae Anthony → Time-In (AM)"');
    console.log('5. SMS will be sent to: 0967 367 3637');
    console.log('6. Check parent portal (login as Raenn)\n');

  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      console.log('ℹ️  Link already exists!');
      
      // Show existing link
      const [result]: any = await pool.execute(
        `SELECT ps.*, p.name as parent_name, s.name as student_name
         FROM parent_student ps
         JOIN parents p ON ps.parent_id = p.id
         JOIN students s ON ps.student_id = s.id
         WHERE ps.student_id = 2`
      );
      console.table(result);
    } else {
      console.error('❌ Error:', error);
    }
  } finally {
    await pool.end();
  }
}

finalLink();
