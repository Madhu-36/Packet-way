const io = require('socket.io-client');
const socket = io('http://localhost:3001');
socket.on('connect', () => {
  console.log('Connected!');
});
socket.on('packet', (data) => {
  console.log('Packet:', data);
});
setTimeout(() => {
  socket.disconnect();
}, 2000);
