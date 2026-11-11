async function testLogin() {
  try {
    console.log('\n🔧 Testing login API at http://localhost:5000/api/auth/login\n');
    
    const response = await fetch('http://localhost:5000/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: 'admin',
        password: 'admin123'
      })
    });

    const data = await response.json();

    if (response.ok) {
      console.log('✅ Login successful!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.error('❌ Login failed!');
      console.error('Status:', response.status);
      console.error('Data:', JSON.stringify(data, null, 2));
    }
  } catch (error: any) {
    console.error('❌ Connection error!');
    console.error('Error:', error.message);
    console.error('Is the backend running on port 5000?');
  }
}

testLogin();
