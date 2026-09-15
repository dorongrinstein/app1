'use strict';
const $=s=>document.querySelector(s);
const H=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n||0);
const paths={
 grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
 calendar:'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2',
 trophy:'M8 21h8 M12 17v4 M7 4h10v6a5 5 0 0 1-10 0z M7 6H4v3a4 4 0 0 0 4 4 M17 6h3v3a4 4 0 0 1-4 4',
 users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M16 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
 settings:'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
 plus:'M12 5v14 M5 12h14',
 upload:'M12 16V3 M7 8l5-5 5 5 M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4',
 download:'M12 3v12 M7 10l5 5 5-5 M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4',
 arrow:'M5 12h14 M12 5l7 7-7 7',
 chevron:'m9 5 7 7-7 7',
 ball:'M5 19c-4-4-2-12 1-13S15 1 19 5s2 12-1 13-9 5-13 1 M8 16l8-8 M8 12l4 4 M12 8l4 4',
 check:'m5 12 4 4L19 6',
 close:'m6 6 12 12 M6 18 18 6',
 logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
 search:'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
 edit:'m16 3 5 5-12 12-6 1 1-6z M14 5l5 5',
 trash:'M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7',
 shield:'M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7z',
 chart:'M3 3v18h18 M7 14l4-5 4 3 5-8',
 info:'M12 8h.01 M12 11v6 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
 lock:'M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4',
 refresh:'M20 7v5h-5 M4 17v-5h5 M6 6a8 8 0 0 1 14 6 M4 12a8 8 0 0 0 14 6',
 menu:'M3 6h18 M3 12h18 M3 18h18'
};
const I=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.ball}"/></svg>`;
const initials=n=>n.split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const brand=()=>'<div class="brand"><span class="brand-mark">G</span><div>gridiron<div class="brand-sub">Football manager</div></div></div>';
let data=null,view='overview',seasonId=localStorage.getItem('gridiron:season')||'',week=1,teamFilter='',boardWeek='',query='',dirty=new Map(),importText='',importPreview=null,toastTimer;
let authMode=localStorage.getItem('gridiron:registered')?'login':'register';
const navs=[['overview','grid','Overview'],['weekly','calendar','Weekly scores'],['leaderboard','trophy','Leaderboard'],['teams','users','Teams & players'],['settings','settings','Seasons & scoring']];
function toast(message,error=false){const t=$('#toast');t.textContent=message;t.className='show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4200);}
async function api(path,method='GET',body){
 const opts={method,headers:{'X-Gridiron-Request':'1'},credentials:'same-origin'};
 if(body!==undefined){opts.headers['Content-Type']='application/json';opts.body=JSON.stringify(body);}
 const r=await fetch(path,opts);let result;try{result=await r.json();}catch{throw Error('The server could not be reached. Please try again.');}
 if(!r.ok){const e=Error(result.error||'Request failed.');e.status=r.status;throw e;}return result;
}
async function load(select=seasonId,resetWeek=false){
 try{data=await api('/api/state'+(select?'?season='+encodeURIComponent(select):''));}
 catch(e){if(e.status===404&&select){data=await api('/api/state');}else if(e.status===401){data=null;auth();return;}else throw e;}
 seasonId=data.season?.id||'';localStorage.setItem('gridiron:season',seasonId);
 if(resetWeek||week>data.season.weeks)week=Math.max(1,...data.scores.map(r=>r.week));
 if(!data.teams.some(t=>t.id===teamFilter))teamFilter='';
 dirty.clear();render();
}
async function mutate(action,body={},method='POST'){
 const r=await api('/api/seasons/'+seasonId+(action?'/'+action:''),method,{...body,revision:data.season.revision});
 await load();return r;
}
const canEdit=()=>data?.season.status==='active';
const disabled=()=>canEdit()?'':'disabled';
function auth(){
 $('#modal').open&&$('#modal').close();
 $('#app').innerHTML=`<div class="auth-shell"><aside class="auth-story">${brand()}<div class="eyebrow">${I('ball')} Every point counts</div><h1>A whole season.<br>One <span>standout.</span></h1><p>Bring your teams together. Track every touchdown, every week, and the players leading the way.</p><div class="auth-scoreboard"><div><strong>06</strong><span>TOUCHDOWN</span></div><div><strong>03</strong><span>FIELD GOAL</span></div><div><strong>01</strong><span>EXTRA POINT</span></div></div><div class="auth-footer">Your league. Your scoring rules.</div></aside><main class="auth-main"><div class="auth-box"><div class="eyebrow">Welcome to your league headquarters</div><h2>${authMode==='register'?'Start your season.':'Welcome back.'}</h2><p class="subtext">${authMode==='register'?'Create your account to manage teams and record scores.':'Sign in to pick up where your league left off.'}</p><div class="auth-tabs"><button data-action="auth-login" class="${authMode==='login'?'active':''}">Sign in</button><button data-action="auth-register" class="${authMode==='register'?'active':''}">Create account</button></div><form id="auth-form"><div class="form-error" role="alert"></div>${authMode==='register'?'<div class="field"><label for="auth-name">Your name</label><input class="input" id="auth-name" name="name" autocomplete="name" placeholder="Tom" maxlength="60" required></div>':''}<div class="field"><label for="auth-user">Username</label><input class="input" id="auth-user" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Your username" minlength="3" maxlength="40" pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,39}" required></div><div class="field"><label for="auth-password">Password</label><input class="input" id="auth-password" name="password" type="password" autocomplete="${authMode==='register'?'new-password':'current-password'}" placeholder="At least 12 characters" minlength="12" maxlength="128" required>${authMode==='register'?'<small>Keep your password somewhere safe. Each account has its own private league records.</small>':''}</div><button class="btn wide" type="submit">${authMode==='register'?'Create my league':'Sign in'} ${I('arrow')}</button></form><p class="auth-fine">Weekly scoring · Team rosters · Season leaderboards</p></div></main></div>`;
 $('#auth-form').addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{
  const b=Object.fromEntries(new FormData(e.target));await api('/api/auth/'+authMode,'POST',b);localStorage.setItem('gridiron:registered','1');seasonId='';week=1;view='overview';await load('',true);
 });});
}
function pageHead(title,subtitle,actions=''){return `<div class="page-head"><div><h1>${title}</h1><p class="subtext">${subtitle}</p></div><div class="actions">${actions}</div></div>`;}
const importButton=()=>`<button class="btn secondary" data-action="import" ${disabled()}>${I('upload')} Upload CSV</button>`;
const scoreButton=()=>`<button class="btn" data-action="score" ${disabled()}>${I('plus')} Add score</button>`;
const teamOptions=(val,empty='All teams')=>`<option value="">${empty}</option>${data.teams.map(t=>`<option value="${H(t.id)}" ${val===t.id?'selected':''}>${H(t.name)}</option>`).join('')}`;
const weekOptions=(val)=>Array.from({length:data.season.weeks},(_,i)=>`<option value="${i+1}" ${Number(val)===i+1?'selected':''}>Week ${i+1}</option>`).join('');
const teamBadge=p=>`<span class="team-badge"><span class="team-square" style="background:${H(p.team_color)}">${H(p.team_abbreviation?.slice(0,2))}</span>${H(p.team_name)}</span>`;
const person=p=>`<div class="person"><span class="person-avatar" style="background:${H(p.team_color)}15;color:${H(p.team_color)}">${H(initials(p.name))}</span><div><div class="person-name">${H(p.name)}</div><div class="person-meta">${p.jersey?'#'+H(p.jersey):'No jersey'}${p.position?' · '+H(p.position):''}</div></div></div>`;
function empty(title,message,action,label,icon='ball'){return `<div class="empty"><div class="empty-icon">${I(icon)}</div><h3>${title}</h3><p>${message}</p>${action?`<button class="btn small secondary" data-action="${action}">${I('plus')}${label}</button>`:''}</div>`;}
function render(){
 if(!data)return auth();
 $('#app').innerHTML=`<div class="app-shell"><aside class="sidebar">${brand()}<div class="nav-label">League workspace</div><nav class="nav" aria-label="Main navigation">${navs.map(([key,icon,label])=>`<button data-action="nav" data-view="${key}" class="${view===key?'active':''}" ${view===key?'aria-current="page"':''}>${I(icon)}${label}</button>`).join('')}</nav><div class="sidebar-bottom"><p class="sidebar-note"><strong>The race for season MVP</strong>Track the points.<br>Let the numbers decide.</p><div class="account"><div class="avatar">${H(initials(data.user.name))}</div><div><div class="account-name">${H(data.user.name)}</div><div class="account-sub">League manager</div></div><button class="icon-button" data-action="logout" title="Sign out" aria-label="Sign out">${I('logout')}</button></div></div></aside><main class="main"><header class="topbar"><button class="icon-button menu-toggle" data-action="menu" aria-label="Open navigation">${I('menu')}</button><div class="mobile-brand"><span class="brand-mark">G</span>gridiron</div><div class="breadcrumb">Workspace ${I('chevron')} <strong>${navs.find(n=>n[0]===view)?.[2]}</strong></div><div class="top-actions"><span class="pill ${canEdit()?'':'closed'}">${canEdit()?'Season in progress':'Season finalized'}</span><select id="season-select" aria-label="Select season">${data.seasons.map(s=>`<option value="${H(s.id)}" ${s.id===seasonId?'selected':''}>${H(s.name)}</option>`).join('')}</select><button class="icon-button" data-action="new-season" title="New season" aria-label="Create a new season">${I('plus')}</button></div></header><div id="main-content" class="content"></div></main></div>`;
 drawMain();
 $('#season-select').addEventListener('change',async e=>{if(!discard()){e.target.value=seasonId;return;}teamFilter='';boardWeek='';query='';await safe(()=>load(e.target.value,true));});
}
function drawMain(){
 $('#main-content').innerHTML=({overview,weekly,leaderboard,teams,settings}[view]||overview)();
 bindMain();
}
function overview(){
 const lead=data.players.find(p=>p.rank===1),winners=data.players.filter(p=>p.rank===1),s=data.summary,final=!canEdit();
 const head=pageHead('Season overview',H(data.season.name)+' · Your league, at a glance.',importButton()+scoreButton());
 const stats=[['Total points',num(s.points),'Across all recorded scores','chart'],['Teams',num(s.teams),'Competing this season','shield'],['Players',num(s.players),'On the season roster','users'],['Weeks recorded',s.weeks+' / '+data.season.weeks,s.entries+' player-week entries','calendar']];
 const leader=`<section class="card leader-card"><div class="eyebrow">${I('trophy')} ${final?'Season MVP':'Leading the league'}</div><h2>${lead?H(winners.length>1?winners.length+' joint leaders':lead.name):'Who will lead<br>the league?'}</h2><div class="team-line">${lead?H(winners.length>1?winners.slice(0,3).map(p=>p.name).join(' · ')+(winners.length>3?' + more':''):lead.team_name+(lead.position?' · '+lead.position:'')):'Your season story starts with the first score.'}</div><div class="leader-bottom"><div class="leader-number">${lead?num(lead.total):'—'}<span>pts</span></div><div class="leader-tag">${lead?(final?'Final standings':lead.weeks_played+' weeks recorded'):'Season '+data.season.year}</div></div><p class="leader-hint">${lead?(winners.length>1?'Equal point totals share first place.':'Ranked by total scoring points across all teams.'):'Add your teams, then enter or upload weekly scores.'}</p></section>`;
 let setup='';
 if(!s.entries)setup=`<div class="onboard"><div class="step"><div class="step-number">01 / ROSTER</div><h3>Add your teams & players</h3><p>Set up the teams competing in your league.</p><button class="text-button" data-action="nav" data-view="teams">Manage roster ${I('arrow')}</button></div><div class="step"><div class="step-number">02 / SCORE</div><h3>Record the week's points</h3><p>Enter scoring counts or upload a CSV for all teams.</p><button class="text-button" data-action="import">Upload scores ${I('arrow')}</button></div><div class="step"><div class="step-number">03 / RANK</div><h3>Follow the race for MVP</h3><p>The leaderboard updates with every saved week.</p><button class="text-button" data-action="nav" data-view="settings">Review scoring rules ${I('arrow')}</button></div></div>`;
 return head+(final?finalBanner():'')+`<div class="stats">${stats.map(([label,val,note,icon])=>`<div class="stat"><div class="stat-top">${label}${I(icon)}</div><div class="stat-value">${val}</div><div class="stat-foot">${note}</div></div>`).join('')}</div>`+setup+`<div class="overview-grid">${leader}<section class="card"><div class="card-head"><div><h2>Points by week</h2><p>League-wide scoring through the season</p></div><span class="pill" style="background:#f0f3f8;color:#6e7a8f">${data.season.weeks} weeks</span></div>${chart()}<div class="chart-legend"><span class="legend-line"></span>Total scoring points</div></section></div><section class="card"><div class="card-head"><div><h2>The front-runners</h2><p>Top players across every team</p></div><button class="text-button" data-action="nav" data-view="leaderboard">Full leaderboard ${I('arrow')}</button></div>${s.entries?boardTable(data.players.filter(p=>p.weeks_played).slice(0,5),false):empty('No points on the board yet','Record your first week to see the top players here.','score','Add the first score','trophy')}<div class="table-footer"><span>Equal point totals share the same rank.</span><span>${H(data.season.name)}</span></div></section>`;
}
function chart(){
 const rows=data.weekly,values=rows.map(w=>w.points),max=Math.max(10,...values),min=Math.min(0,...values),range=max-min||1,w=550,h=145,base=18,left=35;
 const y=v=>base+h-(v-min)/range*h,x=i=>left+i/(rows.length-1||1)*w;
 const active=rows.filter(r=>r.entries),lastIndex=Math.max(-1,...rows.map((r,i)=>r.entries?i:-1));
 let lines='';
 for(let i=0;i<4;i++){const v=min+range*i/3,yy=y(v);lines+=`<line x1="${left}" x2="${left+w}" y1="${yy}" y2="${yy}" stroke="#edf0f5" stroke-dasharray="3 4"/><text x="24" y="${yy+4}" text-anchor="end">${num(Math.round(v))}</text>`;}
 let area='',path='';
 if(lastIndex>=0){const d=rows.slice(0,lastIndex+1).map((r,i)=>`${i?'L':'M'}${x(i)},${y(r.points)}`).join(' ');path=`<path d="${d}" fill="none" stroke="#255ee8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;area=`<path d="${d} L${x(lastIndex)},${base+h} L${left},${base+h} Z" fill="url(#area)"/>`;}
 return `<div class="chart-box"><svg class="chart-svg" viewBox="0 0 610 193" role="img" aria-label="Weekly points: ${H(active.length?active.map(r=>'week '+r.week+', '+r.points+' points').join('; '):'No scores recorded')}"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#255ee8" stop-opacity=".14"/><stop offset="100%" stop-color="#255ee8" stop-opacity="0"/></linearGradient></defs>${lines}${area}${path}${rows.map((r,i)=>(i===0||i===rows.length-1||i%Math.ceil(rows.length/9)===0)?`<text x="${x(i)}" y="187" text-anchor="middle">${r.week}</text>`:'').join('')}${rows.map((r,i)=>r.entries?`<circle cx="${x(i)}" cy="${y(r.points)}" r="3.5" fill="white" stroke="#255ee8" stroke-width="2"><title>Week ${r.week}: ${num(r.points)} points</title></circle>`:'').join('')}${!active.length?'<text x="310" y="96" text-anchor="middle" style="font-size:13px">Your weekly scores will appear here</text>':''}</svg></div>`;
}
function boardTable(players,full=true){
 return `<div class="table-scroll"><table><thead><tr><th>Rank</th><th>Player</th><th>Team</th>${full?data.season.rules.map(r=>`<th title="${H(r.name)}">${H(r.code.toUpperCase())}</th>`).join(''):''}<th>Weeks</th><th>Points</th>${full?'<th>Pts / week</th>':''}</tr></thead><tbody>${players.map(p=>`<tr><td class="rank">${p.rank===1?'<span class="rank-badge">1</span>':p.rank??'—'}</td><td>${person(p)}</td><td>${teamBadge(p)}</td>${full?data.season.rules.map(r=>`<td>${num(p.counts[r.code])}</td>`).join(''):''}<td class="muted">${p.weeks_played}</td><td class="points">${p.weeks_played?num(p.total):'—'}</td>${full?`<td class="muted">${p.weeks_played?num(p.average):'—'}</td>`:''}</tr>`).join('')}</tbody></table></div>`;
}
function finalBanner(){
 const winners=data.players.filter(p=>p.rank===1);
 return `<div class="final-banner">${I('trophy')}<div><h2>${winners.length>1?'Your season co-MVPs':H(winners[0]?.name||'Season results')}</h2><p>${winners.length>1?H(winners.map(p=>p.name).join(', '))+' · ':H(winners[0]?.team_name||'')+' · '}${num(winners[0]?.total)} points · Final standings</p></div><a class="btn small secondary" href="/api/seasons/${seasonId}/export.csv">${I('download')} Export results</a></div>`;
}
function weekly(){
 const players=data.players.filter(p=>!teamFilter||p.team_id===teamFilter).sort((a,b)=>a.team_name.localeCompare(b.team_name)||a.name.localeCompare(b.name));
 const entries=data.scores.filter(r=>r.week===week),recorded=entries.filter(r=>players.some(p=>p.id===r.player_id)).length;
 return pageHead('Weekly scores','Record scoring plays for every player. Totals update when you save.',importButton()+scoreButton())+
 (!canEdit()?'<div class="notice warn">'+I('lock')+'This season is finalized. Reopen it in Seasons & scoring to make a correction.</div>':'')+
 `<div class="filters"><label>Week <select id="week-filter" aria-label="Scoring week">${weekOptions(week)}</select></label><label>Team <select id="team-filter" aria-label="Filter by team">${teamOptions(teamFilter)}</select></label><span class="subtext filter-right">${recorded} of ${players.length} players entered</span></div><section class="card"><div class="card-head"><div><h2>Week ${week} scores</h2><p>Enter the number of each scoring play, not the point total.</p></div><button class="text-button" data-action="download-template">${I('download')} CSV template</button></div>${players.length?`<div class="table-scroll"><table class="entry-table"><thead><tr><th>Player</th>${data.season.rules.map(r=>`<th title="${H(r.name)}">${H(r.code.toUpperCase())}<small>${num(r.points)} pts each</small></th>`).join('')}<th>Total</th><th></th></tr></thead><tbody>${players.map(p=>{const entry=entries.find(e=>e.player_id===p.id);return `<tr><td>${person(p)}<div class="person-meta" style="margin-left:47px">${H(p.team_name)}</div></td>${data.season.rules.map(r=>`<td><input type="number" class="count-input" min="0" max="10000" step="1" value="${entry?.counts[r.code]||0}" data-count="${H(r.code)}" data-player="${p.id}" aria-label="${H(p.name+' '+r.name)}" ${disabled()}></td>`).join('')}<td class="points" data-total="${p.id}">${entry?num(entry.total):'—'}</td><td><button class="icon-button" data-action="score" data-player="${p.id}" data-week="${week}" title="Edit score and notes" aria-label="Edit ${H(p.name)} score" ${disabled()}>${I('edit')}</button></td></tr>`;}).join('')}</tbody></table></div><div class="save-bar"><p id="unsaved">Changes replace the player's saved entry for this week.</p><button class="btn" data-action="save-week" disabled>${I('check')} Save week ${week}</button></div>`:empty('Build your roster first','Add a team and its players, or upload a CSV to create the roster automatically.','team','Add a team','users')}</section>`;
}
function weekBoard(){
 if(!boardWeek)return data.players;
 const scores=data.scores.filter(r=>r.week===Number(boardWeek));
 let result=data.players.map(p=>{const r=scores.find(r=>r.player_id===p.id);return {...p,counts:r?.counts||{},weeks_played:r?1:0,total:r?.total||0,average:r?.total||0};}).sort((a,b)=>Number(b.weeks_played>0)-Number(a.weeks_played>0)||b.total-a.total||a.name.localeCompare(b.name));
 let prev,rank=0;return result.map((p,i)=>{if(p.total!==prev)rank=i+1;prev=p.total;return {...p,rank:p.weeks_played?rank:null};});
}
function leaderboard(){
 const list=weekBoard().filter(p=>(!teamFilter||p.team_id===teamFilter)&&(!query||[p.name,p.team_name,p.position].some(v=>v.toLowerCase().includes(query.toLowerCase()))));
 return pageHead('Leaderboard','The highest-scoring players across your league.',`<a class="btn secondary" href="/api/seasons/${seasonId}/export.csv">${I('download')} Export season</a>`)+(!canEdit()&&!boardWeek?finalBanner():'')+
 `<div class="filters"><div class="search">${I('search')}<input id="player-search" class="input" value="${H(query)}" placeholder="Search players or teams…" aria-label="Search players or teams"></div><label>Team <select id="team-filter" aria-label="Filter by team">${teamOptions(teamFilter)}</select></label><label>Period <select id="board-week" aria-label="Leaderboard period"><option value="">Full season</option>${weekOptions(boardWeek)}</select></label></div><section class="card"><div class="card-head"><div><h2>${boardWeek?'Week '+H(boardWeek)+' standings':'Season standings'}</h2><p>${list.length} players · Ranked by total scoring points</p></div><span class="pill" style="background:#eef3ff;color:#3c64b7">${boardWeek?'Week '+boardWeek:data.season.year+' season'}</span></div>${list.length?boardTable(list):empty(data.players.length?'No matching players':'Your leaderboard is waiting',data.players.length?'Try a different team or search.':'Add players and record weekly scores to start the race for MVP.',data.players.length?'':'team',data.players.length?'':'Add a team','trophy')}<div class="table-footer"><span>Equal point totals share rank. Weeks counts recorded entries, including zero-point weeks.</span><span>${list.filter(p=>p.weeks_played).length} ranked players</span></div></section>`;
}
function teams(){
 const players=data.players.filter(p=>(!teamFilter||p.team_id===teamFilter)&&(!query||p.name.toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>a.team_name.localeCompare(b.team_name)||a.name.localeCompare(b.name));
 return pageHead('Teams & players','Build the roster for '+H(data.season.name)+'.',`<button class="btn secondary" data-action="team" ${disabled()}>${I('plus')} Add team</button><button class="btn" data-action="player" ${disabled()}>${I('plus')} Add player</button>`)+
 `<div class="team-grid">${data.teams.map(t=>`<article class="team-card"><div class="team-card-header"><div class="team-logo" style="background:${H(t.color)}">${H(t.abbreviation)}</div><div><h3>${H(t.name)}</h3><p>${t.players} ${t.players===1?'player':'players'} on roster</p></div><button class="icon-button" data-action="team" data-id="${t.id}" title="Edit team" aria-label="Edit ${H(t.name)}" ${disabled()}>${I('edit')}</button></div><div class="team-card-foot"><strong>${num(t.total)}<small>pts</small></strong><button class="text-button" data-action="team-roster" data-id="${t.id}">View roster ${I('arrow')}</button></div></article>`).join('')}</div>`+
 `<div class="filters"><div class="search">${I('search')}<input class="input" id="player-search" placeholder="Find a player…" value="${H(query)}" aria-label="Find a player"></div><label>Team <select id="team-filter" aria-label="Filter roster by team">${teamOptions(teamFilter)}</select></label></div><section class="card"><div class="card-head"><div><h2>Player roster</h2><p>${data.players.length} players across ${data.teams.length} teams</p></div><button class="text-button" data-action="import" ${disabled()}>${I('upload')} Add from CSV</button></div>${players.length?`<div class="table-scroll"><table><thead><tr><th>Player</th><th>Team</th><th>Position</th><th>Season points</th><th></th></tr></thead><tbody>${players.map(p=>`<tr><td>${person(p)}</td><td>${teamBadge(p)}</td><td class="muted">${H(p.position)||'—'}</td><td class="points">${num(p.total)}</td><td><button class="icon-button" data-action="player" data-id="${p.id}" title="Edit player" aria-label="Edit ${H(p.name)}" ${disabled()}>${I('edit')}</button></td></tr>`).join('')}</tbody></table></div>`:empty(data.players.length?'No matching players':'Make room for your all-stars',data.players.length?'Try another team or search.':'Add a team, then add its players. A CSV upload can also create both for you.',data.teams.length?'player':'team',data.teams.length?'Add player':'Add team','users')}</section>`;
}
function ruleRow(r,newRule=false){
 return `<div class="rule-row"><input class="input rule-code" value="${H(r.code)}" maxlength="16" aria-label="Category code" ${newRule?'':'readonly'} ${disabled()} required><input class="input rule-name" value="${H(r.name)}" maxlength="40" aria-label="Category name" ${disabled()} required><input class="input rule-points" type="number" value="${r.points}" min="-1000" max="1000" step=".01" aria-label="Points per ${H(r.name)||'category'}" ${disabled()} required><button type="button" class="icon-button" data-action="remove-rule" aria-label="Remove ${H(r.name)||'category'}" ${disabled()}>${I('close')}</button></div>`;
}
function settings(){
 return pageHead('Seasons & scoring','Define the points. Keep every season organized.',`<button class="btn" data-action="new-season">${I('plus')} New season</button>`)+
 `<div class="settings-grid"><section class="card"><div class="card-head"><div><h2>Scoring rules</h2><p>Applied to every player in this season</p></div></div><form id="settings-form"><div class="card-body" style="padding-top:4px"><div class="form-error" role="alert"></div><div class="form-row"><div class="field"><label for="season-name">Season name</label><input id="season-name" class="input" name="name" value="${H(data.season.name)}" maxlength="80" ${disabled()} required></div><div class="field"><label for="season-weeks">Weeks in season</label><input id="season-weeks" class="input" type="number" name="weeks" value="${data.season.weeks}" min="1" max="53" ${disabled()} required></div></div><div class="rule-row rule-heading"><span>Code</span><span>Scoring play</span><span>Points</span></div><div class="rules-list">${data.season.rules.map(r=>ruleRow(r)).join('')}</div><button type="button" class="text-button" data-action="add-rule" style="margin-top:16px" ${disabled()}>${I('plus')} Add scoring category</button><hr class="section-divider"><div class="notice">${I('info')}<span>Changing point values recalculates every existing score in this season. A player receives points for the plays you credit to them; passing touchdowns are not counted separately unless you add a category.</span></div><button type="submit" class="btn" ${disabled()}>${I('check')} Save scoring rules</button></div></form></section><div><section class="card"><div class="card-head"><div><h2>${canEdit()?'Finish the season':'Season complete'}</h2><p>${canEdit()?'Declare your season MVP':'Your final standings are preserved'}</p></div>${I('trophy')}</div><div class="card-body" style="padding-top:5px"><p class="settings-note">${canEdit()?'Finalizing saves the standings and locks scores and rules. Players with equal top totals share the MVP title. You can reopen the season to make a correction.':'Scores and scoring rules are locked. Reopen only if you need to correct the results, then finalize again.'}</p><div class="settings-actions"><button class="btn ${canEdit()?'dark':'secondary'}" data-action="${canEdit()?'finalize':'reopen'}" ${canEdit()&&!data.scores.length?'disabled':''}>${I(canEdit()?'trophy':'refresh')}${canEdit()?'Finalize season':'Reopen season'}</button></div></div></section><div class="spacer"></div><section class="card"><div class="card-head"><div><h2>Take your records with you</h2><p>Download a copy whenever you need it</p></div></div><div class="card-body" style="padding-top:5px"><div class="settings-actions"><a class="btn secondary" href="/api/seasons/${seasonId}/export.csv">${I('download')} Export all weekly scores</a><a class="btn secondary" href="/api/seasons/${seasonId}/backup.json">${I('download')} Download season backup</a><button class="btn secondary" data-action="download-template">${I('download')} Get CSV upload template</button></div><p class="settings-note" style="margin:18px 0 0">The season backup includes your roster, rules, scores, and standings. Keep a downloaded copy for your own records.</p></div></section></div></div>`;
}
function bindMain(){
 $('#team-filter')?.addEventListener('change',e=>{if(!discard()){e.target.value=teamFilter;return;}teamFilter=e.target.value;drawMain();});
 $('#week-filter')?.addEventListener('change',e=>{if(!discard()){e.target.value=week;return;}week=Number(e.target.value);drawMain();});
 $('#board-week')?.addEventListener('change',e=>{boardWeek=e.target.value;drawMain();});
 $('#player-search')?.addEventListener('input',e=>{query=e.target.value;const pos=e.target.selectionStart;drawMain();$('#player-search').focus();$('#player-search').setSelectionRange(pos,pos);});
 document.querySelectorAll('[data-count]').forEach(input=>input.addEventListener('input',()=>{
  const id=input.dataset.player,entry=data.scores.find(r=>r.player_id===id&&r.week===week),counts=dirty.get(id)?.counts||{...(entry?.counts||{})};
  counts[input.dataset.count]=Number(input.value);dirty.set(id,{player_id:id,week,counts,notes:entry?.notes||''});
  input.classList.add('changed');document.querySelector('[data-total="'+id+'"]').textContent=num(calc(counts));
  $('#unsaved').textContent=dirty.size+' player '+(dirty.size===1?'entry':'entries')+' with unsaved changes.';
  $('[data-action="save-week"]').disabled=false;
 }));
 $('#settings-form')?.addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{
  const rules=[...e.target.querySelectorAll('.rule-row:not(.rule-heading)')].map(row=>({code:row.querySelector('.rule-code').value.trim(),name:row.querySelector('.rule-name').value.trim(),points:Number(row.querySelector('.rule-points').value)}));
  if(data.scores.length&&JSON.stringify(rules)!==JSON.stringify(data.season.rules)&&!confirm('Recalculate every score in this season using these point values?'))return;
  await mutate('',{name:e.target.elements.name.value,weeks:Number(e.target.elements.weeks.value),rules},'PATCH');toast('Scoring rules saved. Standings updated.');
 });});
}
const calc=counts=>data.season.rules.reduce((n,r)=>n+(counts[r.code]||0)*Math.round(r.points*100),0)/100;
function discard(){if(dirty.size&&!confirm('You have unsaved weekly scores. Discard those changes?'))return false;dirty.clear();return true;}
function openModal(title,body,foot='',wide=false){
 const modal=$('#modal');modal.className=wide?'wide':'';
 modal.innerHTML=`<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="Close dialog">${I('close')}</button></div>${body}${foot}`;
 if(!modal.open)modal.showModal();
 setTimeout(()=>modal.querySelector('input:not([type=file]),select,button[type=submit]')?.focus(),50);
}
async function formAction(form,fn){
 const error=form.querySelector('.form-error'),button=form.querySelector('button[type=submit]'),original=button?.innerHTML;
 if(error){error.className='form-error';error.textContent='';}if(button){button.disabled=true;button.textContent='Saving…';}
 try{await fn();}catch(e){if(error){error.textContent=e.message;error.className='form-error show';}else toast(e.message,true);}
 finally{if(button?.isConnected){button.disabled=false;button.innerHTML=original;}}
}
const footer=(label='Save',extra='')=>`<div class="modal-foot">${extra}<button type="button" class="btn secondary" data-action="close-modal">Cancel</button><button type="submit" class="btn">${label}</button></div>`;
function teamModal(id){
 const t=data.teams.find(t=>t.id===id);
 openModal(t?'Edit team':'Add a team',`<form id="team-form"><div class="modal-body"><div class="form-error" role="alert"></div><div class="field"><label for="team-name">Team name</label><input class="input" id="team-name" name="name" value="${H(t?.name)}" placeholder="e.g. Westside Warriors" maxlength="80" required></div><div class="form-row"><div class="field"><label for="team-abbr">Abbreviation</label><input class="input" id="team-abbr" name="abbreviation" value="${H(t?.abbreviation)}" placeholder="e.g. WSW" maxlength="4"></div><div class="field"><label for="team-color">Team color</label><input class="input" id="team-color" type="color" name="color" value="${H(t?.color||'#2563eb')}" style="padding:5px"></div></div></div>${footer(t?'Save changes':'Add team',t?`<button type="button" class="icon-button" style="margin-right:auto" data-action="delete-team" data-id="${t.id}" title="Delete team" aria-label="Delete team">${I('trash')}</button>`:'')}</form>`);
 $('#team-form').addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{await mutate(t?'teams/'+t.id:'teams',Object.fromEntries(new FormData(e.target)),t?'PATCH':'POST');$('#modal').close();toast(t?'Team updated.':'Team added. Now add your players.');});});
}
function playerModal(id){
 if(!data.teams.length){toast('Add a team first.');return teamModal();}
 const p=data.players.find(p=>p.id===id);
 openModal(p?'Edit player':'Add a player',`<form id="player-form"><div class="modal-body"><div class="form-error" role="alert"></div><div class="field"><label for="player-team">Team</label><select id="player-team" name="team_id" ${p?'disabled':''} required>${teamOptions(p?.team_id||teamFilter,'Choose a team')}</select></div><div class="field"><label for="player-name">Player name</label><input class="input" id="player-name" name="name" value="${H(p?.name)}" maxlength="80" placeholder="First and last name" required></div><div class="form-row"><div class="field"><label for="player-jersey">Jersey number</label><input class="input" id="player-jersey" name="jersey" value="${H(p?.jersey)}" inputmode="numeric" pattern="[0-9]{1,3}" maxlength="3" placeholder="e.g. 12"></div><div class="field"><label for="player-position">Position</label><input class="input" id="player-position" name="position" value="${H(p?.position)}" maxlength="20" placeholder="e.g. QB" list="positions"><datalist id="positions">${['QB','RB','WR','TE','K','LB','DB','DL','OL','P'].map(v=>'<option>'+v+'</option>').join('')}</datalist></div></div></div>${footer(p?'Save changes':'Add player',p?`<button type="button" class="icon-button" style="margin-right:auto" data-action="delete-player" data-id="${p.id}" title="Delete player" aria-label="Delete player">${I('trash')}</button>`:'')}</form>`);
 $('#player-form').addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{await mutate(p?'players/'+p.id:'players',Object.fromEntries(new FormData(e.target)),p?'PATCH':'POST');$('#modal').close();toast(p?'Player updated.':'Player added to the roster.');});});
}
function scoreModal(playerId,selectedWeek=week){
 if(!discard())return;
 if(!data.players.length){toast('Add a player or upload a CSV first.');return playerModal();}
 openModal('Record a score',`<form id="score-form"><div class="modal-body"><div class="form-error" role="alert"></div><div class="form-row"><div class="field"><label for="score-week">Week</label><select id="score-week" name="week">${weekOptions(selectedWeek)}</select></div><div class="field"><label for="score-player">Player</label><select id="score-player" name="player_id" required><option value="">Choose a player</option>${[...data.players].sort((a,b)=>a.team_name.localeCompare(b.team_name)||a.name.localeCompare(b.name)).map(p=>`<option value="${p.id}" ${playerId===p.id?'selected':''}>${H(p.name)}${p.jersey?' #'+H(p.jersey):''} · ${H(p.team_name)}</option>`).join('')}</select></div></div><div class="score-fields">${data.season.rules.map(r=>`<div class="field"><label for="count-${r.code}">${H(r.name)} <span class="muted" style="font-weight:400">(${num(r.points)} pts)</span></label><input class="input" id="count-${r.code}" name="c_${r.code}" type="number" value="0" min="0" max="10000" step="1" required></div>`).join('')}</div><div class="field"><label for="score-notes">Notes <span class="muted" style="font-weight:400">(optional)</span></label><textarea id="score-notes" name="notes" rows="2" maxlength="500" placeholder="Game notes or context for this entry"></textarea></div><div class="score-total"><span>Total points this week</span><strong id="score-calculated">0</strong></div><p id="score-existing" class="settings-note" style="margin:12px 0 0">Counts are saved as one entry per player, per week.</p></div>${footer('Save score','<button type="button" class="icon-button hide" style="margin-right:auto" data-action="delete-score" aria-label="Delete this score entry" title="Delete score entry">'+I('trash')+'</button>')}</form>`);
 const f=$('#score-form');
 function updateTotal(){const counts=Object.fromEntries(data.season.rules.map(r=>[r.code,Number(f.elements['c_'+r.code].value)]));$('#score-calculated').textContent=num(calc(counts));}
 function existing(){
  const r=data.scores.find(r=>r.player_id===f.elements.player_id.value&&r.week===Number(f.elements.week.value));
  for(const rule of data.season.rules)f.elements['c_'+rule.code].value=r?.counts[rule.code]||0;f.elements.notes.value=r?.notes||'';
  $('#score-existing').textContent=r?'This replaces the saved score for this player and week.':'Counts are saved as one entry per player, per week.';
  f.querySelector('[data-action="delete-score"]').classList.toggle('hide',!r);updateTotal();
 }
 f.elements.player_id.addEventListener('change',existing);f.elements.week.addEventListener('change',existing);
 f.querySelectorAll('input[type=number]').forEach(el=>el.addEventListener('input',updateTotal));existing();
 f.addEventListener('submit',async e=>{e.preventDefault();await formAction(f,async()=>{
  const row={player_id:f.elements.player_id.value,week:Number(f.elements.week.value),notes:f.elements.notes.value,counts:Object.fromEntries(data.season.rules.map(r=>[r.code,Number(f.elements['c_'+r.code].value)]))};
  await mutate('scores',{rows:[row]});$('#modal').close();toast('Week '+row.week+' score saved. Leaderboard updated.');
 });});
}
function importModal(){
 if(!discard())return;importText='';importPreview=null;
 openModal('Upload weekly scores',`<div class="modal-body"><div id="import-error" class="form-error" role="alert"></div><p class="subtext" style="margin-bottom:18px">Upload one CSV for any number of teams and weeks. New teams and players are added automatically.</p><label class="upload-zone" for="csv-file">${I('upload')}<strong>Choose your scores file</strong><span>CSV · Up to 2 MB · Maximum 5,000 rows</span><input type="file" id="csv-file" accept=".csv,text/csv"></label><div class="notice">${I('info')}<span>Use the template columns. Enter play counts, such as <strong>td = 2</strong> for two touchdowns. Include jersey numbers to distinguish players with the same name.</span></div><button class="text-button" data-action="download-template">${I('download')} Download CSV template</button><div id="import-preview"></div></div><div class="modal-foot"><button class="btn secondary" data-action="close-modal">Cancel</button><button class="btn" data-action="preview-import" disabled>Review import ${I('arrow')}</button></div>`, '',true);
 $('#csv-file').addEventListener('change',async e=>{
  const f=e.target.files[0];importPreview=null;$('#import-preview').innerHTML='';$('#import-error').className='form-error';
  if(!f)return;if(f.size>2000000){$('#import-error').textContent='Please choose a CSV smaller than 2 MB.';$('#import-error').classList.add('show');return;}
  importText=await f.text();const btn=$('#modal .modal-foot .btn:not(.secondary)');btn.dataset.action='preview-import';btn.innerHTML='Review import '+I('arrow');btn.disabled=false;
 });
}
async function previewImport(button){
 button.disabled=true;button.textContent='Checking scores…';
 try{
  importPreview=await api('/api/seasons/'+seasonId+'/import/preview','POST',{csv:importText,revision:data.season.revision});
  const p=importPreview;$('#import-error').className='form-error';
  $('#import-preview').innerHTML=`<hr class="section-divider"><h3>Ready to import</h3><div class="preview-stats"><span><strong>${p.count}</strong>score entries</span><span><strong>${p.newTeams}</strong>new teams</span><span><strong>${p.newPlayers}</strong>new players</span><span><strong>${p.replaced}</strong>entries replaced</span></div><div class="notice ${p.replaced?'warn':''}">${I('info')}<span>Each row replaces all scoring counts for that player and week. Missing category columns become zero. Re-uploading a file does not add duplicate points.</span></div><div class="preview-table"><table><thead><tr><th>Week</th><th>Player</th><th>Team</th><th>Points</th><th>Action</th></tr></thead><tbody>${p.rows.slice(0,50).map(r=>`<tr><td>${r.week}</td><td>${H(r.player)}${r.jersey?' #'+H(r.jersey):''}</td><td>${H(r.team)}</td><td class="points">${num(r.total)}</td><td><span class="pill ${r.action==='replace'?'closed':''}">${r.action==='replace'?'Replace':'New'}</span></td></tr>`).join('')}</tbody></table></div>${p.count>50?'<p class="settings-note" style="margin:12px 0 0">Showing the first 50 rows. All '+p.count+' rows will be imported.</p>':''}`;
  button.dataset.action='confirm-import';button.textContent='Import '+p.count+' entries';button.disabled=false;
 }catch(e){$('#import-error').textContent=e.message;$('#import-error').className='form-error show';button.textContent='Review import';button.disabled=false;}
}
function newSeasonModal(){
 openModal('Start a new season',`<form id="new-season-form"><div class="modal-body"><div class="form-error" role="alert"></div><div class="field"><label for="new-season-name">Season name</label><input id="new-season-name" class="input" name="name" value="${data.season.year+1} Season" maxlength="80" required></div><div class="form-row"><div class="field"><label for="new-season-year">Year</label><input id="new-season-year" class="input" name="year" type="number" value="${data.season.year+1}" min="2000" max="2200" required></div><div class="field"><label for="new-season-weeks">Weeks</label><input id="new-season-weeks" class="input" name="weeks" type="number" value="${data.season.weeks}" min="1" max="53" required></div></div><div class="field"><label for="copy-season">Roster & scoring rules</label><select id="copy-season" name="copyFrom"><option value="">Start with an empty roster</option>${data.seasons.map(s=>`<option value="${s.id}" ${s.id===seasonId?'selected':''}>Copy from ${H(s.name)}</option>`).join('')}</select><small>Only teams, players, and scoring rules are copied. Previous scores stay in their original season.</small></div></div>${footer('Create season')}</form>`);
 $('#new-season-form').addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{
  const b=Object.fromEntries(new FormData(e.target));b.year=Number(b.year);b.weeks=Number(b.weeks);
  const r=await api('/api/seasons','POST',b);teamFilter='';query='';boardWeek='';view='overview';await load(r.id,true);$('#modal').close();toast('New season created.');
 });});
}
function confirmSeason(kind){
 const final=kind==='finalize',winners=data.players.filter(p=>p.rank===1);
 openModal(final?'Finalize this season?':'Reopen this season?',`<form id="confirm-season"><div class="modal-body"><div class="form-error" role="alert"></div><p>${final?'The current standings will become the final results. Scores, rosters, and scoring rules will be locked until you reopen the season.':'The final standings will be unlocked so you can make corrections. Finalize the season again when you are done.'}</p>${final?`<div class="notice warn">${I('trophy')}<span><strong>${H(winners.map(p=>p.name).join(' & '))}</strong><br>${num(winners[0]?.total)} points · ${winners.length>1?'Joint season MVPs':'Season MVP'}</span></div>`:''}</div>${footer(final?'Finalize & save results':'Reopen season')}</form>`);
 $('#confirm-season').addEventListener('submit',async e=>{e.preventDefault();await formAction(e.target,async()=>{await mutate(kind);$('#modal').close();toast(final?'Season finalized. Your results are saved.':'Season reopened for corrections.');});});
}
async function safe(fn){try{await fn();}catch(e){if(e.status===401){data=null;auth();}toast(e.message,true);}}
document.addEventListener('click',e=>{
 const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
 const action=b.dataset.action;
 safe(async()=>{
  if(action==='auth-login'||action==='auth-register'){authMode=action==='auth-login'?'login':'register';return auth();}
  if(action==='close-modal'){return $('#modal').close();}
  if(action==='menu'){return $('.sidebar').classList.toggle('open');}
  if(action==='nav'){if(!discard())return;view=b.dataset.view;query='';teamFilter='';render();return;}
  if(action==='logout'){if(!discard())return;await api('/api/auth/logout','POST',{});data=null;authMode='login';return auth();}
  if(action==='download-template'){location.href='/api/seasons/'+seasonId+'/template.csv';return;}
  if(action==='new-season'){if(!discard())return;return newSeasonModal();}
  if(action==='team-roster'){teamFilter=b.dataset.id;query='';drawMain();$('.filters')?.scrollIntoView({behavior:'smooth',block:'start'});return;}
  if(['team','player','score','import','preview-import','confirm-import','save-week','add-rule','remove-rule','delete-player','delete-team','delete-score','finalize'].includes(action)&&!canEdit())return toast('Reopen the season before changing records.',true);
  if(action==='team'){return teamModal(b.dataset.id);}
  if(action==='player'){return playerModal(b.dataset.id);}
  if(action==='score'){return scoreModal(b.dataset.player,Number(b.dataset.week||week));}
  if(action==='import'){return importModal();}
  if(action==='preview-import'){return previewImport(b);}
  if(action==='confirm-import'){
   b.disabled=true;b.textContent='Importing…';try{const r=await mutate('import',{csv:importText});$('#modal').close();toast(r.saved+' score entries saved. Standings updated.');}catch(e){$('#import-error').textContent=e.message;$('#import-error').className='form-error show';b.disabled=false;b.textContent='Retry import';}return;
  }
  if(action==='save-week'){
   const inputs=[...document.querySelectorAll('[data-count]')];if(inputs.some(i=>!i.reportValidity()))return;
   b.disabled=true;try{const r=await mutate('scores',{rows:[...dirty.values()]});toast(r.saved+' player scores saved for week '+week+'.');}catch(e){b.disabled=false;throw e;}return;
  }
  if(action==='add-rule'){if($('.rules-list').children.length>=10)return toast('Use up to 10 scoring categories.');$('.rules-list').insertAdjacentHTML('beforeend',ruleRow({code:'',name:'',points:1},true));$('.rules-list').lastElementChild.querySelector('input').focus();return;}
  if(action==='remove-rule'){b.closest('.rule-row').remove();return;}
  if(action==='finalize'||action==='reopen')return confirmSeason(action);
  if(action==='delete-score'){
   if(!confirm('Delete this player’s score entry for the selected week?'))return;
   const f=$('#score-form');await mutate('scores',{player_id:f.elements.player_id.value,week:Number(f.elements.week.value)},'DELETE');$('#modal').close();toast('Score entry removed.');return;
  }
  if(action==='delete-player'||action==='delete-team'){
   if(!confirm('Delete this '+(action==='delete-player'?'player':'team')+'? Records with scores or roster members cannot be deleted.'))return;
   await mutate((action==='delete-player'?'players/':'teams/')+b.dataset.id,{},'DELETE');$('#modal').close();toast('Record removed.');return;
  }
 });
});
window.addEventListener('beforeunload',e=>{if(dirty.size){e.preventDefault();e.returnValue='';}});
load(seasonId,true).catch(e=>{$('#app').innerHTML=`<div class="boot"><span class="brand-mark">G</span><h2>Unable to open your league</h2><p>${H(e.message)}</p><button class="btn" id="retry-load">Try again</button></div>`;$('#retry-load').addEventListener('click',()=>location.reload());});

// These tools use the same authenticated requests and visible state as the UI.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const tools=[
  {name:'read_league_standings',title:'Read league standings',description:'Read the selected season, teams, scoring rules, and player rankings for the signed-in manager.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async()=>{if(!data)throw Error('Sign in first.');await load();return {season:data.season.name,status:data.season.status,rules:data.season.rules,players:data.players.map(p=>({id:p.id,name:p.name,team:p.team_name,rank:p.rank,points:p.total,weeks:p.weeks_played}))};}},
  {name:'record_weekly_scores',title:'Record weekly player scores',description:'Save or replace the complete weekly scoring counts for players in the selected season. Updates the visible leaderboard. Missing category counts become zero.',inputSchema:{type:'object',properties:{rows:{type:'array',minItems:1,maxItems:1000,items:{type:'object',properties:{player_id:{type:'string'},week:{type:'integer',minimum:1,maximum:53},counts:{type:'object',additionalProperties:{type:'integer',minimum:0,maximum:10000}},notes:{type:'string',maxLength:500}},required:['player_id','week','counts'],additionalProperties:false}}},required:['rows'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute:async input=>{if(!data)throw Error('Sign in first.');if(dirty.size)throw Error('Save or discard the current unsaved grid edits first.');if(!input||!Array.isArray(input.rows))throw Error('rows must be an array.');const r=await mutate('scores',{rows:input.rows});toast(r.saved+' weekly scores saved.');return {saved:r.saved,season:data.season.name,totalPoints:data.summary.points};}}
 ];
 for(const tool of tools){try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}
