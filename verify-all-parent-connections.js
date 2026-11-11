require('dotenv').config();
const mysql = require('mysql2/promise');

async function verifyAllParentConnections() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'attendbox_db'
  });

  try {
    console.log('🔍 Verifying all parent-student connections...\n');

    // Get all parents created by the script
    const [parents] = await connection.execute(`
      SELECT p.id, p.name, p.contact, u.username
      FROM parents p
      INNER JOIN users u ON p.user_id = u.id
      WHERE u.username LIKE 'parent%'
      ORDER BY u.username
    `);

    console.log(`✅ Found ${parents.length} parents\n`);

    let connectedCount = 0;
    let notConnectedCount = 0;
    const notConnected = [];

    for (const parent of parents) {
      // Check if parent has a student linked
      const [links] = await connection.execute(`
        SELECT 
          ps.relationship,
          s.id as student_id,
          s.name as student_name,
          u.username as student_username
        FROM parent_student ps
        INNER JOIN students s ON ps.student_id = s.id
        LEFT JOIN users u ON s.user_id = u.id
        WHERE ps.parent_id = ?
      `, [parent.id]);

      if (links.length > 0) {
        connectedCount++;
        console.log(
          `✅ ${parent.username.padEnd(12)} (${parent.name.padEnd(25)}) → ` +
          `${links[0].relationship.padEnd(8)} of ${links[0].student_username || 'N/A'.padEnd(12)} (${links[0].student_name})`
        );
      } else {
        notConnectedCount++;
        notConnected.push(parent);
        console.log(
          `❌ ${parent.username.padEnd(12)} (${parent.name.padEnd(25)}) → ` +
          `NO STUDENT LINKED`
        );
      }
    }

    console.log('\n' + '═'.repeat(100));
    console.log('📊 Summary:');
    console.log('═'.repeat(100));
    console.log(`✅ Connected parents: ${connectedCount}`);
    console.log(`❌ Not connected: ${notConnectedCount}`);
    console.log(`📊 Total parents: ${parents.length}`);

    if (notConnectedCount > 0) {
      console.log('\n⚠️  WARNING: Some parents are not connected to students!');
      console.log('\n❌ Parents without students:');
      console.log('─'.repeat(100));
      notConnected.forEach(parent => {
        console.log(`   ${parent.username.padEnd(12)} | ${parent.name.padEnd(30)} | ${parent.contact}`);
      });
    } else {
      console.log('\n🎉 SUCCESS: All parents are connected to students!');
    }

    // Show distribution
    console.log('\n📊 Student Distribution:');
    console.log('─'.repeat(100));
    
    const [distribution] = await connection.execute(`
      SELECT 
        COUNT(DISTINCT ps.parent_id) as parent_count,
        s.name as student_name,
        u.username as student_username
      FROM parent_student ps
      INNER JOIN students s ON ps.student_id = s.id
      LEFT JOIN users u ON s.user_id = u.id
      WHERE ps.parent_id IN (
        SELECT p.id FROM parents p
        INNER JOIN users u ON p.user_id = u.id
        WHERE u.username LIKE 'parent%'
      )
      GROUP BY s.id, s.name, u.username
      ORDER BY parent_count DESC, s.name
      LIMIT 20
    `);

    console.log('Student Name'.padEnd(30) + ' | Username'.padEnd(15) + ' | # Parents');
    console.log('─'.repeat(100));
    distribution.forEach(row => {
      console.log(
        `${row.student_name.padEnd(30)} | ${(row.student_username || 'N/A').padEnd(15)} | ${row.parent_count}`
      );
    });

    if (distribution.length >= 20) {
      console.log('... (showing top 20)');
    }

    console.log('\n' + '═'.repeat(100));

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await connection.end();
  }
}

verifyAllParentConnections();
