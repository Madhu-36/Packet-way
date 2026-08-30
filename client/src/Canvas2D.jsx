import React, { useRef, useEffect, useCallback, useMemo } from 'react';

const PROTO_COLOR = {
  TCP: '#00f0ff',
  UDP: '#ffaa00',
  ICMP: '#a855f7',
  OTHER: '#6b7280',
};

const LOGICAL_W = 2000;
const LOGICAL_H = 800;
const HALF_H = LOGICAL_H / 2;
const LANE_H = HALF_H / 4;
const SAFE_DIST = 45;

export default function Canvas2D({ vehiclesRef, pausedRef, statsAccRef, selectedVehicle, setSelectedVehicle }) {
  const canvasRef = useRef(null);
  const shockwavesRef = useRef([]);

  // Generate some static stars/sparkles
  const sparkles = useMemo(() => Array.from({length: 400}).map(() => ({
    x: Math.random() * LOGICAL_W,
    y: Math.random() * LOGICAL_H,
    size: Math.random() * 2 + 1,
    speed: Math.random() * 2 + 0.5,
    blinkOffset: Math.random() * Math.PI * 2
  })), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    // Disable image smoothing for sharper neon edges
    ctx.imageSmoothingEnabled = false;

    const render = (time) => {
      frameCount++;
      if (time - lastFpsTime >= 1000) {
        if (statsAccRef.current) statsAccRef.current.fps = frameCount;
        frameCount = 0;
        lastFpsTime = time;
      }

      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const scaleX = canvas.width / LOGICAL_W;
      const scaleY = canvas.height / LOGICAL_H;
      const tick = performance.now() / 100;
      
      const cx = (LOGICAL_W / 2) * scaleX;
      const cy = (LOGICAL_H / 2) * scaleY;

      // Motion Blur / Trails instead of solid clear
      ctx.fillStyle = 'rgba(5, 5, 16, 0.2)'; // 0.2 opacity creates trails
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Grid background (slightly more visible)
      ctx.strokeStyle = 'rgba(0, 48, 64, 0.4)';
      ctx.lineWidth = Math.max(1, 2 * scaleY);
      const gridSize = 40 * scaleY;
      ctx.beginPath();
      for (let x = (tick * 10 * scaleX) % gridSize; x < canvas.width; x += gridSize) {
        ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height);
      }
      for (let y = 0; y < canvas.height; y += gridSize) {
        ctx.moveTo(0, y); ctx.lineTo(canvas.width, y);
      }
      ctx.stroke();

      // Sparkles (faster and brighter)
      ctx.fillStyle = '#00f0ff';
      sparkles.forEach(s => {
         s.x -= s.speed;
         if (s.x < 0) s.x = LOGICAL_W;
         const opacity = (Math.sin(tick * 0.5 + s.blinkOffset) + 1) / 2;
         ctx.globalAlpha = opacity;
         ctx.beginPath();
         ctx.arc(s.x * scaleX, s.y * scaleY, s.size * scaleX, 0, Math.PI*2);
         ctx.fill();
      });
      ctx.globalAlpha = 1.0;

      // Data lanes (optical fibers)
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2 * scaleY;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      for (let i = 0; i < 4; i++) {
        const yIn = i * LANE_H + (LANE_H / 2);
        ctx.moveTo(0, yIn * scaleY); ctx.lineTo(canvas.width, yIn * scaleY);
        const yOut = HALF_H + i * LANE_H + (LANE_H / 2);
        ctx.moveTo(0, yOut * scaleY); ctx.lineTo(canvas.width, yOut * scaleY);
      }
      ctx.stroke();
      ctx.globalAlpha = 1.0;

      const activeVehicles = vehiclesRef.current;

      // Geo Dots mapping
      ctx.fillStyle = '#ff0000';
      ctx.shadowColor = '#ff0000';
      ctx.shadowBlur = 15;
      let geoCount = 0;
      for (let i = 0; i < activeVehicles.length; i++) {
         const v = activeVehicles[i];
         if (v.geo && v.geo.ll && geoCount < 1000) {
            const [lat, lon] = v.geo.ll;
            const gx = ((lon + 180) / 360) * LOGICAL_W * scaleX;
            const gy = ((-lat + 90) / 180) * LOGICAL_H * scaleY;
            
            ctx.globalAlpha = Math.max(0.4, Math.random());
            ctx.beginPath();
            ctx.arc(gx, gy, 3 * scaleX, 0, Math.PI*2);
            ctx.fill();
            geoCount++;
         }
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1.0;

      // Central Hub / Core
      ctx.beginPath();
      ctx.arc(cx, cy, 40 * scaleY, 0, Math.PI*2);
      ctx.fillStyle = '#1a1a3a';
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 4 * scaleY;
      ctx.stroke();
      
      // Pulsing center light
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#00f0ff';
      ctx.beginPath();
      ctx.arc(cx, cy, 20 * scaleY + Math.sin(tick*1.5)*10 * scaleY, 0, Math.PI*2);
      ctx.fillStyle = '#00f0ff';
      ctx.fill();
      ctx.shadowBlur = 0;

      if (!pausedRef.current) {
        // OPTIMIZED Simulator Logic (O(N log N) via sorting instead of O(N^2))
        const lanes = {
          inbound: [[], [], [], []],
          outbound: [[], [], [], []]
        };

        // Bucket vehicles
        for (let i = 0; i < activeVehicles.length; i++) {
          const v = activeVehicles[i];
          if (v.laneIdx >= 0 && v.laneIdx < 4) {
            if (v.isInbound) lanes.inbound[v.laneIdx].push(v);
            else lanes.outbound[v.laneIdx].push(v);
          }
        }

        // Sort buckets
        for (let i = 0; i < 4; i++) {
          lanes.inbound[i].sort((a, b) => a.x - b.x); // Inbound move left, so smaller X is "ahead"
          lanes.outbound[i].sort((a, b) => b.x - a.x); // Outbound move right, so larger X is "ahead"
        }

        // Process vehicles
        activeVehicles.forEach(v1 => {
          let frontVehicle = null;
          let minDistance = Infinity;

          const bucket = v1.isInbound ? lanes.inbound[v1.laneIdx] : lanes.outbound[v1.laneIdx];
          const myIndex = bucket.indexOf(v1);

          if (myIndex > 0) {
            const v2 = bucket[myIndex - 1]; // The vehicle directly ahead
            const c1 = v1.x + v1.w / 2;
            const c2 = v2.x + v2.w / 2;
            
            if (!v1.isInbound) {
              minDistance = c2 - c1 - (v1.w / 2 + v2.w / 2);
            } else {
              minDistance = c1 - c2 - (v1.w / 2 + v2.w / 2);
            }
            if (minDistance > 0) {
              frontVehicle = v2;
            }
          }

          if (frontVehicle && minDistance < SAFE_DIST) {
            let overtook = false;
            
            // Try Overtake (Simplified for speed)
            const tryOvertake = (targetLane) => {
              if (targetLane < 0 || targetLane > 3) return false;
              const targetBucket = v1.isInbound ? lanes.inbound[targetLane] : lanes.outbound[targetLane];
              // Binary search or simple scan (since max capacity is huge, simple scan of nearby)
              let laneClear = true;
              for(let j=0; j<targetBucket.length; j++) {
                const v2 = targetBucket[j];
                if (v1.x < v2.x + v2.w + SAFE_DIST && v1.x + v1.w + SAFE_DIST > v2.x) {
                  laneClear = false;
                  break;
                }
              }

              if (laneClear) {
                v1.laneIdx = targetLane;
                const offset = v1.isInbound ? 0 : HALF_H;
                v1.targetY = offset + targetLane * LANE_H + (LANE_H / 2) - (v1.h / 2);
                return true;
              }
              return false;
            };

            if (Math.random() > 0.5) overtook = tryOvertake(v1.laneIdx - 1) || tryOvertake(v1.laneIdx + 1);
            else overtook = tryOvertake(v1.laneIdx + 1) || tryOvertake(v1.laneIdx - 1);

            if (!overtook) {
              v1.speed = frontVehicle.speed;
              if (minDistance < 0) v1.x -= (v1.isInbound ? -1 : 1);
            } else {
              v1.speed = v1.baseSpeed;
            }
          } else {
            if (Math.abs(v1.speed) < Math.abs(v1.baseSpeed)) {
               v1.speed += (v1.baseSpeed > 0 ? 0.15 : -0.15); // Faster acceleration
               if (Math.abs(v1.speed) > Math.abs(v1.baseSpeed)) v1.speed = v1.baseSpeed;
            }
          }

          if (Math.abs(v1.y - v1.targetY) > 0.5) {
            v1.y += (v1.targetY - v1.y) * 0.25; // Faster lane changes
          } else {
            v1.y = v1.targetY;
          }
          v1.x += v1.speed;
        });

        vehiclesRef.current = activeVehicles.filter(v => {
          if (v.isInbound) return v.x > -v.w - 400;
          else return v.x < LOGICAL_W + 400;
        });
      }

      // Rendering Packets (Vehicles) - EXTREME GLOW
      vehiclesRef.current.forEach(v => {
        const isBlinking = v.suspicious && (Math.sin(tick * 10) > 0);
        const color = isBlinking ? '#ff0000' : (PROTO_COLOR[v.protocol] || PROTO_COLOR.OTHER);
        const vx = v.x * scaleX;
        const vy = v.y * scaleY;
        const vw = v.w * scaleX;
        const vh = v.h * scaleY;

        ctx.save();
        ctx.translate(vx + vw/2, vy + vh/2);
        if (v.isInbound) {
          ctx.rotate(Math.PI);
        }

        const hw = vw/2;
        const hh = vh/2;

        // Packet Neon Glow (Extreme)
        ctx.shadowColor = color;
        ctx.shadowBlur = 30; // Max blur
        
        // Base block
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(-hw, -hh, vw, vh);

        // Core / Emissive part
        ctx.globalAlpha = 1.0;
        ctx.fillStyle = '#ffffff'; // White hot center
        ctx.shadowBlur = 0;
        
        if (v.type === 'CYCLE') {
            ctx.beginPath();
            ctx.moveTo(-hw, 0); ctx.lineTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh);
            ctx.fill();
        } else if (v.type === 'TRUCK' || v.type === 'BUS') {
            ctx.fillRect(-hw + 2, -hh + 2, vw - 4, vh - 4);
            ctx.fillStyle = color;
            ctx.fillRect(hw - 8*scaleX, -hh + 4, 6*scaleX, vh - 8);
        } else {
            ctx.fillRect(-hw + 2, -hh + 2, vw - 4, vh - 4);
        }

        ctx.restore();

        // Selection ring
        if (selectedVehicle && selectedVehicle.uid === v.uid) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 4 + Math.abs(Math.sin(tick*2)) * 4;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 20;
          ctx.strokeRect(vx - 8, vy - 8, vw + 16, vh + 16);
          ctx.shadowBlur = 0;
        }
      });

      // Shockwaves
      for (let i = shockwavesRef.current.length - 1; i >= 0; i--) {
        const sw = shockwavesRef.current[i];
        sw.radius += 10 * scaleX;
        sw.alpha -= 0.02;
        if (sw.alpha <= 0) {
          shockwavesRef.current.splice(i, 1);
          continue;
        }
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI*2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${sw.alpha})`;
        ctx.lineWidth = 4 * scaleX;
        ctx.stroke();
      }

      // Scanlines (CRT effect)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
      for (let i = 0; i < canvas.height; i += 4 * scaleY) {
        ctx.fillRect(0, i, canvas.width, 2 * scaleY);
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [pausedRef, vehiclesRef, statsAccRef, selectedVehicle, sparkles]);

  const handleCanvasClick = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const scaleX = canvas.width / LOGICAL_W;
    const scaleY = canvas.height / LOGICAL_H;

    let clickedVehicle = null;
    const vehicles = vehiclesRef.current;
    
    for (let i = vehicles.length - 1; i >= 0; i--) {
      const v = vehicles[i];
      const vx = v.x * scaleX;
      const vy = v.y * scaleY;
      const vw = v.w * scaleX;
      const vh = v.h * scaleY;

      const pad = 10;
      if (clickX >= vx - pad && clickX <= vx + vw + pad &&
          clickY >= vy - pad && clickY <= vy + vh + pad) {
        clickedVehicle = v;
        break;
      }
    }

    // Spawn shockwave at click
    shockwavesRef.current.push({ x: clickX, y: clickY, radius: 0, alpha: 1 });

    if (clickedVehicle) {
      e.stopPropagation();
      setSelectedVehicle(clickedVehicle);
    } else {
      setSelectedVehicle(null);
    }
  }, [vehiclesRef, setSelectedVehicle]);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-full block"
      onClick={handleCanvasClick}
      style={{ background: '#050510' }}
    />
  );
}
