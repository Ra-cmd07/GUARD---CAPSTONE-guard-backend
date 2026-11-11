/**
 * Test Cloudinary Upload Manually
 */

const pool = require('./dist/lib/db').default;
const { uploadToCloudinary } = require('./dist/utils/cloudinaryUpload');

async function testUpload() {
  console.log('\n🧪 Testing Cloudinary Upload...\n');

  try {
    // Get a recent record with photo but no cloudinary URL
    const [rows] = await pool.execute(
      `SELECT id, student_name, photo_path 
       FROM partial_attendance 
       WHERE photo_path IS NOT NULL 
       AND cloudinary_url IS NULL 
       ORDER BY created_at DESC 
       LIMIT 1`
    );

    if (rows.length === 0) {
      console.log('❌ No records found with photos to upload');
      process.exit(0);
    }

    const record = rows[0];
    console.log('📋 Found record to test:');
    console.log(`   ID: ${record.id}`);
    console.log(`   Student: ${record.student_name}`);
    console.log(`   Photo: ${record.photo_path}`);
    console.log('');

    // Try to upload to Cloudinary
    console.log('☁️  Attempting Cloudinary upload...');
    const result = await uploadToCloudinary(record.photo_path, record.student_name);

    if (result.success) {
      console.log('✅ Upload successful!');
      console.log(`   Cloudinary URL: ${result.url}`);
      console.log('');

      // Update database
      console.log('💾 Updating database...');
      await pool.execute(
        `UPDATE partial_attendance 
         SET cloudinary_url = ?, cloudinary_uploaded = TRUE 
         WHERE id = ?`,
        [result.url, record.id]
      );
      console.log('✅ Database updated!');
      console.log('');
      console.log('🎉 TEST PASSED - Cloudinary upload is working!');
    } else {
      console.log('❌ Upload failed!');
      console.log(`   Error: ${result.error}`);
      console.log('');
      console.log('🔧 Troubleshooting:');
      console.log('   1. Check Cloudinary credentials in .env');
      console.log('   2. Verify photo file exists on server');
      console.log('   3. Check internet connection');
    }

  } catch (error) {
    console.error('❌ Test failed with error:');
    console.error(error);
  } finally {
    process.exit(0);
  }
}

testUpload();
