const axios = require('axios');

(async () => {
  try {
    // First login to get token
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'parent@example.com',
      password: 'password123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Logged in successfully');
    
    // Get student attendance
    const attRes = await axios.get('http://localhost:5000/api/students/3/attendance?from=2026-07-16&to=2026-07-16', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('\n=== ATTENDANCE RECORDS (3 most recent) ===\n');
    
    attRes.data.slice(0, 3).forEach((record, i) => {
      console.log(`--- Record ${i + 1} (ID: ${record.id}) ---`);
      console.log(`Student: ${record.student_name}`);
      console.log(`Date: ${record.date}`);
      console.log(`Status: ${record.status}`);
      console.log(`Time In: ${record.time_in || 'N/A'}`);
      console.log(`Time Out: ${record.time_out || 'N/A'}`);
      console.log(`Method: ${record.scan_method}`);
      console.log(`Photo Path: ${record.photo_path || 'NULL'}`);
      console.log(`Has photo_path field: ${record.hasOwnProperty('photo_path')}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
})();
