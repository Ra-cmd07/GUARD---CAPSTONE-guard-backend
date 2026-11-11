// ============================================================================
// Diagnose Parent Portal Attendance Issue
// ============================================================================

import pool from '../lib/db';

async function diagnoseAttendance() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║              Parent Attendance Diagnostic                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Check parent-student link
    console.log('🔍 Step 1: Check Parent-Student Link');
    console.log('─'.repeat(60));
    
    const [parentLinks] = await pool.execute(
      `SELECT ps.*, p.name as parent_name, s.name as student_name 
       FROM parent_student ps
       JOIN parents p ON ps.parent_id = p.id
       JOIN students s ON ps.student_id = s.id`
    ) as any[];

    if ((parentLinks as any[]).length === 0) {
      console.log('❌ NO parent-student links found!');
      console.log('   Fix: Run link-parent-student.ts script\n');
      return;
    }

    (parentLinks as any[]).forEach((link: any) => {
      console.log(`✅ ${link.parent_name} (ID: ${link.parent_id}) → ${link.student_name} (ID: ${link.student_id})`);
    });
    console.log('');

    // 2. Check recent attendance records
    console.log('🔍 Step 2: Check Recent Attendance Records');
    console.log('─'.repeat(60));
    
    const [allAttendance] = await pool.execute(
      `SELECT id, student_id, student_name, date, time_in, time_out, scan_method, timestamp
       FROM attendance 
       ORDER BY timestamp DESC 
       LIMIT 10`
    ) as any[];

    if ((allAttendance as any[]).length === 0) {
      console.log('❌ NO attendance records found in database!');
      console.log('   Issue: Attendance not being saved\n');
      return;
    }

    console.log('Recent attendance records:');
    (allAttendance as any[]).forEach((att: any) => {
      console.log(`  ${att.date} ${att.time_in || 'N/A'} - ${att.student_name} (ID: ${att.student_id || 'NULL'}) - ${att.scan_method}`);
    });
    console.log('');

    // 3. Check BLE attendance specifically
    console.log('🔍 Step 3: Check BLE Attendance');
    console.log('─'.repeat(60));
    
    const [bleAttendance] = await pool.execute(
      `SELECT id, student_id, student_name, date, time_in, scan_method, timestamp
       FROM attendance 
       WHERE scan_method = 'BLE'
       ORDER BY timestamp DESC 
       LIMIT 5`
    ) as any[];

    if ((bleAttendance as any[]).length === 0) {
      console.log('❌ NO BLE attendance records found!');
      console.log('   Issue: BLE attendance not being saved properly');
      console.log('   Check: ESP32 → Backend communication\n');
    } else {
      console.log('BLE attendance records:');
      (bleAttendance as any[]).forEach((att: any) => {
        console.log(`  ✅ ${att.date} ${att.time_in} - ${att.student_name} (ID: ${att.student_id || 'NULL'})`);
      });
      console.log('');
    }

    // 4. Check what parent API would return
    console.log('🔍 Step 4: Simulate Parent API Call');
    console.log('─'.repeat(60));
    
    // Get the first parent-student link for testing
    const testParent = (parentLinks as any[])[0];
    if (testParent) {
      const studentId = testParent.student_id;
      const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 7 days ago
      const to = new Date().toISOString().split('T')[0]; // today
      
      console.log(`Testing API call for Student ID: ${studentId}`);
      console.log(`Date range: ${from} to ${to}`);
      
      const [apiResult] = await pool.execute(
        `SELECT * FROM attendance 
         WHERE student_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC, timestamp DESC`,
        [studentId, from, to]
      ) as any[];

      if ((apiResult as any[]).length === 0) {
        console.log('❌ API would return EMPTY results');
        console.log('   Reasons:');
        console.log('   - student_id is NULL in attendance records');
        console.log('   - Date range doesn\'t match');
        console.log('   - Wrong student ID');
      } else {
        console.log('✅ API would return:');
        (apiResult as any[]).forEach((att: any) => {
          console.log(`  ${att.date} ${att.time_in || 'N/A'} - ${att.student_name} - ${att.scan_method}`);
        });
      }
      console.log('');
    }

    // 5. Check for NULL student_id issue
    console.log('🔍 Step 5: Check for NULL student_id Issue');
    console.log('─'.repeat(60));
    
    const [nullStudentId] = await pool.execute(
      `SELECT COUNT(*) as count FROM attendance WHERE student_id IS NULL`
    ) as any[];

    const nullCount = (nullStudentId as any[])[0].count;
    if (nullCount > 0) {
      console.log(`⚠️  ${nullCount} attendance records have NULL student_id`);
      console.log('   This prevents parent portal from showing them');
      console.log('   Fix needed in attendance insertion code\n');
    } else {
      console.log('✅ All attendance records have valid student_id\n');
    }

    // 6. Recommendations
    console.log('💡 Recommendations:');
    console.log('─'.repeat(60));
    
    if ((bleAttendance as any[]).length === 0) {
      console.log('1. ❌ No BLE attendance found - Check ESP32 → Backend communication');
    } else if (nullCount > 0) {
      console.log('1. ⚠️  Fix NULL student_id in attendance records');
    } else if ((parentLinks as any[]).length === 0) {
      console.log('1. ❌ Create parent-student links');
    } else {
      console.log('1. ✅ System looks good - Check frontend console for API errors');
    }

  } catch (error) {
    console.error('\n❌ Error during diagnosis:', error);
  } finally {
    await pool.end();
  }
}

// Run diagnosis
diagnoseAttendance();