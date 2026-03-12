const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = 'NestoricDigi';

// Create a token for the worker
const workerId = '69b294c665cacebba2e24a63';
const token = jwt.sign(
  { userId: workerId, email: 'nikilnp12@gmail.com', role: 'worker' },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('Worker JWT:', token);
console.log('');

// Now test the API
const https = require('https');

function apiGet(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'nestoric-backend.onrender.com',
      path: `/api${path}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`GET ${path} -> Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          console.log(JSON.stringify(parsed, null, 2));
        } catch(e) {
          console.log('Raw:', data);
        }
        resolve();
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('Testing /requests/my-tasks...');
  await apiGet('/requests/my-tasks', token);
  console.log('\n---\n');
  console.log('Testing /requests (general endpoint)...');
  await apiGet('/requests', token);
}

main().catch(console.error);
