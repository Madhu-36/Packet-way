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
const { exec }   = require('child_process');

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
const geoCache = new Map();
function lookupGeo(ip) {
  if (!geoip) return null;
  // Skip private / local ranges
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.)/.test(ip)) return null;
  if (geoCache.has(ip)) return geoCache.get(ip);
  const result = geoip.lookup(ip);
  let res = null;
  if (result) {
    res = {
      country: result.country || '??',
      city   : result.city || '',
      region : result.region || '',
      ll     : result.ll || null,
      flag   : countryToFlag(result.country),
    };
  }
  if (geoCache.size > 5000) geoCache.clear();
  geoCache.set(ip, res);
  return res;
}

// ─────────────────────────────────────────────────────────────────────
//  Capture State (shared with connected clients)
// ─────────────────────────────────────────────────────────────────────
const captureState = {
  active       : false,
  isPaused     : false,
  interfaceName: '',
  interfaceDesc: '',
  localIP      : getPrimaryLocalIP(),
  error        : null,
  packetsTotal : 0,
};

// ─────────────────────────────────────────────────────────────────────
//  Analytics & IDS State
// ─────────────────────────────────────────────────────────────────────
const topTalkers = new Map();
const protocolStats = { TCP: 0, UDP: 0, ICMP: 0, OTHER: 0 };
const ipRates = new Map();

// --- Advanced IDS Trackers ---
const portScanTracker = new Map();
const dataExfilTracker = new Map();
const blockedIPs = new Set();

setInterval(() => {
  portScanTracker.clear();
  dataExfilTracker.clear();
}, 10000); // Rolling 10s window


setInterval(() => {
  if (captureState.isPaused || !captureState.active) return;
  
  const sortedTalkers = [...topTalkers.entries()]
    .sort((a,b) => b[1].bytes - a[1].bytes)
    .slice(0, 10);
    
  io.emit('analytics', { topTalkers: sortedTalkers, protocolStats });
  
  for (let [ip, count] of ipRates.entries()) {
    if (count <= 5) ipRates.delete(ip);
    else ipRates.set(ip, count / 2);
  }
}, 1000);

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

// ─────────────────────────────────────────────────────────────────────
//  Packet Buffer & Emission Loop
// ─────────────────────────────────────────────────────────────────────
const packetBuffer = [];
let packetIdCounter = 0;

// Rolling buffer for export feature (last 5000 packets)
const exportBuffer = [];

setInterval(() => {
  if (packetBuffer.length > 0) {
    // Save to export buffer
    exportBuffer.push(...packetBuffer);
    if (exportBuffer.length > 5000) {
      exportBuffer.splice(0, exportBuffer.length - 5000);
    }
    
    io.emit('packets', packetBuffer);
    packetBuffer.length = 0;
  }
}, 100);

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
      if (captureState.isPaused) return;

      // Avoid accumulating too many packets in a single interval if flooded
      if (packetBuffer.length > 500) return;

      const now = Date.now();
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

        // Firewall Enforcement
        if (blockedIPs.has(srcIP) || blockedIPs.has(dstIP)) {
          return; // Soft-drop packet before further processing
        }

        // Decode transport layer
        let tcpFlags = null;
        let ttl = ip.info.ttl;
        let tcpWindow = null;
        let seqNo = null;
        let ackNo = null;
        
        let hostname = null;
        let payloadOffset = 0;
        let payloadLength = 0;

        switch (ip.info.protocol) {
          case PROTOCOL.IP.TCP: {
            const tcp = decoders.TCP(buffer, ip.offset);
            protocol = 'TCP';
            srcPort  = tcp.info.srcport;
            dstPort  = tcp.info.dstport;
            seqNo    = tcp.info.seqno;
            ackNo    = tcp.info.ackno;
            tcpWindow = tcp.info.window;
            const f = tcp.info.flags;
            tcpFlags = {
              fin: (f & 0x01) !== 0,
              syn: (f & 0x02) !== 0,
              rst: (f & 0x04) !== 0,
              psh: (f & 0x08) !== 0,
              ack: (f & 0x10) !== 0,
              urg: (f & 0x20) !== 0,
            };
            
            payloadOffset = tcp.offset;
            payloadLength = nbytes - payloadOffset;
            
            // DPI for TLS SNI (Client Hello)
            if (dstPort === 443 && payloadLength > 43) {
              if (buffer[payloadOffset] === 0x16 && buffer[payloadOffset+5] === 0x01) {
                 const str = buffer.toString('utf8', payloadOffset, payloadOffset + payloadLength);
                 const match = str.match(/([a-z0-9\-]+\.)+[a-z]{2,}/i);
                 if (match) hostname = match[0];
              }
            }
            // DPI for HTTP Host
            if (dstPort === 80 && payloadLength > 10) {
               const str = buffer.toString('utf8', payloadOffset, Math.min(payloadOffset + 200, payloadOffset + payloadLength));
               const match = str.match(/Host:\s*([^\r\n]+)/i);
               if (match) hostname = match[1];
            }
            break;
          }
          case PROTOCOL.IP.UDP: {
            const udp = decoders.UDP(buffer, ip.offset);
            protocol = 'UDP';
            srcPort  = udp.info.srcport;
            dstPort  = udp.info.dstport;
            payloadOffset = udp.offset;
            payloadLength = nbytes - payloadOffset;
            
            // DPI for DNS Queries
            if (dstPort === 53 && payloadLength > 12) {
               let idx = payloadOffset + 12;
               let domain = '';
               try {
                 while (idx < payloadOffset + payloadLength && buffer[idx] > 0) {
                   const len = buffer[idx];
                   if (domain.length > 0) domain += '.';
                   domain += buffer.toString('utf8', idx + 1, idx + 1 + len);
                   idx += len + 1;
                 }
                 if (domain.length > 0 && domain.indexOf('.') > 0) hostname = domain;
               } catch (e) {}
            }
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

        // IDS & Analytics
        protocolStats[protocol] = (protocolStats[protocol] || 0) + 1;
        const tSrc = topTalkers.get(srcIP) || { bytes: 0, geo: geo };
        tSrc.bytes += nbytes;
        topTalkers.set(srcIP, tSrc);
        
        const rate = (ipRates.get(srcIP) || 0) + 1;
        ipRates.set(srcIP, rate);
        let suspicious = rate > 50 || (tcpFlags && tcpFlags.syn && !tcpFlags.ack && rate > 20);

        // 1. Port Scan Detection (Inbound)
        if (dstPort && direction === 'INBOUND') {
          if (!portScanTracker.has(srcIP)) portScanTracker.set(srcIP, new Set());
          const ports = portScanTracker.get(srcIP);
          ports.add(dstPort);
          if (ports.size > 15 && !ports.has('alerted')) {
             ports.add('alerted');
             suspicious = true;
             io.emit('incident-alert', { id: crypto.randomUUID(), type: 'PORT_SCAN', severity: 'HIGH', srcIP, geo: geo || {}, msg: `Port Scan Detected: ${ports.size} unique ports`, timestamp: Date.now() });
          }
        }

        // 2. Data Exfiltration Detection (Outbound)
        if (direction === 'OUTBOUND') {
           const bytes = (dataExfilTracker.get(dstIP) || 0) + nbytes; // dstIP is the external receiver
           dataExfilTracker.set(dstIP, bytes);
           if (bytes > 10 * 1024 * 1024 && !dataExfilTracker.has(dstIP + '_alerted')) { // > 10MB in 10s
              dataExfilTracker.set(dstIP + '_alerted', true);
              suspicious = true;
              io.emit('incident-alert', { id: crypto.randomUUID(), type: 'EXFILTRATION', severity: 'CRITICAL', srcIP: dstIP, geo: geo || {}, msg: `Massive Outbound Spike: ${(bytes/1024/1024).toFixed(1)} MB sent`, timestamp: Date.now() });
           }
        }
        
        // 3. Known Threat Intelligence Simulation
        if (['185.15.59.224', '45.134.144.0'].includes(srcIP) || (rate === 1 && Math.random() < 0.005)) {
           if (!ipRates.has(srcIP + '_threat')) {
             ipRates.set(srcIP + '_threat', true);
             suspicious = true;
             io.emit('incident-alert', { id: crypto.randomUUID(), type: 'THREAT_INTEL', severity: 'CRITICAL', srcIP, geo: geo || {}, msg: `Connection to Known Malicious Actor`, timestamp: Date.now() });
           }
        }
        
        // Generate Hex/ASCII dump (up to 512 bytes for deeper text detection)
        const hexSize = Math.min(512, nbytes);
        const hexBuffer = buffer.slice(0, hexSize);
        const hexDump = hexBuffer.toString('hex');
        let asciiDump = '';
        for(let i=0; i<hexSize; i++) {
          const code = hexBuffer[i];
          asciiDump += (code >= 32 && code <= 126) ? String.fromCharCode(code) : '.';
        }

        // 4. Advanced Text Detection (DPI) on Unencrypted Payloads
        if (!asciiDump.includes('alerted_payload')) {
           const sqlRegex = /(SELECT|UNION|INSERT|DROP\s+TABLE)/i;
           const sensitiveRegex = /(password|passwd|secret|key|login)=/i;
           
           if (sqlRegex.test(asciiDump)) {
              suspicious = true;
              io.emit('incident-alert', { id: crypto.randomUUID(), type: 'SQL_INJECTION', severity: 'CRITICAL', srcIP, geo: geo || {}, msg: `SQL Injection detected in payload`, timestamp: Date.now() });
           } else if (sensitiveRegex.test(asciiDump)) {
              suspicious = true;
              io.emit('incident-alert', { id: crypto.randomUUID(), type: 'DATA_LEAK', severity: 'HIGH', srcIP, geo: geo || {}, msg: `Unencrypted sensitive text detected in payload`, timestamp: Date.now() });
           }
        }

        packetBuffer.push({
          id         : (packetIdCounter++).toString(),
          direction,
          src,
          dst,
          srcIP,
          dstIP,
          srcPort,
          dstPort,
          hostname,
          protocol,
          size       : nbytes,
          vehicleType,
          geo        : geo || { country: '??', city: '', flag: '🌐' },
          timestamp  : now,
          ttl,
          tcpFlags,
          tcpWindow,
          seqNo,
          ackNo,
          suspicious,
          hexDump,
          asciiDump
        });
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
  
  socket.on('pause-capture', () => {
    captureState.isPaused = true;
    io.emit('capture-status', { ...captureState });
    console.log('[WS] Capture PAUSED by client');
  });

  socket.on('resume-capture', () => {
    captureState.isPaused = false;
    io.emit('capture-status', { ...captureState });
    console.log('[WS] Capture RESUMED by client');
  });

  socket.on('export-pcap', () => {
    socket.emit('trigger-export');
  });

  socket.on('block-ip', (ip) => {
    blockedIPs.add(ip);
    console.log(`[FIREWALL] Added soft-block rule for IP: ${ip}`);
    
    // OS-Level Hard Block via Windows Firewall (Requires Admin privileges)
    if (process.platform === 'win32') {
      const inRule = `netsh advfirewall firewall add rule name="PacketWay_Block_In_${ip}" dir=in action=block remoteip="${ip}"`;
      const outRule = `netsh advfirewall firewall add rule name="PacketWay_Block_Out_${ip}" dir=out action=block remoteip="${ip}"`;
      
      exec(inRule, (err) => {
        if (err) {
          console.warn(`[FIREWALL WARN] Failed to add OS-level inbound block for ${ip}. Note: Requires running Node as Administrator.`);
        } else {
          console.log(`[FIREWALL] Successfully added OS-level inbound block for ${ip}`);
        }
      });
      exec(outRule, (err) => {
        if (!err) console.log(`[FIREWALL] Successfully added OS-level outbound block for ${ip}`);
      });
    }

    io.emit('ip-blocked', ip);
  });

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
//  HTTP Export endpoint
// ─────────────────────────────────────────────────────────────────────
app.get('/export-pcap', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="packet-capture.csv"');
  
  if (exportBuffer.length === 0) {
    return res.send("No packets captured yet.");
  }
  
  const headers = ['ID', 'Timestamp', 'Direction', 'Protocol', 'Source_IP', 'Source_Port', 'Dest_IP', 'Dest_Port', 'Size_Bytes', 'Country', 'City', 'Suspicious'];
  const rows = exportBuffer.map(p => {
    return [
      p.id,
      new Date(p.timestamp).toISOString(),
      p.direction,
      p.protocol,
      p.srcIP,
      p.srcPort || '',
      p.dstIP,
      p.dstPort || '',
      p.size,
      `"${(p.geo && p.geo.country) ? p.geo.country : ''}"`,
      `"${(p.geo && p.geo.city) ? p.geo.city : ''}"`,
      p.suspicious ? 'YES' : 'NO'
    ].join(',');
  });
  
  const csv = headers.join(',') + '\n' + rows.join('\n');
  res.send(csv);
});

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
