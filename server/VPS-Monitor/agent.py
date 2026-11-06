#!/usr/bin/env python3
"""Linux /proc read-only collector. Standard library only; bind to loopback."""
import os,time,json,shutil,threading,secrets
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
TOKEN=Path(os.environ.get('VPS_MONITOR_TOKEN_FILE','/etc/vps-monitor/token')).read_text().strip()
if len(TOKEN)<32: raise SystemExit('Token must have at least 32 characters')
lock=threading.Lock(); snapshot={}
def read(path): return Path(path).read_text()
def cpu():
 a=list(map(int,read('/proc/stat').splitlines()[0].split()[1:9]));return sum(a),a[3]+a[4]
def network():
 rx=tx=0
 for line in read('/proc/net/dev').splitlines()[2:]:
  name,values=line.split(':');v=values.split()
  if name.strip()=='lo':continue
  rx+=int(v[0]);tx+=int(v[8])
 return rx,tx
def collect():
 global snapshot
 previous=None
 while True:
  try:
   now=time.monotonic();c=cpu();n=network();mem={}
   for line in read('/proc/meminfo').splitlines():
    k,v=line.split(':',1);mem[k]=int(v.split()[0])*1024
   disk=shutil.disk_usage('/');total=mem['MemTotal'];available=mem.get('MemAvailable',mem.get('MemFree',0))
   usage=None;rxrate=txrate=None
   if previous:
    stamp,pc,pn=previous;dt=now-stamp;delta=c[0]-pc[0]
    usage=round(100*(1-(c[1]-pc[1])/delta),1) if delta>0 else None
    rxrate=max(0,(n[0]-pn[0])/dt);txrate=max(0,(n[1]-pn[1])/dt)
   value={'version':1,'timestamp':time.time(),'hostname':os.uname().nodename,'cpu':{'percent':usage,'cores':os.cpu_count(),'load':os.getloadavg()},'memory':{'total':total,'used':total-available,'percent':round(100*(total-available)/total,1)},'disk':{'mount':'/','total':disk.total,'used':disk.used,'percent':round(100*disk.used/disk.total,1)},'network':{'rxBytes':n[0],'txBytes':n[1],'rxBytesPerSecond':rxrate,'txBytesPerSecond':txrate},'uptime':float(read('/proc/uptime').split()[0])}
   with lock:snapshot=value
   previous=now,c,n
  except Exception:
   pass # preserve timestamp so clients can detect a stale sample
  time.sleep(3)
class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def do_GET(self):
  if self.path!='/v1/status':self.send_error(404);return
  if not secrets.compare_digest(self.headers.get('Authorization',''),'Bearer '+TOKEN):self.send_error(401);return
  with lock:data=dict(snapshot)
  if not data:self.send_error(503);return
  body=json.dumps(data).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
threading.Thread(target=collect,daemon=True).start()
ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('VPS_MONITOR_PORT','9187'))),Handler).serve_forever()
