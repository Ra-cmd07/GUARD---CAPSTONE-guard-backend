const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function addSecondParentForBernie() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'guardmap_db',
  });

  try {
    console.log('👨‍👩‍👦 Adding second parent for Bernie...\n');

    // 1. Find Bernie's student ID
    const [bernieRows] = await conn.execute(
      'SELECT id, name, lrn FROM students WHERE name LIKE ?',
      ['%Bernie%']
    );

    if (bernieRows.length === 0) {
      console.log('❌ Bernie not found!');
      return;
    }

    const bernie = bernieRows[0];
    console.log(`✅ Found Bernie: ${bernie.name} (ID: ${bernie.id}, LRN: ${bernie.lrn})`);

    // 2. Check current parents
    const [currentParents] = await conn.execute(
      `SELECT p.id, p.name, ps.relationship 
       FROM parent_student ps
       INNER JOIN parents p ON ps.parent_id = p.id
       WHERE ps.student_id = ?`,
      [bernie.id]
    );

    console.log(`\n📋 Current parents for Bernie:`);
    currentParents.forEach(p => {
      console.log(`   - ${p.name} (${p.relationship})`);
    });

    // 3. Find Fin's details to create appropriate second parent
    const [finRows] = await conn.execute(
      'SELECT id, name FROM parents WHERE name LIKE ?',
      ['%Finnan%']
    );

    if (finRows.length === 0) {
      console.log('❌ Fin not found!');
      return;
    }

    const fin = finRows[0];
    const finRelationship = currentParents.find(p => p.id === fin.id)?.relationship || 'Father';

    // Determine second parent details
    const secondParentGender = finRelationship === 'Father' ? 'Female' : 'Male';
    const secondParentRelationship = finRelationship === 'Father' ? 'Mother' : 'Father';
    const secondParentName = finRelationship === 'Father' ? 'Maria Sanders' : 'John Sanders';
    const secondParentUsername = finRelationship === 'Father' ? 'maria_sanders' : 'john_sanders';

    console.log(`\n👤 Creating second parent: ${secondParentName} (${secondParentRelationship})`);

    // 4. Check if user already exists
    const [existingUser] = await conn.execute(
      'SELECT id FROM users WHERE username = ?',
      [secondParentUsername]
    );

    let userId;
    if (existingUser.length > 0) {
      userId = existingUser[0].id;
      console.log(`   ℹ️  User account already exists (ID: ${userId})`);
    } else {
      // Create user account
      const hashedPassword = await bcrypt.hash('12345678', 10);
      const [userResult] = await conn.execute(
        'INSERT INTO users (username, password, role_id, is_active) VALUES (?, ?, ?, ?)',
        [secondParentUsername, hashedPassword, 3, 1] // role_id 3 = parent
      );
      userId = userResult.insertId;
      console.log(`   ✅ Created user account (ID: ${userId})`);
    }

    // 5. Check if parent profile already exists
    const [existingParent] = await conn.execute(
      'SELECT id FROM parents WHERE user_id = ?',
      [userId]
    );

    let parentId;
    if (existingParent.length > 0) {
      parentId = existingParent[0].id;
      console.log(`   ℹ️  Parent profile already exists (ID: ${parentId})`);
    } else {
      // Create parent profile
      const [parentResult] = await conn.execute(
        `INSERT INTO parents (user_id, name, contact, address) 
         VALUES (?, ?, ?, ?)`,
        [userId, secondParentName, '+63 917 123 4567', 'Iponan, Cagayan de Oro City']
      );
      parentId = parentResult.insertId;
      console.log(`   ✅ Created parent profile (ID: ${parentId})`);
    }

    // 6. Check if already linked to Bernie
    const [existingLink] = await conn.execute(
      'SELECT id FROM parent_student WHERE parent_id = ? AND student_id = ?',
      [parentId, bernie.id]
    );

    if (existingLink.length > 0) {
      console.log(`   ℹ️  Already linked to Bernie`);
    } else {
      // Link parent to Bernie
      await conn.execute(
        'INSERT INTO parent_student (parent_id, student_id, relationship) VALUES (?, ?, ?)',
        [parentId, bernie.id, secondParentRelationship]
      );
      console.log(`   ✅ Linked to Bernie as ${secondParentRelationship}`);
    }

    // 7. Verify final parent list
    const [finalParents] = await conn.execute(
      `SELECT p.id, p.name, ps.relationship, u.username
       FROM parent_student ps
       INNER JOIN parents p ON ps.parent_id = p.id
       INNER JOIN users u ON p.user_id = u.id
       WHERE ps.student_id = ?
       ORDER BY ps.relationship`,
      [bernie.id]
    );

    console.log(`\n✅ SUCCESS! Bernie now has ${finalParents.length} parent(s):`);
    finalParents.forEach((p, index) => {
      console.log(`   ${index + 1}. ${p.name} (${p.relationship}) - username: ${p.username}`);
    });

    console.log(`\n🔑 Login credentials for second parent:`);
    console.log(`   Username: ${secondParentUsername}`);
    console.log(`   Password: 12345678`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await conn.end();
  }
}

addSecondParentForBernie();
