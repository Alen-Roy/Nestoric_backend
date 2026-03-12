const https = require('https');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2OWIyOTRjNjY1Y2FjZWJiYTJlMjRhNjMiLCJlbWFpbCI6Im5pa2lsbnAxMkBnbWFpbC5jb20iLCJyb2xlIjoid29ya2VyIiwiaWF0IjoxNzczMzEyMzU4LCJleHAiOjE3NzU5MDQzNTh9.aGCDy42S_ktk8mUSvnGiezirsKbQdEIj2Uz766kMS6Y';

function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'nestoric-backend.onrender.com',
      path: `/api${path}`,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`GET ${path} -> Status: ${res.statusCode}`);
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('=== GET /requests/my-tasks ===');
  const tasks = await apiGet('/requests/my-tasks');
  console.log(JSON.stringify(tasks, null, 2));

  console.log('\n=== GET /requests ===');
  const reqs = await apiGet('/requests');
  console.log(JSON.stringify(reqs, null, 2));

  console.log('\n=== GET /users/worker-stats ===');
  const stats = await apiGet('/users/worker-stats');
  console.log(JSON.stringify(stats, null, 2));
}

main().catch(console.error);
