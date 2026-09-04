package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

const pinballPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="theme-color" content="#09061a">
  <title>Neon Orbit Pinball</title>
  <style>
    :root{color-scheme:dark;--cyan:#5ffbf1;--pink:#ff4fd8;--gold:#ffd166;--ink:#09061a}
    *{box-sizing:border-box}html,body{margin:0;min-height:100%;overflow:hidden;background:#05030d}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:white;touch-action:none;user-select:none}
    body:before{content:"";position:fixed;inset:0;background:radial-gradient(circle at 50% -10%,#512681 0,transparent 38%),radial-gradient(circle at 20% 80%,#073b55 0,transparent 34%),linear-gradient(145deg,#05030d,#120725 60%,#04121c);z-index:-2}
    body:after{content:"";position:fixed;inset:0;opacity:.09;background-image:linear-gradient(rgba(255,255,255,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.35) 1px,transparent 1px);background-size:42px 42px;mask-image:linear-gradient(to bottom,black,transparent 72%);z-index:-1}
    .shell{height:100dvh;display:grid;grid-template-rows:auto 1fr auto;gap:10px;max-width:720px;margin:auto;padding:max(12px,env(safe-area-inset-top)) 14px max(12px,env(safe-area-inset-bottom))}
    header{display:flex;align-items:end;justify-content:space-between;gap:12px}
    .brand{font-weight:900;letter-spacing:.15em;text-transform:uppercase;font-size:clamp(17px,4vw,28px);line-height:1;text-shadow:0 0 20px #ff4fd899}
    .brand span{color:var(--cyan)}
    .stats{display:flex;gap:18px;text-align:right}.stat b{display:block;font-size:clamp(17px,4vw,25px);font-variant-numeric:tabular-nums}.stat small{color:#b9afd1;text-transform:uppercase;letter-spacing:.13em;font-size:9px}
    .cabinet{position:relative;min-height:0;border-radius:28px;padding:7px;background:linear-gradient(135deg,#7bf9f0,#ff4fd8 48%,#ffd166);box-shadow:0 0 40px #5ffbf133,0 24px 80px #000b}
    .cabinet:before{content:"";position:absolute;inset:7px;border-radius:21px;box-shadow:inset 0 0 35px #000;pointer-events:none;z-index:2}
    canvas{display:block;width:100%;height:100%;border-radius:21px;background:#080514}
    .overlay{position:absolute;inset:7px;display:grid;place-items:center;border-radius:21px;background:#080514d9;backdrop-filter:blur(5px);z-index:3;transition:.25s}
    .overlay.hidden{opacity:0;pointer-events:none}.card{text-align:center;padding:28px;max-width:430px}
    .eyebrow{color:var(--cyan);font-size:11px;font-weight:800;letter-spacing:.22em;text-transform:uppercase}.card h1{font-size:clamp(38px,10vw,72px);line-height:.88;margin:12px 0 18px;text-transform:uppercase;letter-spacing:-.05em}.card h1 em{font-style:normal;color:var(--pink);text-shadow:0 0 30px #ff4fd888}
    .card p{color:#c9c0dc;line-height:1.55;margin:0 auto 22px}.start{border:0;border-radius:999px;padding:14px 28px;font:800 14px inherit;letter-spacing:.12em;text-transform:uppercase;color:#09061a;background:linear-gradient(90deg,var(--cyan),#fff,var(--gold));box-shadow:0 0 24px #5ffbf166;cursor:pointer}
    .controls{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:12px}.control{height:54px;border:1px solid #ffffff24;border-radius:16px;background:#ffffff0d;color:#fff;font:800 12px inherit;letter-spacing:.11em;text-transform:uppercase;box-shadow:inset 0 1px #ffffff1f;cursor:pointer}.control:active,.control.active{background:#5ffbf126;border-color:#5ffbf1;transform:translateY(1px)}
    .launch{width:82px;border-color:#ffd16666;background:#ffd16616;color:var(--gold)}.hint{display:none;color:#8e83a9;font-size:10px;text-align:center;letter-spacing:.08em}
    @media (min-width:760px){.shell{padding-block:16px}.controls{grid-template-columns:130px 1fr 82px 1fr 130px}.hint{display:block}.left{grid-column:1}.launch{grid-column:3}.right{grid-column:5}}
  </style>
</head>
<body>
<main class="shell">
  <header><div class="brand">Neon <span>Orbit</span></div><div class="stats"><div class="stat"><b id="score">000000</b><small>score</small></div><div class="stat"><b id="balls">3</b><small>balls</small></div></div></header>
  <section class="cabinet"><canvas id="game" aria-label="Interactive neon pinball table"></canvas><div class="overlay" id="overlay"><div class="card"><div class="eyebrow">Control Plane Arcade</div><h1>Neon<br><em>Orbit</em></h1><p>Light every orbit. Wake the reactor. Own the high score.</p><button class="start" id="start">Start game</button></div></div></section>
  <section class="controls"><button class="control left" id="left">◀ Left flipper</button><div class="hint">A / ←</div><button class="control launch" id="launch">Launch</button><div class="hint">D / →</div><button class="control right" id="right">Right flipper ▶</button></section>
</main>
<script>
(() => {
  const canvas=document.getElementById('game'),ctx=canvas.getContext('2d');
  const scoreEl=document.getElementById('score'),ballsEl=document.getElementById('balls'),overlay=document.getElementById('overlay');
  const W=600,H=900,keys={left:false,right:false}; let scale=1,last=0,running=false,score=0,balls=3,shake=0,particles=[];
  const ball={x:522,y:750,r:11,vx:0,vy:0,live:false};
  const bumpers=[{x:210,y:245,r:43,c:'#ff4fd8',value:500},{x:385,y:285,r:43,c:'#5ffbf1',value:500},{x:290,y:405,r:37,c:'#ffd166',value:750}];
  const posts=[{x:122,y:600,r:15},{x:462,y:600,r:15},{x:180,y:690,r:11},{x:420,y:690,r:11}];
  const leftFlip={x:165,y:740,len:120,a:.28,rest:.28,up:-.48,side:1};
  const rightFlip={x:435,y:740,len:120,a:Math.PI-.28,rest:Math.PI-.28,up:Math.PI+.48,side:-1};
  function resize(){const r=canvas.getBoundingClientRect();const d=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d);scale=Math.min(canvas.width/W,canvas.height/H);}
  new ResizeObserver(resize).observe(canvas);
  function addScore(n){score+=n;scoreEl.textContent=String(score).padStart(6,'0');}
  function sparks(x,y,c,n=12){for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=80+Math.random()*220;particles.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s,life:.35+Math.random()*.5,c});}}
  function resetBall(){ball.x=522;ball.y=760;ball.vx=0;ball.vy=0;ball.live=false;}
  function launch(){if(!running)return;if(!ball.live){ball.live=true;ball.vx=-32;ball.vy=-780;addScore(25);sparks(ball.x,ball.y,'#ffd166',18);}}
  function start(){score=0;balls=3;running=true;scoreEl.textContent='000000';ballsEl.textContent=balls;resetBall();overlay.classList.add('hidden');setTimeout(launch,350);}
  function gameOver(){running=false;document.querySelector('.card h1').innerHTML='Game<br><em>Over</em>';document.querySelector('.card p').textContent='Final score: '+score.toLocaleString()+'. The orbit is waiting.';document.getElementById('start').textContent='Play again';overlay.classList.remove('hidden');}
  function collideCircle(o,boost=1.1){const dx=ball.x-o.x,dy=ball.y-o.y,d=Math.hypot(dx,dy),min=ball.r+o.r;if(d<min&&d>0){const nx=dx/d,ny=dy/d,push=min-d;ball.x+=nx*push;ball.y+=ny*push;const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=(1+boost)*dot*nx;ball.vy-=(1+boost)*dot*ny;}return true}return false}
  function collideFlipper(f,active){const x2=f.x+Math.cos(f.a)*f.len,y2=f.y+Math.sin(f.a)*f.len;const dx=x2-f.x,dy=y2-f.y,t=Math.max(0,Math.min(1,((ball.x-f.x)*dx+(ball.y-f.y)*dy)/(f.len*f.len)));const px=f.x+t*dx,py=f.y+t*dy,ox=ball.x-px,oy=ball.y-py,d=Math.hypot(ox,oy),min=ball.r+10;if(d<min&&d>0){const nx=ox/d,ny=oy/d;ball.x+=nx*(min-d);ball.y+=ny*(min-d);const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=1.9*dot*nx;ball.vy-=1.9*dot*ny}if(active){ball.vx+=f.side*120*(1-t);ball.vy-=350+420*t}addScore(10);return true}return false}
  function wall(x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((ball.x-x1)*dx+(ball.y-y1)*dy)/l2));const px=x1+t*dx,py=y1+t*dy,ox=ball.x-px,oy=ball.y-py,d=Math.hypot(ox,oy);if(d<ball.r&&d>0){const nx=ox/d,ny=oy/d;ball.x+=nx*(ball.r-d);ball.y+=ny*(ball.r-d);const dot=ball.vx*nx+ball.vy*ny;if(dot<0){ball.vx-=1.82*dot*nx;ball.vy-=1.82*dot*ny}}}
  function update(dt){if(!running)return;const speed=10;leftFlip.a+=( (keys.left?leftFlip.up:leftFlip.rest)-leftFlip.a)*Math.min(1,dt*speed);rightFlip.a+=( (keys.right?rightFlip.up:rightFlip.rest)-rightFlip.a)*Math.min(1,dt*speed);
    if(ball.live){ball.vy+=520*dt;ball.vx*=Math.pow(.995,dt*60);ball.vy*=Math.pow(.998,dt*60);ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
      wall(65,110,65,670);wall(65,110,150,48);wall(150,48,505,48);wall(505,48,540,115);wall(540,115,540,820);wall(65,670,145,735);wall(540,820,465,735);wall(90,555,170,625);wall(510,555,430,625);
      bumpers.forEach(b=>{if(collideCircle(b,1.35)){addScore(b.value);shake=8;sparks(ball.x,ball.y,b.c,14)}});posts.forEach(p=>collideCircle(p,1));collideFlipper(leftFlip,keys.left);collideFlipper(rightFlip,keys.right);
      if(ball.y>920){balls--;ballsEl.textContent=balls;if(balls<=0)gameOver();else{resetBall();setTimeout(launch,700)}}
    }
    particles.forEach(p=>{p.life-=dt;p.vy+=180*dt;p.x+=p.vx*dt;p.y+=p.vy*dt});particles=particles.filter(p=>p.life>0);shake*=.86;
  }
  function neonLine(x1,y1,x2,y2,c,w=4){ctx.strokeStyle=c;ctx.lineWidth=w;ctx.shadowColor=c;ctx.shadowBlur=14;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();ctx.shadowBlur=0}
  function drawFlipper(f,c){const x2=f.x+Math.cos(f.a)*f.len,y2=f.y+Math.sin(f.a)*f.len;ctx.lineCap='round';neonLine(f.x,f.y,x2,y2,c,20);neonLine(f.x,f.y,x2,y2,'#fff',4)}
  function draw(){const sx=(canvas.width-W*scale)/2,sy=(canvas.height-H*scale)/2;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(scale,0,0,scale,sx+(Math.random()-.5)*shake,sy+(Math.random()-.5)*shake);
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#16092b');g.addColorStop(.55,'#09071b');g.addColorStop(1,'#030817');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    ctx.globalAlpha=.13;ctx.strokeStyle='#8edfff';ctx.lineWidth=1;for(let y=70;y<H;y+=40){ctx.beginPath();ctx.moveTo(50,y);ctx.lineTo(550,y);ctx.stroke()}for(let x=70;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,40);ctx.lineTo(x,H);ctx.stroke()}ctx.globalAlpha=1;
    neonLine(65,110,150,48,'#5ffbf1',6);neonLine(150,48,505,48,'#ff4fd8',6);neonLine(505,48,540,115,'#ffd166',6);neonLine(65,110,65,670,'#5ffbf1',6);neonLine(540,115,540,820,'#ff4fd8',6);neonLine(65,670,145,735,'#ff4fd8',6);neonLine(540,820,465,735,'#5ffbf1',6);neonLine(90,555,170,625,'#ffd166',5);neonLine(510,555,430,625,'#ffd166',5);
    ctx.textAlign='center';ctx.font='900 18px system-ui';ctx.fillStyle='#ffffffaa';ctx.fillText('COSMIC REACTOR',300,105);
    bumpers.forEach((b,i)=>{ctx.shadowColor=b.c;ctx.shadowBlur=28;ctx.fillStyle=b.c+'33';ctx.strokeStyle=b.c;ctx.lineWidth=6;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.font='900 17px system-ui';ctx.fillText(i===2?'750':'500',b.x,b.y+6)});
    posts.forEach(p=>{ctx.fillStyle='#fff';ctx.shadowColor='#5ffbf1';ctx.shadowBlur=15;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0});drawFlipper(leftFlip,'#ff4fd8');drawFlipper(rightFlip,'#5ffbf1');
    ctx.fillStyle='#ffd16622';ctx.fillRect(500,120,40,700);ctx.strokeStyle='#ffd16666';ctx.strokeRect(500,120,40,700);
    ctx.shadowColor='#fff';ctx.shadowBlur=20;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ball.x,ball.y,ball.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    particles.forEach(p=>{ctx.globalAlpha=Math.min(1,p.life*2);ctx.fillStyle=p.c;ctx.fillRect(p.x-2,p.y-2,4,4)});ctx.globalAlpha=1;
  }
  function frame(t){const dt=Math.min(.024,(t-last)/1000||.016);last=t;update(dt);draw();requestAnimationFrame(frame)}
  function bind(id,key){const el=document.getElementById(id);const on=e=>{e.preventDefault();keys[key]=true;el.classList.add('active')};const off=e=>{e.preventDefault();keys[key]=false;el.classList.remove('active')};el.addEventListener('pointerdown',on);addEventListener('pointerup',off)}
  bind('left','left');bind('right','right');document.getElementById('launch').addEventListener('pointerdown',e=>{e.preventDefault();launch()});document.getElementById('start').onclick=start;
  addEventListener('keydown',e=>{if(['ArrowLeft','a','A'].includes(e.key))keys.left=true;if(['ArrowRight','d','D'].includes(e.key))keys.right=true;if(e.code==='Space'){e.preventDefault();launch()}});addEventListener('keyup',e=>{if(['ArrowLeft','a','A'].includes(e.key))keys.left=false;if(['ArrowRight','d','D'].includes(e.key))keys.right=false});
  resize();resetBall();requestAnimationFrame(frame);
})();
</script>
</body>
</html>`

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Cache-Control", "no-cache")
		_, _ = w.Write([]byte(pinballPage))
	})

	server := &http.Server{
		Addr:              ":" + port,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}
	log.Printf("Neon Orbit listening on %s", server.Addr)
	log.Fatal(server.ListenAndServe())
}
