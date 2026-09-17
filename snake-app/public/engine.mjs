export const SIZE = 24;
export const MODES = {chill: {label:'Chill', interval:165, points:10}, classic: {label:'Classic', interval:125, points:20}, fast: {label:'Fast', interval:85, points:30}};
const DIRECTIONS = {up:{x:0,y:-1},down:{x:0,y:1},left:{x:-1,y:0},right:{x:1,y:0}};
const same = (a,b) => a.x===b.x && a.y===b.y;
export class SnakeGame {
  constructor(mode='classic', random=Math.random) {this.random=random;this.reset(mode);}
  reset(mode=this.mode) {
    this.mode=MODES[mode]?mode:'classic';this.state='ready';this.direction=DIRECTIONS.right;this.queue=[];
    this.snake=[{x:8,y:12},{x:7,y:12},{x:6,y:12},{x:5,y:12}];this.food={x:16,y:12};this.score=0;this.bites=0;
  }
  get interval(){return Math.max(50,MODES[this.mode].interval-Math.floor(this.bites/4)*7);}
  start(){if(this.state==='ready'||this.state==='paused')this.state='running';}
  pause(){if(this.state==='running')this.state='paused';}
  turn(name){
    const next=DIRECTIONS[name];if(!next||this.state!=='running'||this.queue.length>=2)return;
    const last=this.queue[this.queue.length-1]||this.direction;
    if(same(last,next)||(last.x+next.x===0&&last.y+next.y===0))return;
    this.queue.push(next);
  }
  spawnFood(){
    const occupied=new Set(this.snake.map(p=>p.y*SIZE+p.x));const empty=[];
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(!occupied.has(y*SIZE+x))empty.push({x,y});
    this.food=empty.length?empty[Math.min(empty.length-1,Math.floor(this.random()*empty.length))]:null;
    if(!this.food)this.state='won';
  }
  tick(){
    if(this.state!=='running')return 'idle';
    if(this.queue.length)this.direction=this.queue.shift();
    const head={x:this.snake[0].x+this.direction.x,y:this.snake[0].y+this.direction.y};
    const eating=this.food&&same(head,this.food);
    const body=eating?this.snake:this.snake.slice(0,-1);
    if(head.x<0||head.x>=SIZE||head.y<0||head.y>=SIZE||body.some(p=>same(p,head))){this.state='over';return 'over';}
    this.snake.unshift(head);
    if(eating){this.bites++;this.score+=MODES[this.mode].points;this.spawnFood();return this.state==='won'?'won':'eat';}
    this.snake.pop();return 'move';
  }
}
