const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://nestoricdigital_db_user:cO3hHibiA3ijqkAy@appnestoric.sjy9bpo.mongodb.net/?appName=AppNestoric').then(async () => {
  const db = mongoose.connection.db;
  
  // Get all requests with assignedWorkerId
  const requests = await db.collection('requests').find({ assignedWorkerId: { $ne: null } }).toArray();
  console.log('=== Requests with assigned workers:', requests.length, '===');
  requests.forEach(r => {
    console.log('  Request:', r._id.toString());
    console.log('    Status:', r.status);
    console.log('    assignedWorkerId:', r.assignedWorkerId);
    console.log('    assignedWorkerId type:', typeof r.assignedWorkerId);
    console.log('    assignedWorkerId constructor:', r.assignedWorkerId?.constructor?.name);
    console.log('    clientName:', r.clientName);
    console.log('');
  });

  // Get all workers
  const workers = await db.collection('users').find({ role: 'worker' }).toArray();
  console.log('=== Workers:', workers.length, '===');
  workers.forEach(w => {
    console.log('  Worker:', w._id.toString());
    console.log('    Name:', w.fullName);
    console.log('    Email:', w.email);
    console.log('    isEmailVerified:', w.isEmailVerified);
    console.log('    _id type:', typeof w._id);
    console.log('    _id constructor:', w._id?.constructor?.name);
    console.log('');
  });

  // Check if any assigned worker IDs match actual worker IDs
  const workerIds = workers.map(w => w._id.toString());
  console.log('=== Cross-check ===');
  requests.forEach(r => {
    const assignedId = r.assignedWorkerId?.toString();
    const matches = workerIds.includes(assignedId);
    console.log('  Request', r._id.toString(), '-> assignedWorkerId:', assignedId, '-> matches worker:', matches);
  });

  // Also get ALL requests to see total
  const allRequests = await db.collection('requests').find({}).toArray();
  console.log('\n=== All requests:', allRequests.length, '===');
  allRequests.forEach(r => {
    console.log('  ', r._id.toString(), '| status:', r.status, '| assignedWorkerId:', r.assignedWorkerId || 'null');
  });

  mongoose.disconnect();
}).catch(e => console.error(e));
