# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("socket.on('packet', (pkt) => {", "socket.on('packet', (pkt) => {\n      console.log('Got packet:', pkt.size);")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
