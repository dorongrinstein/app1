import { createServer } from 'node:http';
import { DatabaseSync, backup } from 'node:sqlite';
import { readFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const root=dirname(fileURLToPath(import.meta.url));
const dataDir=process.env.DATA_DIR||join(root,'data');
mkdirSync(dataDir,{recursive:true});
const db=new DatabaseSync(join(dataDir,'football.sqlite'));
db.exec(readFileSync(join(root,'schema.sql'),'utf8'));
const derive=promisify(scrypt),production=process.env.NODE_ENV==='production';
const cookieName=production?'__Host-gridiron':'gridiron';
const all=(sql,...args)=>db.prepare(sql).all(...args);
const one=(sql,...args)=>db.prepare(sql).get(...args);
const run=(sql,...args)=>db.prepare(sql).run(...args);
const hash=s=>createHash('sha256').update(s).digest('hex');
const now=()=>new Date().toISOString();
const colors=['#2563eb','#dc2626','#7c3aed','#059669','#ea580c','#0891b2','#c026d3','#475569'];
const defaultRules=[
 {code:'td',name:'Touchdown',points:6},
 {code:'fg',name:'Field goal',points:3},
 {code:'xp',name:'Extra point',points:1},
 {code:'two',name:'Two-point conversion',points:2},
 {code:'safety',name:'Safety',points:2}
];
class HttpError extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(msg,status=400)=>{throw new HttpError(status,msg);};
function str(v,label,max=80){
 if(typeof v!=='string'||!v.trim()||v.trim().length>max)fail(label+' must be 1–'+max+' characters.');
 const s=v.trim().normalize('NFC');
 if(/[\x00-\x1f\x7f]/.test(s))fail(label+' contains an unsupported character.');
 return s;
}
function integer(v,label,min,max){
 if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)fail(label+' must be a whole number from '+min+' to '+max+'.');
 return v;
}
function tx(fn){db.exec('BEGIN IMMEDIATE');try{const r=fn();db.exec('COMMIT');return r;}catch(e){db.exec('ROLLBACK');throw e;}}
function rulesValid(rules){
 if(!Array.isArray(rules)||rules.length<1||rules.length>10)fail('Use between 1 and 10 scoring categories.');
 const codes=new Set();
 return rules.map(r=>{
  if(!/^[a-z][a-z0-9_]{0,15}$/.test(r.code)||codes.has(r.code)||['week','team','player','jersey','notes','total','position'].includes(r.code))fail('Each category needs a unique short code, such as td or fg.');
  codes.add(r.code);
  if(typeof r.points!=='number'||!Number.isFinite(r.points)||Math.abs(r.points)>1000||Math.abs(r.points*100-Math.round(r.points*100))>1e-7)fail('Point values must be between -1000 and 1000, with up to two decimal places.');
  return {code:r.code,name:str(r.name,'Category name',40),points:r.points};
 });
}
function countsValid(counts,rules){
 if(!counts||typeof counts!=='object'||Array.isArray(counts))fail('Scoring counts are required.');
 if(Object.keys(counts).some(k=>!rules.some(r=>r.code===k)))fail('Unknown scoring category. Reload the scoring rules.');
 return Object.fromEntries(rules.map(r=>[r.code,integer(counts[r.code]??0,r.name,0,10000)]));
}
const pointsFor=(counts,rules)=>rules.reduce((n,r)=>n+(counts[r.code]||0)*Math.round(r.points*100),0)/100;
function ownerSeason(user,id){
 const s=one('SELECT * FROM seasons WHERE id=? AND user_id=?',id,user.id);
 if(!s)fail('Season not found.',404);
 s.rules=JSON.parse(s.rules);s.final_snapshot=s.final_snapshot?JSON.parse(s.final_snapshot):null;return s;
}
function editable(s,b){
 if(s.status!=='active')fail('This season is finalized. Reopen it before changing scores.',409);
 if(b.revision!==s.revision)fail('The season changed in another tab. Reload it before saving.',409);
}
const bump=id=>run('UPDATE seasons SET revision=revision+1 WHERE id=?',id);
function listScores(s){return all('SELECT * FROM scores WHERE season_id=? ORDER BY week DESC,updated_at DESC',s.id).map(r=>({...r,counts:JSON.parse(r.counts),total:pointsFor(JSON.parse(r.counts),s.rules)}));}
function rankings(s,scores=listScores(s)){
 const players=all('SELECT p.*,t.name team_name,t.color team_color,t.abbreviation team_abbreviation FROM players p JOIN teams t ON p.team_id=t.id WHERE p.season_id=? ORDER BY p.name',s.id);
 const result=players.map(p=>{
  const rows=scores.filter(r=>r.player_id===p.id),counts=Object.fromEntries(s.rules.map(r=>[r.code,rows.reduce((n,x)=>n+(x.counts[r.code]||0),0)])),total=pointsFor(counts,s.rules);
  return {...p,counts,total,weeks_played:rows.length,average:rows.length?Math.round(total/rows.length*100)/100:0};
 }).sort((a,b)=>(Number(b.weeks_played>0)-Number(a.weeks_played>0))||b.total-a.total||a.name.localeCompare(b.name)||a.team_name.localeCompare(b.team_name));
 let prev,rank=0;
 return result.map((p,i)=>{if(p.total!==prev)rank=i+1;prev=p.total;return {...p,rank:p.weeks_played?rank:null};});
}
function state(user,seasonId){
 const seasons=all('SELECT id,name,year,weeks,status,revision FROM seasons WHERE user_id=? ORDER BY year DESC,created_at DESC',user.id);
 if(!seasons.length)return {user,seasons,season:null};
 const s=ownerSeason(user,seasonId||seasons[0].id),scores=listScores(s);
 const board=s.status==='completed'&&s.final_snapshot?s.final_snapshot.leaderboard:rankings(s,scores);
 const teams=all('SELECT * FROM teams WHERE season_id=? ORDER BY name',s.id).map(t=>({...t,players:board.filter(p=>p.team_id===t.id).length,total:Math.round(board.filter(p=>p.team_id===t.id).reduce((n,p)=>n+p.total,0)*100)/100}));
 return {user,seasons,season:s,teams,players:board,scores,
 summary:{points:Math.round(scores.reduce((n,r)=>n+r.total,0)*100)/100,teams:teams.length,players:board.length,weeks:new Set(scores.map(r=>r.week)).size,entries:scores.length},
 weekly:Array.from({length:s.weeks},(_,i)=>({week:i+1,points:Math.round(scores.filter(r=>r.week===i+1).reduce((n,r)=>n+r.total,0)*100)/100,entries:scores.filter(r=>r.week===i+1).length}))};
}
function newSeason(userId,b){
 const id=randomUUID(),year=integer(b.year,'Year',2000,2200),weeks=integer(b.weeks,'Weeks',1,53),name=str(b.name,'Season name');
 const base=b.copyFrom?ownerSeason({id:userId},b.copyFrom):null,rules=base?base.rules:defaultRules;
 run('INSERT INTO seasons(id,user_id,name,year,weeks,rules) VALUES(?,?,?,?,?,?)',id,userId,name,year,weeks,JSON.stringify(rules));
 if(base)for(const t of all('SELECT * FROM teams WHERE season_id=?',base.id)){
  const tid=randomUUID();run('INSERT INTO teams(id,season_id,name,abbreviation,color) VALUES(?,?,?,?,?)',tid,id,t.name,t.abbreviation,t.color);
  for(const p of all('SELECT * FROM players WHERE team_id=?',t.id))run('INSERT INTO players(id,season_id,team_id,name,jersey,position) VALUES(?,?,?,?,?,?)',randomUUID(),id,tid,p.name,p.jersey,p.position);
 }
 return id;
}
function parseCsv(text){
 if(typeof text!=='string'||text.length>2000000)fail('Upload a CSV file smaller than 2 MB.');
 text=text.replace(/^\uFEFF/,'');const rows=[];let row=[],field='',quoted=false,afterQuote=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;afterQuote=true;}}else field+=c;continue;}
  if(c==='"'){if(field.length||afterQuote)fail('Malformed CSV: unexpected quotation mark.');quoted=true;continue;}
  if(c===','||c==='\n'||c==='\r'){
   row.push(field);field='';afterQuote=false;
   if(c!==','){if(c==='\r'&&text[i+1]==='\n')i++;if(row.some(x=>x.trim()!==''))rows.push(row);row=[];}
  }else{if(afterQuote&&c!==' '&&c!=='\t')fail('Malformed CSV after a quoted field.');if(!afterQuote)field+=c;}
 }
 if(quoted)fail('Malformed CSV: a quoted field was not closed.');
 row.push(field);if(row.some(x=>x.trim()!==''))rows.push(row);
 if(rows.length<2)fail('The CSV needs a header and at least one player row.');
 if(rows.length>5001)fail('Import up to 5,000 rows at a time.');
 return rows;
}
const norm=s=>s.trim().normalize('NFC').toLocaleLowerCase('en-US');
function importPreview(s,csv){
 const data=parseCsv(csv),headers=data.shift().map(h=>h.trim().toLowerCase());
 if(new Set(headers).size!==headers.length)fail('CSV headers must be unique.');
 for(const h of ['week','team','player'])if(!headers.includes(h))fail('Missing CSV column: '+h+'.');
 if(!s.rules.some(r=>headers.includes(r.code)))fail('Include at least one scoring category column from the template.');
 const allowed=['week','team','player','jersey','notes','total','position',...s.rules.map(r=>r.code)],unknown=headers.filter(h=>!allowed.includes(h));
 if(unknown.length)fail('Unknown CSV columns: '+unknown.join(', ')+'. Use the downloadable template.');
 const teams=all('SELECT * FROM teams WHERE season_id=?',s.id),players=all('SELECT * FROM players WHERE season_id=?',s.id),existing=listScores(s),seen=new Set(),newTeams=new Set(),newPlayers=new Set();
 const rows=data.map((cells,index)=>{
  const line=index+2;
  try{
   if(cells.length!==headers.length)fail('Expected '+headers.length+' columns; found '+cells.length+'.');
   const r=Object.fromEntries(headers.map((h,i)=>[h,cells[i].trim()]));
   if(!/^\d+$/.test(r.week))fail('Week must be a whole number.');
   const week=integer(Number(r.week),'Week',1,s.weeks),team=str(r.team,'Team'),player=str(r.player,'Player'),jersey=(r.jersey||'').trim();
   if(jersey&&!/^\d{1,3}$/.test(jersey))fail('Jersey must be blank or 1–3 digits.');
   const t=teams.find(t=>norm(t.name)===norm(team)),matches=players.filter(p=>p.team_id===t?.id&&norm(p.name)===norm(player));
   const p=jersey?matches.find(p=>p.jersey===jersey):matches.length===1?matches[0]:undefined;
   if(!jersey&&matches.length>1)fail('More than one player has this name. Include the jersey number.');
   const effectiveJersey=p?.jersey??jersey,key=JSON.stringify([week,norm(team),norm(player),effectiveJersey]);
   if(seen.has(key))fail('Duplicate player/week row. Combine counts into one row.');seen.add(key);
   const counts={};for(const rule of s.rules){const v=r[rule.code]||'0';if(!/^\d+$/.test(v))fail(rule.name+' must be a nonnegative whole number.');counts[rule.code]=integer(Number(v),rule.name,0,10000);}
   if(!t)newTeams.add(norm(team));if(!p)newPlayers.add(JSON.stringify([norm(team),norm(player),effectiveJersey]));
   const notes=(r.notes||'').slice(0,500),position=(r.position||'').slice(0,20);
   return {line,week,team,player,jersey:effectiveJersey,position,counts,notes,total:pointsFor(counts,s.rules),team_id:t?.id,player_id:p?.id,action:existing.some(e=>e.player_id===p?.id&&e.week===week)?'replace':'new'};
  }catch(e){fail('Row '+line+': '+e.message);}
 });
 // Prevent order-dependent identity matching for new, repeated player names.
 const rosterGroups=new Map();
 for(const r of rows){const k=JSON.stringify([norm(r.team),norm(r.player)]);if(!rosterGroups.has(k))rosterGroups.set(k,new Set());rosterGroups.get(k).add(r.jersey);}
 for(const jerseys of rosterGroups.values())if(jerseys.size>1&&jerseys.has(''))fail('Include jersey numbers on every row when players share a name.');
 return {rows,count:rows.length,newTeams:newTeams.size,newPlayers:newPlayers.size,replaced:rows.filter(r=>r.action==='replace').length,points:Math.round(rows.reduce((n,r)=>n+r.total,0)*100)/100};
}
function saveRow(s,playerId,week,counts,notes=''){
 run('INSERT INTO scores(season_id,player_id,week,counts,notes,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(season_id,player_id,week) DO UPDATE SET counts=excluded.counts,notes=excluded.notes,updated_at=excluded.updated_at',s.id,playerId,week,JSON.stringify(counts),notes,now());
}
function applyImport(s,preview){
 for(const r of preview.rows){
  let t=all('SELECT * FROM teams WHERE season_id=?',s.id).find(t=>norm(t.name)===norm(r.team));
  if(!t){t={id:randomUUID()};run('INSERT INTO teams(id,season_id,name,abbreviation,color) VALUES(?,?,?,?,?)',t.id,s.id,r.team,r.team.split(/\s+/).map(x=>x[0]).join('').slice(0,3).toUpperCase(),colors[all('SELECT id FROM teams WHERE season_id=?',s.id).length%colors.length]);}
  let p=r.player_id?one('SELECT id FROM players WHERE id=?',r.player_id):all('SELECT id,name,jersey FROM players WHERE team_id=?',t.id).find(p=>norm(p.name)===norm(r.player)&&p.jersey===r.jersey);
  if(!p){p={id:randomUUID()};run('INSERT INTO players(id,season_id,team_id,name,jersey,position) VALUES(?,?,?,?,?,?)',p.id,s.id,t.id,r.player,r.jersey,r.position);}
  saveRow(s,p.id,r.week,r.counts,r.notes);
 }
 bump(s.id);
}
function csvCell(value){let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
function exportCsv(s){
 const players=all('SELECT p.*,t.name team_name FROM players p JOIN teams t ON t.id=p.team_id WHERE p.season_id=?',s.id);
 const header=['week','team','player','jersey','position',...s.rules.map(r=>r.code),'total','notes'];
 return [header,...listScores(s).map(e=>{const p=players.find(p=>p.id===e.player_id);return [e.week,p.team_name,p.name,p.jersey,p.position,...s.rules.map(r=>e.counts[r.code]||0),e.total,e.notes];})].map(r=>r.map(csvCell).join(',')).join('\r\n');
}

function json(res,data,status=200){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
async function bodyOf(req){
 if(!req.headers['content-type']?.startsWith('application/json'))fail('Content-Type must be application/json.',415);
 let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>2100000)fail('Request is too large.',413);chunks.push(chunk);}
 let b;try{b=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{fail('Invalid JSON request.');}
 if(!b||typeof b!=='object'||Array.isArray(b))fail('A JSON object is required.');
 return b;
}
function sessionUser(req){
 const raw=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(!raw)return null;
 return one('SELECT u.id,u.name,u.username FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?',hash(raw),Date.now())||null;
}
function setSession(res,userId){
 const token=randomBytes(32).toString('base64url');run('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)',hash(token),userId,Date.now()+30*86400000);
 res.setHeader('Set-Cookie',cookieName+'='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000'+(production?'; Secure':''));
}
const authRates=new Map();
function authLimit(req){
 const key=req.socket.remoteAddress||'unknown',now=Date.now();let slot=authRates.get(key);
 if(!slot||slot.until<now){slot={count:0,until:now+600000};authRates.set(key,slot);}
 if(++slot.count>40)fail('Too many sign-in attempts. Try again in 10 minutes.',429);
}
const files=new Map(['/index.html','/app.js','/style.css','/favicon.svg'].map(p=>[p,readFileSync(join(root,'public',p))]));
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
 if(production)res.setHeader('Strict-Transport-Security','max-age=31536000');
 try{
  const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
  if(method==='GET'&&path==='/health/live')return json(res,{status:'ok'});
  if(method==='GET'&&path==='/health/ready'){one('SELECT 1');return json(res,{status:'ok',database:'ready'});}
  if(!path.startsWith('/api/')){
   if(method!=='GET'&&method!=='HEAD')fail('Method not allowed.',405);
   const key=path==='/'?'/index.html':path,content=files.get(key);if(!content)fail('Not found.',404);
   const ext=key.slice(key.lastIndexOf('.'));res.writeHead(200,{'Content-Type':types[ext],'Cache-Control':ext==='.html'?'no-cache':'public, max-age=300'});return res.end(method==='HEAD'?undefined:content);
  }
  if(!['GET','HEAD'].includes(method)){
   if(req.headers['sec-fetch-site']==='cross-site')fail('Cross-site requests are not allowed.',403);
   const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)fail('Request origin does not match this app.',403);
   if(req.headers['x-gridiron-request']!=='1')fail('Missing request verification header.',403);
  }
  if(method==='POST'&&(path==='/api/auth/register'||path==='/api/auth/login')){
   authLimit(req);const b=await bodyOf(req),username=str(b.username,'Username',40).toLowerCase();
   if(!/^[a-z0-9][a-z0-9_.-]{2,39}$/.test(username))fail('Username must be 3–40 letters, numbers, dots, hyphens or underscores.');
   if(typeof b.password!=='string'||b.password.length<12||b.password.length>128)fail('Use a password with 12–128 characters.');
   if(path.endsWith('register')){
    const name=str(b.name,'Your name',60),salt=randomBytes(16).toString('hex'),passwordHash=(await derive(b.password,salt,64)).toString('hex');
    if(one('SELECT id FROM users WHERE username=?',username))fail('That username is already in use.',409);
    const id=randomUUID();tx(()=>{run('INSERT INTO users(id,username,name,password_hash,salt) VALUES(?,?,?,?,?)',id,username,name,passwordHash,salt);newSeason(id,{name:new Date().getFullYear()+' Season',year:new Date().getFullYear(),weeks:18});});
    setSession(res,id);return json(res,{ok:true},201);
   }
   const user=one('SELECT * FROM users WHERE username=?',username),passwordHash=await derive(b.password,user?.salt||'no-account',64);
   if(!user||!timingSafeEqual(passwordHash,Buffer.from(user.password_hash,'hex')))fail('Incorrect username or password.',401);
   setSession(res,user.id);return json(res,{ok:true});
  }
  const user=sessionUser(req);if(!user)fail('Please sign in.',401);
  if(method==='POST'&&path==='/api/auth/logout'){
   const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
   if(token)run('DELETE FROM sessions WHERE token_hash=?',hash(token));
   res.setHeader('Set-Cookie',cookieName+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'+(production?'; Secure':''));
   return json(res,{ok:true});
  }
  if(method==='GET'&&path==='/api/state')return json(res,state(user,url.searchParams.get('season')));
  if(method==='POST'&&path==='/api/seasons'){
   const b=await bodyOf(req);if(one('SELECT count(*) n FROM seasons WHERE user_id=?',user.id).n>=100)fail('Maximum 100 seasons per account.');
   const id=tx(()=>newSeason(user.id,b));return json(res,{id},201);
  }
  const m=path.match(/^\/api\/seasons\/([^/]+)(?:\/(.*))?$/);if(!m)fail('Not found.',404);
  let s=ownerSeason(user,m[1]);const action=m[2]||'';
  if(method==='GET'&&action==='export.csv'){
   res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="gridiron-'+s.year+'-scores.csv"','Cache-Control':'no-store'});
   return res.end('\uFEFF'+exportCsv(s));
  }
  if(method==='GET'&&action==='backup.json'){
   res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':'attachment; filename="gridiron-'+s.year+'-backup.json"','Cache-Control':'no-store'});
   return res.end(JSON.stringify({format:'gridiron-season-v1',exportedAt:now(),...state(user,s.id),user:undefined},null,2));
  }
  if(method==='GET'&&action==='template.csv'){
   const r=[['week','team','player','jersey','position',...s.rules.map(r=>r.code),'notes'],[1,'Your team','Player name',12,'QB',...s.rules.map(()=>0),'']];
   res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="weekly-scores-template.csv"'});
   return res.end(r.map(row=>row.map(csvCell).join(',')).join('\r\n'));
  }
  const b=await bodyOf(req);
  // Re-read after asynchronous body parsing so revision checks cannot race.
  s=ownerSeason(user,m[1]);
  if(method==='POST'&&action==='reopen'){
   if(b.revision!==s.revision)fail('Reload the season before reopening it.',409);
   run("UPDATE seasons SET status='active',final_snapshot=NULL,revision=revision+1 WHERE id=?",s.id);return json(res,{ok:true});
  }
  editable(s,b);
  if(method==='POST'&&action==='finalize'){
   const scores=listScores(s);if(!scores.length)fail('Enter scores before finalizing the season.');
   const snapshot={finalizedAt:now(),leaderboard:rankings(s,scores),rules:s.rules};
   run("UPDATE seasons SET status='completed',final_snapshot=?,revision=revision+1 WHERE id=?",JSON.stringify(snapshot),s.id);return json(res,{ok:true});
  }
  if(method==='PATCH'&&action===''){
   const name=str(b.name,'Season name'),weeks=integer(b.weeks,'Weeks',1,53),rules=rulesValid(b.rules),scores=listScores(s);
   if(scores.some(r=>r.week>weeks))fail('The season has scores beyond that week. Keep enough weeks to include them.');
   const removed=s.rules.filter(r=>!rules.some(n=>n.code===r.code));
   if(removed.some(r=>scores.some(x=>x.counts[r.code])))fail('A category with recorded scores cannot be removed. Set its weight to zero to exclude it.');
   run('UPDATE seasons SET name=?,weeks=?,rules=?,revision=revision+1 WHERE id=?',name,weeks,JSON.stringify(rules),s.id);return json(res,{ok:true});
  }
  if(method==='POST'&&action==='teams'){
   const id=randomUUID(),name=str(b.name,'Team name'),abbr=str(b.abbreviation||name.slice(0,3),'Abbreviation',4).toUpperCase(),color=b.color||colors[all('SELECT id FROM teams WHERE season_id=?',s.id).length%colors.length];
   if(!/^#[a-fA-F0-9]{6}$/.test(color))fail('Invalid team color.');
   tx(()=>{run('INSERT INTO teams(id,season_id,name,abbreviation,color) VALUES(?,?,?,?,?)',id,s.id,name,abbr,color);bump(s.id);});return json(res,{id},201);
  }
  if(method==='PATCH'&&action.startsWith('teams/')){
   const id=action.slice(6);if(!one('SELECT id FROM teams WHERE id=? AND season_id=?',id,s.id))fail('Team not found.',404);
   const name=str(b.name,'Team name'),abbr=str(b.abbreviation,'Abbreviation',4).toUpperCase(),color=b.color;
   if(!/^#[a-fA-F0-9]{6}$/.test(color))fail('Invalid team color.');
   tx(()=>{run('UPDATE teams SET name=?,abbreviation=?,color=? WHERE id=?',name,abbr,color,id);bump(s.id);});return json(res,{ok:true});
  }
  if(method==='POST'&&action==='players'){
   const t=one('SELECT id FROM teams WHERE id=? AND season_id=?',b.team_id,s.id);if(!t)fail('Choose a team from this season.');
   const id=randomUUID(),name=str(b.name,'Player name'),jersey=String(b.jersey||'').trim(),position=String(b.position||'').trim();
   if(jersey&&!/^\d{1,3}$/.test(jersey))fail('Jersey must be blank or 1–3 digits.');if(position.length>20)fail('Position is too long.');
   tx(()=>{run('INSERT INTO players(id,season_id,team_id,name,jersey,position) VALUES(?,?,?,?,?,?)',id,s.id,t.id,name,jersey,position);bump(s.id);});return json(res,{id},201);
  }
  if(method==='PATCH'&&action.startsWith('players/')){
   const id=action.slice(8);if(!one('SELECT id FROM players WHERE id=? AND season_id=?',id,s.id))fail('Player not found.',404);
   const name=str(b.name,'Player name'),jersey=String(b.jersey||'').trim(),position=String(b.position||'').trim();
   if(jersey&&!/^\d{1,3}$/.test(jersey))fail('Invalid jersey number.');if(position.length>20)fail('Position is too long.');
   tx(()=>{run('UPDATE players SET name=?,jersey=?,position=? WHERE id=?',name,jersey,position,id);bump(s.id);});return json(res,{ok:true});
  }
  if(method==='DELETE'&&(action.startsWith('players/')||action.startsWith('teams/'))){
   const kind=action.startsWith('players/')?'players':'teams',id=action.split('/')[1];
   if(!one('SELECT id FROM '+kind+' WHERE id=? AND season_id=?',id,s.id))fail('Record not found.',404);
   if(kind==='teams'&&one('SELECT id FROM players WHERE team_id=?',id))fail('Remove the players before deleting this team.');
   if(kind==='players'&&one('SELECT player_id FROM scores WHERE player_id=?',id))fail('This player has scores. Remove the score entries before deleting the player.');
   tx(()=>{run('DELETE FROM '+kind+' WHERE id=?',id);bump(s.id);});return json(res,{ok:true});
  }
  if(method==='POST'&&action==='scores'){
   if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>1000)fail('Save between 1 and 1,000 score entries.');
   const seen=new Set(),rows=b.rows.map(r=>{
    const p=one('SELECT id FROM players WHERE id=? AND season_id=?',r.player_id,s.id);if(!p)fail('Player not found in this season.');
    const week=integer(r.week,'Week',1,s.weeks),key=p.id+':'+week;if(seen.has(key))fail('Duplicate player/week.');seen.add(key);
    if(typeof r.notes==='string'&&r.notes.length>500)fail('Notes must be no longer than 500 characters.');
    return {...r,week,counts:countsValid(r.counts,s.rules),notes:typeof r.notes==='string'?r.notes:''};
   });
   tx(()=>{for(const r of rows)saveRow(s,r.player_id,r.week,r.counts,r.notes);bump(s.id);});return json(res,{saved:rows.length});
  }
  if(method==='DELETE'&&action==='scores'){
   const week=integer(b.week,'Week',1,s.weeks);tx(()=>{run('DELETE FROM scores WHERE season_id=? AND player_id=? AND week=?',s.id,b.player_id,week);bump(s.id);});return json(res,{ok:true});
  }
  if(method==='POST'&&(action==='import/preview'||action==='import')){
   const preview=importPreview(s,b.csv);if(action==='import')tx(()=>applyImport(s,preview));return json(res,action==='import'?{saved:preview.count}:preview);
  }
  fail('Not found.',404);
 }catch(e){
  if(res.headersSent){res.end();return;}
  if(e.code==='ERR_SQLITE_ERROR'&&/UNIQUE constraint/.test(e.message))return json(res,{error:'That name or player already exists in this season.'},409);
  if(e.status)return json(res,{error:e.message},e.status);
  console.error('Request failed:',e.code||e.name);return json(res,{error:'Something went wrong. Your changes were not saved. Please try again.'},500);
 }
});
server.requestTimeout=30000;server.headersTimeout=15000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Gridiron is listening on port '+(process.env.PORT||8080)));
const cleanTimer=setInterval(()=>{run('DELETE FROM sessions WHERE expires_at<?',Date.now());for(const [k,v]of authRates)if(v.until<Date.now())authRates.delete(k);},3600000);cleanTimer.unref();
let backingUp=false;
async function dailyBackup(){
 if(backingUp)return;backingUp=true;
 try{
  const dir=join(dataDir,'backups');mkdirSync(dir,{recursive:true});
  await backup(db,join(dir,'football-'+new Date().toISOString().slice(0,10)+'.sqlite'));
  const names=readdirSync(dir).filter(f=>/^football-\d{4}-\d{2}-\d{2}\.sqlite$/.test(f)).sort();
  for(const file of names.slice(0,-14))unlinkSync(join(dir,file));
 }catch(e){console.error('Local database backup failed:',e.code||e.name);}finally{backingUp=false;}
}
const backupTimer=setInterval(dailyBackup,86400000);backupTimer.unref();
if(process.env.NODE_ENV!=='test')dailyBackup();
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{server.close(()=>{db.close();process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();});
