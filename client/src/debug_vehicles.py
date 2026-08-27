# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("drawRoad(ctx, w, h);", "drawRoad(ctx, w, h);\n      if (Math.random() < 0.05) console.log('Vehicles:', vehiclesRef.current.length, 'w/h:', w, h, 'pkt1:', vehiclesRef.current[0]);")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
