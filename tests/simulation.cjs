const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let clock=0,tick,frame,focusedId,storedPrefs=JSON.stringify({duration:10,restDuration:3,guide:true,volume:45});
const gradient={addColorStop(){}};
const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,ellipse(x,y,rx,ry){assert([x,y,rx,ry].every(Number.isFinite));assert(rx>=0&&ry>=0);}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
class Element{
 constructor(id=''){this.id=id;this.style={};this.hidden=false;this.disabled=false;this.dataset={};this.events={};this.value='';this.textContent='';this.classList={add(){},remove(){},toggle(){}};this.nextElementSibling={textContent:''};this.firstChild={textContent:id};}
 addEventListener(n,f){(this.events[n]??=[]).push(f);}
 fire(n,data={}){for(const f of this.events[n]||[])f({preventDefault(){},...data});}
 focus(){focusedId=this.id;}
 getContext(){return context;}getBoundingClientRect(){return{width:1200,height:500,left:0,top:0};}setAttribute(){}setPointerCapture(){}showModal(){this.open=true;}close(){this.open=false;}querySelector(){return new Element();}
}
const elements={};for(const m of fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g))elements[m[1]]=new Element(m[1]);
const patterns=['drops','thread','wave'].map(v=>{let b=new Element(v);b.dataset.pattern=v;return b;});
const durations=[5,10,20,0].map(v=>{let b=new Element();b.dataset.min=String(v);return b;});
const document={getElementById:id=>elements[id],createElement:()=>new Element(),body:new Element(),addEventListener(){},querySelectorAll:s=>s==='[data-pattern]'?patterns:s==='[data-min]'?durations:[]};
const param=()=>({value:0,setTargetAtTime(v){this.value=v;},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),pan:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(){}});
class Audio{constructor(){this.sampleRate=8000;this.currentTime=0;this.destination={};this.state='running';}resume(){return Promise.resolve();}createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}createConvolver(){return node();}createStereoPanner(){return node();}createBufferSource(){return node();}createOscillator(){return node();}createBuffer(ch,len){const data=Array.from({length:ch},()=>new Float32Array(Math.ceil(len)));return{getChannelData:i=>data[i]};}}
const window={AudioContext:Audio,addEventListener(){}};
const sandbox={document,window,console,localStorage:{getItem(){return storedPrefs;},setItem(k,v){storedPrefs=v;}},matchMedia:()=>({matches:false}),navigator:{},devicePixelRatio:1,performance:{now:()=>clock},requestAnimationFrame:f=>{frame=f;},setInterval:f=>{tick=f;},ResizeObserver:class{observe(){}}};
vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const snapshot=()=>window.yohaku.snapshot();
const advance=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){clock+=50;tick();if(i%20===0)frame(clock);}};
const invariant=()=>snapshot().stones.forEach(s=>{assert(Number.isFinite(s.surface)&&Number.isFinite(s.core));assert(s.water>=0);assert(s.evaporation>=0);assert(s.surface>90&&s.surface<400);assert(Number.isFinite(s.light)&&s.light>=0&&s.light<=1);});
(async()=>{
 frame(clock);
 await elements.manualEnter.onclick();assert(snapshot().playing);assert.equal(snapshot().audioState,'running');assert.equal(snapshot().mode,'manual');assert.equal(snapshot().duration,0);assert.equal(JSON.parse(storedPrefs).modeVersion,2);
 const initial=snapshot().stones.map(s=>s.surface);
 elements.fill.onclick();assert.equal(snapshot().water,160);assert(!elements.pour.disabled);
 elements.pour.fire('keydown',{code:'Space',repeat:false});advance(2);elements.pour.fire('keyup',{code:'Space'});
 assert(snapshot().water<160&&snapshot().water>0);assert(!snapshot().pouring);
 assert(snapshot().stones.some((s,i)=>s.surface<initial[i]-5));
 const water=snapshot().water;advance(2);assert.equal(snapshot().water,water);invariant();
 elements.pour.fire('keydown',{code:'Space',repeat:false});advance(10);assert.equal(snapshot().water,0);assert(elements.pour.disabled);assert(!snapshot().pouring);
 elements.fill.onclick();const lucky=snapshot().stones.find(s=>s.lucky);const scale=500/760,offset=1200*.65-625*scale;
 elements.scene.fire('pointerdown',{pointerId:7,clientX:offset+lucky.x*scale,clientY:lucky.y*scale});advance(1);elements.scene.fire('pointerup',{pointerId:7});assert(snapshot().secretFound);assert(!snapshot().pouring);
 elements.auto.onclick();assert.equal(snapshot().mode,'auto');
 elements.scene.fire('pointerdown',{pointerId:8,clientX:offset+752*scale,clientY:603*scale});assert(elements.announcement.textContent.includes('会議はありません'));assert(!snapshot().pouring);
 let reacted=false;for(let i=0;i<100;i++){advance(.1);reacted||=snapshot().stones.some(s=>s.evaporation>0);}assert(reacted);assert(snapshot().lighting.dim>.95);assert(snapshot().lighting.activeSpots>0);invariant();
 // Rain drops leave 8–20 seconds between events, with slowly changing gaps.
 patterns[0].onclick();const dropTimes=[];let scheduled=snapshot().nextDrop;
 for(let i=0;i<1200;i++){advance(.1);const next=snapshot().nextDrop;if(next!==scheduled){dropTimes.push(snapshot().elapsed);scheduled=next;}}
 const gaps=dropTimes.slice(1).map((t,i)=>t-dropTimes[i]);assert(gaps.length>=5);assert(gaps.every(g=>g>=7.9&&g<=20.2));assert(Math.max(...gaps)-Math.min(...gaps)>.5);invariant();
 // Each long-form auto mode must finish its tail before a long room-only gap.
 for(const pattern of [patterns[1],patterns[2]]){
  pattern.onclick();let priorPhase='',spaceStarted=0,pours=0,completedSpaces=0,tailStarted=0,tailLevel=0,checkedTail=false,tailChecks=0;
  for(let i=0;i<1800;i++){
   advance(.1);const snap=snapshot(),phase=snap.autoCycle.phase;
   if(phase==='space'&&priorPhase!=='space'){assert.equal(snap.waterLevel,0);spaceStarted=snap.elapsed;}
   if(phase==='pour'&&priorPhase!=='pour'){
    pours++;if(pours>1){assert(snap.elapsed-spaceStarted>=19.8);completedSpaces++;}
   }
   if(phase==='tail'&&priorPhase==='pour'){tailStarted=snap.elapsed;tailLevel=snap.waterLevel;checkedTail=false;}
   if(phase==='tail'&&tailLevel>.001&&!checkedTail&&snap.elapsed-tailStarted>=10){assert(snap.waterLevel>0&&snap.waterLevel<tailLevel*.9,JSON.stringify({pattern:pattern.dataset.pattern,tailLevel,level:snap.waterLevel,evap:snap.stones.reduce((sum,s)=>sum+s.evaporation,0)}));checkedTail=true;tailChecks++;}
   if(phase!=='pour')assert.equal(snap.stream,0);
   if(phase==='space'){assert.equal(snap.waterLevel,0);assert(snap.roomLevel>=.025*.975&&snap.roomLevel<=.025*1.025);}else if(phase===priorPhase)assert.equal(snap.roomLevel,.025);
   priorPhase=phase;
  }
  assert(pours>=2);assert(completedSpaces>=1);assert(tailChecks>=1);invariant();
 }

 elements.pause.onclick();const elapsed=snapshot().elapsed;advance(3);assert.equal(snapshot().elapsed,elapsed);elements.pause.onclick();
 durations.find(b=>b.dataset.min==='5').onclick();advance(301);assert(!snapshot().playing);assert.equal(elements.ending.hidden,false);
 elements.backEntrance.onclick();await elements.manualEnter.onclick();durations.find(b=>b.dataset.min==='0').onclick();advance(1201);assert(snapshot().playing);invariant();
 elements.manual.onclick();elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});elements.pour.fire('blur');assert(!snapshot().pouring);
 for(let i=0;i<110;i++){clock+=50;tick();frame(clock);}assert(snapshot().lighting.dim<.02);invariant();
 const before=snapshot().elapsed;clock+=15000;tick();assert(snapshot().elapsed>=before+15);
 // Only two entry points, and neither a partial nor an empty cup changes mode.
 assert(!elements.restEnter&&!elements.enter&&!elements.freeEnter&&!elements.ritualActions&&!elements.restControls);
 elements.finish.onclick();assert.equal(snapshot().phase,'settling');advance(21);assert.equal(snapshot().phase,'finished');assert.equal(focusedId,'endingTitle');for(let i=0;i<120;i++){clock+=50;tick();frame(clock);}assert(snapshot().lighting.dim>.8);
 elements.backEntrance.onclick();assert.equal(focusedId,'manualEnter');await elements.manualEnter.onclick();assert.equal(focusedId,'fill');
 elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});advance(.8);elements.pour.fire('keyup',{code:'Space'});advance(8);assert.equal(snapshot().mode,'manual');assert(snapshot().water>0);
 elements.pour.fire('keydown',{code:'Space',repeat:false});advance(10);assert.equal(snapshot().water,0);advance(20);assert.equal(snapshot().mode,'manual');assert.equal(snapshot().phase,'free');
 elements.finish.onclick();advance(21);elements.backEntrance.onclick();await elements.autoEnter.onclick();assert.equal(snapshot().mode,'auto');assert.equal(focusedId,'auto');assert.equal(snapshot().duration,0);advance(1201);assert(snapshot().playing);assert.equal(snapshot().phase,'free');
 elements.pause.onclick();const held=snapshot();advance(5);assert.equal(snapshot().elapsed,held.elapsed);elements.finish.onclick();assert.equal(snapshot().phase,'finished');assert(!snapshot().playing);assert.equal(focusedId,'endingTitle');
 await elements.again.onclick();assert.equal(snapshot().mode,'auto');assert(snapshot().playing);elements.manual.onclick();assert.equal(snapshot().mode,'manual');elements.auto.onclick();assert.equal(snapshot().mode,'auto');
 durations.find(b=>b.dataset.min==='10').onclick();assert.equal(snapshot().duration,10);
 const reloadedWindow={...window};vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),{...sandbox,window:reloadedWindow,setInterval(){},requestAnimationFrame(){}});assert.equal(reloadedWindow.yohaku.snapshot().duration,10);
 console.log('PASS: two-mode entry; legacy timer migration to unlimited; timer persistence; manual never auto-switches; unlimited auto; pause and quiet endings; rain gaps; thread/wave fading tails and long room-only gaps; bounded room drift; thermal/render invariants; lighting; keyboard and background clock.');
})().catch(e=>{console.error(e);process.exitCode=1;});
