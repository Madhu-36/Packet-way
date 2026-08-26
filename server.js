/**
 * ════════════════════════════════════════════════════════════════════
 *  Packet-way v2 — Backend Server
 * ════════════════════════════════════════════════════════════════════
 *
 *  ⚠️  ADMINISTRATOR / ROOT PRIVILEGES REQUIRED ⚠️
 *
 *  Raw packet sniffing requires direct OS-level network card access.
 *
 *  Windows — PowerShell (Run as Administrator):
 *    cd "c:\Users\Asus\OneDrive\Desktop\PROJECTS\System Packet traffic application"
 *    npm install
 *    node server.js
 *
 *  Linux / macOS:
 *    sudo node server.js
 *
 *  Prerequisites:
 *    Windows : Npcap (https://npcap.com) installed with WinPcap-compat mode
 *    Linux   : libpcap-dev  →  sudo apt-get install libpcap-dev
 *    macOS   : Xcode CLI    →  xcode-select --install
 *
 *  ⛔ NO SIMULATION FALLBACK — This server ONLY processes real
 *     intercepted packets. If the network is idle, zero packets are
 *     emitted. If Npcap/cap binding fails, the server exits with a
 *     clear error message.
 * ════════════════════════════════════════════════════════════════════
 */

'use strict';

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const os         = require('os');
const crypto     = require('crypto');

// ─────────────────────────────────────────────────────────────────────
//  GeoIP — local MaxMind DB lookup, zero API calls
// ─────────────────────────────────────────────────────────────────────
let geoip;
try {
  geoip = require('geoip-lite');
  console.log('[BOOT] geoip-lite loaded successfully.');
} catch (err) {
  console.warn('[WARN] geoip-lite not available — GeoIP data will be null.');
  geoip = null;
}

// ─────────────────────────────────────────────────────────────────────
//  Express + Socket.io
// ─────────────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: {
    origin : [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:3000',
      'http://localhost:4173',
    ],
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────────────────────────────
//  Utilities
// ─────────────────────────────────────────────────────────────────────

/** Detect all local IPv4 addresses for direction classification. */
function getLocalIPs() {
  const ips = new Set();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs) {
      if (a.family === 'IPv4') ips.add(a.address);
    }
  }
  return ips;
}

/** Find the primary (non-loopback) local IPv4 address. */
function getPrimaryLocalIP() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    const ipv4 = addrs.find(a => a.family === 'IPv4' && !a.internal);
    if (ipv4) return ipv4.address;
  }
  return '127.0.0.1';
}

/** Convert a 2-letter country code to its flag emoji. */
function countryToFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return String.fromCodePoint(
    ...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65)
  );
}

/** Classify packet size into a vehicle type. */
function getVehicleType(sizeBytes) {
  if (sizeBytes <= 64)   return 'CYCLE';
  if (sizeBytes <= 512)  return 'CAR';
  if (sizeBytes <= 1024) return 'TRUCK';
  return 'BUS';
}

/** Perform GeoIP lookup on a foreign (non-local) IP. */
function lookupGeo(ip) {
  if (!geoip) return null;
  // Skip private / local ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(ip)) return null;
  const result = geoip.lookup(ip);
  if (!result) return null;
  return {
    country: result.country || '??',
    city   : result.city || '',
    region : result.region || '',
    ll     : result.ll || null,
    flag   : countryToFlag(result.country),
  };
}

// ─────────────────────────────────────────────────────────────────────
//  Capture State (shared with connected clients)
// ─────────────────────────────────────────────────────────────────────
const captureState = {
  active       : false,
  interfaceName: '',
  interfaceDesc: '',
  localIP      : getPrimaryLocalIP(),
  error        : null,
  packetsTotal : 0,
};

// ─────────────────────────────────────────────────────────────────────
//  Live Packet Capture — Npcap / libpcap via `cap`
// ─────────────────────────────────────────────────────────────────────
function startLiveCapture() {
  let Cap, decoders, PROTOCOL;

  // ── Load the native cap module ──────────────────────────────
  try {
    const capLib = require('cap');
    Cap          = capLib.Cap;
    decoders     = capLib.decoders;
    PROTOCOL     = decoders.PROTOCOL;
  } catch (err) {
    const msg = `[FATAL] Cannot load 'cap' module: ${err.message}\n` +
                '        Ensure Npcap is installed (https://npcap.com) with WinPcap-compat mode.\n' +
                '        Then run: npm install\n' +
                '        And start the server as Administrator.';
    console.error(msg);
    captureState.error = msg;
    io.emit('capture-status', { ...captureState });
    return;
  }

  const localIPs = getLocalIPs();
  console.log('[INFO] Local IPs detected:', [...localIPs]);

  // ── Find a suitable capture device ──────────────────────────
  let deviceName  = process.env.INTERFACE || null;
  let deviceDesc  = '';

  // Skip virtual / irrelevant adapters
  const SKIP_PATTERNS = [
    /bluetooth/i, /virtualbox/i, /hyper-v/i, /vmware/i,
    /loopback/i, /npcap/i, /teredo/i, /isatap/i, /6to4/i,
  ];

  if (!deviceName) {
    try {
      const devices = Cap.deviceList();
      console.log(`[INFO] Network devices found: ${devices.length}`);
      const primaryIP = getPrimaryLocalIP();

      // First pass: find device matching the primary local IP exactly
      for (const dev of devices) {
        const desc = dev.description || dev.name || '';
        if (SKIP_PATTERNS.some(p => p.test(desc))) continue;
        const matchesPrimary = (dev.addresses || []).some(a => a.addr === primaryIP);
        if (matchesPrimary) {
          deviceName = dev.name;
          deviceDesc = desc;
          console.log(`[INFO] Selected device (primary IP match): ${desc}`);
          break;
        }
      }

      // Second pass: find any device with a private IPv4 (skip virtual)
      if (!deviceName) {
        for (const dev of devices) {
          const desc = dev.description || dev.name || '';
          if (SKIP_PATTERNS.some(p => p.test(desc))) continue;
          const hasIPv4 = (dev.addresses || []).some(a =>
            /^\d+\.\d+\.\d+\.\d+$/.test(a.addr) && !a.addr.startsWith('127.')
          );
          if (hasIPv4) {
            deviceName = dev.name;
            deviceDesc = desc;
            console.log(`[INFO] Selected device (fallback): ${desc}`);
            break;
          }
        }
      }
    } catch (err) {
      console.warn('[WARN] Device enumeration failed:', err.message);
    }
  }

  // Last resort: try Cap.findDevice with the primary local IP
  if (!deviceName) {
    try {
      const localIP = getPrimaryLocalIP();
      deviceName = Cap.findDevice(localIP);
      deviceDesc = deviceName;
      console.log(`[INFO] Selected device (Cap.findDevice): ${deviceName}`);
    } catch (_) {}
  }

  if (!deviceName) {
    const msg = '[FATAL] No capturable network device found.\n' +
                '        Ensure Npcap is installed and a network adapter is active.\n' +
                '        You can override with: INTERFACE=<device_name> node server.js';
    console.error(msg);
    captureState.error = msg;
    io.emit('capture-status', { ...captureState });
    return;
  }

  // ── Open capture ────────────────────────────────────────────
  const buffer  = Buffer.alloc(65535);
  const capInst = new Cap();

  // Rate limiter: max 200 emits/sec to keep frontend responsive
  let emitCount   = 0;
  let lastWindow  = Date.now();
  const MAX_PER_SEC = 200;

  try {
    const linkType = capInst.open(deviceName, 'ip', 10 * 1024 * 1024, buffer);
    if (capInst.setMinBytes) capInst.setMinBytes(0);

    captureState.active        = true;
    captureState.interfaceName = deviceName;
    captureState.interfaceDesc = deviceDesc;
    captureState.error         = null;

    console.log(`[INFO] ✅ Capture open on: ${deviceDesc}`);
    console.log(`[INFO] Link type: ${linkType}`);
    console.log('[INFO] Listening for live IPv4 packets…\n');

    io.emit('capture-status', { ...captureState });

    // ── Packet handler ────────────────────────────────────────
    capInst.on('packet', (nbytes) => {
      // Rate-limit window
      const now = Date.now();
      if (now - lastWindow >= 1000) { emitCount = 0; lastWindow = now; }
      if (emitCount >= MAX_PER_SEC) return;

      try {
        let srcIP, dstIP, srcPort = null, dstPort = null;
        let protocol = 'OTHER';
        let ipOffset = 0;

        // Determine IP offset based on link type
        if (linkType === 'ETHERNET') {
          const eth = decoders.Ethernet(buffer);
          if (eth.info.type !== PROTOCOL.ETHERNET.IPV4) return;
          ipOffset = eth.offset;
        } else if (linkType === 'NULL' || linkType === 'LOOP' || linkType === 'RAW') {
          ipOffset = 0;
        } else {
          return;
        }

        // Decode IPv4 header
        const ip = decoders.IPV4(buffer, ipOffset);
        srcIP = ip.info.srcaddr;
        dstIP = ip.info.dstaddr;

        // Decode transport layer
        switch (ip.info.protocol) {
          case PROTOCOL.IP.TCP: {
            const tcp = decoders.TCP(buffer, ip.offset);
            protocol = 'TCP';
            srcPort  = tcp.info.srcport;
            dstPort  = tcp.info.dstport;
            break;
          }
          case PROTOCOL.IP.UDP: {
            const udp = decoders.UDP(buffer, ip.offset);
            protocol = 'UDP';
            srcPort  = udp.info.srcport;
            dstPort  = udp.info.dstport;
            break;
          }
          case PROTOCOL.IP.ICMP:
            protocol = 'ICMP';
            break;
          default:
            return; // Skip non-TCP/UDP/ICMP
        }

        // Direction: is the local machine the destination (INBOUND) or source (OUTBOUND)?
        const direction = localIPs.has(dstIP) ? 'INBOUND' : 'OUTBOUND';

        // Determine which IP is the foreign one for GeoIP
        const foreignIP = direction === 'INBOUND' ? srcIP : dstIP;
        const geo       = lookupGeo(foreignIP);

        // Vehicle classification based on packet size
        const vehicleType = getVehicleType(nbytes);

        // Build src/dst combined strings
        const src = srcPort != null ? `${srcIP}:${srcPort}` : srcIP;
        const dst = dstPort != null ? `${dstIP}:${dstPort}` : dstIP;

        captureState.packetsTotal++;

        io.emit('packet', {
          id         : crypto.randomUUID(),
          direction,
          src,
          dst,
          srcIP,
          dstIP,
          srcPort,
          dstPort,
          protocol,
          size       : nbytes,
          vehicleType,
          geo        : geo || { country: '??', city: '', flag: '🌐' },
          timestamp  : now,
        });

        emitCount++;
      } catch (_) { /* skip malformed packets */ }
    });

    capInst.on('error', (err) => {
      console.error('[ERROR] Capture error:', err.message);
      captureState.error = err.message;
      io.emit('capture-status', { ...captureState });
    });

  } catch (err) {
    const msg = `[FATAL] Failed to open capture device "${deviceDesc}": ${err.message}\n` +
                '        Run this server as Administrator / root.\n' +
                '        Ensure Npcap is installed with WinPcap API-compatible mode.';
    console.error(msg);
    try { capInst.close(); } catch (_) {}
    captureState.error  = msg;
    captureState.active = false;
    io.emit('capture-status', { ...captureState });
  }
}

// ─────────────────────────────────────────────────────────────────────
//  Socket.io — Client connection handling
// ─────────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`[WS] Client connected    : ${socket.id}`);

  // Send current capture status immediately on connect
  socket.emit('capture-status', { ...captureState });

  socket.on('disconnect', () => {
    console.log(`[WS] Client disconnected : ${socket.id}`);
  });
});

// ─────────────────────────────────────────────────────────────────────
//  HTTP health endpoint
// ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({
  status  : captureState.active ? 'capturing' : 'error',
  uptime  : process.uptime(),
  packets : captureState.packetsTotal,
  iface   : captureState.interfaceDesc,
}));

// ─────────────────────────────────────────────────────────────────────
//  Boot
// ─────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        Packet-way v2 — Live Packet Capture Server        ║');
  console.log(`║        Listening on : http://localhost:${PORT}                ║`);
  console.log('║        Mode         : LIVE ONLY (no simulation)          ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('');
  startLiveCapture();
});
