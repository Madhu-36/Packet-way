import React, { useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Edges, Trail } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

const PROTO_COLOR = {
  TCP: '#00f0ff',
  UDP: '#ffaa00',
  ICMP: '#a855f7',
  OTHER: '#6b7280',
};

// Logical to 3D scaling
const SCALE = 0.1;
const LOGICAL_W = 2000;
const LOGICAL_H = 800;
const HALF_H = LOGICAL_H / 2;
const LANE_H = HALF_H / 4;
const SAFE_DIST = 45;

function VehicleMesh({ vehicle, onClick, isSelected }) {
  const group = useRef();
  const baseColor = PROTO_COLOR[vehicle.protocol] || PROTO_COLOR.OTHER;
  
  useFrame(() => {
    if (!group.current) return;
    const targetX = (vehicle.x - LOGICAL_W / 2) * SCALE;
    const targetZ = (vehicle.y - LOGICAL_H / 2) * SCALE;
    group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, 0.5);
    group.current.position.z = THREE.MathUtils.lerp(group.current.position.z, targetZ, 0.5);
    group.current.rotation.y = vehicle.isInbound ? Math.PI : 0;
  });

  const w = vehicle.w * SCALE;
  const h = vehicle.h * SCALE;
  const h2 = h / 2;

  return (
    <group ref={group} onClick={(e) => { e.stopPropagation(); onClick(vehicle); }} position={[(vehicle.x - LOGICAL_W/2)*SCALE, h2, (vehicle.y - LOGICAL_H/2)*SCALE]}>
      <Trail width={2} color={baseColor} length={20} decay={1.5} local={false}>
        {vehicle.type === 'CAR' && (
          <group>
            <mesh position={[0, h2*0.5, 0]} castShadow>
              <boxGeometry args={[w, h2, h]} />
              <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={0.8} />
              <Edges color="#ffffff" opacity={0.5} transparent />
            </mesh>
            <mesh position={[w*0.1, h2*1.5, 0]} castShadow>
              <boxGeometry args={[w*0.5, h2, h*0.8]} />
              <meshStandardMaterial color="#111827" roughness={0.1} />
              <Edges color={baseColor} />
            </mesh>
          </group>
        )}
        
        {vehicle.type === 'TRUCK' && (
          <group>
            <mesh position={[-w*0.15, h2, 0]} castShadow>
              <boxGeometry args={[w*0.7, h, h]} />
              <meshStandardMaterial color="#d1d5db" metalness={0.5} roughness={0.5} />
              <Edges color="#9ca3af" />
            </mesh>
            <mesh position={[w*0.35, h2*0.8, 0]} castShadow>
              <boxGeometry args={[w*0.25, h*0.8, h]} />
              <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={1.2} />
              <Edges color="#ffffff" />
            </mesh>
          </group>
        )}

        {vehicle.type === 'BUS' && (
          <group>
            <mesh position={[0, h2, 0]} castShadow>
              <boxGeometry args={[w, h, h]} />
              <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={0.6} />
              <Edges color="#ffffff" />
            </mesh>
          </group>
        )}

        {vehicle.type === 'CYCLE' && (
          <group>
            <mesh position={[0, h2*0.5, 0]} castShadow>
              <boxGeometry args={[w*0.6, h2, h*0.4]} />
              <meshStandardMaterial color={baseColor} emissive={baseColor} emissiveIntensity={2.0} />
            </mesh>
            <mesh position={[0, h2*1.5, 0]} castShadow>
              <sphereGeometry args={[h2*0.8]} />
              <meshStandardMaterial color="#ffffff" />
            </mesh>
          </group>
        )}
      </Trail>

      <pointLight position={[w/2 + 0.5, h2, h/3]} color="#ffffff" intensity={2} distance={30} />
      <pointLight position={[w/2 + 0.5, h2, -h/3]} color="#ffffff" intensity={2} distance={30} />
      <pointLight position={[-w/2 - 0.5, h2, h/3]} color="#ff0000" intensity={1} distance={10} />
      <pointLight position={[-w/2 - 0.5, h2, -h/3]} color="#ff0000" intensity={1} distance={10} />

      {isSelected && (
        <mesh position={[0, h2, 0]}>
          <boxGeometry args={[w + 2, h + 2, h + 2]} />
          <meshBasicMaterial color="#ffffff" wireframe />
        </mesh>
      )}
    </group>
  );
}

function SimulatorLogic({ vehiclesRef, pausedRef, statsAccRef }) {
  useFrame(() => {
    if (pausedRef.current) return;
    const activeVehicles = vehiclesRef.current;
    
    statsAccRef.current.fpsBuffer = statsAccRef.current.fpsBuffer || [];
    statsAccRef.current.fpsBuffer.push(1);
    if (statsAccRef.current.fpsBuffer.length > 60) statsAccRef.current.fpsBuffer.shift();
    statsAccRef.current.fps = 60;
    
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

    vehiclesRef.current = activeVehicles.filter(v => {
      if (v.isInbound) return v.x > -v.w - 400; 
      else return v.x < LOGICAL_W + 400;
    });
  });
  
  return null;
}

function CameraController({ selectedVehicle }) {
  const { camera } = useThree();
  
  useFrame(() => {
    if (selectedVehicle) {
      const targetX = (selectedVehicle.x - LOGICAL_W / 2) * SCALE;
      const targetZ = (selectedVehicle.y - LOGICAL_H / 2) * SCALE;
      
      const desiredPos = new THREE.Vector3(
        targetX + (selectedVehicle.isInbound ? 30 : -30),
        25,
        targetZ + 30
      );
      
      camera.position.lerp(desiredPos, 0.05);
      camera.lookAt(new THREE.Vector3(targetX, 0, targetZ));
    }
  });

  return selectedVehicle ? null : (
    <OrbitControls 
      autoRotate 
      autoRotateSpeed={0.5} 
      makeDefault 
      minPolarAngle={Math.PI/6} 
      maxPolarAngle={Math.PI/2 - 0.1}
      minDistance={20}
      maxDistance={200}
    />
  );
}

function Scene({ vehiclesRef, pausedRef, statsAccRef, selectedVehicle, setSelectedVehicle }) {
  const [renderCount, setRenderCount] = useState(0);
  
  useFrame(() => {
    if (Math.random() < 0.1) setRenderCount(c => c + 1);
  });

  return (
    <>
      <color attach="background" args={['#050510']} />
      <fog attach="fog" args={['#050510', 50, 300]} />
      <ambientLight intensity={0.2} />
      <directionalLight position={[100, 100, 50]} intensity={1.5} color="#00f0ff" />
      <directionalLight position={[-100, 100, -50]} intensity={1.5} color="#ff3355" />
      <CameraController selectedVehicle={selectedVehicle} />
      <SimulatorLogic vehiclesRef={vehiclesRef} pausedRef={pausedRef} statsAccRef={statsAccRef} />
      
      <group position={[0, 0, 0]}>
        <mesh position={[0, 5, 0]}>
          <cylinderGeometry args={[10, 15, 10, 32]} />
          <meshStandardMaterial color="#1a1a3a" emissive="#00f0ff" emissiveIntensity={0.2} />
        </mesh>
        <mesh position={[0, 15, 0]}>
          <sphereGeometry args={[6, 32, 32]} />
          <meshStandardMaterial color="#000000" wireframe />
        </mesh>
        <pointLight position={[0, 10, 0]} color="#00f0ff" intensity={5} distance={100} />
      </group>

      <Grid 
        infiniteGrid 
        fadeDistance={400} 
        cellColor="#00f0ff" 
        sectionColor="#00f0ff" 
        cellSize={10} 
        sectionSize={50} 
        position={[0, -0.1, 0]}
      />
      
      <mesh rotation={[-Math.PI/2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[1000, 100]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} />
      </mesh>

      {vehiclesRef.current.map(v => (
        <VehicleMesh 
          key={v.uid} 
          vehicle={v} 
          onClick={setSelectedVehicle} 
          isSelected={selectedVehicle?.uid === v.uid} 
        />
      ))}

      <EffectComposer>
        <Bloom luminanceThreshold={0.2} luminanceSmoothing={0.9} height={300} intensity={1.5} />
      </EffectComposer>
    </>
  );
}

export default function Canvas3D(props) {
  return (
    <Canvas shadows camera={{ position: [0, 60, 120], fov: 45 }} gl={{ antialias: false }}>
      <Scene {...props} />
    </Canvas>
  );
}
