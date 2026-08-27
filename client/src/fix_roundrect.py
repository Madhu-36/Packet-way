# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("ctx.roundRect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.4, 2);", "ctx.rect(x + w * 0.2, y + h * 0.3, w * 0.6, h * 0.4);")
content = content.replace("ctx.roundRect(x, y + 2, w, h - 4, 4);", "ctx.rect(x, y + 2, w, h - 4);")
content = content.replace("ctx.roundRect(cabX, y + 2, cabW, h - 4, 3);", "ctx.rect(cabX, y + 2, cabW, h - 4);")
content = content.replace("ctx.roundRect(cargoX, y, cargoW, h, 2);", "ctx.rect(cargoX, y, cargoW, h);")
content = content.replace("ctx.roundRect(x, y, w, h, 3);", "ctx.rect(x, y, w, h);")
content = content.replace("ctx.roundRect(x - 4, y - 4, w + 8, h + 8, 6);", "ctx.rect(x - 4, y - 4, w + 8, h + 8);")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
