#!/usr/bin/env python3
import http.server,json,pathlib,urllib.request,threading,time,os,subprocess
from meta_data import collect
import assistant
agent_lock=threading.BoundedSemaphore(1)
ROOT=pathlib.Path(__file__).resolve().parent
status={'running':False,'done':0,'total':0,'errors':0}
meta_status={'running':False,'stage':'','scanned':0}
def refresh_meta():
 try:
  collect(ROOT,lambda **kw:meta_status.update(kw))
 except Exception as e:meta_status['error']=str(e)
 finally:meta_status['running']=False
def download(url):
 return subprocess.check_output(['curl','--fail','--silent','--show-error','--location','--max-time','25',url],timeout=30)
def atomic(path,data):
 temp=path.with_suffix('.tmp');temp.write_bytes(data);temp.replace(path)
def refresh():
 try:
  raw=download('https://api.opendota.com/api/heroStats');heroes=json.loads(raw)
  if not isinstance(heroes,list) or not heroes:raise ValueError('Empty response')
  atomic(ROOT/'data/heroes.json',raw)
  status.update(total=len(heroes),done=0,errors=0)
  for h in heroes:
   try:
    data=download(f"https://api.opendota.com/api/heroes/{h['id']}/matchups")
    if not isinstance(json.loads(data),list):raise ValueError('Bad matchups')
    atomic(ROOT/'data'/f"matchups-{h['id']}.json",data)
   except Exception:status['errors']+=1
   status['done']+=1;time.sleep(1.2)
   image=ROOT/'assets'/f"{h['id']}.png"
   if not image.exists():
    try:atomic(image,download('https://cdn.cloudflare.steamstatic.com'+h['img'].rstrip('?')))
    except Exception:pass
  (ROOT/'data/updated.json').write_text(json.dumps({'updated':time.time(),'errors':status['errors']}))
 except Exception as e:status['error']=str(e)
 finally:status['running']=False
class Handler(http.server.SimpleHTTPRequestHandler):
 def __init__(self,*a,**kw):super().__init__(*a,directory=str(ROOT),**kw)
 def json_response(self,code,payload):
  raw=json.dumps(payload,ensure_ascii=False).encode()
  self.send_response(code);self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(raw)
 def do_GET(self):
  if self.path=='/api/assistant/status':
   try:
    with urllib.request.urlopen(assistant.OLLAMA+'/api/tags',timeout=3) as r:models=json.load(r).get('models',[])
    ready=any(x.get('name')==assistant.MODEL for x in models)
    self.json_response(200,{'ready':ready,'model':assistant.MODEL,'message':'Модель готова' if ready else 'Модель не установлена'} )
   except Exception:self.json_response(200,{'ready':False,'model':assistant.MODEL,'message':'Запустите Ollama'})
   return
  if self.path=='/api/data':
   payload={'heroes':json.loads((ROOT/'data/heroes.json').read_text()),'matchups':{},'status':status,'updated':(ROOT/'data/heroes.json').stat().st_mtime,'metaStatus':dict(meta_status),'meta':None}
   try:payload['meta']=json.loads((ROOT/'data/meta.json').read_text())
   except (FileNotFoundError,json.JSONDecodeError):pass
   for p in (ROOT/'data').glob('matchups-*.json'):
    try:payload['matchups'][p.stem.split('-')[1]]=json.loads(p.read_text())
    except Exception:pass
   self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(json.dumps(payload).encode())
  else:super().do_GET()
 def do_POST(self):
  if self.headers.get('Origin') not in (None,f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'):
   self.send_error(403);return
  if self.path=='/api/assistant':
   if self.headers.get('Host') not in (f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'):
    self.json_response(403,{'error':'Недопустимый адрес запроса'});return
   try:length=int(self.headers.get('Content-Length','0'))
   except ValueError:self.json_response(400,{'error':'Некорректная длина запроса'});return
   if not 0<length<=50000:self.json_response(413,{'error':'Запрос слишком большой или пустой'});return
   if not agent_lock.acquire(blocking=False):self.json_response(429,{'error':'Ассистент занят. Дождитесь текущего ответа.'});return
   try:
    self.connection.settimeout(10)
    payload=json.loads(self.rfile.read(length))
    result=assistant.run(payload)
    self.json_response(200,result)
   except (ValueError,UnicodeDecodeError) as e:self.json_response(400,{'error':str(e)})
   except ConnectionError as e:self.json_response(503,{'error':str(e)})
   except Exception as e:
    print('Assistant error:',repr(e),flush=True)
    self.json_response(500,{'error':'Не удалось обработать запрос. Проверьте журнал сервера.'})
   finally:agent_lock.release()
   return
  if self.path=='/api/refresh-meta':
   if not meta_status['running']:
    meta_status.clear();meta_status.update(running=True,stage='Запуск',scanned=0);threading.Thread(target=refresh_meta,daemon=True).start()
   self.send_response(202);self.end_headers();return
  if self.path!='/api/refresh':self.send_error(404);return
  if not status['running']:
   status.clear();status.update(running=True,done=0,total=0,errors=0);threading.Thread(target=refresh,daemon=True).start()
  self.send_response(202);self.end_headers()
if __name__=='__main__':
 port=int(os.environ.get('DRAFT_PORT',8765));print(f'Draft Lab: http://127.0.0.1:{port}',flush=True)
 http.server.ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
