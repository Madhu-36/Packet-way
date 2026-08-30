import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Line, Sphere, Stars } from '@react-three/drei';
import * as THREE from 'three';

// Convert Lat/Lon to 3D Cartesian on a sphere of radius R
const latLonToVector3 = (lat, lon, radius) => {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);

  const x = -(radius * Math.sin(phi) * Math.cos(theta));
  const z = (radius * Math.sin(phi) * Math.sin(theta));
  const y = (radius * Math.cos(phi));

  return new THREE.Vector3(x, y, z);
};

// Fixed location for Local Machine (e.g., Central US)
const LOCAL_LAT = 39.8283;
const LOCAL_LON = -98.5795;

const GLOBE_RADIUS = 5;

// The Earth Sphere
function CyberEarth() {
  const earthRef = useRef();
  useFrame(() => {
    if (earthRef.current) earthRef.current.rotation.y += 0.001;
  });

  return (
    <group ref={earthRef}>
      <Sphere args={[GLOBE_RADIUS, 32, 32]}>
        <meshBasicMaterial color="#001122" transparent opacity={0.8} />
      </Sphere>
      <Sphere args={[GLOBE_RADIUS * 1.01, 32, 32]}>
        <meshBasicMaterial color="#00f0ff" wireframe transparent opacity={0.15} />
      </Sphere>
    </group>
  );
}

// Generate quadratic bezier arc between two 3D points
function getArcPoints(start, end) {
  const midPoint = start.clone().lerp(end, 0.5);
  // Bulge out from the center of the earth
  const dist = start.distanceTo(end);
  midPoint.normalize().multiplyScalar(GLOBE_RADIUS + dist * 0.3 + 0.5);

  const curve = new THREE.QuadraticBezierCurve3(start, midPoint, end);
  return curve.getPoints(20);
}

// Render dynamic packet arcs
function PacketArcs({ vehiclesRef, pausedRef }) {
  const arcsGroup = useRef();
  const localPos = useMemo(() => latLonToVector3(LOCAL_LAT, LOCAL_LON, GLOBE_RADIUS), []);

  useFrame(() => {
    if (pausedRef.current || !arcsGroup.current) return;
    
    // Animate earth rotation on the arcs group so they stick to the earth
    arcsGroup.current.rotation.y += 0.001;
  });

  // We map the active vehicles to arcs.
  // Due to React re-rendering, we shouldn't map 15000 React components.
  // For maximum performance, we will only render the most recent 150 packets that have GEO data.
  const packets = vehiclesRef.current || [];
  const withGeo = packets.filter(p => p.geo && p.geo.ll && p.geo.ll.length === 2);
  const recentPackets = withGeo.slice(Math.max(withGeo.length - 150, 0));

  return (
    <group ref={arcsGroup}>
      {/* Draw a ping at the Local Machine */}
      <mesh position={localPos}>
         <sphereGeometry args={[0.1, 8, 8]} />
         <meshBasicMaterial color="#ffffff" />
      </mesh>

      {recentPackets.map((p, i) => {
        const [lat, lon] = p.geo.ll;
        const foreignPos = latLonToVector3(lat, lon, GLOBE_RADIUS);
        
        const start = p.direction === 'OUTBOUND' ? localPos : foreignPos;
        const end = p.direction === 'OUTBOUND' ? foreignPos : localPos;
        const points = getArcPoints(start, end);
        
        const color = p.suspicious ? '#ef4444' : (p.direction === 'OUTBOUND' ? '#f97316' : '#3b82f6');

        return (
          <group key={`${p.id}-${i}`}>
             <Line points={points} color={color} lineWidth={2} transparent opacity={0.6} />
             <mesh position={foreignPos}>
               <sphereGeometry args={[0.05, 8, 8]} />
               <meshBasicMaterial color={color} />
             </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default function GlobeView({ vehiclesRef, pausedRef }) {
  // We use a forceUpdate mechanism since vehiclesRef mutates silently
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (pausedRef.current) return;
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, [pausedRef]);

  return (
    <div className="w-full h-full bg-[#03030a] cursor-move relative">
      <Canvas camera={{ position: [0, 0, 15], fov: 45 }}>
        <ambientLight intensity={1.5} />
        <Stars radius={100} depth={50} count={5000} factor={4} saturation={0} fade speed={1} />
        
        <CyberEarth />
        <PacketArcs vehiclesRef={vehiclesRef} pausedRef={pausedRef} />
        
        <OrbitControls 
          enablePan={false} 
          enableZoom={true}
          minDistance={6}
          maxDistance={30}
          autoRotate={false}
        />
      </Canvas>
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-none text-center">
         <div className="text-cyan text-xs font-mono tracking-[0.3em] uppercase mb-1">Global Threat Matrix</div>
         <div className="text-muted text-[9px] font-mono tracking-widest">Orbiting Command Center</div>
      </div>
    </div>
  );
}
