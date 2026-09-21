import os, json, sqlite3, secrets, hashlib, hmac, time, re, math
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from http.cookies import SimpleCookie
from datetime import date

ROOT = Path(__file__).parent
DATA = Path(os.getenv('DATA_DIR', '/data'))
DATA.mkdir(parents=True, exist_ok=True)
DB = DATA / 'tracker.db'
SECURE = os.getenv('COOKIE_SECURE', '1') == '1'

def conn():
    c = sqlite3.connect(DB, timeout=15)
    c.row_factory = sqlite3.Row
    return c

def initialize():
    with conn() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS days(day TEXT PRIMARY KEY,weight REAL,steps INTEGER DEFAULT 0,notes TEXT DEFAULT '',complete INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS entries(id TEXT PRIMARY KEY,day TEXT NOT NULL,kind TEXT NOT NULL,payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires REAL NOT NULL);''')
        config = json.loads(os.getenv('APP_CONFIG', '{}'))
        defaults = dict(name='My',partner='Partner',calories=1800,protein=150,walkMinutes=35,gymWeekly=2,pilatesWeekly=1,timezone='America/Los_Angeles')
        if not c.execute("SELECT 1 FROM settings WHERE key='config'").fetchone() and not all(k in config for k in ['startWeight','goalWeight','startDate','goalDate']):
            raise RuntimeError('APP_CONFIG must specify goal weights and dates')
        defaults.update(config)
        c.execute('INSERT OR IGNORE INTO settings VALUES (?,?)', ('config',json.dumps(defaults)))
        auth = os.getenv('AUTH_HASH')
        if not auth and not c.execute("SELECT 1 FROM settings WHERE key='auth'").fetchone():
            raise RuntimeError('AUTH_HASH is required on first boot')
        if auth: c.execute('INSERT OR IGNORE INTO settings VALUES (?,?)', ('auth',auth))

def phash(password,salt):
    return hashlib.pbkdf2_hmac('sha256',password.encode(),salt.encode(),600000).hex()
def numeric(v,lo,hi):
    if isinstance(v,bool): raise ValueError('Expected a number')
    n=float(v)
    if not math.isfinite(n) or not lo<=n<=hi: raise ValueError('Number outside allowed range')
    return n
def daykey(v):
    if not isinstance(v,str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',v): raise ValueError('Invalid date')
    date.fromisoformat(v)
    return v

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def out(self,status,data,ctype='application/json',cookie=None):
        body = json.dumps(data).encode() if ctype=='application/json' else data
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store')
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('X-Frame-Options','DENY')
        self.send_header('Referrer-Policy','no-referrer')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if cookie: self.send_header('Set-Cookie',cookie)
        self.end_headers()
        self.wfile.write(body)
    def cookie(self,token,age):
        return f'diet_session={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={age}'+('; Secure' if SECURE else '')
    def token(self):
        try:
            cookies=SimpleCookie(self.headers.get('Cookie',''))
            return hashlib.sha256(cookies['diet_session'].value.encode()).hexdigest()
        except Exception: return ''
    def authorized(self):
        with conn() as c:
            return c.execute('SELECT 1 FROM sessions WHERE token=? AND expires>?',(self.token(),time.time())).fetchone() is not None
    def do_GET(self):
        path=self.path.split('?')[0]
        if path=='/healthz': return self.out(200,{'ok':True})
        if path=='/readyz':
            try:
                with conn() as c: c.execute('SELECT 1 FROM settings').fetchone()
                return self.out(200,{'ok':True})
            except Exception: return self.out(503,{'error':'Storage unavailable'})
        if path in ['/', '/app.js','/style.css','/favicon.svg']:
            name={'/':'index.html'}.get(path,path[1:])
            ct={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[Path(name).suffix]
            return self.out(200,(ROOT/'public'/name).read_bytes(),ct)
        if not self.authorized(): return self.out(401,{'error':'Please sign in'})
        if path in ['/api/state','/api/export']:
            with conn() as c:
                config=json.loads(c.execute("SELECT value FROM settings WHERE key='config'").fetchone()[0])
                days=[dict(r) for r in c.execute('SELECT * FROM days ORDER BY day')]
                entries=[dict(r)|{'payload':json.loads(r['payload'])} for r in c.execute('SELECT * FROM entries ORDER BY day,id')]
            return self.out(200,dict(config=config,days=days,entries=entries))
        return self.out(404,{'error':'Not found'})
    def do_POST(self):
        try:
            if self.headers.get('X-Requested-With')!='diet-app': return self.out(403,{'error':'Invalid request'})
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=20000: return self.out(413,{'error':'Request too large'})
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict): raise ValueError('Invalid request')
            path=self.path
            if path=='/api/login':
                with conn() as c:
                    now=time.time()
                    c.execute('DELETE FROM attempts WHERE expires<?',(now,))
                    c.execute('DELETE FROM sessions WHERE expires<?',(now,))
                    row=c.execute("SELECT count FROM attempts WHERE bucket='login'").fetchone()
                    if row and row[0]>=15: return self.out(429,{'error':'Too many attempts. Try again in 15 minutes.'})
                    c.execute("INSERT INTO attempts VALUES ('login',1,?) ON CONFLICT(bucket) DO UPDATE SET count=count+1",(now+900,))
                with conn() as c: auth=c.execute("SELECT value FROM settings WHERE key='auth'").fetchone()[0]
                salt,expected=auth.split(':')
                password=str(data.get('password',''))
                if len(password)>256 or not hmac.compare_digest(phash(password,salt),expected): return self.out(401,{'error':'Incorrect passphrase'})
                token=secrets.token_urlsafe(32)
                with conn() as c:
                    c.execute("DELETE FROM attempts WHERE bucket='login'")
                    c.execute('INSERT INTO sessions VALUES (?,?)',(hashlib.sha256(token.encode()).hexdigest(),time.time()+30*86400))
                return self.out(200,{'ok':True},cookie=self.cookie(token,30*86400))
            if not self.authorized(): return self.out(401,{'error':'Please sign in again'})
            with conn() as c:
                if path=='/api/logout':
                    c.execute('DELETE FROM sessions WHERE token=?',(self.token(),))
                    return self.out(200,{'ok':True},cookie=self.cookie('',0))
                if path=='/api/day':
                    day=daykey(data['day'])
                    c.execute('INSERT OR IGNORE INTO days(day) VALUES (?)',(day,))
                    for key in ['weight','steps','notes','complete']:
                        if key not in data: continue
                        val=data[key]
                        if key=='weight': val=None if val in [None,''] else numeric(val,70,700)
                        if key=='steps': val=int(numeric(val,0,100000))
                        if key=='notes': val=str(val)[:2000]
                        if key=='complete': val=int(bool(val))
                        c.execute(f'UPDATE days SET {key}=? WHERE day=?',(val,day))
                elif path=='/api/entry':
                    day=daykey(data['day']); kind=data['kind']; p=data['payload']; eid=str(data['id'])
                    if not re.fullmatch(r'[a-zA-Z0-9-]{1,100}',eid): raise ValueError('Invalid entry ID')
                    if kind=='food':
                        p={k: str(p.get(k,''))[:200] for k in ['name','portion','meal']} | {k:numeric(p.get(k,0),0,10000 if k=='calories' else 1000) for k in ['calories','protein']}
                        if not p['name'].strip(): raise ValueError('Food name required')
                        if p['meal'] not in ['Breakfast','Lunch','Snack','Dinner']: raise ValueError('Invalid meal')
                    elif kind=='activity':
                        if p['type'] not in ['Walking','Gym','Pilates']: raise ValueError('Invalid activity')
                        p={'type':p['type'],'minutes':numeric(p['minutes'],1,1440),'notes':str(p.get('notes',''))[:500]}
                    else: raise ValueError('Invalid entry type')
                    c.execute('INSERT INTO entries VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET day=excluded.day,kind=excluded.kind,payload=excluded.payload',(eid,day,kind,json.dumps(p)))
                elif path=='/api/delete': c.execute('DELETE FROM entries WHERE id=?',(str(data['id']),))
                elif path=='/api/password':
                    password=str(data.get('password',''))
                    if not 12<=len(password)<=256: raise ValueError('Use a passphrase of 12–256 characters')
                    salt=secrets.token_hex(16)
                    c.execute("UPDATE settings SET value=? WHERE key='auth'",(salt+':'+phash(password,salt),))
                    c.execute('DELETE FROM sessions WHERE token<>?',(self.token(),))
                else: return self.out(404,{'error':'Not found'})
            return self.out(200,{'ok':True})
        except (ValueError,KeyError,TypeError): return self.out(400,{'error':'Please check the entered values.'})
        except Exception: return self.out(500,{'error':'Could not save. Please retry; your entry is still on screen.'})

if __name__=='__main__':
    initialize()
    ThreadingHTTPServer(('0.0.0.0',int(os.getenv('PORT','8080'))),Handler).serve_forever()
