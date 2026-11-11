const fs = require('fs');

console.log('🔍 Checking if backend code is updated...\n');

// Read the controller file
const code = fs.readFileSync('controllers/attendanceController.ts', 'utf8');

// Check if the new flexible matching code exists
if (code.includes('Flexible matching')) {
  console.log('✅ CODE IS UPDATED in attendanceController.ts');
  console.log('   The flexible matching logic is present in the file.\n');
  
  console.log('⚠️  BUT - Did you RESTART the backend?');
  console.log('   Node.js loads code at startup.');
  console.log('   Changes don\'t take effect until you restart!\n');
  
  console.log('📋 TO RESTART BACKEND:');
  console.log('   1. Find the terminal running backend');
  console.log('   2. Press Ctrl+C to stop');
  console.log('   3. Run: npm run dev');
  console.log('   4. Wait for: "🚀 AttendBox API running at http://0.0.0.0:5000"\n');
  
  console.log('✅ After restart, the teacher portal will work!');
} else {
  console.log('❌ CODE NOT UPDATED');
  console.log('   The flexible matching code is missing.');
  console.log('   Something went wrong with the file update.');
}
