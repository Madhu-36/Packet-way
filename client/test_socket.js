import { io } from 'socket.io-client';
const socket = io('http://localhost:3001');
socket.on('connect', () => console.log('Connected to server'));
socket.on('packet', (data) => console.log('Packet:', data));
setTimeout(() => { socket.disconnect(); process.exit(0); }, 3000);
