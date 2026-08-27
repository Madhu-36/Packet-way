import React, { useRef, useEffect, useCallback } from 'react';
import { getAsset } from './utils/assetLoader';

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let frameCount = 0;
    let lastFpsTime = performance.now();

    const render = (time) => {
      // Calculate FPS
      frameCount++;
      if (time - lastFpsTime >= 1000) {
        if (statsAccRef.current) statsAccRef.current.fps = frameCount;
        frameCount = 0;
        lastFpsTime = time;
      }

      // Resize canvas to match CSS size
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }

      const scaleX = canvas.width / LOGICAL_W;
      const scaleY = canvas.height / LOGICAL_H;
      const tick = performance.now() / 100;

      // Clear background (Deep dark slate asphalt)
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Shoulders & Guard Rails
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(0, 0, canvas.width, HALF_H * scaleY); // Inbound track
      ctx.fillRect(0, HALF_H * scaleY, canvas.width, HALF_H * scaleY); // Outbound track

      // Yellow outer boundaries
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = Math.max(2, 4 * scaleY);
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(canvas.width, 0);
      ctx.moveTo(0, LOGICAL_H * scaleY); ctx.lineTo(canvas.width, LOGICAL_H * scaleY);
      ctx.stroke();

      // Animated Dash Lines for Lanes
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, 2 * scaleY);
      ctx.setLineDash([20 * scaleX, 15 * scaleX]);

      // Inbound lanes (moving left -> offset increases)
      ctx.lineDashOffset = (tick * 10 * scaleX) % (35 * scaleX);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(0, i * LANE_H * scaleY);
        ctx.lineTo(canvas.width, i * LANE_H * scaleY);
      }
      ctx.stroke();

      // Outbound lanes (moving right -> offset decreases)
      ctx.lineDashOffset = -(tick * 10 * scaleX) % (35 * scaleX);
      ctx.beginPath();
      for (let i = 1; i < 4; i++) {
        ctx.moveTo(0, (HALF_H + i * LANE_H) * scaleY);
        ctx.lineTo(canvas.width, (HALF_H + i * LANE_H) * scaleY);
      }
      ctx.stroke();

      // Center divider (Yellow double solid line)
      ctx.setLineDash([]);
      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = Math.max(2, 4 * scaleY);
      ctx.beginPath();
      ctx.moveTo(0, HALF_H * scaleY - 3 * scaleY);
      ctx.lineTo(canvas.width, HALF_H * scaleY - 3 * scaleY);
      ctx.moveTo(0, HALF_H * scaleY + 3 * scaleY);
      ctx.lineTo(canvas.width, HALF_H * scaleY + 3 * scaleY);
      ctx.stroke();

      const activeVehicles = vehiclesRef.current;

      if (!pausedRef.current) {
        // Simulator Logic
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

        // Remove vehicles out of bounds
        vehiclesRef.current = activeVehicles.filter(v => {
          if (v.isInbound) return v.x > -v.w - 400;
          else return v.x < LOGICAL_W + 400;
        });
      }

      // Rendering Logic
      vehiclesRef.current.forEach(v => {
        const color = PROTO_COLOR[v.protocol] || PROTO_COLOR.OTHER;
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

        // Protocol Neon Underglow (Aura)
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.fillRect(-hw, -hh, vw, vh);
        ctx.globalAlpha = 1.0;

        // Sprite rendering
        const img = getAsset(v.type);
        if (img && img.width > 1) {
          ctx.shadowBlur = 0;
          ctx.drawImage(img, -hw, -hh, vw, vh);
        } else {
          // Fallback colored rectangle
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(-hw, -hh, vw, vh);
          ctx.globalAlpha = 1.0;
        }

        // Dynamic Headlight Cones
        const gradient = ctx.createLinearGradient(hw, 0, hw + vw * 1.5, 0);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(hw, -hh * 0.8);
        ctx.lineTo(hw + vw * 1.5, -hh * 2.0);
        ctx.lineTo(hw + vw * 1.5, hh * 2.0);
        ctx.lineTo(hw, hh * 0.8);
        ctx.fill();

        ctx.restore();

        // Selection pulsing ring
        if (selectedVehicle && selectedVehicle.uid === v.uid) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2 + Math.abs(Math.sin(tick)) * 4;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.strokeRect(vx - 4, vy - 4, vw + 8, vh + 8);
          ctx.shadowBlur = 0;
        }
      });

      // Draw Traffic Poles and Lights
      const drawTrafficLight = (tx, ty, isRed) => {
        // Base / Pole shadow
        ctx.fillStyle = '#000000';
        ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(tx, ty, 8 * scaleX, 4 * scaleY, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;

        // Pole
        ctx.fillStyle = '#475569';
        ctx.fillRect(tx - 3 * scaleX, ty - 60 * scaleY, 6 * scaleX, 60 * scaleY);

        // Box
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(tx - 10 * scaleX, ty - 90 * scaleY, 20 * scaleX, 40 * scaleY);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx - 10 * scaleX, ty - 90 * scaleY, 20 * scaleX, 40 * scaleY);

        // Red Light
        ctx.fillStyle = isRed ? '#ef4444' : '#450a0a';
        ctx.shadowBlur = isRed ? 20 : 0;
        ctx.shadowColor = '#ef4444';
        ctx.beginPath(); ctx.arc(tx, ty - 78 * scaleY, 6 * scaleX, 0, Math.PI * 2); ctx.fill();

        // Green Light
        ctx.fillStyle = !isRed ? '#22c55e' : '#052e16';
        ctx.shadowBlur = !isRed ? 20 : 0;
        ctx.shadowColor = '#22c55e';
        ctx.beginPath(); ctx.arc(tx, ty - 60 * scaleY, 6 * scaleX, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
      };

      // Traffic light state (alternates every 4 seconds)
      const isRedCycle = (Math.floor(tick / 40) % 2) === 0;

      const polePositions = [canvas.width * 0.2, canvas.width * 0.5, canvas.width * 0.8];

      polePositions.forEach(xPos => {
        // Top Side Poles
        drawTrafficLight(xPos, 40 * scaleY, !isRedCycle);
        // Bottom Side Poles
        drawTrafficLight(xPos, canvas.height - 10 * scaleY, isRedCycle);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [pausedRef, vehiclesRef, statsAccRef, selectedVehicle]);

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

    if (clickedVehicle) {
      e.stopPropagation();
      setSelectedVehicle(clickedVehicle);
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
