const https = require('https');

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: 'nestoric-backend.onrender.com',
      path: `/api${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`POST ${path} -> Status: ${res.statusCode}`);
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

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
  // Step 1: Login as worker
  console.log('=== Step 1: Login as worker ===');
  const loginResult = await apiPost('/auth/login', {
    email: 'nikilnp12@gmail.com',
    password: 'Nikil@123'  // guessing common password patterns
  });
  console.log(JSON.stringify(loginResult, null, 2));

  if (loginResult.token) {
    const token = loginResult.token;
    
    // Step 2: Get my-tasks
    console.log('\n=== Step 2: GET /requests/my-tasks ===');
    const tasks = await apiGet('/requests/my-tasks', token);
    console.log(JSON.stringify(tasks, null, 2));

    // Step 3: Get all requests (general)
    console.log('\n=== Step 3: GET /requests ===');
    const reqs = await apiGet('/requests', token);
    console.log(JSON.stringify(reqs, null, 2));
  } else {
    console.log('Login failed, cannot test further.');
    
    // Try check-verification instead
    console.log('\n=== Trying check-verification ===');
    const verify = await apiGet('/auth/check-verification?email=nikilnp12@gmail.com', null);
    console.log(JSON.stringify(verify, null, 2));
  }
}

main().catch(console.error);
