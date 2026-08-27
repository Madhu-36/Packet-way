# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("vehiclesRef.current.forEach(v => {", "if(Math.random()<0.02 && vehiclesRef.current.length > 0) console.log('DEBUG:', vehiclesRef.current[0].x, vehiclesRef.current[0].y, w, h);\n      vehiclesRef.current.forEach(v => {")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
