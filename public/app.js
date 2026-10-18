'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
let seed=8127; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
let prefs={volume:45,distance:60,duration:10,flow:35};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('yohaku-settings')||'{}')};}catch{}
for(const k of ['volume','distance','flow'])prefs[k]=clamp(Number(prefs[k])||0,k==='flow'?10:0,100);
if(![0,5,10,20].includes(prefs.duration))prefs.duration=10;
const state={started:false,playing:false,mode:'manual',pattern:'drops',water:0,pouring:false,elapsed:0,autoClock:0,nextDrop:1,simTime:0,stream:0,fillFlash:0,focus:false,ended:false};
const ladle={x:487,y:563,targetX:487,targetY:563,angle:-.35,drag:false};
let view={w:1200,h:760,s:1,ox:0,oy:0}, previous=performance.now(), uiClock=0, particles=[], delayed=[];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const stones=[];

// A two-temperature model. Water and energy are conserved at each stone;
// tuned coefficients describe a small visible part of a much larger heater.
for(let row=0;row<4;row++){
  for(let col=0;col<6;col++){
    const x=591+col*52+(row%2)*22+(rnd()-.5)*18;
    const y=355+row*33+(rnd()-.5)*20;
    const r=29+rnd()*13;
    stones.push({x,y,r,ts:295+rnd()*45,tc:340+rnd()*35,water:0,wet:0,evap:0,rough:.7+rnd()*.6,cap:65+rnd()*45,sprite:null});
  }
}
stones.sort((a,b)=>a.y-b.y);
function makeStone(stone){
  const c=document.createElement('canvas');c.width=120;c.height=100;const g=c.getContext('2d');
  const points=[];for(let i=0;i<11;i++){const a=i/11*Math.PI*2;const r=.84+rnd()*.16;points.push([60+Math.cos(a)*51*r,48+Math.sin(a)*36*r]);}
  g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();g.save();g.clip();
  const shade=g.createLinearGradient(22,10,75,90);shade.addColorStop(0,'#69665b');shade.addColorStop(.3,'#494a41');shade.addColorStop(.65,'#30362f');shade.addColorStop(1,'#171e1a');g.fillStyle=shade;g.fillRect(0,0,120,100);
  for(let i=0;i<1900;i++){const x=rnd()*120,y=rnd()*100,v=rnd();g.fillStyle=v>.5?`rgba(193,187,157,${rnd()*.15})`:`rgba(0,9,6,${rnd()*.28})`;g.fillRect(x,y,.4+rnd()*2,.4+rnd()*1.5);}
  for(let i=0;i<11;i++){g.beginPath();const x=rnd()*120,y=rnd()*85;g.moveTo(x,y);g.lineTo(x+20-rnd()*40,y+3+rnd()*12);g.lineTo(x+30-rnd()*50,y+8+rnd()*18);g.strokeStyle='rgba(9,17,12,.22)';g.lineWidth=.5+rnd();g.stroke();}
  g.restore();g.strokeStyle='#c0b39222';g.lineWidth=.6;g.stroke();return c;
}
stones.forEach(s=>s.sprite=makeStone(s));

// A quiet synthesized soundscape: steam beds, granular bubbles, impact,
// trickling water, and restrained room reflections. No audio file is looped.
class Soundscape{
  constructor(){this.ctx=null;this.steam=[];this.lastBubble=0;}
  async init(){
    if(this.ctx){await this.ctx.resume();return;}
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)throw new Error('このブラウザでは音声合成を利用できません。');
    this.ctx=new Audio();const c=this.ctx;
    this.master=c.createGain();this.master.gain.value=0;
    const compressor=c.createDynamicsCompressor();compressor.threshold.value=-21;compressor.knee.value=20;compressor.ratio.value=4;compressor.attack.value=.03;compressor.release.value=.5;
    this.lowpass=c.createBiquadFilter();this.lowpass.type='lowpass';this.lowpass.frequency.value=4200;this.lowpass.Q.value=.3;
    this.lowpass.connect(this.master);this.master.connect(compressor);compressor.connect(c.destination);
    this.room=c.createConvolver();const impulse=c.createBuffer(2,c.sampleRate*1.3,c.sampleRate);
    for(let ch=0;ch<2;ch++){const data=impulse.getChannelData(ch);let b=0;for(let i=0;i<data.length;i++){b=(b+(Math.random()*2-1)*.22)/1.22;data[i]=b*Math.exp(-i/c.sampleRate*6)*.35;}}
    this.room.buffer=impulse;const roomGain=c.createGain();roomGain.gain.value=.24;this.room.connect(roomGain);roomGain.connect(this.lowpass);
    this.noise=c.createBuffer(1,c.sampleRate*7,c.sampleRate);const d=this.noise.getChannelData(0);let brown=0;
    for(let i=0;i<d.length;i++){const white=Math.random()*2-1;brown=(brown+.025*white)/1.025;d[i]=white*.62+brown*2;}
    for(let i=0;i<6;i++){
      const n=c.createBufferSource();n.buffer=this.noise;n.loop=true;
      const f=c.createBiquadFilter();f.type='bandpass';f.frequency.value=650+i*320;f.Q.value=.45;
      const gain=c.createGain();gain.gain.value=0;const pan=c.createStereoPanner();pan.pan.value=(i-2.5)*.12;
      n.connect(f);f.connect(gain);gain.connect(pan);pan.connect(this.lowpass);pan.connect(this.room);n.start(0,i*.63);this.steam.push({gain,f});
    }
    const roomNoise=c.createBufferSource();roomNoise.buffer=this.noise;roomNoise.loop=true;
    const filter=c.createBiquadFilter();filter.type='lowpass';filter.frequency.value=180;
    const gain=c.createGain();gain.gain.value=.025;roomNoise.connect(filter);filter.connect(gain);gain.connect(this.lowpass);roomNoise.start();
    this.volume();
  }
  volume(){if(!this.ctx)return;const t=this.ctx.currentTime;this.master.gain.setTargetAtTime(state.playing?prefs.volume/100*.72:0,t,.45);this.lowpass.frequency.setTargetAtTime(lerp(5600,2800,prefs.distance/100),t,.3);}
  burst(kind,amount=1,x=740){
    if(!this.ctx||!state.playing)return;const c=this.ctx,t=c.currentTime;
    const source=c.createBufferSource();source.buffer=this.noise;const filter=c.createBiquadFilter();filter.type='bandpass';
    const gain=c.createGain(),pan=c.createStereoPanner();pan.pan.value=clamp((x-650)/600,-.5,.5)*(1-prefs.distance/160);
    const config={fill:[430,.55,.13],impact:[850,.18,.07],drop:[1100,.10,.05],bubble:[1500,.055,.045],wood:[240,.2,.014]}[kind]||[1000,.1,.04];
    filter.frequency.value=config[0]*(.85+Math.random()*.3);filter.Q.value=kind==='drop'?2.8:.65;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(config[2]*clamp(amount,.05,2),t+.012);gain.gain.exponentialRampToValueAtTime(.0001,t+config[1]);
    source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.lowpass);pan.connect(this.room);
    source.start(t,Math.random()*5,config[1]);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
    if(kind==='fill'||kind==='drop'){
      const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(kind==='fill'?380:730,t);o.frequency.exponentialRampToValueAtTime(kind==='fill'?170:410,t+.11);g.gain.setValueAtTime(.016*amount,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(this.lowpass);o.start(t);o.stop(t+.18);o.onended=()=>{o.disconnect();g.disconnect();};
    }
  }
  update(dt){
    if(!this.ctx)return;
    const energy=new Array(6).fill(0);stones.forEach((s,i)=>energy[i%6]+=s.evap);
    this.steam.forEach((voice,i)=>{const amp=Math.sqrt(energy[i])* .065*(.9+.1*Math.sin(state.simTime*.7+i));voice.gain.gain.setTargetAtTime(state.playing?Math.min(.22,amp):0,this.ctx.currentTime,.13);});
    const total=stones.reduce((n,s)=>n+s.evap,0);
    if(state.playing&&total>.005&&Math.random()<Math.min(.6,total*dt*1.4)){const s=stones[Math.floor(Math.random()*stones.length)];this.burst('bubble',Math.min(.7,total*.1),s.x);}
  }
}
const sound=new Soundscape();
function announce(t){$('announcement').textContent=t;}
function hint(t){$('hint').innerHTML='<span>·</span> '+t;}
function save(){try{localStorage.setItem('yohaku-settings',JSON.stringify(prefs));}catch{}}
function updateWater(){const p=clamp(state.water/160,0,1);$('waterBar').style.width=p*100+'%';$('waterText').textContent=p<.01?'柄杓は空です':p>.95?'水を汲みました':'水が残っています';$('pour').disabled=!state.playing||state.water<=0||state.mode!=='manual';}
function nearest(x,y){return stones.reduce((best,s)=>Math.hypot(x-s.x,y-s.y)<Math.hypot(x-best.x,y-best.y)?s:best,stones[0]);}
function addWater(x,y,amount,impact=true){
  const s=nearest(x,y);s.water+=amount;
  if(impact&&Math.random()<.2)sound.burst('impact',Math.min(1,amount*.7),x);
  if(!reducedMotion&&Math.random()<.5)particles.push({kind:'splash',x:s.x,y:s.y,vx:(Math.random()-.5)*65,vy:-30-Math.random()*35,life:.5,max:.5,size:1.5});
  return s;
}
async function start(){
  try{await sound.init();}catch(e){announce(e.message);$('welcome').querySelector('p').textContent=e.message;return;}
  state.started=true;state.playing=true;state.ended=false;state.elapsed=0;state.autoClock=0;state.nextDrop=.8;
  $('welcome').hidden=true;$('ending').hidden=true;$('pause').disabled=false;$('pauseIcon').textContent='Ⅱ';$('pauseText').textContent='ひと休み';$('pause').setAttribute('aria-label','一時停止');
  document.body.classList.add('playing');sound.volume();updateWater();announce('サウナに入りました');hint('バケツで水を汲んで、石にゆっくり注ぐ。');
  if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:'余白 — おうちのサウナ',artist:'静かなロウリュ'});navigator.mediaSession.setActionHandler('play',()=>{if(!state.playing)togglePause();});navigator.mediaSession.setActionHandler('pause',()=>{if(state.playing)togglePause();});}
}
function end(){state.playing=false;state.pouring=false;state.ended=true;document.body.classList.remove('playing');sound.volume();setFocus(false);$('ending').hidden=false;$('pause').disabled=true;updateWater();announce('おかえりなさい。サウナの時間が終わりました。');}
function togglePause(){
  if(!state.started||state.ended)return;
  state.playing=!state.playing;state.pouring=false;
  if(state.playing)sound.init().catch(()=>{});sound.volume();document.body.classList.toggle('playing',state.playing);
  $('pauseIcon').textContent=state.playing?'Ⅱ':'▷';$('pauseText').textContent=state.playing?'ひと休み':'再開する';$('pause').setAttribute('aria-label',state.playing?'一時停止':'再生');updateWater();
  hint(state.playing?(state.mode==='manual'?'バケツで水を汲んで、石にゆっくり注ぐ。':'何もせず、音にまかせて。'):'ひと休み中。再生ボタンで、またここへ。');
}
function fill(){
  if(!state.playing||state.mode!=='manual')return;
  state.water=160;state.fillFlash=1;ladle.targetX=403;ladle.targetY=551;sound.burst('fill',1,390);updateWater();hint('石を押し続けると、ゆっくり注げます。');announce('柄杓に水を汲みました');
}
function beginPour(x=745,y=405){
  if(!state.playing||state.mode!=='manual'||state.water<=0)return;
  state.pouring=true;ladle.targetX=x;ladle.targetY=y-96;state.pourX=x;state.pourY=y;canvas.classList.add('pouring');$('pour').classList.add('held');
}
function stopPour(){state.pouring=false;canvas.classList.remove('pouring');$('pour').classList.remove('held');}
function setMode(mode){
  stopPour();state.mode=mode;state.autoClock=0;state.nextDrop=.7;
  for(const [id,m] of [['manual','manual'],['auto','auto']]){$(id).classList.toggle('selected',mode===m);$(id).setAttribute('aria-pressed',String(mode===m));}
  $('manualPanel').hidden=mode!=='manual';$('autoPanel').hidden=mode!=='auto';
  if(mode==='auto'){ladle.targetX=487;ladle.targetY=563;hint('何もせず、音にまかせて。');}else hint('バケツで水を汲んで、石にゆっくり注ぐ。');
  updateWater();announce(mode==='auto'?'オートロウリュに切り替えました':'セルフロウリュに切り替えました');
}
function setFocus(on){state.focus=on;document.body.classList.toggle('focus-mode',on);$('restore').hidden=!on;$('focus').setAttribute('aria-label',on?'画面に戻る':'画面を暗くする');}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-view.ox)/view.s,y:(e.clientY-r.top-view.oy)/view.s};}
let pointerId=null;
canvas.addEventListener('pointerdown',e=>{
  if(!state.playing||state.mode!=='manual')return;const p=point(e);pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);
  if(Math.hypot(p.x-395,(p.y-578)*1.3)<95){fill();return;}
  if(p.x>535&&p.x<965&&p.y>280&&p.y<525){if(state.water>0)beginPour(p.x,p.y);else hint('まずは、手前のバケツで水を汲みましょう。');return;}
  if(Math.hypot(p.x-ladle.x,p.y-ladle.y)<130)ladle.drag=true;
});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId)return;const p=point(e);if(ladle.drag){ladle.targetX=clamp(p.x,300,970);ladle.targetY=clamp(p.y,260,610);}else if(state.pouring){state.pourX=clamp(p.x,565,930);state.pourY=clamp(p.y,330,470);ladle.targetX=state.pourX;ladle.targetY=state.pourY-96;}});
function releasePointer(e){if(pointerId!==null&&e.pointerId!==pointerId)return;if(ladle.drag&&Math.hypot(ladle.targetX-395,(ladle.targetY-570)*1.3)<105)fill();ladle.drag=false;pointerId=null;stopPour();}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
$('pour').addEventListener('pointerdown',e=>{if(!state.playing||state.water<=0)return;e.preventDefault();$('pour').setPointerCapture(e.pointerId);beginPour();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('pour').addEventListener(type,stopPour);
$('pour').addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();beginPour();}});
$('pour').addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();stopPour();}});
$('pour').addEventListener('blur',stopPour);
$('fill').onclick=fill;$('enter').onclick=start;$('again').onclick=start;$('pause').onclick=togglePause;
$('manual').onclick=()=>setMode('manual');$('auto').onclick=()=>setMode('auto');
document.querySelectorAll('[data-pattern]').forEach(b=>b.onclick=()=>{state.pattern=b.dataset.pattern;state.autoClock=0;state.nextDrop=.7;document.querySelectorAll('[data-pattern]').forEach(v=>{v.classList.toggle('selected',v===b);v.setAttribute('aria-pressed',String(v===b));});announce(b.firstChild.textContent+'を選びました');});
$('focus').onclick=()=>setFocus(!state.focus);$('restore').onclick=()=>setFocus(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape')setFocus(false);});
$('settings').onclick=()=>{stopPour();$('settingsDialog').showModal();};$('help').onclick=()=>{stopPour();$('helpDialog').showModal();};
for(const id of ['settingsDialog','helpDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
for(const id of ['volume','distance','flow']){$(id).value=prefs[id];$(id).addEventListener('input',()=>{prefs[id]=Number($(id).value);syncLabels();save();sound.volume();});}
function syncLabels(){$('volumeValue').textContent=prefs.volume+'%';$('distanceValue').textContent=prefs.distance>65?'少し離れて':prefs.distance>30?'ベンチから':'ストーブの近く';$('flow').nextElementSibling.textContent=prefs.flow>65?'たっぷり':prefs.flow>35?'ほどよく':'細く';}
function syncDuration(){document.querySelectorAll('[data-min]').forEach(b=>{const active=Number(b.dataset.min)===prefs.duration;b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});}
document.querySelectorAll('[data-min]').forEach(b=>b.onclick=()=>{prefs.duration=Number(b.dataset.min);state.elapsed=0;syncDuration();save();updateTimer();});
syncLabels();syncDuration();
function updateTimer(){let seconds=prefs.duration?Math.max(0,Math.ceil(prefs.duration*60-state.elapsed)):Math.floor(state.elapsed);$('sessionTime').textContent=prefs.duration===0?'∞ '+String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0'):String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');}
updateTimer();
window.addEventListener('blur',()=>{stopPour();ladle.drag=false;pointerId=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPour();previous=performance.now();}});

function simulate(dt){
  if(!state.playing){sound.update(dt);return;}
  state.simTime+=dt;state.elapsed+=dt;state.fillFlash=Math.max(0,state.fillFlash-dt*.8);state.stream=0;
  const remaining=prefs.duration?prefs.duration*60-state.elapsed:Infinity;
  if(remaining<=0){end();return;}
  if(remaining<5&&sound.ctx)sound.master.gain.setTargetAtTime(prefs.volume/100*.72*(remaining/5),sound.ctx.currentTime,.3);
  if(state.mode==='manual'&&state.pouring){
    const amount=Math.min(state.water,(8+prefs.flow*.52)*dt);state.water=Math.max(0,state.water-amount);state.stream=amount/dt;
    addWater(state.pourX,state.pourY,amount);if(state.water<=0){stopPour();hint('最後の一滴まで、耳をすませて。');announce('柄杓が空になりました');}updateWater();
  }
  if(state.mode==='auto'){
    state.autoClock+=dt;const t=state.autoClock;
    if(state.pattern==='drops'&&t>=state.nextDrop){const x=650+Math.random()*190,y=350+Math.random()*100;const a=.45+Math.random()*.55;addWater(x,y,a,false);sound.burst('drop',.7,x);particles.push({kind:'fall',x,y:130,vx:0,vy:260,life:.8,max:.8,size:2});state.nextDrop=t+1.3+Math.random()*2.8;}
    if(state.pattern==='thread'){
      const cycle=(t%17)/17;const intensity=cycle<.7?Math.pow(Math.sin(cycle/.7*Math.PI),.7):0;
      const x=730+Math.sin(t*.16)*95;const hot=nearest(x,400).ts>150?1:.25;addWater(x,400,intensity*hot*2.8*dt,false);state.stream=intensity*7;state.pourX=x;state.pourY=400;
    }
    if(state.pattern==='wave'){
      const cycle=t%60;let rate=cycle<3?Math.sin(cycle/3*Math.PI)*55:cycle<44?.5+Math.sin(t*.3)*.25:.08;
      const x=640+Math.random()*220;addWater(x,370+Math.random()*80,rate*dt,cycle<3);state.stream=cycle<3?rate:0;state.pourX=x;state.pourY=400;
      if(cycle>3&&Math.random()<dt*.3)sound.burst('drop',.25,x);
    }
  }
  for(let i=delayed.length-1;i>=0;i--){delayed[i].wait-=dt;if(delayed[i].wait<=0){const d=delayed.splice(i,1)[0];d.stone.water+=d.amount;sound.burst('drop',.2,d.stone.x);}}
  for(let i=0;i<stones.length;i++){
    const s=stones[i];const transfer=(s.tc-s.ts)*3.8*dt;
    s.ts+=transfer/s.cap;s.tc-=transfer/(s.cap*7);s.tc+=(355-s.tc)*.0035*dt;s.ts+=(115-s.ts)*.0015*dt;
    const potential=Math.max(0,s.ts-98)*.011*s.rough;
    const evap=Math.min(s.water,potential*dt,Math.max(0,(s.ts-95)*s.cap)/2450);
    s.water-=evap;s.ts-=evap*2450/s.cap;s.evap=evap/dt;
    s.wet=lerp(s.wet,Math.min(1,s.water/2+s.evap*.12),Math.min(1,dt*5));
    if(s.water>4){const runoff=Math.min(s.water-4,12*dt);s.water-=runoff;const lower=stones.filter(t=>t.y>s.y+18&&Math.abs(t.x-s.x)<75);if(lower.length&&delayed.length<100)delayed.push({stone:lower[Math.floor(Math.random()*lower.length)],amount:runoff,wait:.25+Math.random()*.5});}
    if(!reducedMotion&&s.evap>.05&&Math.random()<s.evap*dt*2.4&&particles.length<190){const life=2.5+Math.random()*2;particles.push({kind:'steam',x:s.x+(Math.random()-.5)*25,y:s.y-10,vx:(Math.random()-.5)*13,vy:-14-Math.random()*18,life,max:life,size:14+Math.random()*15});}
  }
  sound.update(dt);
  uiClock+=dt;if(uiClock>.4){uiClock=0;const total=stones.reduce((n,s)=>n+s.evap,0);$('roomState').textContent=total>3?'ロウリュの余韻':total>.1?'石が、静かに呼吸する':'静かなサウナ室';$('soundText').textContent=state.mode==='auto'?'音に、まかせて。':state.pouring?'ゆっくり、ひと注ぎ。':'静けさを、聴く。';updateTimer();}
}

// Hand-rendered timber, stone, copper and water; the scene stays local and
// keeps functioning without remote imagery or a graphics library.
const background=document.createElement('canvas');background.width=1200;background.height=760;const bg=background.getContext('2d');
function path(g,points){g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();}
function wood(g,x,y,w,h,vertical=true,tone=1){
  const grd=g.createLinearGradient(x,y,x+w,y+h*.1);grd.addColorStop(0,`rgb(${36*tone},${30*tone},${22*tone})`);grd.addColorStop(.2,`rgb(${52*tone},${41*tone},${28*tone})`);grd.addColorStop(.7,`rgb(${45*tone},${35*tone},${24*tone})`);grd.addColorStop(1,`rgb(${28*tone},${25*tone},${19*tone})`);g.fillStyle=grd;g.fillRect(x,y,w,h);
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  for(let i=0;i<65;i++){g.beginPath();let p=rnd();if(vertical){g.moveTo(x+p*w,y);g.bezierCurveTo(x+p*w+6,y+h*.3,x+p*w-5,y+h*.7,x+p*w+2,y+h);}else{g.moveTo(x,y+p*h);g.bezierCurveTo(x+w*.3,y+p*h+3,x+w*.7,y+p*h-3,x+w,y+p*h+1);}g.strokeStyle=rnd()>.5?'#b09b7410':'#0b100b33';g.lineWidth=.3+rnd()*1.1;g.stroke();}
  g.restore();g.fillStyle='#080f0b99';if(vertical)g.fillRect(x+w-2,y,2,h);else g.fillRect(x,y+h-2,w,2);
}
function makeBackground(){
  bg.fillStyle='#211e16';bg.fillRect(0,0,1200,760);
  for(let i=0;i<24;i++)wood(bg,i*54,0,54,550,true,.9+rnd()*.4);
  bg.save();path(bg,[[0,0],[232,0],[232,510],[0,680]]);bg.clip();for(let i=0;i<9;i++)wood(bg,i*30,0,30,760,true,.65+rnd()*.12);bg.restore();
  bg.fillStyle='#121810';path(bg,[[0,670],[232,510],[1200,510],[1200,760],[0,760]]);bg.fill();
  for(let i=0;i<10;i++){bg.beginPath();bg.moveTo(235+i*110,510);bg.lineTo(-400+i*250,760);bg.strokeStyle='#96866a14';bg.lineWidth=1;bg.stroke();}
  for(let j=0;j<5;j++){bg.beginPath();bg.moveTo(0,540+j*j*11);bg.lineTo(1200,540+j*j*11);bg.strokeStyle='#040a0699';bg.stroke();}
  // Floating bench along the left wall.
  bg.fillStyle='#0c120d';path(bg,[[0,505],[500,480],[500,532],[0,627]]);bg.fill();
  for(let i=0;i<5;i++){bg.save();path(bg,[[0,470+i*20],[465,449+i*9],[510,465+i*10],[0,491+i*23]]);bg.clip();wood(bg,0,440,530,170,false,1.35-i*.05);bg.restore();}
  bg.fillStyle='#241f15';path(bg,[[40,592],[58,588],[58,710],[40,716]]);bg.fill();path(bg,[[450,525],[465,522],[465,616],[450,620]]);bg.fill();
  // A concealed warm lamp, with most of the room kept in shadow.
  const glow=bg.createRadialGradient(1000,240,0,1000,240,350);glow.addColorStop(0,'#e7b26430');glow.addColorStop(.5,'#b1843915');glow.addColorStop(1,'#8e652000');bg.fillStyle=glow;bg.fillRect(500,0,700,650);
  bg.fillStyle='#121710';bg.fillRect(975,145,42,135);bg.shadowColor='#e7b569';bg.shadowBlur=28;bg.fillStyle='#cfad6e';bg.fillRect(983,156,26,113);bg.shadowBlur=0;
  for(let i=0;i<8;i++){bg.fillStyle='#292a1b';bg.fillRect(977,153+i*16,38,5);}bg.fillStyle='#333223';bg.fillRect(972,144,48,12);bg.fillRect(972,277,48,10);
  const darkness=bg.createLinearGradient(0,0,0,760);darkness.addColorStop(0,'#06100a33');darkness.addColorStop(.7,'#0a120e11');darkness.addColorStop(1,'#08120d66');bg.fillStyle=darkness;bg.fillRect(0,0,1200,760);
}
makeBackground();
function ellipse(g,x,y,rx,ry,fill){g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=fill;g.fill();}
function drawHeater(g){
  ellipse(g,752,656,214,42,'#030a0766');
  const metal=g.createLinearGradient(560,0,946,0);metal.addColorStop(0,'#17211b');metal.addColorStop(.4,'#303a2f');metal.addColorStop(.7,'#1f2a22');metal.addColorStop(1,'#111b15');
  g.fillStyle=metal;g.beginPath();g.moveTo(563,430);g.lineTo(584,619);g.bezierCurveTo(640,677,870,677,920,619);g.lineTo(941,430);g.closePath();g.fill();
  // Hints of stones behind the fine steel cage.
  for(let row=0;row<4;row++)for(let col=0;col<7;col++){const s=stones[(row*7+col)%stones.length];g.globalAlpha=.65;g.drawImage(s.sprite,570+col*51+(row%2)*10,442+row*43,64,53);}g.globalAlpha=1;
  for(let i=0;i<24;i++){const a=(i/23)*Math.PI;const x=752+183*Math.cos(a);const lowerX=752+164*Math.cos(a);g.beginPath();g.moveTo(x,430+Math.sin(a)*38);g.lineTo(lowerX,620+Math.sin(a)*35);g.strokeStyle=i%3===0?'#75806a77':'#64715c55';g.lineWidth=i%3===0?3:1.3;g.stroke();g.beginPath();g.moveTo(x+2,430+Math.sin(a)*38);g.lineTo(lowerX+2,620+Math.sin(a)*35);g.strokeStyle='#050d09aa';g.lineWidth=1;g.stroke();}
  for(const y of [473,555,624]){g.beginPath();g.ellipse(752,y,183-(y-430)*.08,38,0,0,Math.PI);g.strokeStyle='#6b755d88';g.lineWidth=4;g.stroke();g.strokeStyle='#111b13';g.lineWidth=1;g.stroke();}
  ellipse(g,752,425,188,64,'#0d1810');
  stones.forEach(s=>{g.save();g.translate(s.x,s.y);g.shadowColor='#020b07bb';g.shadowBlur=8;g.shadowOffsetY=5;g.drawImage(s.sprite,-s.r,-s.r*.75,s.r*2,s.r*1.65);g.shadowBlur=0;g.shadowOffsetY=0;if(s.wet>.01){g.globalAlpha=s.wet*.65;ellipse(g,-2,-3,s.r*.63,s.r*.32,'#0c1b15');g.globalAlpha=s.wet*.4;g.beginPath();g.ellipse(-s.r*.18,-s.r*.2,s.r*.35,s.r*.11,-.3,Math.PI,Math.PI*2);g.strokeStyle='#b4beb0';g.lineWidth=1;g.stroke();}g.restore();});
  g.beginPath();g.ellipse(752,432,190,65,0,0,Math.PI);g.strokeStyle='#87907888';g.lineWidth=5;g.stroke();g.strokeStyle='#1b291c';g.lineWidth=2;g.stroke();
}
function drawBucket(g){
  const oldSeed=seed;seed=9182;
  ellipse(g,395,663,91,18,'#040b0788');
  // Bent wooden handle behind the rim.
  g.beginPath();g.ellipse(395,564,77,86,0,Math.PI,Math.PI*2);g.strokeStyle='#2f3625';g.lineWidth=10;g.stroke();g.strokeStyle='#7e7851';g.lineWidth=4;g.stroke();
  g.save();path(g,[[311,559],[479,559],[466,650],[455,665],[333,665],[322,650]]);g.clip();for(let i=0;i<13;i++)wood(g,307+i*14,549,14,125,true,1.6+(rnd()*.01));g.restore();
  ellipse(g,395,559,85,31,'#8b805d');ellipse(g,395,560,77,25,'#1b2a22');
  const water=g.createLinearGradient(0,543,0,585);water.addColorStop(0,'#54605a');water.addColorStop(.5,'#35473f');water.addColorStop(1,'#1e332b');ellipse(g,395,564,72,20,water);
  g.save();g.beginPath();g.ellipse(395,564,72,20,0,0,Math.PI*2);g.clip();
  for(let i=0;i<4;i++){const p=(state.simTime*.16+i*.27)%1;g.beginPath();g.ellipse(392,564,p*84,p*23,0,0,Math.PI*2);g.strokeStyle=`rgba(184,199,179,${(1-p)*(.07+state.fillFlash*.2)})`;g.lineWidth=.8;g.stroke();}g.restore();
  for(const y of [594,642]){g.beginPath();g.ellipse(395,y,80-(y-590)*.15,24,0,0,Math.PI);g.strokeStyle='#242e23';g.lineWidth=8;g.stroke();g.strokeStyle='#9b9e7944';g.lineWidth=1;g.stroke();}
  g.beginPath();g.ellipse(395,559,84,30,0,0,Math.PI);g.strokeStyle='#b8a379';g.lineWidth=3;g.stroke();seed=oldSeed;
}
function drawLadle(g,dt){
  const smooth=1-Math.exp(-dt*8);ladle.x=lerp(ladle.x,ladle.targetX,smooth);ladle.y=lerp(ladle.y,ladle.targetY,smooth);ladle.angle=lerp(ladle.angle,state.pouring?.38:-.35,smooth);
  g.save();g.translate(ladle.x,ladle.y);g.rotate(ladle.angle);g.shadowColor='#0008';g.shadowBlur=14;g.shadowOffsetY=9;
  const handle=g.createLinearGradient(0,0,0,130);handle.addColorStop(0,'#b39a6a');handle.addColorStop(.5,'#786343');handle.addColorStop(1,'#423b29');g.fillStyle=handle;g.beginPath();g.moveTo(14,4);g.lineTo(143,56);g.quadraticCurveTo(154,64,147,69);g.lineTo(8,18);g.closePath();g.fill();
  ellipse(g,0,5,34,23,'#3e3c2a');g.fillStyle='#94784d';g.beginPath();g.moveTo(-33,-3);g.lineTo(-29,20);g.quadraticCurveTo(0,41,30,17);g.lineTo(34,-3);g.closePath();g.fill();
  ellipse(g,0,-3,34,23,'#b09a70');ellipse(g,0,-3,28,17,'#4c4d36');g.shadowBlur=0;g.shadowOffsetY=0;
  if(state.water>0){const waterLevel=state.water/160;ellipse(g,0,-1,26*Math.sqrt(waterLevel),14*Math.sqrt(waterLevel),'#6b827778');g.beginPath();g.ellipse(-3,-5,18*Math.sqrt(waterLevel),8*Math.sqrt(waterLevel),0,Math.PI,Math.PI*1.7);g.strokeStyle='#d2deca66';g.lineWidth=.8;g.stroke();}
  g.restore();
}
function drawStream(g){
  if(state.stream<.05)return;
  const targetX=state.pourX||745,targetY=state.pourY||400;
  if(state.mode==='auto'&&state.pattern==='wave'){
    for(let i=0;i<9;i++){const x=635+i*25;g.beginPath();g.moveTo(x,40);g.bezierCurveTo(x+5,160,x-10,275,x+Math.sin(state.simTime*3+i)*10,420);g.strokeStyle=`rgba(187,211,200,${Math.min(.22,state.stream/250)})`;g.lineWidth=1+Math.random();g.stroke();}
  }else{
    const sx=state.mode==='manual'?ladle.x-25:targetX-15,sy=state.mode==='manual'?ladle.y:50;
    g.beginPath();g.moveTo(sx,sy);g.bezierCurveTo(sx-9,sy+55,targetX-14,targetY-40,targetX,targetY);
    g.strokeStyle='#c1dbcc55';g.lineWidth=clamp(state.stream*.07,1,3);g.stroke();g.strokeStyle='#c7e8d42b';g.lineWidth=clamp(state.stream*.13,2,6);g.stroke();
  }
}
function drawParticles(g,dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(state.playing){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.kind==='splash')p.vy+=140*dt;if(p.kind==='fall')p.vy+=200*dt;}if(p.life<=0||p.kind==='fall'&&p.y>440){particles.splice(i,1);continue;}
    if(p.kind==='steam'){
      const age=1-p.life/p.max;const size=p.size*(1+age*2.5);const alpha=Math.sin(age*Math.PI)*.055;const fog=g.createRadialGradient(p.x,p.y,0,p.x,p.y,size);fog.addColorStop(0,`rgba(204,211,184,${alpha})`);fog.addColorStop(1,'rgba(204,211,184,0)');g.fillStyle=fog;g.fillRect(p.x-size,p.y-size,size*2,size*2);p.x+=Math.sin(state.simTime*.6+p.max)*dt*4;
    }else{g.beginPath();g.ellipse(p.x,p.y,p.size*.6,p.size*(p.kind==='fall'?2:1),0,0,Math.PI*2);g.fillStyle=`rgba(182,211,194,${p.life/p.max*.6})`;g.fill();}
  }
}
function resize(){const r=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);view.w=r.width;view.h=r.height;view.s=r.height/760;view.ox=r.width*(r.width<700?.5:.65)-625*view.s;view.oy=0;view.dpr=dpr;}
new ResizeObserver(resize).observe(canvas);resize();
function render(now){
  const dt=Math.min(.05,(now-previous)/1000);previous=now;
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.clearRect(0,0,view.w,view.h);ctx.drawImage(background,0,0,view.w,view.h);ctx.translate(view.ox,view.oy);ctx.scale(view.s,view.s);
  drawHeater(ctx);drawBucket(ctx);drawLadle(ctx,dt);drawStream(ctx);drawParticles(ctx,dt);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
// Keep the session clock and audio moving independently of drawing. Browsers
// can throttle background timers, so recover wall time without a burst of sound.
let lastTick=performance.now();
setInterval(()=>{const now=performance.now(),delta=Math.max(0,(now-lastTick)/1000);lastTick=now;const step=Math.min(.2,delta);if(state.playing&&delta>step){state.elapsed+=delta-step;if(state.mode==='auto')state.autoClock+=delta-step;}simulate(step);},50);
// A small read-only diagnostic surface for checking physical invariants.
window.yohaku={snapshot:()=>({started:state.started,playing:state.playing,mode:state.mode,pattern:state.pattern,water:state.water,elapsed:state.elapsed,pouring:state.pouring,audioState:sound.ctx?.state||'not-started',stones:stones.map(s=>({surface:s.ts,core:s.tc,water:s.water,evaporation:s.evap})),particles:particles.length})};
})();
