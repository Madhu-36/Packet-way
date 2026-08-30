const http = require('http');

const payloads = [
  "SELECT * FROM users WHERE username='admin' --",
  "UNION SELECT 1,2,password FROM admins",
  "login=admin&password=mySuperSecretKey123",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
];

payloads.forEach((payload, index) => {
  setTimeout(() => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 3001,
      path: '/api/test',
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (res) => {});
    req.on('error', (e) => {});
    req.write(payload);
    req.end();
    console.log("Sent payload:", payload);
  }, index * 1000);
});
