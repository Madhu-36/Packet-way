# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

injection = '''
  const vehiclesRef = useRef([
    {
      uid: 'dummy-1',
      type: 'CAR',
      x: 500,
      y: 200,
      w: 80,
      h: 40,
      speed: 0,
      color: '#00ff88',
      glowColor: '#00ff8880',
      protocol: 'TCP',
      size: 500,
      isInbound: true
    }
  ]);
'''

content = content.replace("const vehiclesRef = useRef([]);", injection)

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
