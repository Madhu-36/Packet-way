const fs = require('fs');
const { createCanvas } = require('canvas');

const dir = './client/public/vehicles';
if (!fs.existsSync(dir)){
    fs.mkdirSync(dir, { recursive: true });
}

function drawSedan() {
    const canvas = createCanvas(120, 56);
    const ctx = canvas.getContext('2d');
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    
    // Body gradient (Metallic grey)
    const grad = ctx.createLinearGradient(0, 0, 0, 56);
    grad.addColorStop(0, '#2d3748');
    grad.addColorStop(0.5, '#718096');
    grad.addColorStop(1, '#1a202c');
    
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(10, 8, 100, 40, 15);
    ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Windshield
    const glass = ctx.createLinearGradient(0, 0, 0, 56);
    glass.addColorStop(0, '#1e3a8a');
    glass.addColorStop(1, '#0f172a');
    
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.roundRect(65, 12, 22, 32, 6); ctx.fill();
    
    // Windshield glare
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath(); ctx.moveTo(65, 12); ctx.lineTo(72, 12); ctx.lineTo(87, 44); ctx.lineTo(78, 44); ctx.fill();

    // Rear window
    ctx.fillStyle = glass;
    ctx.beginPath(); ctx.roundRect(25, 13, 18, 30, 4); ctx.fill();

    // Roof (with slight curve highlight)
    const roof = ctx.createLinearGradient(0, 0, 0, 56);
    roof.addColorStop(0, '#4a5568'); roof.addColorStop(0.5, '#a0aec0'); roof.addColorStop(1, '#2d3748');
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.roundRect(43, 13, 22, 30, 6); ctx.fill();
    
    // Headlights (white LED)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.roundRect(105, 10, 4, 8, 2); ctx.roundRect(105, 38, 4, 8, 2); ctx.fill();

    // Taillights (red LED)
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 4;
    ctx.beginPath(); ctx.roundRect(10, 10, 3, 10, 1); ctx.roundRect(10, 36, 3, 10, 1); ctx.fill();
    ctx.shadowColor = 'transparent';
    
    // Side Mirrors
    ctx.fillStyle = '#2d3748';
    ctx.beginPath(); ctx.roundRect(75, 5, 8, 5, 2); ctx.roundRect(75, 46, 8, 5, 2); ctx.fill();

    fs.writeFileSync(`${dir}/sedan.png`, canvas.toBuffer());
}

function drawTruck() {
    const canvas = createCanvas(180, 70);
    const ctx = canvas.getContext('2d');
    
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;

    // Trailer (Aluminum box)
    const tGrad = ctx.createLinearGradient(0, 0, 0, 70);
    tGrad.addColorStop(0, '#cbd5e1'); tGrad.addColorStop(0.5, '#f8fafc'); tGrad.addColorStop(1, '#94a3b8');
    ctx.fillStyle = tGrad;
    ctx.fillRect(10, 8, 120, 54);
    
    // Trailer ribbing
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1;
    for(let i=15; i<130; i+=12) { ctx.beginPath(); ctx.moveTo(i, 8); ctx.lineTo(i, 62); ctx.stroke(); }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(60, 20, 40, 30); // Side logo decal
    ctx.fillStyle = '#ef4444'; ctx.fillRect(65, 30, 30, 10);

    // Cab
    const cGrad = ctx.createLinearGradient(0, 0, 0, 70);
    cGrad.addColorStop(0, '#b91c1c'); cGrad.addColorStop(0.5, '#ef4444'); cGrad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = cGrad;
    ctx.beginPath(); ctx.roundRect(132, 12, 35, 46, 6); ctx.fill();

    ctx.shadowColor = 'transparent';
    
    // Windshield
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(150, 15, 12, 40);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.moveTo(150, 15); ctx.lineTo(155, 15); ctx.lineTo(162, 55); ctx.lineTo(157, 55); ctx.fill();
    
    // Exhaust stack
    ctx.fillStyle = '#d4d4d8'; ctx.fillRect(128, 6, 8, 8); ctx.fillStyle = '#18181b'; ctx.beginPath(); ctx.arc(132, 10, 2, 0, Math.PI*2); ctx.fill();

    // Headlights
    ctx.fillStyle = '#ffffff'; ctx.fillRect(163, 14, 4, 8); ctx.fillRect(163, 48, 4, 8);
    // Taillights
    ctx.fillStyle = '#ef4444'; ctx.fillRect(10, 10, 4, 12); ctx.fillRect(10, 48, 4, 12);

    fs.writeFileSync(`${dir}/truck.png`, canvas.toBuffer());
}

function drawBus() {
    const canvas = createCanvas(220, 70);
    const ctx = canvas.getContext('2d');
    
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
    
    // Body (City transit bus)
    const bGrad = ctx.createLinearGradient(0, 0, 0, 70);
    bGrad.addColorStop(0, '#0369a1'); bGrad.addColorStop(0.5, '#38bdf8'); bGrad.addColorStop(1, '#075985');
    ctx.fillStyle = bGrad;
    ctx.beginPath(); ctx.roundRect(10, 8, 200, 54, 8); ctx.fill();
    
    ctx.shadowColor = 'transparent';
    
    // Roof AC units and vents
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(40, 22, 25, 26);
    ctx.fillRect(100, 22, 40, 26);
    ctx.fillRect(170, 22, 20, 26);
    
    // Windows along the side (black strip)
    ctx.fillStyle = '#020617';
    ctx.fillRect(30, 8, 140, 4);
    ctx.fillRect(30, 58, 140, 4);

    // Front windshield
    ctx.fillStyle = '#0f172a';
    ctx.beginPath(); ctx.roundRect(198, 10, 10, 50, 4); ctx.fill();
    
    // Taillights
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(10, 12, 3, 10); ctx.fillRect(10, 48, 3, 10);
    
    fs.writeFileSync(`${dir}/bus.png`, canvas.toBuffer());
}

function drawBicycle() {
    const canvas = createCanvas(60, 24);
    const ctx = canvas.getContext('2d');
    
    ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 2;

    // Thin frame
    ctx.strokeStyle = '#ef4444'; // Red frame
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(15, 12); ctx.lineTo(40, 12); // Main tube
    ctx.moveTo(35, 10); ctx.lineTo(42, 12); ctx.lineTo(35, 15); // Front fork
    ctx.moveTo(18, 10); ctx.lineTo(12, 12); ctx.lineTo(18, 15); // Rear stays
    ctx.stroke();

    ctx.shadowColor = 'transparent';

    // Wheels
    ctx.strokeStyle = '#1e293b'; 
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(2, 12); ctx.lineTo(14, 12); // Rear wheel
    ctx.moveTo(42, 12); ctx.lineTo(54, 12); // Front wheel
    ctx.stroke();
    
    // Seat
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.ellipse(18, 12, 3, 2, 0, 0, Math.PI*2); ctx.fill();

    // Handlebars
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(41, 5); ctx.lineTo(40, 12); ctx.lineTo(41, 19);
    ctx.stroke();
    
    // Grips
    ctx.fillStyle = '#000000';
    ctx.fillRect(40, 4, 2, 3);
    ctx.fillRect(40, 17, 2, 3);

    // Pedals
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(28, 7, 2, 3);
    ctx.fillRect(28, 14, 2, 3);
    
    // Crankset
    ctx.fillStyle = '#cbd5e1';
    ctx.beginPath(); ctx.arc(29, 12, 2.5, 0, Math.PI*2); ctx.fill();

    // Rider
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 2;
    
    // Rider back
    ctx.fillStyle = '#2563eb'; // Blue jersey
    ctx.beginPath(); ctx.ellipse(24, 12, 5, 7, 0, 0, Math.PI*2); ctx.fill(); 
    
    // Arms
    ctx.strokeStyle = '#fcd34d'; // Skin tone
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 8); ctx.lineTo(35, 7); ctx.lineTo(40, 6); // Left arm
    ctx.moveTo(26, 16); ctx.lineTo(35, 17); ctx.lineTo(40, 18); // Right arm
    ctx.stroke();
    
    // Helmet
    ctx.fillStyle = '#eab308'; // Yellow helmet
    ctx.beginPath();
    ctx.moveTo(28, 9.5); ctx.lineTo(34, 12); ctx.lineTo(28, 14.5);
    ctx.arc(28, 12, 2.5, Math.PI/2, Math.PI*1.5);
    ctx.fill();

    fs.writeFileSync(`${dir}/bicycle.png`, canvas.toBuffer());
}

function drawMotorcycle() {
    const canvas = createCanvas(80, 34);
    const ctx = canvas.getContext('2d');
    
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 3;

    // Body (Sport bike)
    const mGrad = ctx.createLinearGradient(0, 0, 0, 34);
    mGrad.addColorStop(0, '#eab308'); mGrad.addColorStop(0.5, '#fde047'); mGrad.addColorStop(1, '#a16207');
    ctx.fillStyle = mGrad;
    ctx.beginPath(); ctx.roundRect(25, 12, 32, 10, 4); ctx.fill();
    
    ctx.shadowColor = 'transparent';

    // Rider (black leather jacket & helmet)
    ctx.fillStyle = '#111827';
    // Helmet
    ctx.beginPath(); ctx.ellipse(35, 17, 7, 8, 0, 0, Math.PI*2); ctx.fill(); 
    // Back / shoulders
    ctx.beginPath(); ctx.ellipse(27, 17, 9, 10, 0, 0, Math.PI*2); ctx.fill();

    // Wheels / Tires (Thick and dark)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath(); ctx.roundRect(58, 14, 14, 6, 2); ctx.fill(); // Front tire
    ctx.beginPath(); ctx.roundRect(8, 13, 16, 8, 2); ctx.fill(); // Rear tire
    
    // Front cowl / fairing
    ctx.fillStyle = mGrad;
    ctx.beginPath(); ctx.moveTo(56, 12); ctx.lineTo(60, 17); ctx.lineTo(56, 22); ctx.fill();
    
    // Handlebars
    ctx.fillStyle = '#334155';
    ctx.fillRect(52, 9, 3, 16);
    
    // Windshield (tinted)
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(58, 17, 4, 6, 0, 0, Math.PI*2); ctx.fill();

    // Headlight (LED)
    ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(62, 17, 2, 0, Math.PI*2); ctx.fill();
    ctx.shadowColor = 'transparent';

    // Taillight
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(22, 17, 2, 0, Math.PI*2); ctx.fill();

    fs.writeFileSync(`${dir}/motorcycle.png`, canvas.toBuffer());
}

drawSedan();
drawTruck();
drawBus();
drawBicycle();
drawMotorcycle();
console.log('Real world vehicle sprites successfully generated.');
