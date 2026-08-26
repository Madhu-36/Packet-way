import React, { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Filter, X, Pause, Play, Wifi, WifiOff, Globe,
  Gauge, MonitorUp, MonitorDown, Layers, Search, SlidersHorizontal,
} from 'lucide-react';

// ═════════════════════════════════════════════════════════════════════
//  CONSTANTS
// ═════════════════════════════════════════════════════════════════════
const SERVER_URL   = 'http://localhost:3001';
const MAX_VEHICLES = 200;
const LANE_COUNT   = 4; // per direction

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
  OTHER: '#6b728050',
};

// Realistic metallic paint palettes
const PROTO_PAINT = {
  TCP  : { d: '#1e3a8a', m: '#3b82f6', l: '#93c5fd', roof: '#2563eb' },
  UDP  : { d: '#78350f', m: '#f59e0b', l: '#fcd34d', roof: '#d97706' },
  ICMP : { d: '#4c1d95', m: '#a855f7', l: '#d8b4fe', roof: '#9333ea' },
  OTHER: { d: '#374151', m: '#6b7280', l: '#d1d5db', roof: '#4b5563' },
};

const TYPE_CFG = {
  CYCLE: { w: [28, 38],  h: [14, 18],  spd: [5.5, 8.5] },
  CAR  : { w: [52, 68],  h: [24, 32],  spd: [3.0, 5.0] },
  TRUCK: { w: [80, 105], h: [30, 38],  spd: [1.8, 3.2] },
  BUS  : { w: [115,145], h: [34, 44],  spd: [0.8, 1.8] },
};

function rnd(lo, hi)    { return lo + Math.random() * (hi - lo); }
function rndInt(lo, hi) { return Math.floor(rnd(lo, hi + 1)); }

// ═════════════════════════════════════════════════════════════════════
//  VEHICLE FACTORY
// ═════════════════════════════════════════════════════════════════════
let uidCounter = 0;

function createVehicle(pkt, cw, ch) {
  const type = pkt.size <= 64 ? 'CYCLE' : pkt.size <= 512 ? 'CAR' : pkt.size <= 1024 ? 'TRUCK' : 'BUS';
  const cfg = TYPE_CFG[type] || TYPE_CFG.CAR;
  
  // Back to horizontal: W is length, H is width
  const w = Math.floor(Math.random() * (cfg.w[1] - cfg.w[0]) + cfg.w[0]);
  const h = Math.floor(Math.random() * (cfg.h[1] - cfg.h[0]) + cfg.h[0]);
  
  // Outbound drives Left-to-Right, Inbound drives Right-to-Left
  const isOut = pkt.direction === 'OUTBOUND';
  const x = isOut ? -w - 100 : cw + 100;
  const speed = (Math.random() * (cfg.spd[1] - cfg.spd[0]) + cfg.spd[0]) * (isOut ? 1 : -1);
  
  // Y: Lanes
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
    baseSpeed: speed, laneIdx, targetY: y,
    color: color, glowColor: glow,
    protocol, size: pkt.size, isInbound: !isOut,
    srcIP: pkt.srcIP, dstIP: pkt.dstIP, srcPort: pkt.srcPort, dstPort: pkt.dstPort, geo: pkt.geo,
    ttl: pkt.ttl, tcpFlags: pkt.tcpFlags, tcpWindow: pkt.tcpWindow, seqNo: pkt.seqNo, ackNo: pkt.ackNo
  };
}

// ═════════════════════════════════════════════════════════════════════
//  CANVAS: Road Drawing
// ═════════════════════════════════════════════════════════════════════
function drawRoad(ctx, w, h) {
  ctx.fillStyle = '#05050f';
  ctx.fillRect(0, 0, w, h);

  const halfH = h / 2;
  const laneH = halfH / 4;

  // Road surface gradient
  const gi = ctx.createLinearGradient(0, 0, 0, halfH);
  gi.addColorStop(0, '#07091a'); gi.addColorStop(0.5, '#060815'); gi.addColorStop(1, '#07091a');
  ctx.fillStyle = gi;
  ctx.fillRect(0, 0, w, halfH);

  const go = ctx.createLinearGradient(0, halfH, 0, h);
  go.addColorStop(0, '#10070a'); go.addColorStop(0.5, '#0b0508'); go.addColorStop(1, '#10070a');
  ctx.fillStyle = go;
  ctx.fillRect(0, halfH, w, halfH);

  // Outer borders
  ctx.fillStyle = '#00f5ff22'; ctx.fillRect(0, 0, w, 2);
  ctx.fillStyle = '#ff335522'; ctx.fillRect(0, h - 2, w, 2);

  // Center median divider (glowing double line)
  ctx.shadowBlur = 8; ctx.shadowColor = '#00f5ff';
  ctx.fillStyle = '#00f5ff88'; ctx.fillRect(0, halfH - 2, w, 1);
  ctx.shadowColor = '#ff3355';
  ctx.fillStyle = '#ff335588'; ctx.fillRect(0, halfH + 1, w, 1);
  ctx.shadowBlur = 0;

  // Dashed lane lines
  ctx.strokeStyle = '#ffffff15'; ctx.lineWidth = 1;
  ctx.setLineDash([20, 20]);
  for (let i = 1; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(0, i * laneH); ctx.lineTo(w, i * laneH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, halfH + i * laneH); ctx.lineTo(w, halfH + i * laneH); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Legends
  ctx.save();
  ctx.font = 'bold 14px "Share Tech Mono", monospace';
  ctx.fillStyle = '#3b82f60a';
  ctx.textAlign = 'left';
  ctx.fillText('◀  INBOUND  ·  TCP  ·  UDP  ·  ICMP', 16, laneH * 0.55);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff33550a';
  ctx.fillText('OUTBOUND  ·  TCP  ·  UDP  ·  ICMP  ▶', w - 16, halfH + laneH * 0.55);
  ctx.restore();
}
// ═════════════════════════════════════════════════════════════════════
//  CANVAS: Vehicle Drawings
// ═════════════════════════════════════════════════════════════════════

// ── CYCLE (0-64 B) ─────────────────
function drawCycle(ctx, v) {
  const { x, y, w, h, isInbound, protocol } = v;
  const paint = PROTO_PAINT[protocol] || PROTO_PAINT.OTHER;
  
  // Rider and bike frame
  ctx.fillStyle = paint.d;
  ctx.beginPath();
  ctx.roundRect(x + w * 0.2, y + h * 0.2, w * 0.6, h * 0.6, 4);
  ctx.fill();
  
  // Helmet
  ctx.fillStyle = paint.l;
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h / 2, h * 0.3, 0, Math.PI * 2);
  ctx.fill();
  
  // Wheels
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.roundRect(!isInbound ? x + w - 4 : x + 2, y + h / 2 - 2, 4, 4, 1); ctx.fill();
  ctx.beginPath(); ctx.roundRect(!isInbound ? x + 2 : x + w - 4, y + h / 2 - 2, 4, 4, 1); ctx.fill();
}

// ── CAR (65-512 B) ─────────────────
function drawCar(ctx, v) {
  const { x, y, w, h, isInbound, protocol } = v;
  const paint = PROTO_PAINT[protocol] || PROTO_PAINT.OTHER;
  
  // Main body
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, paint.d); grad.addColorStop(0.5, paint.m); grad.addColorStop(1, paint.d);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y + 2, w, h - 4, 6);
  ctx.fill();

  // Roof
  ctx.fillStyle = paint.roof;
  ctx.beginPath();
  ctx.roundRect(x + w * 0.25, y + 4, w * 0.45, h - 8, 3);
  ctx.fill();
  
  // Windshields (dark glass)
  ctx.fillStyle = '#111928';
  // Front Windshield
  const frontX = !isInbound ? x + w * 0.7 : x + w * 0.15;
  ctx.beginPath(); ctx.roundRect(frontX, y + 4, w * 0.15, h - 8, 2); ctx.fill();
  // Rear Window
  const rearX = !isInbound ? x + w * 0.15 : x + w * 0.7;
  ctx.beginPath(); ctx.roundRect(rearX, y + 5, w * 0.12, h - 10, 2); ctx.fill();

  // Headlights
  ctx.fillStyle = '#ffffe0';
  const hx = !isInbound ? x + w - 2 : x;
  ctx.fillRect(hx, y + 4, 2, 3);
  ctx.fillRect(hx, y + h - 7, 2, 3);
  
  // Taillights
  ctx.fillStyle = '#ff3333';
  const tx = !isInbound ? x : x + w - 2;
  ctx.fillRect(tx, y + 4, 2, 3);
  ctx.fillRect(tx, y + h - 7, 2, 3);
}

// ── TRUCK (513-1024 B) ─────────────────
function drawTruck(ctx, v) {
  const { x, y, w, h, isInbound, protocol } = v;
  const paint = PROTO_PAINT[protocol] || PROTO_PAINT.OTHER;
  
  const cabW = w * 0.25;
  const cargoW = w - cabW - 2;
  const cabX = !isInbound ? x + cargoW + 2 : x;
  const cargoX = !isInbound ? x : x + cabW + 2;
  
  // Cargo Trailer (Realistic white/grey)
  const cGrad = ctx.createLinearGradient(0, y, 0, y + h);
  cGrad.addColorStop(0, '#d1d5db'); cGrad.addColorStop(0.5, '#f3f4f6'); cGrad.addColorStop(1, '#9ca3af');
  ctx.fillStyle = cGrad;
  ctx.beginPath(); ctx.roundRect(cargoX, y, cargoW, h, 2); ctx.fill();
  
  // Cab
  const cabGrad = ctx.createLinearGradient(0, y, 0, y + h);
  cabGrad.addColorStop(0, paint.d); cabGrad.addColorStop(0.5, paint.m); cabGrad.addColorStop(1, paint.d);
  ctx.fillStyle = cabGrad;
  ctx.beginPath(); ctx.roundRect(cabX, y + 2, cabW, h - 4, 4); ctx.fill();
  
  // Cab Windshield
  ctx.fillStyle = '#111928';
  const glassX = !isInbound ? cabX + cabW * 0.5 : cabX + cabW * 0.2;
  ctx.beginPath(); ctx.roundRect(glassX, y + 4, cabW * 0.3, h - 8, 1); ctx.fill();
}

// ── BUS (1025+ B) ─────────────────
function drawBus(ctx, v) {
  const { x, y, w, h, isInbound, protocol } = v;
  const paint = PROTO_PAINT[protocol] || PROTO_PAINT.OTHER;
  
  // Main body
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, paint.d); grad.addColorStop(0.5, paint.m); grad.addColorStop(1, paint.d);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill();
  
  // Roof AC units
  ctx.fillStyle = '#e5e7eb';
  ctx.beginPath(); ctx.roundRect(x + w * 0.2, y + h / 2 - 3, w * 0.15, 6, 2); ctx.fill();
  ctx.beginPath(); ctx.roundRect(x + w * 0.6, y + h / 2 - 3, w * 0.15, 6, 2); ctx.fill();
  
  // Front Windshield
  ctx.fillStyle = '#111928';
  ctx.beginPath(); ctx.roundRect(!isInbound ? x + w - 8 : x + 2, y + 2, 6, h - 4, 2); ctx.fill();
}

// ── Generic vehicle renderer with rich info overlay ─────────────────
function drawVehicle(ctx, v, isSelected) {
  const { x, y, w, h, type, color, id } = v;
  ctx.save();
  
  if (isSelected) {
    ctx.shadowBlur = 10; ctx.shadowColor = '#ffffff';
    ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.rect(x - 4, y - 4, w + 8, h + 8); ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // NO SHINING: removed the overall neon glow
  
  switch (type) {
    case 'CYCLE': drawCycle(ctx, v); break;
    case 'CAR':   drawCar(ctx, v);   break;
    case 'TRUCK': drawTruck(ctx, v); break;
    case 'BUS':   drawBus(ctx, v);   break;
    default:      drawCar(ctx, v);
  }

  // ── RICH INFO OVERLAY (Only drawn if packet matches some condition, or always shown? Currently always drawn) ──────────────────
  const protoStr = v.protocol || '??';
  const sizeStr  = v.size > 999 ? (v.size / 1024).toFixed(1) + 'K' : v.size + 'B';
  const dirArrow = v.isInbound ? '◀' : '▶';
  const srcShort = (v.srcIP || '?').split('.').slice(-2).join('.');
  const dstShort = (v.dstIP || '?').split('.').slice(-2).join('.');
  const portStr  = v.dstPort ? ':' + v.dstPort : '';
  const geoFlag  = v.geo?.flag && v.geo.flag !== '🌐' ? ' ' + v.geo.flag : '';

  const line1 = protoStr + ' ' + sizeStr + ' ' + dirArrow;
  const line2 = srcShort + '→' + dstShort + portStr + geoFlag;

  ctx.font = 'bold 8px "Share Tech Mono", monospace';
  const w1 = ctx.measureText(line1).width;
  ctx.font = '7px "Share Tech Mono", monospace';
  const w2 = ctx.measureText(line2).width;
  const infoW = Math.max(w1, w2) + 14;
  const infoH = 24;
  const infoX = x + w / 2 - infoW / 2;
  const infoY = y - infoH - 6;

  ctx.fillStyle = '#111827dd';
  ctx.strokeStyle = '#374151'; ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.roundRect(infoX, infoY, infoW, infoH, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(infoX + 1, infoY + 2, 2, infoH - 4);
  ctx.font = 'bold 8px "Share Tech Mono", monospace';
  ctx.fillStyle = color; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(line1, infoX + 6, infoY + 3);
  ctx.font = '7px "Share Tech Mono", monospace';
  ctx.fillStyle = '#9ca3af';
  ctx.fillText(line2, infoX + 6, infoY + 13);

  ctx.restore();
}

// ── HUD overlay on canvas ───────────────────────────────────────────
function drawCanvasHUD(ctx, w, h, vehicles) {
  const inC  = vehicles.filter(v => v.isInbound).length;
  const outC = vehicles.length - inC;
  const halfH = h / 2;
  ctx.save();
  ctx.font = 'bold 10px "Orbitron", sans-serif';
  ctx.fillStyle = '#3b82f688'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`◀ INBOUND  ${inC}`, 12, 8);
  ctx.fillStyle = '#ff335588'; ctx.textAlign = 'right';
  ctx.fillText(`${outC}  OUTBOUND ▶`, w - 12, halfH + 8);

  // Legend
  const lx = 10, ly = halfH - 82;
  ctx.fillStyle = '#00000099';
  ctx.beginPath(); ctx.roundRect(lx, ly, 150, 74, 4); ctx.fill();
  ctx.strokeStyle = '#1a2a3a'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.font = 'bold 8px "Share Tech Mono", monospace';
  const leg = [
    { c: '#3b82f6', l: '🏍  Cycle   ≤ 64 B' },
    { c: '#f59e0b', l: '🚗  Car     65–512 B' },
    { c: '#a855f7', l: '🚛  Truck   513–1024 B' },
    { c: '#ef4444', l: '🚌  Bus     > 1024 B' },
  ];
  leg.forEach((it, i) => {
    const iy = ly + 10 + i * 15;
    ctx.fillStyle = it.c; ctx.fillRect(lx + 6, iy + 1, 7, 7);
    ctx.fillStyle = '#c8d0e8'; ctx.textAlign = 'left'; ctx.fillText(it.l, lx + 18, iy);
  });
  ctx.restore();
}

// ═════════════════════════════════════════════════════════════════════
//  MANIFEST PANEL
// ═════════════════════════════════════════════════════════════════════
function ManifestRow({ label, value, accent }) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-border gap-2">
      <span className="text-muted text-[11px] font-mono uppercase tracking-wider shrink-0">{label}</span>
      <span className="text-right text-[12px] font-mono break-all" style={{ color: accent || '#c8d0e8' }}>{value}</span>
    </div>
  );
}

const PROTO_BADGE = {
  TCP  : { bg: 'bg-blue-950', border: 'border-blue-500', text: 'text-blue-400' },
  UDP  : { bg: 'bg-amber-950', border: 'border-amber-500', text: 'text-amber-400' },
  ICMP : { bg: 'bg-purple-950', border: 'border-purple-500', text: 'text-purple-400' },
  OTHER: { bg: 'bg-gray-900', border: 'border-gray-500', text: 'text-gray-400' },
};

const TYPE_EMOJI = { CYCLE: '🏍️', CAR: '🚗', TRUCK: '🚛', BUS: '🚌' };
const TYPE_LABEL = { CYCLE: '0–64 B', CAR: '65–512 B', TRUCK: '513–1024 B', BUS: '1025+ B' };

function ManifestPanel({ vehicle, onClose, onPauseToggle, isPaused }) {
  if (!vehicle) return null;
  const pb  = PROTO_BADGE[vehicle.protocol] || PROTO_BADGE.OTHER;
  const col = PROTO_COLOR[vehicle.protocol] || PROTO_COLOR.OTHER;
  const fmtTs = ts => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };
  const geo = vehicle.geo || {};

  return (
    <div className="animate-slide-in absolute top-0 right-0 w-[360px] h-full flex flex-col z-50 backdrop-blur-xl overflow-hidden"
         style={{ background: 'linear-gradient(160deg, #08081a, #0a0a22)', borderLeft: `1px solid ${col}40` }}>
      {/* Glow edge */}
      <div className="absolute top-0 left-0 w-[2px] h-full opacity-60"
           style={{ background: `linear-gradient(180deg, transparent, ${col}, transparent)` }} />

      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <div>
          <div className="font-[var(--font-display)] text-[13px] font-bold tracking-widest" style={{ color: col }}>
            ▌ CARGO MANIFEST
          </div>
          <div className="font-mono text-[11px] text-muted mt-1">
            {TYPE_EMOJI[vehicle.type]} {vehicle.type} · LIVE CAPTURE
          </div>
        </div>
        <button onClick={onClose}
                className="bg-surface border border-border text-muted hover:text-text hover:border-border2 rounded px-2.5 py-1 font-mono text-sm cursor-pointer transition-colors">
          <X size={14} />
        </button>
      </div>

      {/* Vehicle ID hero */}
      <div className="px-5 py-4 border-b border-border shrink-0" style={{ background: col + '0c' }}>
        <div className="font-[var(--font-display)] text-[22px] font-black tracking-wide" style={{ color: col, textShadow: `0 0 16px ${col}` }}>
          #{(vehicle.id || '').slice(0, 8)}
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          <span className={`${pb.bg} border ${pb.border} ${pb.text} font-mono text-[11px] px-2.5 py-0.5 rounded font-semibold tracking-wider`}>
            {vehicle.protocol}
          </span>
          <span className={`font-mono text-[11px] px-2.5 py-0.5 rounded font-semibold tracking-wide border ${vehicle.isInbound ? 'bg-green-950 border-green-500 text-green-400' : 'bg-red-950 border-red-500 text-red-400'}`}>
            {vehicle.isInbound ? '◀ INBOUND' : '▶ OUTBOUND'}
          </span>
          <span className="bg-yellow-950 border border-yellow-600 text-yellow-400 font-mono text-[11px] px-2.5 py-0.5 rounded tracking-wide">
            {vehicle.size} B · {TYPE_LABEL[vehicle.type]}
          </span>
        </div>
      </div>

      {/* Data rows */}
      <div className="px-5 overflow-y-auto flex-1">
        <ManifestRow label="Packet ID" value={(vehicle.id || '').slice(0, 13) + '…'} accent={col} />
        <ManifestRow label="Source" value={vehicle.src || '—'} />
        <ManifestRow label="Destination" value={vehicle.dst || '—'} />
        <ManifestRow label="Protocol" value={vehicle.protocol} accent={col} />
        <ManifestRow label="Payload Size" value={`${vehicle.size} bytes (${(vehicle.size / 1024).toFixed(2)} KB)`} accent="#ffd700" />
        <ManifestRow label="Vehicle Class" value={`${TYPE_EMOJI[vehicle.type]} ${vehicle.type}`} accent={col} />
        <ManifestRow label="Captured At" value={fmtTs(vehicle.timestamp)} />
        {geo.country && geo.country !== '??' && (
          <>
            <ManifestRow label="GeoIP Country" value={`${geo.flag || '🌐'} ${geo.country}`} accent="#00f5ff" />
            {geo.city && <ManifestRow label="GeoIP City" value={geo.city} accent="#00f5ff" />}
          </>
        )}
        {vehicle.ttl != null && <ManifestRow label="IP TTL" value={vehicle.ttl} />}
        {vehicle.tcpFlags && (
          <ManifestRow 
            label="TCP Flags" 
            value={Object.entries(vehicle.tcpFlags)
              .filter(([_, v]) => v)
              .map(([k]) => k.toUpperCase())
              .join(' · ') || 'NONE'} 
            accent={col} 
          />
        )}
        {vehicle.seqNo != null && <ManifestRow label="Sequence No" value={vehicle.seqNo} />}
        {vehicle.ackNo != null && <ManifestRow label="Ack No" value={vehicle.ackNo} />}
        {vehicle.tcpWindow != null && <ManifestRow label="TCP Window" value={vehicle.tcpWindow} />}
      </div>

      {/* Footer */}
      <div className="flex gap-2 px-5 py-3 border-t border-border shrink-0">
        <button onClick={onPauseToggle}
                className={`flex-1 font-mono text-[12px] py-2 rounded cursor-pointer transition-colors tracking-wider border ${isPaused ? 'bg-green-950 border-green-500 text-green-400' : 'bg-orange-950 border-orange-500 text-orange-400'}`}>
          {isPaused ? '▶  RESUME' : '⏸  PAUSE'}
        </button>
        <button onClick={onClose}
                className="flex-1 bg-surface border border-border text-muted font-mono text-[12px] py-2 rounded cursor-pointer hover:text-text hover:border-border2 transition-colors tracking-wider">
          ✕  CLOSE
        </button>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  FILTER PANEL
// ═════════════════════════════════════════════════════════════════════
function FilterPanel({ filters, onUpdate, isOpen, onToggle }) {
  if (!isOpen) return null;
  const toggle = (key) => onUpdate({ ...filters, [key]: !filters[key] });
  return (
    <div className="w-[200px] shrink-0 border-r border-border bg-surface flex flex-col overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2 text-[12px] font-[var(--font-display)] text-cyan tracking-widest font-bold">
          <SlidersHorizontal size={14} /> FILTERS
        </div>
        <button onClick={onToggle} className="text-muted hover:text-text cursor-pointer"><X size={14} /></button>
      </div>

      {/* Protocol toggles */}
      <div className="px-3 py-3 border-b border-border">
        <div className="text-[10px] font-mono text-muted tracking-wider mb-2 uppercase">Protocol</div>
        {['TCP', 'UDP', 'ICMP'].map(proto => {
          const active = filters[proto.toLowerCase()];
          const c = PROTO_COLOR[proto];
          return (
            <button key={proto} onClick={() => toggle(proto.toLowerCase())}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-[11px] font-mono mb-1 cursor-pointer transition-all border ${active ? 'border-opacity-60' : 'border-transparent opacity-40'}`}
                    style={{ borderColor: active ? c : 'transparent', background: active ? c + '15' : 'transparent', color: active ? c : '#5a6080' }}>
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: active ? c : '#333' }} />
              {proto}
            </button>
          );
        })}
      </div>

      {/* Port filter */}
      <div className="px-3 py-3 border-b border-border">
        <div className="text-[10px] font-mono text-muted tracking-wider mb-2 uppercase">Port Filter</div>
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
          <input type="text" placeholder="e.g. 443"
                 value={filters.portFilter}
                 onChange={e => onUpdate({ ...filters, portFilter: e.target.value })}
                 className="w-full bg-bg border border-border rounded px-2 pl-7 py-1.5 text-[11px] font-mono text-text placeholder:text-dim focus:outline-none focus:border-cyan" />
        </div>
      </div>

      {/* Size slider */}
      <div className="px-3 py-3">
        <div className="text-[10px] font-mono text-muted tracking-wider mb-2 uppercase">Min Size (bytes)</div>
        <input type="range" min={0} max={1500} step={10}
               value={filters.minSize}
               onChange={e => onUpdate({ ...filters, minSize: parseInt(e.target.value) })}
               className="w-full accent-cyan" />
        <div className="text-[11px] font-mono text-dim mt-1">≥ {filters.minSize} B</div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  BANDWIDTH CHART (Recharts)
// ═════════════════════════════════════════════════════════════════════
function BandwidthChart({ data }) {
  return (
    <div className="h-[110px] shrink-0 border-t border-border bg-surface px-2 pt-1">
      <div className="flex items-center gap-2 px-2 py-1">
        <Activity size={12} className="text-cyan" />
        <span className="text-[10px] font-[var(--font-display)] text-muted tracking-widest">BANDWIDTH (KB/s) — 60s WINDOW</span>
        <span className="text-[9px] font-mono ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-blue-500" /> IN</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-orange-500" /> OUT</span>
        </span>
      </div>
      <ResponsiveContainer width="100%" height={72}>
        <AreaChart data={data} margin={{ top: 2, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a1a3a" />
          <XAxis dataKey="t" tick={{ fontSize: 8, fill: '#3a4060' }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 8, fill: '#3a4060' }} />
          <Tooltip contentStyle={{ background: '#0a0a20', border: '1px solid #1a1a3a', fontSize: 11, fontFamily: 'Share Tech Mono' }}
                   labelStyle={{ color: '#5a6080' }}
                   itemStyle={{ padding: 0 }} />
          <Area type="monotone" dataKey="inKBs"  name="Inbound"  stroke="#3b82f6" fill="#3b82f620" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="outKBs" name="Outbound" stroke="#f97316" fill="#f9731620" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════
//  MAIN APP
// ═════════════════════════════════════════════════════════════════════
export default function App() {
  const canvasRef    = useRef(null);
  const vehiclesRef  = useRef([]);
  const animRef      = useRef(null);
  const pausedRef    = useRef(false);
  const lastFrameRef = useRef(performance.now());
  const fpsBufferRef = useRef([]);

  // Bandwidth tracking refs (avoid re-renders in hot path)
  const bwRef = useRef({ inBytes: 0, outBytes: 0, history: [] });

  const [connected, setConnected]           = useState(false);
  const [captureInfo, setCaptureInfo]       = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [isPaused, setIsPaused]             = useState(false);
  const [filterOpen, setFilterOpen]         = useState(false);
  const [filters, setFilters]               = useState({ tcp: true, udp: true, icmp: true, portFilter: '', minSize: 0 });
  const [stats, setStats]                   = useState({ total: 0, inbound: 0, outbound: 0, pps: 0, fps: 0, bwIn: 0, bwOut: 0 });
  const [bwData, setBwData]                 = useState([]);

  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  const statsAccRef = useRef({ total: 0, inbound: 0, outbound: 0, ppsBuffer: [], fps: 0 });

  // ── Socket.io ─────────────────────────────────────────────────
  useEffect(() => {
    const socket = io(SERVER_URL, {
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });
    socket.on('connect',       () => setConnected(true));
    socket.on('disconnect',    () => setConnected(false));
    socket.on('connect_error', () => setConnected(false));

    socket.on('capture-status', (info) => setCaptureInfo(info));

    socket.on('packet', (pkt) => {
      if (!pkt) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Apply filters
      const f = filtersRef.current;
      if (pkt.protocol === 'TCP'  && !f.tcp)  return;
      if (pkt.protocol === 'UDP'  && !f.udp)  return;
      if (pkt.protocol === 'ICMP' && !f.icmp) return;
      if (f.minSize > 0 && pkt.size < f.minSize) return;
      if (f.portFilter) {
        const p = parseInt(f.portFilter);
        if (!isNaN(p) && pkt.srcPort !== p && pkt.dstPort !== p) return;
      }

      const v = createVehicle(pkt, canvas.clientWidth, canvas.clientHeight);
      vehiclesRef.current.push(v);
      if (vehiclesRef.current.length > MAX_VEHICLES) {
        vehiclesRef.current.splice(0, vehiclesRef.current.length - MAX_VEHICLES);
      }

      // Stats
      const sr = statsAccRef.current;
      sr.total++;
      sr.ppsBuffer.push(Date.now());
      if (pkt.direction === 'INBOUND') sr.inbound++; else sr.outbound++;

      // Bandwidth accumulation
      if (pkt.direction === 'INBOUND') bwRef.current.inBytes += pkt.size;
      else                             bwRef.current.outBytes += pkt.size;
    });

    return () => socket.disconnect();
  }, []);

  // ── Stats refresh (500ms) ─────────────────────────────────────
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

  // ── Bandwidth chart (every 1s) ────────────────────────────────
  useEffect(() => {
    const iv = setInterval(() => {
      const bw = bwRef.current;
      const now = new Date();
      const t = now.toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
      const entry = { t, inKBs: +(bw.inBytes / 1024).toFixed(1), outKBs: +(bw.outBytes / 1024).toFixed(1) };
      bw.inBytes = 0;
      bw.outBytes = 0;
      bw.history.push(entry);
      if (bw.history.length > 60) bw.history.shift();
      setBwData([...bw.history]);
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  // ── Canvas resize ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const p = canvas.parentElement;
      if (p) {
        const dpr = window.devicePixelRatio || 1;
        // Physical pixels (for crisp rendering)
        canvas.width = p.clientWidth * dpr;
        canvas.height = p.clientHeight * dpr;
        // Scale context so drawing uses logical CSS pixels
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
      }
    };
    resize();
    
    const ro = new ResizeObserver(resize);
    ro.observe(canvas.parentElement);
    return () => { ro.disconnect(); };
  }, []);

  // ── Animation loop ────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const animate = (ts) => {
      const dt = ts - lastFrameRef.current;
      lastFrameRef.current = ts;
      fpsBufferRef.current.push(1000 / Math.max(dt, 1));
      if (fpsBufferRef.current.length > 60) fpsBufferRef.current.shift();
      statsAccRef.current.fps = fpsBufferRef.current.reduce((a, b) => a + b, 0) / fpsBufferRef.current.length;

      // Use logical size for drawing coordinates
      const w = canvas.clientWidth, h = canvas.clientHeight;
      drawRoad(ctx, w, h);
      if (!pausedRef.current) {
        const activeVehicles = vehiclesRef.current;
        const halfH = h / 2;
        const laneH = halfH / 4;
        const SAFE_DIST = 45;

        activeVehicles.forEach(v1 => {
          let frontVehicle = null;
          let minDistance = Infinity;

          activeVehicles.forEach(v2 => {
            if (v1 === v2 || v1.isInbound !== v2.isInbound || v1.laneIdx !== v2.laneIdx) return;
            
            const c1 = v1.x + v1.w / 2;
            const c2 = v2.x + v2.w / 2;
            
            let isAhead = false;
            let dist = 0;
            
            if (!v1.isInbound) {
              isAhead = c2 > c1 || (c2 === c1 && v2.uid > v1.uid);
              dist = c2 - c1 - (v1.w / 2 + v2.w / 2);
            } else {
              isAhead = c2 < c1 || (c2 === c1 && v2.uid > v1.uid);
              dist = c1 - c2 - (v1.w / 2 + v2.w / 2);
            }

            if (isAhead && dist < minDistance) {
              minDistance = dist;
              frontVehicle = v2;
            }
          });

          if (frontVehicle && minDistance < SAFE_DIST) {
            let overtook = false;
            const tryOvertake = (targetLane) => {
              if (targetLane < 0 || targetLane > 3) return false;
              const laneClear = !activeVehicles.some(v2 => {
                if (v1 === v2 || v1.isInbound !== v2.isInbound || v2.laneIdx !== targetLane) return false;
                return v1.x < v2.x + v2.w + SAFE_DIST && v1.x + v1.w + SAFE_DIST > v2.x;
              });

              if (laneClear) {
                v1.laneIdx = targetLane;
                const offset = v1.isInbound ? 0 : halfH;
                v1.targetY = offset + targetLane * laneH + (laneH / 2) - (v1.h / 2);
                return true;
              }
              return false;
            };

            if (Math.random() > 0.5) overtook = tryOvertake(v1.laneIdx - 1) || tryOvertake(v1.laneIdx + 1);
            else overtook = tryOvertake(v1.laneIdx + 1) || tryOvertake(v1.laneIdx - 1);

            if (!overtook) {
              v1.speed = frontVehicle.speed;
              // If already overlapping, slightly push back if possible
              if (minDistance < 0) v1.x -= (v1.isInbound ? -0.5 : 0.5);
            } else {
              v1.speed = v1.baseSpeed;
            }
          } else {
            if (Math.abs(v1.speed) < Math.abs(v1.baseSpeed)) {
               v1.speed += (v1.baseSpeed > 0 ? 0.08 : -0.08);
               if (Math.abs(v1.speed) > Math.abs(v1.baseSpeed)) v1.speed = v1.baseSpeed;
            }
          }

          if (Math.abs(v1.y - v1.targetY) > 0.5) {
            v1.y += (v1.targetY - v1.y) * 0.15;
          } else {
            v1.y = v1.targetY;
          }
          
          v1.x += v1.speed;
        });

        vehiclesRef.current = activeVehicles.filter(v => {
          if (v.isInbound) return v.x > -v.w - 400; 
          else return v.x < w + 400;
        });
      }
      vehiclesRef.current.forEach(v => drawVehicle(ctx, v, selectedVehicle ? v.uid === selectedVehicle.uid : false));
      // HUD removed from canvas to avoid 3D perspective distortion
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedVehicle]);

  // ── Click detection ───────────────────────────────────────────
  const handleCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Logical CSS coordinates match directly with our unscaled drawing coordinates
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const hit = [...vehiclesRef.current].reverse().find(v =>
      mx >= v.x - 30 && mx <= v.x + v.w + 30 && my >= v.y - 30 && my <= v.y + v.h + 30
    );
    if (hit) {
      setSelectedVehicle({ ...hit });
      pausedRef.current = true;
      setIsPaused(true);
    }
  }, []);

  const handleClose = useCallback(() => {
    setSelectedVehicle(null);
    pausedRef.current = false;
    setIsPaused(false);
  }, []);

  const handlePauseToggle = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setIsPaused(next);
    if (!next) setSelectedVehicle(null);
  }, []);

  // ── Keyboard ──────────────────────────────────────────────────
  useEffect(() => {
    const fn = (e) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === ' ') { e.preventDefault(); handlePauseToggle(); }
      if (e.key === 'f' || e.key === 'F') setFilterOpen(p => !p);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [handleClose, handlePauseToggle]);

  // ── Derived state ─────────────────────────────────────────────
  const hasManifest = !!selectedVehicle;
  const captureActive = captureInfo?.active;
  const captureError  = captureInfo?.error;
  const ifaceName     = captureInfo?.interfaceDesc || captureInfo?.interfaceName || '—';

  // ═════════════════════════════════════════════════════════════
  //  RENDER
  // ═════════════════════════════════════════════════════════════
  return (
    <div className="flex flex-col w-full h-full bg-bg overflow-hidden">

      {/* ── TOP HUD BAR ── */}
      <header className="flex items-center justify-between px-4 h-[54px] shrink-0 bg-surface border-b border-border gap-3">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[16px] border border-cyan/30"
               style={{ background: 'linear-gradient(135deg, #00f5ff11, #3b82f611)' }}>🛣️</div>
          <div>
            <div className="font-[var(--font-display)] text-[14px] font-bold text-cyan tracking-[0.14em]"
                 style={{ textShadow: '0 0 10px #00f5ff' }}>PACKET-WAY</div>
            <div className="font-mono text-[9px] text-muted tracking-wider">LIVE PACKET MONITOR v2</div>
          </div>
        </div>

        {/* Stats pills */}
        <div className="flex gap-1 items-center flex-1 justify-center flex-wrap">
          {[
            { icon: Layers,     label: 'TOTAL',   value: stats.total,    color: '#c8d0e8' },
            { icon: MonitorDown, label: 'IN',      value: stats.inbound,  color: '#3b82f6' },
            { icon: MonitorUp,   label: 'OUT',     value: stats.outbound, color: '#f97316' },
            { icon: Activity,    label: 'PKT/S',   value: stats.pps,      color: '#00f5ff' },
            { icon: Gauge,       label: 'FPS',     value: stats.fps,      color: '#ffd700' },
          ].map(({ icon: Icon, label, value, color }) => (
            <div key={label} className="bg-bg border border-border rounded-md px-3 py-1 text-center min-w-[58px]">
              <div className="flex items-center justify-center gap-1">
                <Icon size={10} style={{ color }} />
                <span className="font-[var(--font-display)] text-[13px] font-bold leading-tight" style={{ color }}>
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </span>
              </div>
              <div className="font-mono text-[8px] text-dim tracking-wider mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Interface chip */}
          <div className="hidden md:flex items-center gap-1.5 bg-bg border border-border rounded px-2 py-1">
            <Globe size={10} className="text-muted" />
            <span className="font-mono text-[9px] text-muted max-w-[120px] truncate">{ifaceName}</span>
          </div>

          {/* Filter toggle */}
          <button onClick={() => setFilterOpen(p => !p)}
                  className={`border rounded px-2 py-1 font-mono text-[10px] cursor-pointer transition-colors ${filterOpen ? 'bg-cyan/10 border-cyan/50 text-cyan' : 'bg-bg border-border text-muted hover:text-text'}`}
                  title="F to toggle filters">
            <Filter size={13} />
          </button>

          {/* Pause */}
          <button onClick={handlePauseToggle}
                  className={`border rounded px-2.5 py-1 font-mono text-[10px] tracking-wider cursor-pointer transition-colors ${isPaused ? 'bg-green-950 border-green-500 text-green-400' : 'bg-bg border-border text-muted hover:text-text'}`}
                  title="Space to toggle">
            {isPaused ? <Play size={13} /> : <Pause size={13} />}
          </button>

          {/* Connection dot */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400 animate-pulse-glow'}`}
                 style={{ boxShadow: connected ? '0 0 6px #00ff88' : '0 0 6px #ff3355' }} />
            {connected ? <Wifi size={12} className="text-green-400" /> : <WifiOff size={12} className="text-red-400" />}
          </div>
        </div>
      </header>

      {/* ── MAIN AREA ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Filter panel */}
        <FilterPanel filters={filters} onUpdate={setFilters} isOpen={filterOpen} onToggle={() => setFilterOpen(false)} />

        {/* Canvas + Chart column */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Canvas container */}
          <div className="relative flex-1 overflow-hidden">
            <canvas ref={canvasRef} onClick={handleCanvasClick}
                    className="block w-full h-full" style={{ cursor: 'crosshair' }} />

            {/* Paused overlay */}
            {isPaused && !selectedVehicle && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/60 border border-border2 rounded-lg px-6 py-3 font-[var(--font-display)] text-[13px] text-ngold tracking-[0.18em] pointer-events-none backdrop-blur-sm">
                ⏸  PAUSED — PRESS SPACE
              </div>
            )}

            {/* Capture error overlay */}
            {captureError && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-red-950/80 border border-red-500 rounded-lg px-6 py-4 max-w-md text-center pointer-events-none backdrop-blur-sm">
                <div className="font-[var(--font-display)] text-[14px] text-red-400 tracking-wider mb-2">⚠ CAPTURE ERROR</div>
                <div className="font-mono text-[11px] text-red-300/70 whitespace-pre-wrap">{captureError}</div>
              </div>
            )}

            {/* Waiting state */}
            {stats.total === 0 && !captureError && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                <div className="font-[var(--font-display)] text-[20px] text-cyan tracking-[0.14em] mb-3"
                     style={{ textShadow: '0 0 18px #00f5ff' }}>
                  {connected && captureActive ? 'AWAITING TRAFFIC' : 'CONNECTING…'}
                </div>
                <div className="font-mono text-[11px] text-dim tracking-wider">
                  {connected
                    ? captureActive ? 'Listening on network interface — browse the web to generate traffic' : 'Capture not active — check server logs'
                    : 'Connecting to backend at localhost:3001…'}
                </div>
                {connected && <div className="mt-4 font-mono text-cyan animate-blink">▌</div>}
              </div>
            )}

            {/* Hint */}
            {!hasManifest && stats.total > 0 && (
              <div className="absolute bottom-2 right-3 font-mono text-[9px] text-dim tracking-wider pointer-events-none">
                CLICK VEHICLE TO INSPECT · SPACE PAUSE · F FILTERS
              </div>
            )}

            {/* Manifest */}
            {hasManifest && (
              <ManifestPanel vehicle={selectedVehicle} onClose={handleClose}
                             onPauseToggle={handlePauseToggle} isPaused={isPaused} />
            )}
          </div>

          {/* Bandwidth chart */}
          <BandwidthChart data={bwData} />
        </div>
      </div>
    </div>
  );
}
