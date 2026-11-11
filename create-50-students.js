const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Filipino names for variety
const firstNames = [
  'Maria', 'Jose', 'Juan', 'Ana', 'Pedro', 'Rosa', 'Miguel', 'Sofia', 'Carlos', 'Isabella',
  'Diego', 'Gabriela', 'Luis', 'Valentina', 'Rafael', 'Camila', 'Antonio', 'Mariana', 'Jorge', 'Lucia',
  'Manuel', 'Elena', 'Ricardo', 'Victoria', 'Fernando', 'Daniela', 'Roberto', 'Andrea', 'Alejandro', 'Carmen',
  'Francisco', 'Laura', 'Javier', 'Paula', 'Eduardo', 'Sandra', 'Sergio', 'Patricia', 'Oscar', 'Monica',
  'Raul', 'Silvia', 'Andres', 'Teresa', 'Marco', 'Beatriz', 'Pablo', 'Natalia', 'Rodrigo', 'Adriana'
];

const lastNames = [
  'Santos', 'Reyes', 'Cruz', 'Ramos', 'Garcia', 'Mendoza', 'Torres', 'Gonzales', 'Lopez', 'Flores',
  'De Leon', 'Dela Cruz', 'Castillo', 'Alvarez', 'Rivera', 'Morales', 'Villanueva', 'Fernandez', 'Diaz', 'Perez',
  'Aquino', 'Bautista', 'Santiago', 'Navarro', 'Soriano', 'Mercado', 'Valdez', 'Miranda', 'Castro', 'Salazar',
  'Hernandez', 'Pascual', 'Tolentino', 'Manalo', 'Ocampo', 'Aguilar', 'Velasco', 'Rojas', 'Vargas', 'Domingo',
  'Romero', 'Gutierrez', 'Jimenez', 'Ortega', 'Marquez', 'Herrera', 'Silva', 'Medina', 'Cabrera', 'Alonzo'
];

const sections = ['Diamond', 'Ruby', 'Emerald', 'Sapphire', 'Pearl', 'Gold', 'Silver', 'Bronze'];
const grades = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'];
const genders = ['Male', 'Female'];

function generatePhoneNumber() {
  // Generate Philippine mobile number (09XX XXX XXXX)
  const prefixes = ['0917', '0918', '0919', '0920', '0921', '0922', '0923', '0926', '0927', '0928', '0929', '0939', '0947', '0949', '0950', '0951', '0953', '0954'];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(1000000 + Math.random() * 9000000); // 7 digits
  return `${prefix}${suffix}`;
}

function generateLRN(index) {
  // Generate 12-digit LRN starting from a base
  const base = 221234000000;
  return (base + index + 100).toString();
}

function generateRFID() {
  // Generate 10-digit RFID UID
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

function generateBLEMAC() {
  // Generate MAC address format XX:XX:XX:XX:XX:XX
  const hex = () => Math.floor(Math.random() * 256).toString(16).padStart(2, '0').toUpperCase();
  return `${hex()}:${hex()}:${hex()}:${hex()}:${hex()}:${hex()}`;
}

async function createStudents() {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'attendbox_db'
  });

  console.log('🎓 Creating Students 51-100 with Parents...\n');

  const password = '12345678';
  const hashedPassword = await bcrypt.hash(password, 10);

  let successCount = 0;
  const errors = [];

  for (let i = 51; i <= 100; i++) {
    try {
      // Generate student data (cycle through names if needed)
      const firstName = firstNames[(i - 1) % firstNames.length];
      const lastName = lastNames[(i - 1) % lastNames.length];
      const fullName = `${firstName} ${lastName}`;
      const username = `student${i}`;
      const gender = genders[Math.floor(Math.random() * genders.length)];
      const grade = grades[Math.floor(Math.random() * grades.length)];
      const section = sections[Math.floor(Math.random() * sections.length)];
      const lrn = generateLRN(i);
      const rfidUid = generateRFID();
      const macAddress = generateBLEMAC();
      const studentContact = generatePhoneNumber();
      
      // 1. Insert student into users table (role_id: 4 = student)
      const [userResult] = await connection.execute(
        `INSERT INTO users (username, password, role_id, is_active, created_at, updated_at)
         VALUES (?, ?, 4, 1, NOW(), NOW())`,
        [username, hashedPassword]
      );
      const userId = userResult.insertId;

      // 2. Insert into students table
      await connection.execute(
        `INSERT INTO students 
         (user_id, name, lrn, gender, grade, section, rfid_uid, mac_address, contact, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
        [userId, fullName, lrn, gender, grade, section, rfidUid, macAddress, studentContact]
      );

      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE user_id = ?',
        [userId]
      );
      const studentId = studentRows[0].id;

      // 3. Create parent account (role_id: 3 = parent)
      const parentFirstName = gender === 'Male' ? 'Mr.' : 'Mrs.';
      const parentFullName = `${parentFirstName} ${lastName}`;
      const parentUsername = `parent${i}`;
      const parentContact = generatePhoneNumber();

      const [parentUserResult] = await connection.execute(
        `INSERT INTO users (username, password, role_id, is_active, created_at, updated_at)
         VALUES (?, ?, 3, 1, NOW(), NOW())`,
        [parentUsername, hashedPassword]
      );
      const parentUserId = parentUserResult.insertId;

      // 4. Insert into parents table
      await connection.execute(
        `INSERT INTO parents (user_id, name, contact)
         VALUES (?, ?, ?)`,
        [parentUserId, parentFullName, parentContact]
      );

      const [parentRows] = await connection.execute(
        'SELECT id FROM parents WHERE user_id = ?',
        [parentUserId]
      );
      const parentId = parentRows[0].id;

      // 5. Link parent to student
      await connection.execute(
        `INSERT INTO parent_student (parent_id, student_id, relationship)
         VALUES (?, ?, 'Father')`,
        [parentId, studentId]
      );

      successCount++;
      console.log(`✅ ${i}. ${fullName} (${username}) + Parent: ${parentFullName} (${parentUsername})`);
      console.log(`   📱 Student: ${studentContact} | Parent: ${parentContact}`);
      console.log(`   📇 LRN: ${lrn} | RFID: ${rfidUid}`);
      console.log(`   🔵 BLE: ${macAddress}`);
      console.log(`   🎓 ${grade} - ${section}\n`);

    } catch (error) {
      errors.push({ index: i, error: error.message });
      console.error(`❌ ${i}. Failed: ${error.message}\n`);
    }
  }

  await connection.end();

  console.log('\n═══════════════════════════════════════════════════');
  console.log(`✅ Successfully created: ${successCount}/50 students`);
  console.log(`❌ Failed: ${errors.length}/50 students`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n📋 LOGIN CREDENTIALS:');
  console.log('   Students: student51 to student100');
  console.log('   Parents: parent51 to parent100');
  console.log('   Password: 12345678 (all accounts)');
  console.log('\n💡 Each student has:');
  console.log('   • 1 parent account (Father)');
  console.log('   • Unique LRN (for QR scanning)');
  console.log('   • Unique RFID UID (for RFID scanning)');
  console.log('   • Unique BLE MAC address (for BLE scanning)');
  console.log('   • Philippine phone numbers (both student & parent)');
  console.log('═══════════════════════════════════════════════════\n');

  if (errors.length > 0) {
    console.log('⚠️  Errors:');
    errors.forEach(e => console.log(`   ${e.index}: ${e.error}`));
  }
}

createStudents().catch(console.error);
