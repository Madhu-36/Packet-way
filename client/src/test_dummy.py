# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Add a dummy packet generator in useEffect
injection = '''
    const dummyIv = setInterval(() => {
      if (!canvasRef.current) return;
      const pkt = {
        direction: Math.random() > 0.5 ? 'INBOUND' : 'OUTBOUND',
        size: Math.random() * 1200,
        protocol: 'TCP'
      };
      const v = createVehicle(pkt, canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      vehiclesRef.current.push(v);
    }, 500);
'''
content = content.replace("const ro = new ResizeObserver(resize);", injection + "\n    const ro = new ResizeObserver(resize);")
content = content.replace("return () => ro.disconnect();", "return () => { ro.disconnect(); clearInterval(dummyIv); };")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
