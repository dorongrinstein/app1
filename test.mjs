import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';

test('weekly scoring, import safety, tenant isolation, finalization, and restart persistence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'gridiron-test-'));
 const port=18080+Math.floor(Math.random()*1000),base='http://127.0.0.1:'+port;
 let child,cookie='',otherCookie='',logs='';
 async function start(){
  child=spawn(process.execPath,['server.mjs'],{env:{...process.env,NODE_ENV:'test',DATA_DIR:dir,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
  for(let i=0;i<100;i++){try{const r=await fetch(base+'/health/ready');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,70));}
  throw Error('Server did not start: '+logs);
 }
 async function stop(){if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}}
 async function request(path,method='GET',body,expected=200,useCookie=cookie){
  const headers={'X-Gridiron-Request':'1'};if(useCookie)headers.Cookie=useCookie;if(body!==undefined)headers['Content-Type']='application/json';
  const r=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data=text;}
  assert.equal(r.status,expected,JSON.stringify({path,status:r.status,body:data}));
  return {data,cookie:r.headers.get('set-cookie')?.split(';')[0],headers:r.headers};
 }
 try{
  await start();
  const home=await request('/');assert.match(home.data,/Gridiron/);assert.match(home.headers.get('content-security-policy'),/default-src 'self'/);
  await request('/api/state','GET',undefined,401,'');
  const password=randomUUID()+randomUUID();
  const registration=await request('/api/auth/register','POST',{name:'Test Manager',username:'test.manager',password},201,'');cookie=registration.cookie;assert.ok(cookie);
  let st=(await request('/api/state')).data,sid=st.season.id;
  const path='/api/seasons/'+sid;
  async function refresh(){st=(await request('/api/state?season='+sid)).data;return st;}
  async function change(action,body={},method='POST',status=200){const r=await request(path+(action?'/'+action:''),method,{...body,revision:st.season.revision},status);if(status<300)await refresh();return r.data;}
  assert.equal(st.summary.entries,0);
  const csv='\uFEFFweek,team,player,jersey,td,fg,xp,two,safety,notes\r\n1,"Harbor, Hawks",Alex Reed,12,2,0,0,0,0,"Two touchdowns, opening game"\r\n1,Valley Bears,Jordan Lee,9,1,1,1,0,0,\r\n2,"Harbor, Hawks",Alex Reed,12,1,0,0,0,0,\r\n2,Valley Bears,Jordan Lee,9,1,0,2,0,0,';
  const preview=(await request(path+'/import/preview','POST',{csv,revision:st.season.revision})).data;
  assert.equal(preview.count,4);assert.equal(preview.newTeams,2);assert.equal(preview.newPlayers,2);
  assert.equal((await refresh()).summary.entries,0,'Preview must not mutate');
  await change('import',{csv});assert.equal(st.summary.points,36);assert.equal(st.summary.entries,4);assert.equal(st.summary.teams,2);
  assert.deepEqual(st.players.map(p=>p.total),[18,18]);assert.deepEqual(st.players.map(p=>p.rank),[1,1]);
  const oldRevision=st.season.revision;await change('import',{csv});
  assert.equal(st.summary.points,36,'Repeat import must not double-count');assert.equal(st.summary.entries,4);
  await request(path+'/import','POST',{csv,revision:oldRevision},409);
  await change('import',{csv:csv+'\r\n54,Bad Team,Invalid Player,1,1,0,0,0,0,'},'POST',400);
  assert.equal((await refresh()).summary.teams,2,'Invalid import must be atomic');
  await change('import',{csv:csv+'\r\n2,Valley Bears,Jordan Lee,9,2,0,0,0,0,'},'POST',400);
  await change('import',{csv:'week,team,player,td\n1,Other,Person,-1'},'POST',400);
  await change('import',{csv:'week,team,player,td,typo\n1,Other,Person,1,1'},'POST',400);
  const alex=st.players.find(p=>p.name==='Alex Reed'),jordan=st.players.find(p=>p.name==='Jordan Lee');
  await change('scores',{rows:[{player_id:alex.id,week:1,counts:{td:1,fg:1,xp:0,two:0,safety:0}}]});
  assert.equal(st.players.find(p=>p.id===alex.id).total,15);assert.equal(st.players[0].id,jordan.id);
  await change('scores',{rows:[{player_id:alex.id,week:1,counts:{td:-1}}]},'POST',400);
  await change('import',{csv});assert.equal(st.summary.points,36);
  const updatedRules=st.season.rules.map(r=>({...r,points:r.code==='td'?7:r.points}));
  await change('',{name:'Scoring test',weeks:18,rules:updatedRules},'PATCH');
  assert.equal(st.players[0].id,alex.id);assert.equal(st.players[0].total,21);assert.equal(st.players[1].total,20);
  const exported=await request(path+'/export.csv');assert.match(exported.data,/"Harbor, Hawks"/);assert.match(exported.data,/"td"/);
  const other=(await request('/api/auth/register','POST',{name:'Other Manager',username:'other.manager',password},201,''));otherCookie=other.cookie;
  await request('/api/state?season='+sid,'GET',undefined,404,otherCookie);
  const otherState=(await request('/api/state','GET',undefined,200,otherCookie)).data;
  await request('/api/seasons/'+otherState.season.id+'/scores','POST',{revision:otherState.season.revision,rows:[{player_id:alex.id,week:1,counts:{td:99}}]},400,otherCookie);
  await change('finalize');assert.equal(st.season.status,'completed');assert.equal(st.season.final_snapshot.leaderboard[0].total,21);
  await change('import',{csv},'POST',409);await change('',{name:'Oops',weeks:18,rules:updatedRules},'PATCH',409);
  const b=(await request(path+'/backup.json')).data;assert.equal(b.format,'gridiron-season-v1');assert.equal(b.scores.length,4);assert.equal(b.user,undefined);
  await stop();await start();await refresh();
  assert.equal(st.summary.points,41,'Saved scores and sessions survive process restart');assert.equal(st.season.status,'completed');
  await change('reopen');assert.equal(st.season.status,'active');
  await change('scores',{player_id:alex.id,week:2},'DELETE');assert.equal(st.players.find(p=>p.id===alex.id).total,14);
  const season2=(await request('/api/seasons','POST',{name:'Next season',year:2027,weeks:20,copyFrom:sid},201)).data;
  const next=(await request('/api/state?season='+season2.id)).data;
  assert.equal(next.summary.entries,0);assert.equal(next.summary.teams,2);assert.equal(next.summary.players,2);assert.equal(next.season.rules[0].points,7);
  await request('/api/auth/logout','POST',{});await request('/api/state','GET',undefined,401);
  const login=await request('/api/auth/login','POST',{username:'test.manager',password},200,'');assert.ok(login.cookie);
  const noHeader=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'test.manager',password})});
  assert.equal(noHeader.status,403);
 }finally{await stop();rmSync(dir,{recursive:true,force:true});}
});
