# -*- coding: utf-8 -*-
import re

with open('App.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace("PROTO_PAINT[protocol]?.base || PROTO_PAINT.OTHER.base || '#ffffff'", "PROTO_COLOR[protocol] || PROTO_COLOR.OTHER")

with open('App.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
