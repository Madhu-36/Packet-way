const crypto = require('crypto');
const TYPE_CFG = {
  CYCLE: { w: [28, 38],  h: [14, 18],  spd: [5.5, 8.5] },
  CAR  : { w: [52, 68],  h: [24, 32],  spd: [3.0, 5.0] },
  TRUCK: { w: [80, 105], h: [30, 38],  spd: [1.8, 3.2] },
  BUS  : { w: [110, 140], h: [32, 42], spd: [1.2, 2.2] }
};
const PROTO_COLOR = {
  TCP  : '#3b82f6',
  UDP  : '#f59e0b',
  ICMP : '#a855f7',
  OTHER: '#6b7280',
};
const PROTO_GLOW = {
  TCP  : '#3b82f660',
  UDP  : '#f59e0b60',
  ICMP : '#a855f760',
  OTHER: '#6b728060',
};

function createVehicle(pkt, cw, ch) {
  const type = pkt.size <= 64 ? 'CYCLE' : pkt.size <= 512 ? 'CAR' : pkt.size <= 1024 ? 'TRUCK' : 'BUS';
  const cfg = TYPE_CFG[type] || TYPE_CFG.CAR;
  
  const w = Math.floor(Math.random() * (cfg.w[1] - cfg.w[0]) + cfg.w[0]);
  const h = Math.floor(Math.random() * (cfg.h[1] - cfg.h[0]) + cfg.h[0]);
  
  const isOut = pkt.direction === 'OUTBOUND';
  const x = isOut ? cw + 100 : -w - 100;
  const speed = (Math.random() * (cfg.spd[1] - cfg.spd[0]) + cfg.spd[0]) * (isOut ? -1 : 1);
  
  const halfH = ch / 2;
  const laneH = halfH / 4;
  const laneIdx = Math.floor(Math.random() * 4);
  const y = isOut 
    ? halfH + laneIdx * laneH + (laneH / 2) - (h / 2) 
    : laneIdx * laneH + (laneH / 2) - (h / 2);
  
  const protocol = pkt.protocol || 'OTHER';
  const color = PROTO_COLOR[protocol] || PROTO_COLOR.OTHER;
  const glow = PROTO_GLOW[protocol] || PROTO_GLOW.OTHER;

  return {
    uid: pkt.uid || pkt.id,
    type, x, y, w, h, speed,
    color, glowColor: glow,
    protocol, size: pkt.size, isInbound: !isOut
  };
}

const pkt = {
  id: '1234',
  direction: 'OUTBOUND',
  protocol: 'TCP',
  size: 500
};

const v = createVehicle(pkt, 1920, 1080);
console.log('Outbound:', v);

const pkt2 = {
  id: '1235',
  direction: 'INBOUND',
  protocol: 'UDP',
  size: 500
};
const v2 = createVehicle(pkt2, 1920, 1080);
console.log('Inbound:', v2);

