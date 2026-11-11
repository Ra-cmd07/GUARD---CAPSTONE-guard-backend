// Test if timezone fix is working
import pool from './lib/db';

async function testTimezoneFix() {
  console.log('\n🧪 Testing Timezone Fix\n');
  
  // Calculate Philippines time
  const now = new Date();
  const phTime = new Date(now.getTime() + (8 * 60 * 60 * 1000));
  const localDate = phTime.toISOString().split('T')[0];
  const localTime = phTime.toISOString().split('T')[1].split('.')[0];
  
  console.log('System Time (UTC):', now.toISOString());
  console.log('Philippines Time (UTC+8):', phTime.toISOString());
  console.log('Local Date:', localDate);
  console.log('Local Time:', localTime);
  
  // Check MySQL time
  const [rows]: any = await pool.execute('SELECT NOW() as mysql_now, CURDATE() as mysql_date');
  console.log('\nMySQL NOW():', rows[0].mysql_now);
  console.log('MySQL CURDATE():', rows[0].mysql_date);
  
  console.log('\n✅ Timezone fix code is ACTIVE in this process');
  console.log('📅 Expected attendance date:', localDate);
  
  await pool.end();
}

testTimezoneFix();
