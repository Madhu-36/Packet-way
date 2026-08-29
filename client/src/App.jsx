import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Network, Terminal, Settings, Play, Pause, ArrowDownLeft, ArrowUpRight, Activity, Box, X, Download, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import Canvas3D from './Canvas3D';

const SERVER_URL = 'http://localhost:3001';
// Increased MAX_VEHICLES to take advantage of InstancedMesh!
const MAX_VEHICLES = 3000;

function StatBlock({ label, value, icon, accent, flash }) {
  return (
    <div className={`flex flex-col bg-[#0b0c16] rounded border px-3 py-2 w-28 shrink-0 ${flash ? 'border-red-500 animate-pulse' : 'border-border'}`}>
      <div className='flex items-center gap-1.5 text-[9px] font-mono text-muted uppercase tracking-widest mb-1'>
        {icon && React.cloneElement(icon, { style: { color: accent } })}
        {label}
      </div>
      <div className='text-lg font-mono font-bold text-text leading-tight shadow-sm'
           style={{ textShadow: `0 0 10px ${accent}40` }}>
        {value}
      </div>
    </div>
  );
}

function ManifestRow({ label, value, accent }) {
  return (
    <div className='flex justify-between items-center py-1.5 border-b border-border/50 last:border-0'>
      <span className='text-[10px] font-mono text-muted uppercase tracking-wider'>{label}</span>
      <span className='text-xs font-mono font-medium truncate ml-4' style={{ color: accent || '#d1d5db' }}>{value}</span>
    </div>
  );
}

function ManifestPanel({ vehicle, onClose }) {
  if (!vehicle) return null;

  const col = vehicle.suspicious ? '#ff0000' : '#00f0ff';
  const geo = vehicle.geo || {};
  const isOut = !vehicle.isInbound;

  return (
    <div className='absolute right-4 top-1/2 -translate-y-1/2 w-[340px] bg-surface/95 backdrop-blur-xl border border-border shadow-[0_0_40px_rgba(0,0,0,0.8)] flex flex-col pointer-events-auto rounded-md overflow-hidden transform transition-all duration-300 z-50'>
      <div className='bg-gradient-to-r from-bg to-surface p-4 border-b border-border flex justify-between items-start relative'>
        <div className='absolute top-0 left-0 w-full h-[1px]' style={{ background: `linear-gradient(90deg, transparent, ${col}, transparent)` }} />
        <div>
          <div className='flex items-center gap-2 mb-1'>
            {vehicle.suspicious ? <ShieldAlert size={14} className="text-red-500 animate-pulse" /> : <Box size={14} style={{ color: col }} />}
            <h2 className='font-[var(--font-display)] text-lg font-bold text-text uppercase tracking-widest'>Cargo Manifest</h2>
          </div>
          <div className='text-[10px] font-mono text-muted tracking-widest'>ID: {vehicle.uid}</div>
        </div>
        <button onClick={onClose} className='text-muted hover:text-white transition-colors bg-bg p-1 rounded border border-border'>
          <X size={14} />
        </button>
      </div>

      <div className='p-4 flex flex-col gap-3 flex-1 overflow-y-auto' style={{ maxHeight: 'calc(100vh - 200px)' }}>
        <div className='flex gap-2'>
          <div className='flex-1 bg-bg border border-border rounded p-3 flex flex-col items-center justify-center relative overflow-hidden'>
            <div className='absolute inset-0 opacity-5' style={{ backgroundColor: col }} />
            <div className='text-[10px] font-mono text-muted tracking-widest uppercase mb-1'>Protocol</div>
            <div className='text-xl font-bold tracking-widest' style={{ color: col }}>{vehicle.protocol}</div>
          </div>
          <div className='flex-1 bg-bg border border-border rounded p-3 flex flex-col items-center justify-center relative overflow-hidden'>
            <div className='absolute inset-0 opacity-5' style={{ backgroundColor: isOut ? '#f97316' : '#3b82f6' }} />
            <div className='text-[10px] font-mono text-muted tracking-widest uppercase mb-1'>Trajectory</div>
            <div className='text-sm font-bold tracking-widest flex items-center gap-1' style={{ color: isOut ? '#f97316' : '#3b82f6' }}>
              {isOut ? <><ArrowUpRight size={14}/> OUTBOUND</> : <><ArrowDownLeft size={14}/> INBOUND</>}
            </div>
          </div>
        </div>

        <div className='bg-bg border border-border rounded p-3 mt-1'>
          <div className='flex justify-between items-center mb-3'>
            <div className='flex flex-col'>
              <span className='text-[9px] font-mono text-muted uppercase tracking-widest'>Source</span>
              <span className='text-xs font-mono text-white'>{vehicle.srcIP}</span>
              {vehicle.srcPort && <span className='text-[10px] font-mono text-cyan'>Port {vehicle.srcPort}</span>}
            </div>
            <ArrowUpRight size={16} className='text-muted opacity-50' />
            <div className='flex flex-col text-right'>
              <span className='text-[9px] font-mono text-muted uppercase tracking-widest'>Destination</span>
              <span className='text-xs font-mono text-white'>{vehicle.dstIP}</span>
              {vehicle.dstPort && <span className='text-[10px] font-mono text-cyan'>Port {vehicle.dstPort}</span>}
            </div>
          </div>
        </div>

        <div className='bg-bg border border-border rounded px-3 py-1'>
          <ManifestRow label='Payload Size' value={vehicle.size > 999 ? (vehicle.size / 1024).toFixed(2) + ' KB' : vehicle.size + ' Bytes'} accent='#fff' />
          <ManifestRow label='Transport Type' value={vehicle.type} />
          {vehicle.suspicious && <ManifestRow label='IDS Status' value="SUSPICIOUS" accent="#ef4444" />}
        </div>

        {geo.country && geo.country !== '??' && (
          <div className='bg-bg border border-border rounded px-3 py-1'>
            <ManifestRow label='GeoIP Country' value={(geo.flag || '🌐') + ' ' + geo.country} accent='#00f5ff' />
            {geo.city && <ManifestRow label='GeoIP City' value={geo.city} accent='#00f5ff' />}
          </div>
        )}
        
        <div className='bg-bg border border-border rounded px-3 py-1'>
          {vehicle.ttl != null && <ManifestRow label='IP TTL' value={vehicle.ttl} />}
          {vehicle.tcpFlags && (
            <ManifestRow 
              label='TCP Flags' 
              value={Object.entries(vehicle.tcpFlags).filter(([_, v]) => v).map(([k]) => k.toUpperCase()).join(' · ') || 'NONE'} 
              accent={col} 
            />
          )}
          {vehicle.seqNo != null && <ManifestRow label='Sequence No' value={vehicle.seqNo} />}
          {vehicle.ackNo != null && <ManifestRow label='Ack No' value={vehicle.ackNo} />}
          {vehicle.tcpWindow != null && <ManifestRow label='TCP Window' value={vehicle.tcpWindow} />}
        </div>
      </div>
    </div>
  );
}

function AnalyticsPanel({ analytics, onClose }) {
  if (!analytics) return null;

  const ps = analytics?.protocolStats || {};

  const data = [
    { name: 'TCP', value: ps.TCP || 0, color: '#00f0ff' },
    { name: 'UDP', value: ps.UDP || 0, color: '#ffaa00' },
    { name: 'ICMP', value: ps.ICMP || 0, color: '#a855f7' },
    { name: 'OTHER', value: ps.OTHER || 0, color: '#6b7280' },
  ].filter(d => d.value > 0);

  return (
    <div className='absolute left-4 top-20 w-[300px] bg-surface/90 backdrop-blur-xl border border-border shadow-2xl flex flex-col pointer-events-auto rounded-md overflow-hidden z-40'>
      <div className='bg-bg p-3 border-b border-border flex justify-between items-center'>
        <div className='flex items-center gap-2'>
          <Activity size={14} className="text-cyan" />
          <h2 className='font-[var(--font-display)] text-sm font-bold text-text uppercase tracking-widest'>Analytics Console</h2>
        </div>
        <button onClick={onClose} className='text-muted hover:text-white'>
          <X size={14} />
        </button>
      </div>

      <div className='p-4 flex flex-col gap-4'>
        <div>
          <div className='text-[10px] font-mono text-muted uppercase tracking-widest mb-2'>Protocol Distribution</div>
          <div className='h-32 flex justify-center'>
            {data.length > 0 ? (
              <PieChart width={120} height={120}>
                <Pie data={data} cx={60} cy={60} innerRadius={40} outerRadius={60} paddingAngle={2} dataKey="value" stroke="none">
                  {data.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#0b0c16', border: '1px solid #1a1a3a', fontSize: '10px' }} />
              </PieChart>
            ) : <div className="text-muted text-xs flex items-center h-full">No Data</div>}
          </div>
          <div className="flex gap-2 justify-center mt-2 flex-wrap">
            {data.map((d, i) => (
              <div key={i} className="flex items-center gap-1 text-[9px] font-mono">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
                {d.name} ({(d.value/1000).toFixed(1)}k)
              </div>
            ))}
          </div>
        </div>

        <div className='border-t border-border pt-4'>
          <div className='text-[10px] font-mono text-muted uppercase tracking-widest mb-2'>Top Talkers (Bandwidth)</div>
          <div className="flex flex-col gap-2">
            {analytics.topTalkers?.slice(0, 5).map(([ip, stats], i) => (
              <div key={ip} className="flex justify-between items-center bg-bg/50 p-1.5 rounded border border-border/50">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] text-muted">{i+1}.</span>
                  <span className="text-xs font-mono">{stats.geo?.flag || '🌐'}</span>
                  <span className="text-[11px] font-mono text-cyan truncate">{ip}</span>
                </div>
                <span className="text-[10px] font-mono text-muted ml-2">{(stats.bytes/1024/1024).toFixed(2)} MB</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function FilterPanel({ filters, onUpdate }) {
  const toggle = (k) => onUpdate({ ...filters, [k]: !filters[k] });
  return (
    <div className='mt-2 bg-surface/90 backdrop-blur-xl border border-border rounded w-64 shadow-2xl flex flex-col overflow-hidden'>
      <div className='bg-bg px-3 py-2 border-b border-border font-[var(--font-display)] text-xs tracking-widest text-text uppercase'>
        Signal Filters
      </div>
      <div className='p-2 border-b border-border'>
        {['TCP', 'UDP', 'ICMP'].map(proto => {
          const active = filters[proto.toLowerCase()];
          return (
            <button key={proto} onClick={() => toggle(proto.toLowerCase())}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] font-mono mb-1 cursor-pointer transition-all border ${active ? 'border-cyan text-cyan' : 'border-transparent text-muted'}`}>
              <div className='w-2.5 h-2.5 rounded-sm' style={{ background: active ? '#00f0ff' : '#333' }} />
              {proto}
            </button>
          );
        })}
      </div>
      <div className='px-3 py-3'>
        <div className='text-[10px] font-mono text-muted tracking-wider mb-2 uppercase'>Min Size (bytes)</div>
        <input type='range' min={0} max={1500} step={10}
               value={filters.minSize}
               onChange={e => onUpdate({ ...filters, minSize: parseInt(e.target.value) })}
               className='w-full accent-cyan' />
        <div className='text-[11px] font-mono text-dim mt-1'>≥ {filters.minSize} B</div>
      </div>
    </div>
  );
}

function BandwidthChart({ data }) {
  return (
    <div className='h-[110px] shrink-0 border-t border-border bg-surface px-2 pt-1'>
      <div className='flex items-center gap-2 px-2 py-1'>
        <Activity size={12} className='text-cyan' />
        <span className='text-[10px] font-[var(--font-display)] text-muted tracking-widest'>BANDWIDTH (KB/s) — 60s WINDOW</span>
      </div>
      <ResponsiveContainer width='100%' height={72}>
        <AreaChart data={data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray='3 3' stroke='#1a1a3a' />
          <XAxis dataKey='t' tick={{ fontSize: 8, fill: '#3a4060' }} interval='preserveStartEnd' />
          <YAxis tick={{ fontSize: 8, fill: '#3a4060' }} />
          <Area type='monotone' dataKey='inKBs' name='Inbound' stroke='#3b82f6' fill='#3b82f620' strokeWidth={1.5} dot={false} />
          <Area type='monotone' dataKey='outKBs' name='Outbound' stroke='#f97316' fill='#f9731620' strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function createVehicle(pkt, cw, ch) {
  let type, w, h;
  
  // Expanded vehicle types based on ports
  const isDNS = pkt.srcPort === 53 || pkt.dstPort === 53;
  const isHTTP = pkt.srcPort === 80 || pkt.dstPort === 80 || pkt.srcPort === 443 || pkt.dstPort === 443;
  
  if (isDNS) {
    type = 'CYCLE'; w = 15; h = 10;
  } else if (isHTTP) {
    type = pkt.size > 1000 ? 'BUS' : 'TRUCK';
    w = pkt.size > 1000 ? 120 : 80;
    h = pkt.size > 1000 ? 30 : 25;
  } else {
    // Default mapping by size
    if (pkt.size <= 64)        { type = 'CYCLE'; w = 20; h = 10; }
    else if (pkt.size <= 512)  { type = 'CAR';   w = 40; h = 20; }
    else if (pkt.size <= 1024) { type = 'TRUCK'; w = 80; h = 25; }
    else                       { type = 'BUS';   w = 120; h = 30; }
  }

  const protocol = pkt.protocol || 'OTHER';
  const isOut = pkt.direction === 'OUTBOUND';
  const x = isOut ? -w - 100 : cw + 100;
  
  const speed = (Math.random() * 3 + 2) * (isOut ? 1 : -1) * (isDNS ? 1.5 : 1); // DNS is faster
  
  const halfH = ch / 2;
  const laneH = halfH / 4;
  const laneIdx = Math.floor(Math.random() * 4);
  const y = isOut 
    ? halfH + laneIdx * laneH + (laneH / 2) - (h / 2) 
    : laneIdx * laneH + (laneH / 2) - (h / 2);

  return {
    uid: pkt.uid || pkt.id,
    type, x, y, w, h, speed,
    baseSpeed: speed, laneIdx, targetY: y,
    protocol, size: pkt.size, isInbound: !isOut,
    srcIP: pkt.srcIP, dstIP: pkt.dstIP, srcPort: pkt.srcPort, dstPort: pkt.dstPort, geo: pkt.geo,
    ttl: pkt.ttl, tcpFlags: pkt.tcpFlags, tcpWindow: pkt.tcpWindow, seqNo: pkt.seqNo, ackNo: pkt.ackNo,
    suspicious: pkt.suspicious
  };
}

// Audio System using Web Audio API
class AudioEngine {
  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[Audio] AudioContext not available:', e.message);
      this.ctx = null;
    }
    this.enabled = false;
  }
  
  playAmbient() {
    if (!this.enabled || !this.ctx) return;
    // Simple synth chord for ambiance
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, this.ctx.currentTime); // A2
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.01, this.ctx.currentTime);
    osc.start();
    osc.stop(this.ctx.currentTime + 2);
  }

  playAlert() {
    if (!this.enabled || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }
}

export default function App() {
  const vehiclesRef  = useRef([]);
  const pausedRef    = useRef(false);
  const bwRef = useRef({ inBytes: 0, outBytes: 0, history: [] });
  const socketRef = useRef(null);

  const [connected, setConnected]           = useState(false);
  const [captureInfo, setCaptureInfo]       = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isPaused, setIsPaused]             = useState(false);
  const [filterOpen, setFilterOpen]         = useState(false);
  const [filters, setFilters]               = useState({ tcp: true, udp: true, icmp: true, portFilter: '', minSize: 0 });
  const [stats, setStats]                   = useState({ total: 0, inbound: 0, outbound: 0, pps: 0, fps: 0, bwIn: 0, bwOut: 0 });
  const [bwData, setBwData]                 = useState([]);
  
  const [analytics, setAnalytics]           = useState(null);
  const [showAnalytics, setShowAnalytics]   = useState(true);
  
  const [audioEnabled, setAudioEnabled]     = useState(false);
  const audioRef = useRef(null);
  const alertCooldown = useRef(0);

  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);
  const statsAccRef = useRef({ total: 0, inbound: 0, outbound: 0, ppsBuffer: [], fps: 0 });

  useEffect(() => {
    const socket = io(SERVER_URL, { reconnectionDelayMax: 5000, transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    
    socket.on('connect',       () => setConnected(true));
    socket.on('disconnect',    () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));
    socket.on('capture-status', (info) => {
      setCaptureInfo(info);
      if (info.isPaused !== undefined) {
        setIsPaused(info.isPaused);
        pausedRef.current = info.isPaused;
      }
    });

    socket.on('analytics', (data) => setAnalytics(data));
    socket.on('trigger-export', async () => {
      try {
        const response = await fetch(`${SERVER_URL}/export-pcap`);
        if (!response.ok) throw new Error('Failed to fetch capture data');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'packet-capture.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Export failed:", err);
        alert("Export failed: " + err.message);
      }
    });

    socket.on('packets', (packets) => {
      const f = filtersRef.current;
      
      packets.forEach(pkt => {
        if (!pkt) return;
        if (pkt.protocol === 'TCP'  && !f.tcp)  return;
        if (pkt.protocol === 'UDP'  && !f.udp)  return;
        if (pkt.protocol === 'ICMP' && !f.icmp) return;
        if (f.minSize > 0 && pkt.size < f.minSize) return;
        if (f.portFilter) {
          const p = parseInt(f.portFilter);
          if (!isNaN(p) && pkt.srcPort !== p && pkt.dstPort !== p) return;
        }

        const v = createVehicle(pkt, 2000, 800);
        vehiclesRef.current.push(v);

        if (pkt.suspicious && audioRef.current && Date.now() - alertCooldown.current > 1000) {
          audioRef.current.playAlert();
          alertCooldown.current = Date.now();
        }

        const sr = statsAccRef.current;
        sr.total++;
        sr.ppsBuffer.push(Date.now());
        if (pkt.direction === 'INBOUND') sr.inbound++; else sr.outbound++;
        if (pkt.direction === 'INBOUND') bwRef.current.inBytes += pkt.size; else bwRef.current.outBytes += pkt.size;
      });

      if (vehiclesRef.current.length > MAX_VEHICLES) {
        vehiclesRef.current.splice(0, vehiclesRef.current.length - MAX_VEHICLES);
      }
    });

    return () => socket.disconnect();
  }, []);

  // Ambient Audio Loop
  useEffect(() => {
    const iv = setInterval(() => {
      if (audioRef.current && !pausedRef.current) {
        audioRef.current.playAmbient();
      }
    }, 4000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const now = Date.now();
      const sr  = statsAccRef.current;
      sr.ppsBuffer = sr.ppsBuffer.filter(t => now - t < 1000);
      setStats({
        total   : sr.total,
        inbound : sr.inbound,
        outbound: sr.outbound,
        pps     : sr.ppsBuffer.length,
        fps     : Math.round(sr.fps || 0),
        bwIn    : (bwRef.current.inBytes / 1024).toFixed(1),
        bwOut   : (bwRef.current.outBytes / 1024).toFixed(1),
      });
    }, 500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => {
      const bw = bwRef.current;
      const now = new Date();
      const t = now.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
      const entry = { t, inKBs: +(bw.inBytes / 1024).toFixed(1), outKBs: +(bw.outBytes / 1024).toFixed(1) };
      bw.inBytes = 0; bw.outBytes = 0;
      bw.history.push(entry);
      if (bw.history.length > 60) bw.history.shift();
      setBwData([...bw.history]);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  const handlePause = () => {
    const next = !isPaused;
    if (socketRef.current) {
      if (next) socketRef.current.emit('pause-capture');
      else socketRef.current.emit('resume-capture');
    }
  };

  const handleExport = () => {
    if (socketRef.current) socketRef.current.emit('export-pcap');
  };

  const toggleAudio = () => {
    if (!audioRef.current) audioRef.current = new AudioEngine();
    const n = !audioEnabled;
    audioRef.current.enabled = n;
    if (n && audioRef.current.ctx.state === 'suspended') {
      audioRef.current.ctx.resume();
    }
    setAudioEnabled(n);
  };

  const handleVehicleSelect = (v) => {
    setSelectedVehicle(v);
  };

  const clearSelection = () => {
    setSelectedVehicle(null);
  };

  return (
    <div className='flex flex-col h-screen w-full bg-[#050510] text-text font-[var(--font-sans)] overflow-hidden relative'>
      <div className='absolute inset-0 z-0' onClick={clearSelection}>
        <Canvas3D 
          vehiclesRef={vehiclesRef}
          pausedRef={pausedRef}
          statsAccRef={statsAccRef}
          selectedVehicle={selectedVehicle}
          setSelectedVehicle={handleVehicleSelect}
        />
      </div>

      <div className='absolute inset-0 z-10 pointer-events-none flex flex-col justify-between p-4'>
        <div className='flex items-start justify-between w-full pointer-events-auto'>
          <div className='flex flex-col gap-2'>
            <div className='flex items-center gap-3 bg-surface/80 backdrop-blur-md border border-border px-4 py-2 rounded shadow-2xl'>
              <Network className='text-cyan animate-pulse' size={18} />
              <h1 className='font-[var(--font-display)] text-lg text-white font-bold tracking-widest uppercase'>
                Packet<span className='text-cyan font-light'>Way</span> 3D
              </h1>
              <div className='w-[1px] h-4 bg-border mx-2' />
              <div className='flex items-center gap-2'>
                <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500 animate-ping' : 'bg-red-500'}`} />
                <span className='text-[11px] font-mono font-bold text-muted uppercase tracking-widest'>
                  {connected ? 'LINK UP' : 'LINK DOWN'}
                </span>
              </div>
            </div>
            
            <div className='flex gap-2 mt-1'>
              <button onClick={() => setShowAnalytics(!showAnalytics)} className={`text-[10px] uppercase tracking-widest font-mono border px-2 py-1 rounded transition-colors ${showAnalytics ? 'bg-cyan/20 border-cyan text-cyan' : 'bg-surface/80 border-border text-muted hover:text-white'}`}>
                Analytics
              </button>
            </div>
            {captureInfo && (
              <div className='flex flex-col gap-1 bg-surface/80 backdrop-blur-md border border-border px-3 py-2 rounded shadow-lg max-w-[300px] mt-1'>
                <div className='text-[10px] font-mono text-cyan uppercase tracking-widest flex items-center gap-1'>
                  <Terminal size={10} /> Active Interface
                </div>
                <div className='text-xs text-text truncate' title={captureInfo.interfaceDesc || captureInfo.interfaceName}>
                  {captureInfo.interfaceDesc || captureInfo.interfaceName || 'Detecting...'}
                </div>
                {captureInfo.localIP && (
                  <div className='text-[10px] font-mono text-muted truncate'>
                    Local: {captureInfo.localIP}
                  </div>
                )}
                {captureInfo.error && (
                  <div className='text-[10px] font-mono text-red-400 truncate mt-1' title={captureInfo.error}>
                    ⚠ {captureInfo.error.split('\n')[0]}
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className='flex flex-col items-end gap-2'>
            <div className='flex items-center gap-2'>
              <button onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all ${audioEnabled ? 'border-cyan text-cyan' : 'border-border text-muted hover:text-text hover:border-text'}`}>
                {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleExport(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all border-border text-muted hover:text-text hover:border-cyan`}
                      title="Export PCAP / JSON">
                <Download size={16} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); setFilterOpen(!filterOpen); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all ${filterOpen ? 'border-cyan text-cyan' : 'border-border text-muted hover:text-text hover:border-text'}`}>
                <Settings size={16} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); handlePause(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all ${isPaused ? 'border-orange-500 text-orange-500 bg-orange-500/20' : 'border-border text-muted hover:text-text hover:border-text'}`}
                      title={isPaused ? "Resume Capture" : "Pause Capture"}>
                {isPaused ? <Play size={16} /> : <Pause size={16} />}
              </button>
            </div>
            {filterOpen && (
              <div className='pointer-events-auto' onClick={(e) => e.stopPropagation()}>
                <FilterPanel filters={filters} onUpdate={setFilters} />
              </div>
            )}
          </div>
        </div>

        <div className='flex justify-between items-end w-full pointer-events-none'>
          <div className='flex gap-4 bg-surface/80 backdrop-blur-md border border-border rounded-t px-6 py-3 shadow-2xl pointer-events-auto'>
            <StatBlock label='TOTAL PKT' value={stats.total.toLocaleString()} accent='#3b82f6' />
            <StatBlock label='PPS (1s)' value={stats.pps} accent='#a855f7' flash={stats.pps > 1000} />
            <StatBlock label='INBOUND' value={stats.inbound.toLocaleString()} icon={<ArrowDownLeft size={10}/>} accent='#3b82f6' />
            <StatBlock label='OUTBOUND' value={stats.outbound.toLocaleString()} icon={<ArrowUpRight size={10}/>} accent='#f97316' />
            <StatBlock label='FPS' value={stats.fps} accent={stats.fps > 50 ? '#10b981' : '#f59e0b'} />
          </div>
        </div>
      </div>
      
      {showAnalytics && <AnalyticsPanel analytics={analytics} onClose={() => setShowAnalytics(false)} />}
      <ManifestPanel vehicle={selectedVehicle} onClose={clearSelection} />
      
      <div className='relative z-20 pointer-events-auto'>
        <BandwidthChart data={bwData} />
      </div>
    </div>
  );
}
