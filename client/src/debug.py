# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("drawRoad(ctx, w, h);", "drawRoad(ctx, w, h);\n      ctx.fillStyle='white'; ctx.font='20px Arial'; ctx.fillText('Vehicles: ' + vehiclesRef.current.length, 50, 50);")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
