const axios = require('axios');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const https = require('https');

dotenv.config();

const SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key_here';
const API = (process.env.VITE_API_URL || 'https://localhost:5000') + '/api';

async function run() {
  try {
    const token = jwt.sign({ id: 1, username: 'admin', role: 'admin' }, SECRET);
    console.log('Using token:', token.slice(0, 40) + '...');

    const agent = new https.Agent({ rejectUnauthorized: false });

    const meta = await axios.get(API + '/admin/assignments/metadata', { headers: { Authorization: `Bearer ${token}` }, httpsAgent: agent });
    console.log('\nMetadata: teachers:', meta.data.teachers?.length, 'students:', meta.data.students?.length);

    const list = await axios.get(API + '/admin/assignments', { headers: { Authorization: `Bearer ${token}` }, httpsAgent: agent });
    console.log('\nAssignments count:', (list.data || []).length);
    console.log('Sample assignment (first):', (list.data && list.data[0]) || 'none');
  } catch (err) {
    console.error('Check failed:');
    if (err.response) {
      console.error('  status:', err.response.status);
      console.error('  body:', JSON.stringify(err.response.data, null, 2));
    } else {
      console.error(err.stack || err.message || err);
    }
    process.exit(1);
  }
}

run();
