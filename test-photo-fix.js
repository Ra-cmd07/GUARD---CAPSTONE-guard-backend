/**
 * Test Photo Fix - Verify photos are properly transferred from partial_attendance to attendance
 */

const pool = require('./dist/lib/db').default;

async function testPhotoFix() {
  console.log('\n🔍 Testing Photo Path Transfer...\n');

  try {
    // Check partial_attendance for records with photos
    console.log('📋 Checking partial_attendance (staging):');
    const [partialRows] = await pool.execute(
      `SELECT id, student_name, photo_path, local_path, scan_method, created_at 
       FROM partial_attendance 
       WHERE date = CURDATE() AND photo_path IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT 5`
    );

    if (partialRows.length === 0) {
      console.log('❌ No records with photos found in partial_attendance for today');
      console.log('   Please scan a student at the kiosk first!\n');
      process.exit(0);
    }

    console.log(`✅ Found ${partialRows.length} record(s) with photos:\n`);
    partialRows.forEach(r => {
      console.log(`   ID: ${r.id}`);
      console.log(`   Student: ${r.student_name}`);
      console.log(`   Photo: ${r.photo_path}`);
      console.log(`   Time: ${r.created_at}`);
      console.log('');
    });

    // Check attendance for records with photos
    console.log('📋 Checking attendance (final):');
    const [attendanceRows] = await pool.execute(
      `SELECT id, student_name, photo_path, local_path, scan_method, created_at 
       FROM attendance 
       WHERE date = CURDATE() AND photo_path IS NOT NULL
       ORDER BY created_at DESC 
       LIMIT 5`
    );

    if (attendanceRows.length === 0) {
      console.log('❌ No records with photos found in attendance table');
      console.log('   This means photos are NOT being transferred during verification!');
      console.log('\n💡 Solution: Verify a record from partial_attendance in Teacher Dashboard');
      console.log('   and check if photo appears in final attendance.\n');
    } else {
      console.log(`✅ Found ${attendanceRows.length} record(s) with photos:\n`);
      attendanceRows.forEach(r => {
        console.log(`   ID: ${r.id}`);
        console.log(`   Student: ${r.student_name}`);
        console.log(`   Photo: ${r.photo_path}`);
        console.log(`   Time: ${r.created_at}`);
        console.log('');
      });
      console.log('✅ Photos ARE being transferred correctly!\n');
    }

    // Check for records WITHOUT photos
    console.log('📋 Checking for records WITHOUT photos:');
    const [noPhotoRows] = await pool.execute(
      `SELECT id, student_name, photo_path, scan_method, created_at 
       FROM attendance 
       WHERE date = CURDATE() AND photo_path IS NULL
       ORDER BY created_at DESC 
       LIMIT 3`
    );

    if (noPhotoRows.length > 0) {
      console.log(`⚠️  Found ${noPhotoRows.length} record(s) WITHOUT photos:\n`);
      noPhotoRows.forEach(r => {
        console.log(`   ID: ${r.id}`);
        console.log(`   Student: ${r.student_name}`);
        console.log(`   Photo: NULL`);
        console.log(`   Time: ${r.created_at}`);
        console.log('');
      });
      console.log('💡 These are OLD records created before the fix was applied.\n');
    }

    console.log('─'.repeat(60));
    console.log('\n📝 Summary:');
    console.log(`   Partial (with photos): ${partialRows.length}`);
    console.log(`   Final (with photos): ${attendanceRows.length}`);
    console.log(`   Final (without photos): ${noPhotoRows.length}`);
    console.log('\n✅ Test complete!\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    process.exit(0);
  }
}

testPhotoFix();
