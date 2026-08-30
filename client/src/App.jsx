import React, { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Network, Terminal, Settings, Play, Pause, ArrowDownLeft, ArrowUpRight, Activity, Box, X, Download, Upload, ShieldAlert, Volume2, VolumeX, Maximize, Minimize, Globe } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import Canvas2D from './Canvas2D';
import TopologyGraph from './TopologyGraph';
import GlobeView from './GlobeView';

// Use window.location.origin to support Localtunnel and Production deployments
const SERVER_URL = window.location.origin;

// OPTIMIZATION: Reduced MAX_VEHICLES to 2000 to save CPU and GPU draw calls.
const MAX_VEHICLES = 2000;

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

const highlightKeywords = (text) => {
  if (!text) return null;
  
  // Advanced Text Detection System
  const sensitivePatterns = [
    // 1. Sensitive Keywords (Credentials & HTTP)
    { regex: /(HTTP|GET|POST|PUT|DELETE|admin|password|passwd|root|user|login|auth|token|secret|key)/gi, class: "text-red-500 font-bold bg-red-500/20 px-[1px]" },
    // 2. Email Addresses
    { regex: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi, class: "text-purple-400 font-bold bg-purple-400/20 px-[1px] underline" },
    // 3. Bearer Tokens / JWT prefixes
    { regex: /(Bearer\s+[A-Za-z0-9-_.]+)/gi, class: "text-orange-500 font-bold bg-orange-500/20 px-[1px]" },
    // 4. SQL Injection / Malicious Queries
    { regex: /(SELECT|UNION|INSERT|DROP\s+TABLE|--|1=1)/gi, class: "text-rose-600 font-bold bg-rose-600/30 px-[1px]" }
  ];

  // We need to match any of these patterns. For simplicity in React, we'll build a combined Regex 
  // and prioritize the match classes.
  const combinedRegex = new RegExp(`(${sensitivePatterns.map(p => p.regex.source).join('|')})`, 'gi');
  
  const parts = text.split(combinedRegex).filter(Boolean); // Filter out undefined captured groups
  
  return parts.map((part, i) => {
    for (const pattern of sensitivePatterns) {
      if (part.match(new RegExp(`^${pattern.regex.source}$`, 'i'))) {
        return <span key={i} className={pattern.class} title="Sensitive Text Detected!">{part}</span>;
      }
    }
    return part;
  });
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
          {vehicle.hostname && (
             <div className='mt-2 pt-2 border-t border-border/50 text-center'>
               <span className='text-[9px] font-mono text-muted uppercase tracking-widest block mb-0.5'>DPI Extracted Host</span>
               <span className='text-[11px] font-mono font-bold text-green-400'>{vehicle.hostname}</span>
             </div>
          )}
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
        
        {vehicle.hexDump && (
          <div className='bg-bg border border-border rounded p-3 mt-1'>
            <div className='text-[9px] font-mono text-muted uppercase tracking-widest mb-2 flex justify-between'>
              <span>Hex Dump (First {vehicle.hexDump.length/2} bytes)</span>
              <span>ASCII</span>
            </div>
            <div className='flex justify-between gap-4 font-mono text-[9px] leading-[1.3]'>
              <div className='text-cyan/70 break-all w-2/3'>
                {vehicle.hexDump.match(/.{1,2}/g)?.join(' ')}
              </div>
              <div className='text-white/60 break-all w-1/3 text-right' style={{ wordBreak: 'break-all' }}>
                {highlightKeywords(vehicle.asciiDump)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreatLogPanel({ incidents, onClose, onBlockIP, blockedIPs }) {
  if (!incidents) return null;

  return (
    <div className='absolute left-4 top-[25rem] w-[300px] h-[300px] bg-surface/90 backdrop-blur-xl border border-red-500/30 shadow-2xl flex flex-col pointer-events-auto rounded-md overflow-hidden z-40'>
      <div className='bg-red-950/40 p-3 border-b border-red-500/50 flex justify-between items-center'>
        <div className='flex items-center gap-2'>
          <ShieldAlert size={14} className="text-red-500 animate-pulse" />
          <h2 className='font-[var(--font-display)] text-sm font-bold text-red-500 uppercase tracking-widest'>Threat Log</h2>
        </div>
        <button onClick={onClose} className='text-red-400 hover:text-red-300'>
          <X size={14} />
        </button>
      </div>

      <div className='p-2 flex-1 overflow-y-auto flex flex-col gap-2'>
        {incidents.length === 0 ? (
          <div className="text-muted text-xs flex justify-center items-center h-full font-mono">No threats detected.</div>
        ) : incidents.map((inc) => (
          <div key={inc.id} className="bg-bg/60 border border-red-500/20 rounded p-2 flex flex-col gap-1">
            <div className="flex justify-between items-start">
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${inc.severity === 'CRITICAL' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                {inc.type}
              </span>
              <span className="text-[9px] text-muted font-mono">{new Date(inc.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-[11px] text-red-200 mt-1 leading-tight">{inc.msg}</div>
            <div className="flex justify-between items-center mt-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono">{inc.geo?.flag || '🌐'}</span>
                <span className="text-[10px] font-mono text-cyan">{inc.srcIP}</span>
              </div>
              {!blockedIPs.has(inc.srcIP) ? (
                 <button onClick={() => onBlockIP(inc.srcIP)} className="text-[9px] uppercase font-bold text-red-500 border border-red-500/50 hover:bg-red-500 hover:text-white px-2 py-0.5 rounded transition-colors">Block IP</button>
              ) : (
                 <span className="text-[9px] uppercase font-bold text-white bg-red-600 px-2 py-0.5 rounded flex items-center gap-1"><ShieldAlert size={8} /> Blocked</span>
              )}
            </div>
          </div>
        ))}
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
  
  const speed = (Math.random() * 2 + 1.5) * (isOut ? 1 : -1) * (isDNS ? 1.5 : 1); // Reduced speed
  
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
  const [incidents, setIncidents]           = useState([]);
  const [showThreatLog, setShowThreatLog]   = useState(true);
  const [viewMode, setViewMode]             = useState('highway');
  
  const [audioEnabled, setAudioEnabled]     = useState(false);
  const audioRef = useRef(null);
  const alertCooldown = useRef(0);

  const [isFullscreen, setIsFullscreen]     = useState(false);
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
      }
    }
  };
  useEffect(() => {
    const handleFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFs);
    return () => document.removeEventListener('fullscreenchange', handleFs);
  }, []);

  const fileInputRef = useRef(null);
  const first3000Ref = useRef([]);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const [blockedIPs, setBlockedIPs] = useState(new Set());
  
  const handleBlockIP = (ip) => {
    if(socketRef.current) socketRef.current.emit('block-ip', ip);
    setBlockedIPs(prev => {
       const next = new Set(prev);
       next.add(ip);
       return next;
    });
    alert(`Firewall Rule Added: ${ip} is now actively blocked at the network edge.`);
  };
  
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
    socket.on('incident-alert', (incident) => {
      setIncidents(prev => [incident, ...prev].slice(0, 50));
      if (audioRef.current && audioRef.current.enabled && Date.now() - alertCooldown.current > 1000) {
        audioRef.current.playAlert();
        alertCooldown.current = Date.now();
      }
    });
    socket.on('trigger-export', async () => {
      try {
        const response = await fetch(`${SERVER_URL}/export-pcap`);
        if (!response.ok) throw new Error('Failed to fetch capture data');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'packet-capture.csv';
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
        if (first3000Ref.current.length < 3000) {
          first3000Ref.current.push(pkt);
        }

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

  const downloadFirst3000 = () => {
    const data = first3000Ref.current;
    if (data.length === 0) return alert("No packets captured yet!");
    
    const headers = ['ID', 'Timestamp', 'Direction', 'Protocol', 'Source', 'Dest', 'Size', 'Suspicious', 'Hostname'];
    const rows = data.map(p => [
       p.id || p.uid || 'N/A',
       p.timestamp ? new Date(p.timestamp).toISOString() : 'N/A',
       p.direction || (p.isInbound ? 'INBOUND' : 'OUTBOUND'),
       p.protocol || 'UNKNOWN',
       p.src || `${p.srcIP}:${p.srcPort}`,
       p.dst || `${p.dstIP}:${p.dstPort}`,
       p.size || 0,
       p.suspicious ? 'Yes' : 'No',
       p.hostname || ''
    ]);
    
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `packet_capture_3000_${Date.now()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
       try {
         let data = [];
         if (file.name.endsWith('.json')) {
            data = JSON.parse(event.target.result);
         } else if (file.name.endsWith('.csv')) {
            const lines = event.target.result.split('\n');
            const headers = lines[0].split(',');
            for(let i=1; i<lines.length; i++) {
               if(!lines[i]) continue;
               const vals = lines[i].split(',');
               let obj = {};
               headers.forEach((h, idx) => { obj[h.trim()] = vals[idx]?.trim(); });
               obj.size = parseInt(obj.Size) || 0;
               obj.direction = obj.Direction;
               obj.srcIP = obj.Source ? obj.Source.split(':')[0] : '';
               obj.dstIP = obj.Dest ? obj.Dest.split(':')[0] : '';
               obj.protocol = obj.Protocol;
               obj.suspicious = obj.Suspicious === 'Yes';
               obj.geo = { ll: [37 + Math.random()*10, -122 + Math.random()*10] }; // fake geo for replay visualization if missing
               data.push(obj);
            }
         }
         
         if (socketRef.current) socketRef.current.disconnect();
         setIsReplayMode(true);
         pausedRef.current = true;
         vehiclesRef.current = data.map((d, i) => ({ ...d, id: i.toString() }));
         alert(`Forensic Mode: Loaded ${data.length} packets from ${file.name}. Click Play to resume visualizer.`);
       } catch (err) {
         console.error(err);
         alert("Failed to parse forensic file.");
       }
    };
    reader.readAsText(file);
  };

  return (
    <div className='flex flex-col h-screen w-full bg-[#050510] text-text font-[var(--font-sans)] overflow-hidden relative'>
      <div className='absolute inset-0 z-0' onClick={clearSelection}>
        {viewMode === 'highway' ? (
          <Canvas2D 
            vehiclesRef={vehiclesRef}
            pausedRef={pausedRef}
            statsAccRef={statsAccRef}
            selectedVehicle={selectedVehicle}
            setSelectedVehicle={handleVehicleSelect}
          />
        ) : viewMode === 'topology' ? (
          <TopologyGraph 
            vehiclesRef={vehiclesRef} 
            pausedRef={pausedRef} 
          />
        ) : (
          <GlobeView
            vehiclesRef={vehiclesRef} 
            pausedRef={pausedRef} 
          />
        )}
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
                <div className={`w-2 h-2 rounded-full ${isReplayMode ? 'bg-purple-500 animate-pulse' : connected ? 'bg-green-500 animate-ping' : 'bg-red-500'}`} />
                <span className={`text-[11px] font-mono font-bold ${isReplayMode ? 'text-purple-400' : 'text-muted'} uppercase tracking-widest`}>
                  {isReplayMode ? 'FORENSIC REPLAY' : connected ? 'LINK UP' : 'LINK DOWN'}
                </span>
              </div>
            </div>
            
            <div className='flex flex-wrap gap-2 mt-2 max-w-[400px]'>
              <button onClick={() => {
                if (viewMode === 'highway') setViewMode('topology');
                else if (viewMode === 'topology') setViewMode('globe');
                else setViewMode('highway');
              }} className={`text-[10px] uppercase tracking-widest font-mono border px-4 py-2 rounded transition-colors ${viewMode === 'globe' ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold' : viewMode === 'topology' ? 'bg-purple-500/20 border-purple-500 text-purple-400 font-bold' : 'bg-surface/90 border-border text-muted hover:text-white'}`}>
                <span className="flex items-center gap-1"><Globe size={12} /> {viewMode === 'highway' ? 'View Topology' : viewMode === 'topology' ? 'View Globe' : 'View Highway'}</span>
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
            <div className='flex flex-col gap-2 mb-4 pointer-events-auto'>
              <button onClick={() => setShowAnalytics(!showAnalytics)} className={`text-sm uppercase tracking-widest font-mono border-2 px-6 py-3 rounded transition-all shadow-xl ${showAnalytics ? 'bg-cyan border-cyan text-black font-bold' : 'bg-surface/90 border-cyan/50 text-cyan hover:bg-cyan hover:text-black'}`}>
                📊 Analytics Console
              </button>
              <button onClick={() => setShowThreatLog(!showThreatLog)} className={`text-sm uppercase tracking-widest font-mono border-2 px-6 py-3 rounded transition-all shadow-xl ${showThreatLog ? 'bg-red-500 border-red-500 text-white font-bold animate-pulse' : 'bg-surface/90 border-red-500/50 text-red-500 hover:bg-red-500 hover:text-white'}`}>
                🛡️ Threat Log {incidents.length > 0 && `(${incidents.length})`}
              </button>
              <button onClick={downloadFirst3000} className="text-sm uppercase tracking-widest font-mono border-2 px-6 py-3 rounded transition-all shadow-xl bg-blue-600/20 border-blue-500 text-blue-400 font-bold hover:bg-blue-600 hover:text-white flex items-center justify-center gap-2">
                <Download size={16} /> Download 3000 Packets
              </button>
            </div>
            
            <div className='flex items-center gap-2 pointer-events-auto'>
              <button onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all border-border text-muted hover:text-text hover:border-cyan`}
                      title="Toggle Fullscreen">
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); toggleAudio(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all ${audioEnabled ? 'border-cyan text-cyan' : 'border-border text-muted hover:text-text hover:border-text'}`}>
                {audioEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
              <button onClick={(e) => { e.stopPropagation(); handleExport(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all border-border text-muted hover:text-text hover:border-cyan`}
                      title="Export PCAP / JSON">
                <Download size={16} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                      className={`p-2 rounded border bg-surface/80 backdrop-blur transition-all ${isReplayMode ? 'border-purple-500 text-purple-400' : 'border-border text-muted hover:text-text hover:border-purple-500'}`}
                      title="Forensic Upload (CSV/JSON)">
                <Upload size={16} />
              </button>
              <input type="file" accept=".json,.csv" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
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
      {showThreatLog && <ThreatLogPanel incidents={incidents} onClose={() => setShowThreatLog(false)} onBlockIP={handleBlockIP} blockedIPs={blockedIPs} />}
      <ManifestPanel vehicle={selectedVehicle} onClose={clearSelection} />
      
      <div className='absolute bottom-16 left-4 right-4 z-0 pointer-events-auto'>
        <BandwidthChart data={bwData} />
      </div>
    </div>
  );
}
