import React, { useRef, useEffect } from 'react';

const LOGICAL_W = 1200;
const LOGICAL_H = 800;

export default function TopologyGraph({ vehiclesRef, pausedRef }) {
  const canvasRef = useRef(null);
  
  // Physics State
  const nodesRef = useRef(new Map());
  const edgesRef = useRef(new Map());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const render = () => {
      const rect = canvas.getBoundingClientRect();
      if (canvas.width !== rect.width || canvas.height !== rect.height) {
        canvas.width = rect.width;
        canvas.height = rect.height;
      }
      
      const scaleX = canvas.width / LOGICAL_W;
      const scaleY = canvas.height / LOGICAL_H;
      const cx = LOGICAL_W / 2;
      const cy = LOGICAL_H / 2;

      // Update graph structure from live packets
      if (!pausedRef.current) {
         const packets = vehiclesRef.current;
         // Slowly decay edge weights
         edgesRef.current.forEach(e => { e.weight *= 0.99; });
         
         // Process new packets
         packets.forEach(p => {
           if (!nodesRef.current.has(p.srcIP)) {
             nodesRef.current.set(p.srcIP, { id: p.srcIP, x: cx + (Math.random()-0.5)*100, y: cy + (Math.random()-0.5)*100, vx: 0, vy: 0, isLocal: p.direction === 'OUTBOUND', r: 5, geo: p.geo, name: p.hostname });
           }
           if (!nodesRef.current.has(p.dstIP)) {
             nodesRef.current.set(p.dstIP, { id: p.dstIP, x: cx + (Math.random()-0.5)*100, y: cy + (Math.random()-0.5)*100, vx: 0, vy: 0, isLocal: p.direction === 'INBOUND', r: 5, geo: p.geo, name: p.hostname });
           }
           
           const edgeId = `${p.srcIP}-${p.dstIP}`;
           if (!edgesRef.current.has(edgeId)) {
             edgesRef.current.set(edgeId, { src: p.srcIP, dst: p.dstIP, weight: 1, active: true });
           } else {
             edgesRef.current.get(edgeId).weight += 0.05;
             if (edgesRef.current.get(edgeId).weight > 5) edgesRef.current.get(edgeId).weight = 5;
           }
         });

         // Cleanup dead edges and orphaned nodes periodically
         if (Math.random() < 0.05) {
            for (let [k, e] of edgesRef.current.entries()) {
               if (e.weight < 0.05) edgesRef.current.delete(k);
            }
         }
      }

      const nodesArr = Array.from(nodesRef.current.values());
      const edgesArr = Array.from(edgesRef.current.values());

      // Physics integration (Force Directed Graph)
      // 1. Repulsion
      for(let i=0; i<nodesArr.length; i++) {
        for(let j=i+1; j<nodesArr.length; j++) {
           const n1 = nodesArr[i];
           const n2 = nodesArr[j];
           const dx = n1.x - n2.x;
           const dy = n1.y - n2.y;
           const distSq = dx*dx + dy*dy;
           if (distSq > 0 && distSq < 40000) {
             const f = 200 / distSq;
             n1.vx += (dx * f); n1.vy += (dy * f);
             n2.vx -= (dx * f); n2.vy -= (dy * f);
           }
        }
        // Center gravity
        const n = nodesArr[i];
        if (n.isLocal) {
          n.vx += (cx - n.x) * 0.01;
          n.vy += (cy - n.y) * 0.01;
        } else {
          // Orbit
          const dx = cx - n.x;
          const dy = cy - n.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist > 300) {
            n.vx += dx * 0.001;
            n.vy += dy * 0.001;
          }
        }
      }

      // 2. Attraction (Springs)
      edgesArr.forEach(e => {
        const n1 = nodesRef.current.get(e.src);
        const n2 = nodesRef.current.get(e.dst);
        if (n1 && n2) {
          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const f = (dist - 100) * 0.005;
          n1.vx += dx * f; n1.vy += dy * f;
          n2.vx -= dx * f; n2.vy -= dy * f;
        }
      });

      // 3. Apply forces
      nodesArr.forEach(n => {
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.8; n.vy *= 0.8; // Dampening
      });

      // Rendering
      ctx.fillStyle = '#050510';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw Grid
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let x=0; x<canvas.width; x+=50*scaleX) { ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); }
      for(let y=0; y<canvas.height; y+=50*scaleY) { ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); }
      ctx.stroke();

      // Draw Edges
      edgesArr.forEach(e => {
        const n1 = nodesRef.current.get(e.src);
        const n2 = nodesRef.current.get(e.dst);
        if (n1 && n2) {
          ctx.beginPath();
          ctx.moveTo(n1.x * scaleX, n1.y * scaleY);
          ctx.lineTo(n2.x * scaleX, n2.y * scaleY);
          ctx.strokeStyle = `rgba(0, 240, 255, ${Math.min(e.weight, 1) * 0.5})`;
          ctx.lineWidth = Math.min(e.weight, 3) * scaleX;
          ctx.stroke();
        }
      });

      // Draw Nodes
      nodesArr.forEach(n => {
        const nx = n.x * scaleX;
        const ny = n.y * scaleY;
        const isFocus = n.name != null; // DPI extracted name gets focus
        
        ctx.beginPath();
        ctx.arc(nx, ny, (n.isLocal ? 10 : isFocus ? 8 : 4) * scaleX, 0, Math.PI*2);
        ctx.fillStyle = n.isLocal ? '#00f0ff' : (isFocus ? '#a855f7' : '#f97316');
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Labels
        if (n.isLocal || isFocus) {
          ctx.fillStyle = '#ffffff';
          ctx.font = `${10 * scaleY}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(n.name || n.id, nx, ny + 20 * scaleY);
          if (n.geo?.flag && !n.isLocal) {
             ctx.fillText(n.geo.flag, nx, ny - 12 * scaleY);
          }
        }
      });

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [pausedRef, vehiclesRef]);

  return (
    <canvas ref={canvasRef} className="w-full h-full block" />
  );
}
