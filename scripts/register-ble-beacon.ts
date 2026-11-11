// ============================================================================
// Register BLE Beacon to Student
// ============================================================================

import pool from '../lib/db';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(prompt, resolve);
  });
}

async function registerBeacon() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║           Register BLE Beacon to Student                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Show all students
    console.log('📋 Current Students:');
    console.log('─'.repeat(60));
    
    const [students] = await pool.execute(
      `SELECT id, name, grade, section, mac_address 
       FROM students 
       WHERE is_active = 1 
       ORDER BY name`
    ) as any[];

    if ((students as any[]).length === 0) {
      console.log('❌ No students found in database');
      process.exit(1);
    }

    (students as any[]).forEach((s: any) => {
      const mac = s.mac_address || 'NOT SET';
      console.log(`  ${s.id}. ${s.name} (${s.grade}-${s.section}) - MAC: ${mac}`);
    });

    console.log('');

    // Get MAC address from user (or from Serial Monitor)
    const macAddress = await question('Enter BLE Beacon MAC Address (e.g., F7:6C:A5:11:0A:F7): ');
    
    if (!macAddress || macAddress.length < 12) {
      console.log('❌ Invalid MAC address format');
      process.exit(1);
    }

    // Normalize MAC address
    const normalizedMac = macAddress.toUpperCase().trim();

    // Check if MAC already registered
    const [existing] = await pool.execute(
      'SELECT id, name FROM students WHERE mac_address = ?',
      [normalizedMac]
    ) as any[];

    if ((existing as any[]).length > 0) {
      const student = (existing as any[])[0];
      console.log(`\n⚠️  MAC address already registered to: ${student.name} (ID: ${student.id})`);
      const overwrite = await question('Overwrite? (yes/no): ');
      if (overwrite.toLowerCase() !== 'yes') {
        console.log('❌ Cancelled');
        process.exit(0);
      }
    }

    // Get student ID
    const studentIdStr = await question('\nEnter Student ID to assign this beacon: ');
    const studentId = parseInt(studentIdStr);

    if (isNaN(studentId)) {
      console.log('❌ Invalid student ID');
      process.exit(1);
    }

    // Verify student exists
    const [studentCheck] = await pool.execute(
      'SELECT id, name FROM students WHERE id = ?',
      [studentId]
    ) as any[];

    if ((studentCheck as any[]).length === 0) {
      console.log(`❌ Student with ID ${studentId} not found`);
      process.exit(1);
    }

    const student = (studentCheck as any[])[0];

    // Update student with beacon MAC
    await pool.execute(
      'UPDATE students SET mac_address = ? WHERE id = ?',
      [normalizedMac, studentId]
    );

    console.log('\n✅ SUCCESS!');
    console.log('─'.repeat(60));
    console.log(`Student: ${student.name} (ID: ${studentId})`);
    console.log(`Beacon MAC: ${normalizedMac}`);
    console.log('─'.repeat(60));
    console.log('\n📱 Test the beacon:');
    console.log('1. Hold BLE beacon near ESP32');
    console.log('2. Check Serial Monitor for detection');
    console.log('3. Should see: "✅ [Student Name] → [Location]"');
    console.log('4. Check kiosk display for attendance record\n');

  } catch (error) {
    console.error('\n❌ Error:', error);
  } finally {
    await pool.end();
    rl.close();
  }
}

// Run the script
registerBeacon();
