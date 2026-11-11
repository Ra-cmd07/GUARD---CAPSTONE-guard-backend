// Test parent login and data retrieval
import axios from 'axios';

const BASE_URL = 'http://localhost:5000/api';

async function testParentLogin() {
  try {
    console.log('\n🔐 === TESTING PARENT LOGIN ===');
    console.log('Logging in as parent "Fin"...\n');

    // Login
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      username: 'Fin',
      password: 'fin123'
    });

    console.log('✅ Login successful!');
    console.log('User data:', JSON.stringify(loginRes.data.user, null, 2));
    const token = loginRes.data.token;
    const profileId = loginRes.data.user.profileId;

    console.log(`\n👤 Profile ID: ${profileId}`);
    console.log(`🔑 Token: ${token.substring(0, 20)}...`);

    // Get students (children)
    console.log('\n📚 === FETCHING CHILDREN (STUDENTS) ===');
    const studentsRes = await axios.get(`${BASE_URL}/students`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`✅ Found ${studentsRes.data.length} child(ren):`);
    console.log(JSON.stringify(studentsRes.data, null, 2));

    if (studentsRes.data.length > 0) {
      const studentId = studentsRes.data[0].id;
      console.log(`\n📊 === FETCHING ATTENDANCE FOR STUDENT ${studentId} ===`);
      
      const attendanceRes = await axios.get(`${BASE_URL}/students/${studentId}/attendance`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log(`✅ Found ${attendanceRes.data.length} attendance record(s):`);
      console.log(JSON.stringify(attendanceRes.data, null, 2));
    }

  } catch (err: any) {
    if (err.response) {
      console.error('❌ API Error:', err.response.status, err.response.data);
    } else {
      console.error('❌ Error:', err.message);
    }
  }
}

testParentLogin();
