import {SnakeGame, SIZE, MODES} from './engine.mjs';

const $ = id => document.getElementById(id);
const canvas=$('board'), ctx=canvas.getContext('2d');
const storage={get(key,fallback){try{return localStorage.getItem(key)??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,String(value));}catch{}}};
export const game=new SnakeGame(storage.get('snake:mode','classic'));
let best=readBest(),sound=storage.get('snake:sound','off')==='on',audio,lastTick=0,frame=0,foodFlash=0,previousState='';
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const keyDirections={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',w:'up',s:'down',a:'left',d:'right'};

function readBest(){const n=Number(storage.get('snake:best:'+game.mode,0));return Number.isFinite(n)&&n>=0?Math.floor(n):0;}
function saveBest(){if(game.score>best){best=game.score;storage.set('snake:best:'+game.mode,best);}}
function pad(n){return String(n).padStart(3,'0');}
function tone(frequency,duration=.07,type='sine'){
  if(!sound)return;
  try{
    audio??=new (window.AudioContext||window.webkitAudioContext)();
    if(audio.state==='suspended')audio.resume().catch(()=>{});
    const oscillator=audio.createOscillator(),gain=audio.createGain();
    oscillator.type=type;oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.045,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);
    oscillator.connect(gain);gain.connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }catch{}
}
function start(){if(game.state==='over'||game.state==='won')reset(false);game.start();lastTick=performance.now();tone(440);updateUI();canvas.focus({preventScroll:true});}
function reset(show=true){saveBest();game.reset();lastTick=performance.now();foodFlash=0;if(show){updateUI();draw();}}
function togglePause(){
  if(game.state==='running'){game.pause();tone(220);}
  else if(game.state==='paused'){game.start();lastTick=performance.now();tone(440);}
  else {start();return;}
  updateUI();canvas.focus({preventScroll:true});
}
function steer(direction){if(game.state==='ready')start();game.turn(direction);}
function updateUI(){
  const state=game.state,overlay=$('overlay');
  $('score').textContent=pad(game.score);$('best').textContent=pad(best);$('mode-label').textContent=MODES[game.mode].label.toUpperCase();
  $('mode-note').textContent=MODES[game.mode].points+' points per bite. Speed builds as you grow.';
  document.querySelectorAll('[data-mode]').forEach(b=>{const chosen=b.dataset.mode===game.mode;b.classList.toggle('selected',chosen);b.setAttribute('aria-pressed',String(chosen));});
  overlay.hidden=state==='running';
  $('pause-button').disabled=state!=='running'&&state!=='paused';
  $('pause-button').innerHTML=state==='paused'?'▷ <span>Resume</span>':'Ⅱ <span>Pause</span>';
  $('pause-button').setAttribute('aria-label',state==='paused'?'Resume game':'Pause game');
  if(state!==previousState){
    const content={
      ready:["LET'S PLAY","Got an appetite?","Eat. Grow. Keep moving.",'Start game','Your next high score starts here.'],
      paused:['TAKE YOUR TIME','Catching your breath?','Your snake will wait.','Keep going','Paused. Take all the time you need.'],
      over:['ONE MORE ROUND?','A good run.',`${game.score} points · ${game.bites} ${game.bites===1?'bite':'bites'} · ${MODES[game.mode].label} pace`,'Play again',game.score>0&&game.score>=best?'Personal best. Hungry for more?':'Every great run starts with another try.'],
      won:['BOARD COMPLETE','Absolutely full.',`${game.score} points. Every square is yours.`,'Play again','You filled the board. Incredible.']
    };
    if(content[state]){const [kicker,title,copy,label,message]=content[state];$('overlay-kicker').textContent=kicker;$('overlay-title').textContent=title;$('overlay-copy').textContent=copy;$('play-label').textContent=label;$('game-message').textContent=message;}
    else $('game-message').textContent='Find your rhythm. Follow your appetite.';
    previousState=state;
  }
}
function roundRect(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill();}
function draw(time=0){
  const cell=576/SIZE;
  ctx.clearRect(0,0,576,576);ctx.fillStyle='#101b12';ctx.fillRect(0,0,576,576);
  ctx.strokeStyle='#b2d3930b';ctx.lineWidth=1;
  ctx.beginPath();for(let i=1;i<SIZE;i++){ctx.moveTo(i*cell+.5,0);ctx.lineTo(i*cell+.5,576);ctx.moveTo(0,i*cell+.5);ctx.lineTo(576,i*cell+.5);}ctx.stroke();
  if(game.food){
    const f=game.food;const pulse=reduceMotion?0:Math.sin(time/260)*.7;
    ctx.shadowColor='#ff967e55';ctx.shadowBlur=14+foodFlash;
    roundRect(f.x*cell+5-pulse,f.y*cell+5-pulse,cell-10+pulse*2,cell-10+pulse*2,4,'#ff967e');ctx.shadowBlur=0;
    roundRect(f.x*cell+9,f.y*cell+7,3,3,1,'#ffdbc0');
  }
  for(let i=game.snake.length-1;i>=0;i--){
    const p=game.snake[i],t=1-i/game.snake.length;const color=i===0?'#d0ff84':`hsl(${87+t*2} 65% ${38+t*24}%)`;
    roundRect(p.x*cell+1.2,p.y*cell+1.2,cell-2.4,cell-2.4,i===0?6:4,color);
    if(i>0){const before=game.snake[i-1],dx=before.x-p.x,dy=before.y-p.y;ctx.fillStyle=color;
      if(dx)ctx.fillRect(p.x*cell+(dx>0?cell-4:-2),p.y*cell+4,6,cell-8);
      else ctx.fillRect(p.x*cell+4,p.y*cell+(dy>0?cell-4:-2),cell-8,6);
    }
  }
  const head=game.snake[0],d=game.direction,cx=(head.x+.5)*cell,cy=(head.y+.5)*cell;
  for(const side of [-1,1]){ctx.fillStyle='#23371c';ctx.beginPath();ctx.arc(cx+d.x*5+(d.y?side*4.5:0),cy+d.y*5+(d.x?side*4.5:0),2,0,Math.PI*2);ctx.fill();}
  if(game.state==='over'){ctx.fillStyle='#ff867d20';ctx.fillRect(0,0,576,576);}
}
function loop(time){
  if(game.state==='running'&&time-lastTick>=game.interval){
    lastTick=time;const event=game.tick();
    if(event==='eat'||event==='won'){saveBest();foodFlash=14;tone(520+Math.min(game.bites,12)*35);}
    if(event==='over'){saveBest();tone(140,.25,'triangle');}
    updateUI();
  }
  if(foodFlash>0)foodFlash=Math.max(0,foodFlash-1);
  draw(time);frame=requestAnimationFrame(loop);
}
function resize(){const width=canvas.getBoundingClientRect().width;const px=Math.round(width*Math.min(devicePixelRatio||1,2));if(px>0){canvas.width=px;canvas.height=px;ctx.setTransform(px/576,0,0,px/576,0,0);draw();}}
new ResizeObserver(resize).observe(canvas);
$('play-button').addEventListener('click',()=>game.state==='paused'?togglePause():start());
$('pause-button').addEventListener('click',togglePause);
$('restart-button').addEventListener('click',()=>{reset();tone(300);});
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{
  if(button.dataset.mode===game.mode)return;
  saveBest();game.reset(button.dataset.mode);best=readBest();previousState='';storage.set('snake:mode',game.mode);updateUI();draw();tone(350);
}));
function updateSound(){$('sound-button').setAttribute('aria-pressed',String(sound));$('sound-label').textContent=sound?'Sound on':'Sound off';}
$('sound-button').addEventListener('click',()=>{sound=!sound;storage.set('snake:sound',sound?'on':'off');updateSound();tone(660);});
document.addEventListener('keydown',event=>{
  if(event.altKey||event.ctrlKey||event.metaKey)return;
  const key=event.key.length===1?event.key.toLowerCase():event.key;
  if(key===' '||key==='Enter'){
    if(event.target.closest('button,a,input,select,textarea'))return;
    event.preventDefault();if(event.repeat)return;
    if(key===' '||game.state!=='running')togglePause();
  }else if(keyDirections[key]){
    if(event.target.closest('input,select,textarea'))return;
    event.preventDefault();if(!event.repeat)steer(keyDirections[key]);
  }else if(key==='p'||key==='Escape'){
    if(!event.repeat&&(game.state==='running'||game.state==='paused')){event.preventDefault();togglePause();}
  }else if(key==='r'&&!event.repeat&&!event.target.closest('input,select,textarea')){event.preventDefault();reset();}
});
document.querySelectorAll('[data-direction]').forEach(button=>button.addEventListener('pointerdown',event=>{event.preventDefault();steer(button.dataset.direction);}));
let touchStart=null;
canvas.addEventListener('pointerdown',event=>{if(event.pointerType==='mouse')return;touchStart={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.setPointerCapture(event.pointerId);});
canvas.addEventListener('pointermove',event=>{
  if(!touchStart||event.pointerId!==touchStart.id)return;
  const x=event.clientX-touchStart.x,y=event.clientY-touchStart.y;
  if(Math.max(Math.abs(x),Math.abs(y))<16)return;
  steer(Math.abs(x)>Math.abs(y)?(x>0?'right':'left'):(y>0?'down':'up'));touchStart={x:event.clientX,y:event.clientY,id:event.pointerId};
});
canvas.addEventListener('pointerup',()=>{touchStart=null;});canvas.addEventListener('pointercancel',()=>{touchStart=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&game.state==='running'){game.pause();updateUI();}});
window.addEventListener('blur',()=>{if(game.state==='running'){game.pause();updateUI();}});
window.addEventListener('pagehide',()=>{cancelAnimationFrame(frame);saveBest();});
window.addEventListener('pageshow',event=>{if(event.persisted){lastTick=performance.now();frame=requestAnimationFrame(loop);}});
updateSound();updateUI();resize();frame=requestAnimationFrame(loop);
