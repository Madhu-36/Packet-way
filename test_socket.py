import socketio
import time

sio = socketio.Client()

@sio.event
def connect():
    print('connected to server')

@sio.event
def packet(data):
    print('received packet:', data)

sio.connect('http://localhost:3001')
time.sleep(3)
sio.disconnect()
