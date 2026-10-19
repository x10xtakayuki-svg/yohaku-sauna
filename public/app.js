'use strict';
(() => {
const $ = id => document.getElementById(id);
const canvas = $('scene'), ctx = canvas.getContext('2d');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
let seed=8127; const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
let prefs={volume:45,distance:60,duration:10,restDuration:3,guide:false,flow:35};
try{prefs={...prefs,...JSON.parse(localStorage.getItem('yohaku-settings')||'{}')};}catch{}
for(const k of ['volume','distance','flow'])prefs[k]=clamp(Number(prefs[k])||0,k==='flow'?10:0,100);
if(![0,3,5,10,20].includes(prefs.duration))prefs.duration=10;
if(![0,3,5,10,20].includes(prefs.restDuration))prefs.restDuration=3;
prefs.guide=prefs.guide===true;
const state={started:false,playing:false,mode:'manual',pattern:'drops',water:0,pouring:false,elapsed:0,autoClock:0,nextDrop:1,simTime:0,stream:0,fillFlash:0,focus:false,ended:false,secretFound:false,luckyWater:0,secretGlow:0,autoDim:0,experience:'meditation',phase:'idle',audibleTime:0,sessionGain:0,tailTime:0,ritualPoured:0,ritualWait:null,restDelay:0,cueTime:0,starting:false};
const ladle={x:487,y:563,targetX:487,targetY:563,angle:-.35,drag:false};
let view={w:1200,h:760,s:1,ox:0,oy:0}, previous=performance.now(), uiClock=0, particles=[], delayed=[];
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const stones=[];

// A two-temperature model. Water and energy are conserved at each stone;
// tuned coefficients describe a small visible part of a much larger heater.
for(let row=0;row<4;row++){
  for(let col=0;col<6;col++){
    const spread=[45,55,58,51][row];
    const x=752+(col-2.5)*spread*.86+(rnd()-.5)*20;
    const y=325+row*35+(rnd()-.5)*22;
    const r=34+rnd()*15;
    stones.push({x,y,r,ts:295+rnd()*45,tc:340+rnd()*35,water:0,wet:0,evap:0,light:0,lightShown:0,rough:.7+rnd()*.6,cap:65+rnd()*45,sprite:null,lucky:row===3&&col===3});
  }
}
stones.sort((a,b)=>a.y-b.y);
function makeStone(stone){
  const c=document.createElement('canvas');c.width=256;c.height=208;const g=c.getContext('2d');
  const points=[];const offset=rnd()*.5;
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2+offset;const r=.8+rnd()*.2;points.push([128+Math.cos(a)*117*r,99+Math.sin(a)*85*r]);}
  const outline=()=>{g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y));g.closePath();};
  outline();g.save();g.clip();
  const warmth=rnd();const shade=g.createLinearGradient(190,10,70,190);shade.addColorStop(0,warmth>.5?'#7d7b70':'#747e79');shade.addColorStop(.3,'#454e48');shade.addColorStop(.66,'#2b3530');shade.addColorStop(1,'#111a17');g.fillStyle=shade;g.fillRect(0,0,256,208);
  const center=[100+rnd()*45,69+rnd()*24];
  for(let i=0;i<points.length;i++){g.beginPath();g.moveTo(...center);g.lineTo(...points[i]);g.lineTo(...points[(i+1)%points.length]);g.closePath();g.fillStyle=i>5&&i<10?`rgba(213,197,159,${.04+rnd()*.1})`:`rgba(6,13,9,${rnd()*.17})`;g.fill();}
  // Mineral inclusions, pores and fractured veins are baked once per stone.
  for(let i=0;i<3400;i++){const x=rnd()*256,y=rnd()*208,r=.4+rnd()*1.8;g.fillStyle=rnd()>.6?`rgba(207,200,175,${rnd()*.24})`:`rgba(7,17,11,${rnd()*.3})`;g.fillRect(x,y,r,r*.7);}
  for(let i=0;i<38;i++){let x=rnd()*256,y=rnd()*208;g.beginPath();g.moveTo(x,y);for(let j=0;j<4;j++){x+=rnd()*17-6;y+=rnd()*13;g.lineTo(x,y);}g.strokeStyle=i%5===0?'#d0c1a137':'#0c171554';g.lineWidth=i%5===0?.65:1.1;g.stroke();}
  const edge=g.createRadialGradient(147,65,35,127,105,132);edge.addColorStop(0,'#0000');edge.addColorStop(.68,'#0000');edge.addColorStop(1,'#020b0966');g.fillStyle=edge;g.fillRect(0,0,256,208);g.restore();
  outline();g.strokeStyle='#c9c2a32b';g.lineWidth=.9;g.stroke();
  if(stone.lucky){g.strokeStyle='#111a17aa';g.lineWidth=2.6;g.lineCap='round';for(const x of [107,149]){g.beginPath();g.moveTo(x-8,90);g.quadraticCurveTo(x,97,x+8,89);g.stroke();}g.beginPath();g.moveTo(119,116);g.quadraticCurveTo(129,125,140,114);g.stroke();}
  const wet=document.createElement('canvas');wet.width=256;wet.height=208;const w=wet.getContext('2d');w.drawImage(c,0,0);w.globalCompositeOperation='source-atop';w.fillStyle='#03150f77';w.fillRect(0,0,256,208);
  const sheen=w.createRadialGradient(176,46,0,166,59,93);sheen.addColorStop(0,'#fff0cb8a');sheen.addColorStop(.18,'#e9dfbd32');sheen.addColorStop(.55,'#adc7b010');sheen.addColorStop(1,'#fff0');w.fillStyle=sheen;w.fillRect(0,0,256,208);
  for(let i=0;i<15;i++){const x=45+rnd()*160,y=25+rnd()*90;w.beginPath();w.ellipse(x,y,1+rnd()*5,.6+rnd(),-.4,0,Math.PI*2);w.fillStyle='#e5ebd24f';w.fill();}stone.wetSprite=wet;return c;
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
    const gain=c.createGain();gain.gain.value=.018;this.ambient=gain;roomNoise.connect(filter);filter.connect(gain);gain.connect(this.lowpass);roomNoise.start();
    this.volume();
  }
  volume(){if(!this.ctx)return;const t=this.ctx.currentTime,quiet=state.experience==='meditation';this.master.gain.setTargetAtTime(state.playing?prefs.volume/100*(quiet?.62:.72)*state.sessionGain:0,t,state.playing?.4:.3);this.lowpass.frequency.setTargetAtTime(quiet?lerp(3600,2200,prefs.distance/100):lerp(5600,2800,prefs.distance/100),t,.8);this.ambient?.gain.setTargetAtTime(quiet?.014:.025,t,1);}
  burst(kind,amount=1,x=740){
    if(!this.ctx||!state.playing)return;const c=this.ctx,t=c.currentTime;
    const source=c.createBufferSource();source.buffer=this.noise;const filter=c.createBiquadFilter();filter.type='bandpass';
    const gain=c.createGain(),pan=c.createStereoPanner();pan.pan.value=clamp((x-650)/600,-.5,.5)*(1-prefs.distance/160);
    const quiet=state.experience==='meditation';
    const config={fill:[430,.55,.13],impact:[850,.18,.07],drop:[1100,.10,.05],bubble:[1500,.055,.045],wood:[240,.2,.014]}[kind]||[1000,.1,.04];
    const length=config[1]*(quiet?1.3:1);
    filter.frequency.value=config[0]*(.85+Math.random()*.3)*(quiet?.78:1);filter.Q.value=kind==='drop'?(quiet?1.1:2.8):.65;
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(config[2]*clamp(amount,.05,2)*(quiet?.5:1),t+(quiet?.025:.012));gain.gain.exponentialRampToValueAtTime(.0001,t+length);
    source.connect(filter);filter.connect(gain);gain.connect(pan);pan.connect(this.lowpass);pan.connect(this.room);
    source.start(t,Math.random()*5,length);source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();pan.disconnect();};
    if(kind==='fill'||kind==='drop'&&!quiet){
      const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(kind==='fill'?380:730,t);o.frequency.exponentialRampToValueAtTime(kind==='fill'?170:410,t+.11);g.gain.setValueAtTime(.016*amount,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(this.lowpass);o.start(t);o.stop(t+.18);o.onended=()=>{o.disconnect();g.disconnect();};
    }
  }
  update(dt){
    if(!this.ctx)return;
    const energy=new Array(6).fill(0);stones.forEach((s,i)=>energy[i%6]+=s.evap);
    this.steam.forEach((voice,i)=>{const amp=Math.sqrt(energy[i])* .065*(.9+.1*Math.sin(state.simTime*.7+i));voice.gain.gain.setTargetAtTime(state.playing?Math.min(.22,amp)*(state.experience==='meditation'?.78:1):0,this.ctx.currentTime,state.experience==='meditation'?.28:.13);});
    const total=stones.reduce((n,s)=>n+s.evap,0);
    if(state.playing&&total>.005&&Math.random()<Math.min(.6,total*dt*(state.experience==='meditation'?.4:1.4))){const s=stones[Math.floor(Math.random()*stones.length)];this.burst('bubble',Math.min(.7,total*.1),s.x);}
  }
}
const sound=new Soundscape();
const smoothstep=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
function announce(t){$('announcement').textContent=t;}
function hint(t){$('hint').innerHTML='<span>·</span> '+t;}
function save(){try{localStorage.setItem('yohaku-settings',JSON.stringify(prefs));}catch{}}
function duration(){return state.experience==='meditation'?prefs.restDuration:prefs.duration;}
function resting(){return state.experience==='meditation'&&['rest','settling'].includes(state.phase);}
function updateWater(){const p=clamp(state.water/160,0,1);$('waterBar').style.width=p*100+'%';$('waterText').textContent=p<.01?'柄杓は空です':p>.95?'水を汲みました':'水が残っています';$('pour').disabled=!state.playing||state.water<=0||state.mode!=='manual'||state.phase==='settling';}
function nearest(x,y){return stones.reduce((best,s)=>Math.hypot(x-s.x,y-s.y)<Math.hypot(x-best.x,y-best.y)?s:best,stones[0]);}
function addWater(x,y,amount,impact=true){
  if(amount<=0)return nearest(x,y);
  const s=nearest(x,y);s.water+=amount;s.light=Math.min(1,s.light+amount*.45);
  if(state.phase==='ritual')state.ritualPoured+=amount;
  if(s.lucky&&state.experience==='free'&&state.mode==='manual'&&state.pouring&&!state.secretFound){state.luckyWater+=amount;if(state.luckyWater>=18){state.secretFound=true;state.secretGlow=4;hint('……石も、ととのいました。');announce('……石も、ととのいました。');}}
  if(impact&&Math.random()<.2)sound.burst('impact',Math.min(1,amount*.7),x);
  if(!reducedMotion&&Math.random()<.35&&particles.length<190)particles.push({kind:'splash',x:s.x,y:s.y,vx:(Math.random()-.5)*65,vy:-30-Math.random()*35,life:.5,max:.5,size:1.5});
  return s;
}
function closeRestPanel(){ $('restPanel').hidden=true;$('restTools').setAttribute('aria-expanded','false');$('restTools').textContent='操作を開く';$('restTime').hidden=true;$('peekTime').setAttribute('aria-expanded','false');$('peekTime').textContent='残り時間を見る';}
function toggleRestPanel(){const open=$('restPanel').hidden;$('restPanel').hidden=!open;$('restTools').setAttribute('aria-expanded',String(open));$('restTools').textContent=open?'操作を閉じる':'操作を開く';}
function showCue(text,seconds=6){$('restCue').textContent=text;$('restCue').hidden=false;state.cueTime=seconds;}
function sessionUI(){
  const med=state.experience==='meditation';document.body.classList.toggle('meditation',med);document.body.classList.toggle('at-entrance',state.phase==='idle');document.body.classList.toggle('ritual-mode',state.phase==='ritual');document.body.classList.toggle('resting',resting());document.body.classList.toggle('session-finished',state.ended);
  $('restControls').hidden=!resting()||state.ended;$('ritualActions').hidden=state.phase!=='ritual';$('skipPour').hidden=state.ritualPoured>0;
  $('manual').disabled=state.phase==='settling';$('auto').disabled=state.phase==='settling';$('pause').disabled=!state.started||state.ended;
  const quietContent=resting()||state.phase==='idle'||state.ended;
  for(const selector of ['.room-caption','.room-tag','#hint'])document.querySelector?.(selector)?.setAttribute('aria-hidden',String(quietContent));
  canvas.setAttribute('aria-hidden',String(state.phase==='idle'||state.ended));canvas.setAttribute('aria-label',resting()?'静かなサウナ室。画面を触ると操作を開けます。':'木の壁に囲まれたサウナストーブ。バケツで水を汲み、石を押して注げます。');
  syncDuration();updateWater();updateTimer();
}
async function start(intent='free'){
  if(state.starting)return;state.starting=true;for(const id of ['enter','restEnter','freeEnter'])$(id).disabled=true;
  try{await sound.init();}catch(e){announce(e.message);$('welcome').querySelector('p').textContent=e.message;state.starting=false;for(const id of ['enter','restEnter','freeEnter'])$(id).disabled=false;return;}
  state.experience=intent==='free'?'free':'meditation';state.phase=intent==='free'?'free':'ritual';state.started=true;state.playing=true;state.ended=false;state.elapsed=0;state.autoClock=0;state.nextDrop=.8;state.audibleTime=0;state.sessionGain=0;state.tailTime=0;state.water=0;state.ritualPoured=0;state.ritualWait=null;state.stream=0;state.cueTime=0;
  setFocus(false);closeRestPanel();$('restCue').hidden=true;$('welcome').hidden=true;$('ending').hidden=true;
  $('pauseIcon').textContent='Ⅱ';$('pauseText').textContent='ひと休み';$('restPause').textContent='一時停止';$('pause').setAttribute('aria-label','一時停止');$('restPause').setAttribute('aria-label','一時停止');document.body.classList.add('playing');
  $('finishEarly').textContent='余韻を聴いて、終える';$('anotherPour').textContent='もう一杯、かける';
  setMode('manual');hint(intent==='free'?'バケツで水を汲んで、石にゆっくり注ぐ。':'水を汲んで、一杯。余韻のあとに休めます。');
  if(intent==='rest')enterRest(false);else{sessionUI();$('fill').focus?.({preventScroll:true});}
  sound.volume();announce(intent==='rest'?'静かな休息が始まります':'サウナに入りました');
  if('mediaSession' in navigator){navigator.mediaSession.metadata=new MediaMetadata({title:'余白 — おうちのサウナ',artist:'静かなロウリュ'});navigator.mediaSession.setActionHandler('play',()=>{if(!state.playing)togglePause();});navigator.mediaSession.setActionHandler('pause',()=>{if(state.playing)togglePause();});}
  state.starting=false;for(const id of ['enter','restEnter','freeEnter'])$(id).disabled=false;
}
function enterRest(afterPour=true){
  if(!state.playing||state.ended)return;stopPour();state.phase='rest';state.elapsed=0;state.autoClock=0;state.tailTime=0;state.ritualWait=null;state.restDelay=afterPour?10:1.5;state.stream=0;
  ladle.targetX=487;ladle.targetY=563;ladle.drag=false;pointerId=null;
  setMode('auto');closeRestPanel();sessionUI();
  showCue(prefs.guide?'考えごとに気づいたら、水の音へ。':'ここからは、音にまかせて。',prefs.guide?8:5);
  announce('ここからは、音にまかせて。');$('restPause').focus?.({preventScroll:true});
}
function beginSettling(){
  if(state.ended)return;if(!state.playing){end();return;}if(state.phase==='settling')return;state.phase='settling';state.tailTime=0;state.ritualWait=null;stopPour();state.stream=0;closeRestPanel();sessionUI();
  if(state.experience==='free')hint('注水を止めて、最後の余韻を。');
}
function end(){
  state.playing=false;stopPour();state.phase='finished';state.ended=true;state.sessionGain=0;state.stream=0;state.cueTime=0;$('restCue').hidden=true;closeRestPanel();document.body.classList.remove('playing');sound.volume();
  if(state.experience==='free')setFocus(false);$('ending').hidden=false;sessionUI();announce('おかえりなさい。');$('endingTitle').focus?.({preventScroll:true});
}
function returnEntrance(){
  state.playing=false;stopPour();state.started=false;state.ended=false;state.phase='idle';state.experience='meditation';state.sessionGain=0;state.stream=0;state.cueTime=0;document.body.classList.remove('playing');sound.volume();setFocus(false);closeRestPanel();$('restCue').hidden=true;$('ending').hidden=true;$('welcome').hidden=false;sessionUI();$('restEnter').focus?.({preventScroll:true});
}
function togglePause(){
  if(!state.started||state.ended)return;state.playing=!state.playing;stopPour();
  if(state.playing)sound.init().catch(()=>{});sound.volume();document.body.classList.toggle('playing',state.playing);
  $('pauseIcon').textContent=state.playing?'Ⅱ':'▷';$('pauseText').textContent=state.playing?'ひと休み':'再開する';$('restPause').textContent=state.playing?'一時停止':'再開する';$('pause').setAttribute('aria-label',state.playing?'一時停止':'再生');$('restPause').setAttribute('aria-label',state.playing?'一時停止':'再生');updateWater();
  $('finishEarly').textContent=state.playing?'余韻を聴いて、終える':'このまま終える';$('anotherPour').textContent=state.playing?'もう一杯、かける':'再開して、もう一杯';
  if(!resting())hint(state.playing?(state.phase==='ritual'?'一杯かけても、このまま休んでも。':state.mode==='manual'?'バケツで水を汲んで、石にゆっくり注ぐ。':'何もせず、音にまかせて。'):'ひと休み中。再生ボタンで、またここへ。');
}
function fill(){
  if(!state.playing||state.mode!=='manual'||state.phase==='settling')return;
  state.ritualWait=null;state.water=160;state.fillFlash=1;ladle.targetX=403;ladle.targetY=551;sound.burst('fill',1,390);updateWater();hint('石を押し続けると、ゆっくり注げます。');announce('柄杓に水を汲みました');
}
function beginPour(x=745,y=405){
  if(!state.playing||state.mode!=='manual'||state.water<=0||state.phase==='settling')return;
  state.ritualWait=null;state.pouring=true;ladle.targetX=x;ladle.targetY=y-96;state.pourX=x;state.pourY=y;canvas.classList.add('pouring');$('pour').classList.add('held');
}
function stopPour(){
  const wasPouring=state.pouring;state.pouring=false;canvas.classList.remove('pouring');$('pour').classList.remove('held');
  if(wasPouring&&state.phase==='ritual'){
    if(state.water<=.01&&state.ritualPoured>0){state.ritualWait=3;hint('余韻のあと、静かな休息へ。');}
    else if(state.ritualPoured>0)hint('余韻を聴いたら、柄杓を戻して休めます。');
    $('skipPour').hidden=state.ritualPoured>0;
  }
}
function setMode(mode){
  stopPour();state.mode=mode;state.autoClock=0;state.nextDrop=.7;document.body.classList.toggle('auto-ambience',mode==='auto');
  for(const [id,m] of [['manual','manual'],['auto','auto']]){$(id).classList.toggle('selected',mode===m);$(id).setAttribute('aria-pressed',String(mode===m));}
  $('manualPanel').hidden=mode!=='manual';$('autoPanel').hidden=mode!=='auto';
  if(mode==='auto'){ladle.targetX=487;ladle.targetY=563;hint('何もせず、音にまかせて。');}else hint('バケツで水を汲んで、石にゆっくり注ぐ。');updateWater();
}
function setFocus(on){state.focus=on;document.body.classList.toggle('focus-mode',on);$('restore').hidden=!on;$('focus').setAttribute('aria-label',on?'画面に戻る':'画面を暗くする');}
function point(e){const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left-view.ox)/view.s,y:(e.clientY-r.top-view.oy)/view.s};}
let pointerId=null;
canvas.addEventListener('pointerdown',e=>{
  if(resting()){toggleRestPanel();return;}
  if(!state.playing||state.phase==='settling'||state.ended)return;const p=point(e);
  if(state.experience==='free'&&p.x>707&&p.x<797&&p.y>584&&p.y<623){hint('ここでは、会議はありません。ロウリュだけです。');announce('ここでは、会議はありません。ロウリュだけです。');return;}
  if(state.mode!=='manual')return;pointerId=e.pointerId;canvas.setPointerCapture(e.pointerId);
  if(Math.hypot(p.x-395,(p.y-578)*1.3)<95){fill();return;}
  if(p.x>535&&p.x<965&&p.y>280&&p.y<525){if(state.water>0)beginPour(p.x,p.y);else hint('まずは、手前のバケツで水を汲みましょう。');return;}
  if(Math.hypot(p.x-ladle.x,p.y-ladle.y)<130)ladle.drag=true;
});
canvas.addEventListener('pointermove',e=>{if(e.pointerId!==pointerId||resting())return;const p=point(e);if(ladle.drag){ladle.targetX=clamp(p.x,300,970);ladle.targetY=clamp(p.y,260,610);}else if(state.pouring){state.pourX=clamp(p.x,565,930);state.pourY=clamp(p.y,330,470);ladle.targetX=state.pourX;ladle.targetY=state.pourY-96;}});
function releasePointer(e){if(pointerId!==null&&e.pointerId!==pointerId)return;if(ladle.drag&&Math.hypot(ladle.targetX-395,(ladle.targetY-570)*1.3)<105)fill();ladle.drag=false;pointerId=null;stopPour();}
canvas.addEventListener('pointerup',releasePointer);canvas.addEventListener('pointercancel',releasePointer);canvas.addEventListener('lostpointercapture',releasePointer);
$('pour').addEventListener('pointerdown',e=>{if(!state.playing||state.water<=0)return;e.preventDefault();$('pour').setPointerCapture(e.pointerId);beginPour();});
for(const type of ['pointerup','pointercancel','lostpointercapture'])$('pour').addEventListener(type,stopPour);
$('pour').addEventListener('keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();beginPour();}});
$('pour').addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();stopPour();}});
$('pour').addEventListener('blur',stopPour);
$('fill').onclick=fill;$('enter').onclick=()=>start('ritual');$('restEnter').onclick=()=>start('rest');$('freeEnter').onclick=()=>start('free');$('again').onclick=()=>start('rest');$('backEntrance').onclick=returnEntrance;$('pause').onclick=togglePause;$('restPause').onclick=togglePause;
$('putBack').onclick=()=>enterRest(state.ritualPoured>0);$('skipPour').onclick=()=>enterRest(false);$('restTools').onclick=toggleRestPanel;
$('finishEarly').onclick=beginSettling;
$('anotherPour').onclick=()=>{if(state.ended)return;if(!state.playing)togglePause();state.phase='ritual';state.ritualPoured=0;state.ritualWait=null;state.tailTime=0;state.water=0;state.cueTime=0;$('restCue').hidden=true;closeRestPanel();setMode('manual');sessionUI();hint('もう一杯、好きなところへ。');$('fill').focus?.({preventScroll:true});};
$('peekTime').onclick=()=>{const visible=$('restTime').hidden;$('restTime').hidden=!visible;$('peekTime').setAttribute('aria-expanded',String(visible));$('peekTime').textContent=visible?'時間を閉じる':'残り時間を見る';updateTimer();};
$('manual').onclick=()=>setMode('manual');$('auto').onclick=()=>setMode('auto');
document.querySelectorAll('[data-pattern]').forEach(b=>b.onclick=()=>{state.pattern=b.dataset.pattern;state.autoClock=0;state.nextDrop=.7;document.querySelectorAll('[data-pattern]').forEach(v=>{v.classList.toggle('selected',v===b);v.setAttribute('aria-pressed',String(v===b));});announce(b.firstChild.textContent+'を選びました');});
$('focus').onclick=()=>setFocus(!state.focus);$('restore').onclick=()=>setFocus(false);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){setFocus(false);closeRestPanel();}});
$('settings').onclick=()=>{stopPour();syncDuration();$('settingsDialog').showModal();};$('help').onclick=()=>{stopPour();$('helpDialog').showModal();};
for(const id of ['settingsDialog','helpDialog'])$(id).addEventListener('click',e=>{if(e.target===$(id)){const r=$(id).getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)$(id).close();}});
for(const id of ['volume','distance','flow']){$(id).value=prefs[id];$(id).addEventListener('input',()=>{prefs[id]=Number($(id).value);syncLabels();save();sound.volume();});}
$('guide').checked=prefs.guide;$('guide').addEventListener('change',()=>{prefs.guide=$('guide').checked;save();});
function syncLabels(){$('volumeValue').textContent=prefs.volume+'%';$('distanceValue').textContent=prefs.distance>65?'少し離れて':prefs.distance>30?'ベンチから':'ストーブの近く';$('flow').nextElementSibling.textContent=prefs.flow>65?'たっぷり':prefs.flow>35?'ほどよく':'細く';}
function syncDuration(){document.querySelectorAll('[data-min]').forEach(b=>{const active=Number(b.dataset.min)===duration();b.classList.toggle('selected',active);b.setAttribute('aria-pressed',String(active));});$('durationContext').textContent=state.experience==='meditation'?'休息の時間':'自由ロウリュの時間';$('restEnter').innerHTML=prefs.restDuration?`そのまま、${prefs.restDuration}分休む <span>→</span>`:'時間を決めず、休む <span>→</span>';$('enter').textContent=prefs.restDuration?`一杯かけてから、${prefs.restDuration}分休む`:'一杯かけてから、休む';}
document.querySelectorAll('[data-min]').forEach(b=>b.onclick=()=>{const key=state.experience==='meditation'?'restDuration':'duration';prefs[key]=Number(b.dataset.min);state.elapsed=0;if(state.phase==='settling'){state.phase=state.experience==='meditation'?'rest':'free';state.tailTime=0;sessionUI();}syncDuration();save();updateTimer();});
function updateTimer(){let seconds=state.phase==='settling'?Math.max(0,Math.ceil(20-state.tailTime)):duration()?Math.max(0,Math.ceil(duration()*60-state.elapsed)):Math.floor(state.elapsed);const text=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');$('sessionTime').textContent=duration()?text:'∞ '+text;$('restTime').textContent=state.phase==='settling'?'余韻の残り '+text:duration()?'あと '+text:'時間は決めていません。';}
syncLabels();sessionUI();
window.addEventListener('blur',()=>{stopPour();ladle.drag=false;pointerId=null;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopPour();previous=performance.now();}});


function simulate(dt){
  if(!state.playing){sound.update(dt);return;}
  state.simTime+=dt;state.audibleTime+=dt;state.fillFlash=Math.max(0,state.fillFlash-dt*.8);state.secretGlow=Math.max(0,state.secretGlow-dt);state.stream=0;
  if(state.cueTime>0){state.cueTime=Math.max(0,state.cueTime-dt);if(state.cueTime===0)$('restCue').hidden=true;}
  if(state.phase==='ritual'&&state.ritualWait!==null&&!state.pouring){state.ritualWait-=dt;if(state.ritualWait<=0)enterRest(true);}
  if(state.phase==='free'||state.phase==='rest'){
    state.elapsed+=dt;
    if(duration()>0&&duration()*60-state.elapsed<=20)beginSettling();
  }
  if(state.phase==='settling')state.tailTime+=dt;
  state.sessionGain=smoothstep(state.audibleTime/5)*(state.phase==='settling'?1-smoothstep((state.tailTime-6)/14):1);
  sound.volume();
  if(state.phase==='settling'&&state.tailTime>=20){end();return;}
  if(['free','ritual'].includes(state.phase)&&state.mode==='manual'&&state.pouring){
    const amount=Math.min(state.water,(8+prefs.flow*.52)*dt);state.water=Math.max(0,state.water-amount);state.stream=amount/dt;
    addWater(state.pourX,state.pourY,amount);
    if(state.water<=0){stopPour();if(state.phase==='free'){hint('最後の一滴まで、耳をすませて。');announce('柄杓が空になりました');}}
    updateWater();
  }
  if(state.phase==='rest'){
    state.autoClock+=dt;const t=state.autoClock-state.restDelay;
    if(t>0){
      // Short, soft pours separated by real silence. The first cup is allowed
      // to finish before the automatic water starts; there is no audible cue.
      const cycle=t%38;
      const pulse=cycle<10?Math.sin(cycle/10*Math.PI)**2:cycle>28&&cycle<32?.09*Math.sin((cycle-28)/4*Math.PI)**2:0;
      const x=745+Math.sin(t*.08)*60,y=370+Math.sin(t*.055)*22;
      const hot=nearest(x,y).ts>150?1:.25,rate=pulse*2.1*hot;
      addWater(x,y,rate*dt,false);state.stream=rate*2;state.pourX=x;state.pourY=y;
    }
  }
  if(state.phase==='free'&&state.mode==='auto'){
    state.autoClock+=dt;const t=state.autoClock;
    if(state.pattern==='drops'&&t>=state.nextDrop){const x=650+Math.random()*190,y=350+Math.random()*100;const a=.45+Math.random()*.55;addWater(x,y,a,false);sound.burst('drop',.7,x);particles.push({kind:'fall',x,y:130,vx:0,vy:260,life:.8,max:.8,size:2});state.nextDrop=t+1.3+Math.random()*2.8;}
    if(state.pattern==='thread'){
      const cycle=(t%17)/17;const intensity=cycle<.7?Math.pow(Math.sin(cycle/.7*Math.PI),.7):0;
      const x=730+Math.sin(t*.16)*95;const hot=nearest(x,400).ts>150?1:.25;addWater(x,400,intensity*hot*2.8*dt,false);state.stream=intensity*7;state.pourX=x;state.pourY=400;
    }
    if(state.pattern==='wave'){
      const cycle=t%60;const rate=cycle<3?Math.sin(cycle/3*Math.PI)*55:cycle<44?.5+Math.sin(t*.3)*.25:.08;
      const x=640+Math.random()*220;addWater(x,370+Math.random()*80,rate*dt,cycle<3);state.stream=cycle<3?rate:0;state.pourX=x;state.pourY=400;
      if(cycle>3&&Math.random()<dt*.3)sound.burst('drop',.25,x);
    }
  }
  for(let i=delayed.length-1;i>=0;i--){delayed[i].wait-=dt;if(delayed[i].wait<=0){const d=delayed.splice(i,1)[0];d.stone.water+=d.amount;d.stone.light=Math.min(1,d.stone.light+d.amount*.25);sound.burst('drop',.2,d.stone.x);}}
  for(let i=0;i<stones.length;i++){
    const s=stones[i];s.light*=Math.exp(-dt/2.8);const transfer=(s.tc-s.ts)*3.8*dt;
    s.ts+=transfer/s.cap;s.tc-=transfer/(s.cap*7);s.tc+=(355-s.tc)*.0035*dt;s.ts+=(115-s.ts)*.0015*dt;
    const potential=Math.max(0,s.ts-98)*.011*s.rough;
    // A little surface film remains in the uneven stone. Its evaporation
    // provides the tail instead of playing a fixed sound after water stops.
    const available=s.water*(1-Math.exp(-dt/(s.rough*.65)));
    const evap=Math.min(available,potential*dt,Math.max(0,(s.ts-95)*s.cap)/2450);
    s.water-=evap;s.ts-=evap*2450/s.cap;s.evap=evap/dt;
    s.wet=lerp(s.wet,Math.min(1,s.water/2+s.evap*.12),Math.min(1,dt*5));
    if(s.water>4){const runoff=Math.min(s.water-4,12*dt);s.water-=runoff;const lower=stones.filter(t=>t.y>s.y+18&&Math.abs(t.x-s.x)<75);if(lower.length&&delayed.length<100)delayed.push({stone:lower[Math.floor(Math.random()*lower.length)],amount:runoff,wait:.25+Math.random()*.5});}
    if(!reducedMotion&&s.evap>.05&&Math.random()<s.evap*dt*2.4&&particles.length<190){const life=2.5+Math.random()*2;particles.push({kind:'steam',x:s.x+(Math.random()-.5)*25,y:s.y-10,vx:(Math.random()-.5)*13,vy:-14-Math.random()*18,life,max:life,size:14+Math.random()*15});}
  }
  sound.update(dt);
  uiClock+=dt;if(uiClock>.4){uiClock=0;const total=stones.reduce((n,s)=>n+s.evap,0);$('roomState').textContent=total>3?'ロウリュの余韻':total>.1?'石が、静かに呼吸する':'静かなサウナ室';$('soundText').textContent=state.mode==='auto'?'音に、まかせて。':state.pouring?'ゆっくり、ひと注ぎ。':'静けさを、聴く。';updateTimer();}
}


// Materials are baked into reusable layers; only water, wetness and mist
// animate. High-resolution stone sprites retain detail on phone displays.
const background=document.createElement('canvas');background.width=1600;background.height=1014;const bg=background.getContext('2d');
function path(g,points){g.beginPath();points.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.closePath();}
function ellipse(g,x,y,rx,ry,fill){g.beginPath();g.ellipse(x,y,rx,ry,0,0,Math.PI*2);g.fillStyle=fill;g.fill();}
function wood(g,x,y,w,h,vertical=true,tone=1){
  const grd=g.createLinearGradient(x,y,vertical?x+w:x,vertical?y:y+h);grd.addColorStop(0,`rgb(${45*tone},${33*tone},${21*tone})`);grd.addColorStop(.09,`rgb(${65*tone},${47*tone},${29*tone})`);grd.addColorStop(.65,`rgb(${56*tone},${40*tone},${25*tone})`);grd.addColorStop(1,`rgb(${29*tone},${25*tone},${17*tone})`);g.fillStyle=grd;g.fillRect(x,y,w,h);
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  const count=vertical?65:85;
  for(let i=0;i<count;i++){const p=rnd(),wave=rnd()*8,phase=rnd()*6;g.beginPath();for(let j=0;j<=18;j++){const t=j/18;const wobble=Math.sin(t*7+phase)*wave+Math.sin(t*23+phase)*1.3;const px=vertical?x+p*w+wobble:x+t*w,py=vertical?y+t*h:y+p*h+wobble;if(j)g.lineTo(px,py);else g.moveTo(px,py);}g.strokeStyle=rnd()>.6?'#e0bd7917':'#100e0838';g.lineWidth=.3+rnd()*.9;g.stroke();}
  if(rnd()>.45){const kx=x+w*(.2+rnd()*.6),ky=y+h*(.2+rnd()*.6);for(let i=1;i<7;i++){g.beginPath();g.ellipse(kx,ky,vertical?i*1.2:i*7,vertical?i*8:i*1.2,vertical?.1:0,0,Math.PI*2);g.strokeStyle='#0c100b2b';g.lineWidth=.6;g.stroke();}}
  g.restore();g.fillStyle='#080b0799';if(vertical){g.fillRect(x+w-2,y,2,h);g.fillStyle='#d5b98318';g.fillRect(x+1,y,1,h);}else{g.fillRect(x,y+h-3,w,3);g.fillStyle='#d5b98325';g.fillRect(x,y+1,w,1);}
}
function glow(g,x,y,r,color){const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,color);grad.addColorStop(1,'#d79a4000');g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);}
function makeBackground(){
  bg.save();bg.scale(1600/1200,1014/760);bg.fillStyle='#211c14';bg.fillRect(0,0,1200,760);
  // Broad cedar boards and a darker return wall give the room depth.
  for(let i=0;i<8;i++)wood(bg,225,i*68,975,68,false,1.05+rnd()*.25);
  bg.save();path(bg,[[0,0],[225,0],[225,514],[0,681]]);bg.clip();for(let i=0;i<8;i++)wood(bg,i*31,0,31,760,true,.69+rnd()*.17);bg.restore();
  const corner=bg.createLinearGradient(170,0,285,0);corner.addColorStop(0,'#02080500');corner.addColorStop(.5,'#02080599');corner.addColorStop(1,'#02080500');bg.fillStyle=corner;bg.fillRect(170,0,115,530);
  bg.fillStyle='#121812';path(bg,[[0,681],[225,514],[1200,514],[1200,760],[0,760]]);bg.fill();
  for(let row=0;row<6;row++){const y0=514+row*row*8,y1=514+(row+1)*(row+1)*8;for(let col=-2;col<9;col++){const a=210+col*170,b=a+169;path(bg,[[lerp(a,600,.1),y0],[lerp(b,600,.1),y0],[600+(b-600)*(1+(y1-514)/450),y1],[600+(a-600)*(1+(y1-514)/450),y1]]);bg.fillStyle=`rgba(91,94,73,${.025+rnd()*.045})`;bg.fill();bg.strokeStyle='#070e0a88';bg.lineWidth=1.2;bg.stroke();}}
  for(let i=0;i<7000;i++){const x=rnd()*1200,y=514+rnd()*246;bg.fillStyle=rnd()>.5?'#d0bf8c06':'#0006';bg.fillRect(x,y,rnd()*2,.4);}
  // Concealed lighting beneath the bench; the top remains pleasantly dim.
  glow(bg,250,568,290,'#e3a95726');glow(bg,1030,280,430,'#f6bc6037');
  bg.fillStyle='#0b110c';path(bg,[[0,510],[483,464],[515,520],[0,661]]);bg.fill();
  for(let i=0;i<5;i++){const points=[[0,456+i*22],[465,430+i*11],[515,447+i*12],[0,480+i*25]];bg.save();path(bg,points);bg.clip();wood(bg,0,420,540,190,false,1.65-i*.08);bg.restore();path(bg,points);bg.strokeStyle='#d7b37424';bg.lineWidth=.8;bg.stroke();}
  bg.beginPath();bg.moveTo(0,602);bg.lineTo(482,503);bg.strokeStyle='#e4b76b99';bg.shadowColor='#e9a34f';bg.shadowBlur=15;bg.lineWidth=2;bg.stroke();bg.shadowBlur=0;
  for(const x of [34,420]){bg.fillStyle='#1f2418';path(bg,[[x,590-x*.16],[x+17,584-x*.16],[x+17,718-x*.21],[x,724-x*.21]]);bg.fill();}
  // A folded linen towel, with seams and a soft contact shadow.
  bg.save();bg.translate(285,474);bg.rotate(-.12);bg.shadowColor='#0009';bg.shadowBlur=12;bg.shadowOffsetY=7;path(bg,[[-72,-13],[54,-18],[76,5],[-54,17]]);const linen=bg.createLinearGradient(0,-20,0,20);linen.addColorStop(0,'#a29e83');linen.addColorStop(.35,'#c0b89a');linen.addColorStop(1,'#6d725b');bg.fillStyle=linen;bg.fill();bg.shadowBlur=0;for(let i=0;i<15;i++){bg.beginPath();bg.moveTo(-60+i*8,-11);bg.lineTo(-43+i*8,12);bg.strokeStyle='#ede1bc17';bg.lineWidth=.7;bg.stroke();}bg.beginPath();bg.moveTo(-61,9);bg.lineTo(64,-1);bg.strokeStyle='#3a44334d';bg.lineWidth=2;bg.stroke();bg.restore();
  // Slatted wall light and its amber pool on the cedar.
  glow(bg,1020,230,210,'#f8bc6f32');bg.fillStyle='#1a2115';bg.fillRect(991,137,57,164);bg.shadowColor='#ffce84';bg.shadowBlur=34;bg.fillStyle='#e5be7d';bg.fillRect(999,150,39,136);bg.shadowBlur=0;
  for(let i=0;i<9;i++){wood(bg,992,145+i*18,55,7,false,1.25);bg.fillStyle='#fff0c319';bg.fillRect(994,145+i*18,51,1);}bg.fillStyle='#62583a';bg.fillRect(989,136,61,9);bg.fillRect(989,299,61,8);
  // A small analog dial is decorative, without simulated room readings.
  ellipse(bg,1122,358,27,27,'#1d2317');ellipse(bg,1122,356,24,24,'#7c7856');ellipse(bg,1122,356,20,20,'#b9b18c');for(let i=0;i<11;i++){const a=-Math.PI*.78+i*Math.PI*.156;bg.beginPath();bg.moveTo(1122+Math.cos(a)*15,356+Math.sin(a)*15);bg.lineTo(1122+Math.cos(a)*18,356+Math.sin(a)*18);bg.strokeStyle='#4a503b';bg.lineWidth=.8;bg.stroke();}bg.beginPath();bg.moveTo(1114,364);bg.lineTo(1129,345);bg.strokeStyle='#64422a';bg.lineWidth=1.3;bg.stroke();ellipse(bg,1122,356,2,2,'#514b31');
  const shade=bg.createLinearGradient(0,0,0,760);shade.addColorStop(0,'#030a0866');shade.addColorStop(.45,'#020b0705');shade.addColorStop(1,'#08120e55');bg.fillStyle=shade;bg.fillRect(0,0,1200,760);bg.restore();
}
makeBackground();
const heaterArt=document.createElement('canvas');heaterArt.width=1200;heaterArt.height=760;
function bakeHeater(){
  const g=heaterArt.getContext('2d');
  glow(g,765,638,195,'#000a');ellipse(g,752,658,183,32,'#020a09bb');
  const metal=g.createLinearGradient(590,0,914,0);metal.addColorStop(0,'#090e0d');metal.addColorStop(.15,'#242b28');metal.addColorStop(.45,'#121916');metal.addColorStop(.88,'#343a30');metal.addColorStop(1,'#0b1410');
  g.fillStyle=metal;g.beginPath();g.moveTo(590,407);g.lineTo(598,629);g.bezierCurveTo(642,673,862,673,906,629);g.lineTo(914,407);g.closePath();g.fill();
  g.save();g.beginPath();g.moveTo(590,407);g.lineTo(598,629);g.bezierCurveTo(642,673,862,673,906,629);g.lineTo(914,407);g.closePath();g.clip();
  for(let row=0;row<6;row++)for(let col=0;col<7;col++){const s=stones[(row*7+col)%stones.length];g.drawImage(s.sprite,579+col*47+(row%2)*17,416+row*36,65,55);}
  const shadow=g.createLinearGradient(0,430,0,670);shadow.addColorStop(0,'#03110b20');shadow.addColorStop(1,'#020b0966');g.fillStyle=shadow;g.fillRect(580,400,350,270);g.restore();
  // A restrained Finnish pillar silhouette: fine black rods, sparse bands.
  for(let i=0;i<36;i++){const a=i/35*Math.PI,x=752+163*Math.cos(a),bottom=752+155*Math.cos(a);g.beginPath();g.moveTo(x,410+Math.sin(a)*43);g.lineTo(bottom,629+Math.sin(a)*32);g.strokeStyle='#050a08';g.lineWidth=3.4;g.stroke();g.strokeStyle='#50594b';g.lineWidth=1.1;g.stroke();g.beginPath();g.moveTo(x+.7,410+Math.sin(a)*43);g.lineTo(bottom+.7,629+Math.sin(a)*32);g.strokeStyle=i<16?'#b9b5985c':'#87998b29';g.lineWidth=.55;g.stroke();}
  for(const y of [464,552,638]){g.beginPath();g.ellipse(752,y,163-(y-410)*.035,34,0,0,Math.PI);g.strokeStyle='#080e0b';g.lineWidth=6;g.stroke();g.strokeStyle='#414a3f';g.lineWidth=2;g.stroke();g.strokeStyle='#b8b39555';g.lineWidth=.65;g.stroke();}
  // A tiny maker's plate rewards a closer look, without interrupting the room.
  g.fillStyle='#101611';g.fillRect(714,590,76,26);g.strokeStyle='#68705a88';g.lineWidth=.7;g.strokeRect(714,590,76,26);g.fillStyle='#d2d2b9';g.font='600 10px sans-serif';g.textAlign='center';g.fillText('YOHAKU',752,601);g.fillStyle='#9aa28d';g.font='4.7px sans-serif';g.fillText('NO MEETINGS. JUST LÖYLY.',752,610);g.fillStyle='#be7e44';g.fillRect(733,614,38,1);
  ellipse(g,752,404,162,56,'#0b130f');
}
bakeHeater();
function drawHeater(g){
  g.drawImage(heaterArt,0,0);
  stones.forEach(s=>{g.save();g.translate(s.x,s.y);g.shadowColor='#020a08bb';g.shadowBlur=10;g.shadowOffsetY=7;g.drawImage(s.sprite,-s.r,-s.r*.78,s.r*2,s.r*1.65);g.shadowBlur=0;g.shadowOffsetY=0;if(s.wet>.005){g.globalAlpha=s.wet;g.drawImage(s.wetSprite,-s.r,-s.r*.78,s.r*2,s.r*1.65);}g.restore();});
  g.beginPath();g.ellipse(752,421,164,56,0,0,Math.PI);g.strokeStyle='#080e0b';g.lineWidth=6;g.stroke();g.strokeStyle='#5d6655';g.lineWidth=2;g.stroke();g.strokeStyle='#d0c49b66';g.lineWidth=.6;g.stroke();
  if(state.experience==='free'&&state.secretGlow>0&&!reducedMotion){const s=stones.find(s=>s.lucky);g.save();const progress=1-state.secretGlow/4;g.globalAlpha=Math.sin(progress*Math.PI)*.38;g.strokeStyle='#e2d8b5';g.lineWidth=1;for(let i=0;i<3;i++){const x=s.x-13+i*13,y=s.y-23-progress*26;g.beginPath();g.moveTo(x,y+7);g.bezierCurveTo(x-5,y+3,x+5,y-2,x,y-7);g.stroke();}g.restore();}
}
const bucketArt=document.createElement('canvas');bucketArt.width=240;bucketArt.height=250;
function bakeBucket(){
  const oldSeed=seed;seed=9182;const g=bucketArt.getContext('2d');g.translate(-275,-450);
  ellipse(g,395,665,98,21,'#020b08aa');g.beginPath();g.ellipse(395,555,77,86,0,Math.PI,Math.PI*2);g.strokeStyle='#292f20';g.lineWidth=11;g.stroke();g.strokeStyle='#a6a07a';g.lineWidth=3;g.stroke();
  g.save();path(g,[[310,554],[480,554],[467,651],[453,668],[335,668],[322,651]]);g.clip();for(let i=0;i<14;i++)wood(g,305+i*13,548,13,130,true,1.85+Math.sin(i/14*Math.PI)*.4);
  const shade=g.createLinearGradient(310,0,480,0);shade.addColorStop(0,'#0008');shade.addColorStop(.35,'#0000');shade.addColorStop(.7,'#e1b37414');shade.addColorStop(1,'#0008');g.fillStyle=shade;g.fillRect(305,548,180,130);g.restore();
  for(const y of [590,642]){g.beginPath();g.ellipse(395,y,81-(y-590)*.14,24,0,0,Math.PI);g.strokeStyle='#1a241c';g.lineWidth=9;g.stroke();g.strokeStyle='#8e987d';g.lineWidth=4;g.stroke();g.strokeStyle='#d9ce9b88';g.lineWidth=.8;g.stroke();for(const x of [339,451])ellipse(g,x,y+16,1.5,2,'#252e22');}
  ellipse(g,395,554,86,32,'#b3a079');ellipse(g,395,555,79,26,'#28372b');ellipse(g,395,558,74,21,'#152c23');seed=oldSeed;
}
bakeBucket();
function drawBucket(g){
  g.drawImage(bucketArt,275,450);
  const water=g.createLinearGradient(0,538,0,580);water.addColorStop(0,'#6e7d6888');water.addColorStop(.48,'#334e4188');water.addColorStop(1,'#142e25');ellipse(g,395,559,73,21,water);
  g.save();g.beginPath();g.ellipse(395,559,73,21,0,0,Math.PI*2);g.clip();
  for(let i=0;i<5;i++){const p=(state.simTime*.12+i*.21)%1;g.beginPath();g.ellipse(392,558,p*95,p*27,0,0,Math.PI*2);g.strokeStyle=`rgba(212,222,190,${(1-p)*(.075+state.fillFlash*.28)})`;g.lineWidth=.8;g.stroke();}
  for(let i=0;i<6;i++){const y=547+i*2.8;g.beginPath();g.moveTo(410+Math.sin(state.simTime+i)*3,y);g.quadraticCurveTo(425,y-2,438+Math.cos(state.simTime*.8+i)*4,y+1);g.strokeStyle=`rgba(249,214,145,${.08+Math.sin(i)*.04})`;g.lineWidth=1.7;g.stroke();}g.restore();
  g.beginPath();g.ellipse(395,554,85,31,0,0,Math.PI);g.strokeStyle='#d5bc8a';g.lineWidth=2.3;g.stroke();
}
function drawLadle(g,dt){
  const smooth=1-Math.exp(-dt*8);ladle.x=lerp(ladle.x,ladle.targetX,smooth);ladle.y=lerp(ladle.y,ladle.targetY,smooth);ladle.angle=lerp(ladle.angle,state.pouring?.38:-.35,smooth);
  const dip=state.fillFlash>0?Math.sin(state.fillFlash*Math.PI)*9:0;
  g.save();g.translate(ladle.x,ladle.y+dip);g.rotate(ladle.angle);g.shadowColor='#0008';g.shadowBlur=13;g.shadowOffsetY=8;
  const handle=g.createLinearGradient(0,0,0,70);handle.addColorStop(0,'#d6b982');handle.addColorStop(.4,'#96764a');handle.addColorStop(1,'#453d28');path(g,[[12,2],[154,57],[155,65],[147,69],[8,18]]);g.fillStyle=handle;g.fill();g.shadowBlur=0;g.shadowOffsetY=0;
  for(let i=0;i<5;i++){g.beginPath();g.moveTo(22,9+i*1.4);g.lineTo(145,58+i*1.2);g.strokeStyle=i%2?'#e1be8233':'#332b2344';g.lineWidth=.7;g.stroke();}g.beginPath();g.moveTo(148,60);g.lineTo(150,63);g.strokeStyle='#302e23';g.lineWidth=2;g.stroke();
  // A brushed copper bowl picks up the warm wall light.
  const copper=g.createLinearGradient(-37,0,36,10);copper.addColorStop(0,'#584932');copper.addColorStop(.2,'#b59a68');copper.addColorStop(.47,'#756340');copper.addColorStop(.8,'#d9bb81');copper.addColorStop(1,'#64583b');
  g.beginPath();g.moveTo(-35,-4);g.lineTo(-29,21);g.bezierCurveTo(-14,38,20,36,31,18);g.lineTo(36,-4);g.closePath();g.fillStyle=copper;g.fill();
  ellipse(g,0,-4,36,24,'#c9b283');ellipse(g,0,-4,31,19,'#414e37');
  const inner=g.createLinearGradient(-25,-18,20,16);inner.addColorStop(0,'#202d21');inner.addColorStop(1,'#a29464');ellipse(g,0,-4,29,17,inner);
  g.beginPath();g.ellipse(0,-5,34,22,0,Math.PI*.95,Math.PI*1.9);g.strokeStyle='#ffedbb99';g.lineWidth=1;g.stroke();
  if(state.water>0){const level=Math.sqrt(state.water/160);ellipse(g,0,-1,27*level,14*level,'#6687769c');g.beginPath();g.ellipse(-2,-4,21*level,9*level,0,Math.PI,Math.PI*1.8);g.strokeStyle='#e4e8c4b3';g.lineWidth=.9;g.stroke();}
  g.restore();
}
function drawStream(g){
  if(state.stream<.05)return;
  const targetX=state.pourX||745,targetY=state.pourY||400,t=state.simTime;
  const stream=(sx,sy,tx,ty,width,alpha,offset=0)=>{
    const bend=Math.sin(t*2+offset)*2;g.beginPath();g.moveTo(sx,sy);g.bezierCurveTo(sx-7+bend,sy+(ty-sy)*.35,tx-12,ty-37,tx,ty);g.strokeStyle=`rgba(133,179,160,${alpha*.3})`;g.lineWidth=width+3;g.stroke();g.strokeStyle=`rgba(201,225,208,${alpha})`;g.lineWidth=width;g.stroke();g.strokeStyle=`rgba(244,242,209,${alpha*.9})`;g.lineWidth=.7;g.stroke();
    for(let i=0;i<8;i++){const p=(t*1.6+i/8+offset)%1;const x=lerp(sx,tx,p)-Math.sin(p*Math.PI)*7,y=lerp(sy,ty,p*p);ellipse(g,x,y,.75,2.3,`rgba(235,242,216,${alpha*.7})`);}
  };
  if(state.experience==='free'&&state.mode==='auto'&&state.pattern==='wave'){for(let i=0;i<9;i++){const x=638+i*25;stream(x,40,x+Math.sin(t*2+i)*7,410,.7+state.stream*.015,Math.min(.38,state.stream/150),i*.13);}}
  else{const sx=state.mode==='manual'?ladle.x-31*Math.cos(ladle.angle):targetX-15,sy=state.mode==='manual'?ladle.y-31*Math.sin(ladle.angle):45;stream(sx,sy,targetX,targetY,clamp(state.stream*.06,1,3),.55);}
}
const mistArt=document.createElement('canvas');mistArt.width=128;mistArt.height=128;
{const g=mistArt.getContext('2d');for(let i=0;i<12;i++){const x=40+rnd()*48,y=40+rnd()*48,r=19+rnd()*23;const grad=g.createRadialGradient(x,y,0,x,y,r);grad.addColorStop(0,'#dbe2d549');grad.addColorStop(.45,'#dbe2d519');grad.addColorStop(1,'#dbe2d500');g.fillStyle=grad;g.fillRect(x-r,y-r,r*2,r*2);}}
function drawParticles(g,dt){
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(state.playing){p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.kind==='splash')p.vy+=140*dt;if(p.kind==='fall')p.vy+=200*dt;}if(p.life<=0||p.kind==='fall'&&p.y>440){particles.splice(i,1);continue;}
    if(p.kind==='steam'){
      const age=1-p.life/p.max,size=p.size*(1+age*3.5);g.save();g.translate(p.x,p.y);g.rotate(Math.sin(age*2+p.max)*.5);g.globalAlpha=Math.sin(age*Math.PI)*.22;g.drawImage(mistArt,-size,-size,size*2,size*2);g.restore();p.x+=Math.sin(state.simTime*.6+p.max)*dt*6;
    }else{const alpha=p.life/p.max;g.beginPath();g.moveTo(p.x-p.vx*.025,p.y-p.vy*.025);g.lineTo(p.x,p.y);g.strokeStyle=`rgba(195,223,209,${alpha*.55})`;g.lineWidth=p.size*.7;g.stroke();ellipse(g,p.x,p.y,p.size*.55,p.size*(p.kind==='fall'?1.5:.7),`rgba(236,235,199,${alpha*.85})`);}
  }
}
function drawAtmosphere(g){
  if(reducedMotion||state.experience==='meditation')return;
  // A few slow, faint motes in the light; no flashing or camera movement.
  g.save();for(let i=0;i<15;i++){const x=850+Math.sin(i*4.17+state.simTime*.025)*180,y=190+(i*43+state.simTime*(1+i%3))%330;ellipse(g,x,y,.6,.6,`rgba(235,217,166,${.045+Math.sin(i)*.02})`);}g.restore();
}

// Low-resolution light masks keep the soft illumination inexpensive on phones.
// The light follows actual water contacts, rather than a looping spotlight.
const dimLayer=document.createElement('canvas'),dimCtx=dimLayer.getContext('2d');
function drawAutoLighting(g,dt){
  const med=state.experience==='meditation';
  const target=med?(['rest','settling','finished'].includes(state.phase)?1:state.phase==='ritual'?.18:0):(state.started&&!state.ended&&state.mode==='auto'?1:0);
  state.autoDim=reducedMotion?target:lerp(state.autoDim,target,1-Math.exp(-dt/(med?2.6:1.1)));
  stones.forEach(s=>{s.lightShown=lerp(s.lightShown,s.light,1-Math.exp(-dt*5));});
  if(state.autoDim<.002)return;
  dimCtx.setTransform(1,0,0,1,0,0);dimCtx.clearRect(0,0,dimLayer.width,dimLayer.height);
  dimCtx.setTransform(dimLayer.width/view.w,0,0,dimLayer.height/view.h,0,0);
  dimCtx.globalCompositeOperation='source-over';dimCtx.fillStyle=`rgba(3,9,7,${state.autoDim*.7})`;dimCtx.fillRect(0,0,view.w,view.h);
  dimCtx.globalCompositeOperation='destination-out';
  for(const s of stones){
    const strength=Math.sqrt(s.lightShown);if(strength<.025)continue;
    const x=view.ox+s.x*view.s,y=view.oy+(s.y-8)*view.s,r=s.r*2.3*view.s;
    const pool=dimCtx.createRadialGradient(x,y,3*view.s,x,y,r);
    pool.addColorStop(0,`rgba(0,0,0,${strength*.94})`);pool.addColorStop(.35,`rgba(0,0,0,${strength*.72})`);pool.addColorStop(1,'rgba(0,0,0,0)');
    dimCtx.fillStyle=pool;dimCtx.fillRect(x-r,y-r,r*2,r*2);
  }
  dimCtx.globalCompositeOperation='source-over';
  g.save();g.setTransform(view.dpr,0,0,view.dpr,0,0);g.drawImage(dimLayer,0,0,view.w,view.h);
  // A very small warm reflection, like a concealed lamp grazing wet stone.
  g.globalCompositeOperation='screen';
  for(const s of stones){if(s.lightShown<.025)continue;const x=view.ox+(s.x+8)*view.s,y=view.oy+(s.y-17)*view.s,r=s.r*1.6*view.s;const light=g.createRadialGradient(x,y,0,x,y,r);light.addColorStop(0,`rgba(232,210,163,${s.lightShown*state.autoDim*.075})`);light.addColorStop(1,'rgba(232,210,163,0)');g.fillStyle=light;g.fillRect(x-r,y-r,r*2,r*2);}
  g.restore();
}
function resize(){const r=canvas.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);view.w=r.width;view.h=r.height;view.s=r.width<700?Math.min(r.height/760,r.width/700):r.height/760;view.ox=r.width*(r.width<700?.5:.65)-625*view.s;view.oy=Math.max(0,r.height-760*view.s)*.55;view.dpr=dpr;dimLayer.width=Math.max(1,Math.round(r.width*.5));dimLayer.height=Math.max(1,Math.round(r.height*.5));}
new ResizeObserver(resize).observe(canvas);resize();
function render(now){
  const dt=Math.min(.05,(now-previous)/1000);previous=now;
  ctx.setTransform(view.dpr,0,0,view.dpr,0,0);ctx.clearRect(0,0,view.w,view.h);ctx.drawImage(background,0,0,view.w,view.h);ctx.translate(view.ox,view.oy);ctx.scale(view.s,view.s);
  drawHeater(ctx);drawBucket(ctx);drawLadle(ctx,dt);drawStream(ctx);drawParticles(ctx,dt);drawAtmosphere(ctx);
  drawAutoLighting(ctx,dt);
  requestAnimationFrame(render);
}
requestAnimationFrame(render);
// Keep the session clock and audio moving independently of drawing. Browsers
// can throttle background timers, so recover wall time without a burst of sound.
let lastTick=performance.now();
setInterval(()=>{const now=performance.now(),delta=Math.max(0,(now-lastTick)/1000);lastTick=now;const step=Math.min(.2,delta);if(state.playing&&delta>step){const missed=delta-step;state.audibleTime+=missed;if(state.phase==='free'||state.phase==='rest')state.elapsed+=missed;if(state.phase==='settling')state.tailTime+=missed;if(state.ritualWait!==null)state.ritualWait-=missed;if(state.mode==='auto')state.autoClock+=missed;}simulate(step);},50);
// A small read-only diagnostic surface for checking physical invariants.
window.yohaku={snapshot:()=>({started:state.started,playing:state.playing,mode:state.mode,pattern:state.pattern,experience:state.experience,phase:state.phase,gain:state.sessionGain,tailTime:state.tailTime,water:state.water,elapsed:state.elapsed,pouring:state.pouring,secretFound:state.secretFound,lighting:{dim:state.autoDim,activeSpots:stones.filter(s=>s.light>.01).length},audioState:sound.ctx?.state||'not-started',stones:stones.map(s=>({x:s.x,y:s.y,lucky:s.lucky,surface:s.ts,core:s.tc,water:s.water,evaporation:s.evap,light:s.light})),particles:particles.length})};
})();
