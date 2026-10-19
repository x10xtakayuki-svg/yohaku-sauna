const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let clock=0,tick,frame,focusedId;
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
const durations=[3,5,10,20,0].map(v=>{let b=new Element();b.dataset.min=String(v);return b;});
const document={getElementById:id=>elements[id],createElement:()=>new Element(),body:new Element(),addEventListener(){},querySelectorAll:s=>s==='[data-pattern]'?patterns:s==='[data-min]'?durations:[]};
const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),pan:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(){}});
class Audio{constructor(){this.sampleRate=8000;this.currentTime=0;this.destination={};this.state='running';}resume(){return Promise.resolve();}createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}createConvolver(){return node();}createStereoPanner(){return node();}createBufferSource(){return node();}createOscillator(){return node();}createBuffer(ch,len){const data=Array.from({length:ch},()=>new Float32Array(Math.ceil(len)));return{getChannelData:i=>data[i]};}}
const window={AudioContext:Audio,addEventListener(){}};
const sandbox={document,window,console,localStorage:{getItem(){return null;},setItem(){}},matchMedia:()=>({matches:false}),navigator:{},devicePixelRatio:1,performance:{now:()=>clock},requestAnimationFrame:f=>{frame=f;},setInterval:f=>{tick=f;},ResizeObserver:class{observe(){}}};
vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const snapshot=()=>window.yohaku.snapshot();
const advance=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){clock+=50;tick();if(i%20===0)frame(clock);}};
const invariant=()=>snapshot().stones.forEach(s=>{assert(Number.isFinite(s.surface)&&Number.isFinite(s.core));assert(s.water>=0);assert(s.evaporation>=0);assert(s.surface>90&&s.surface<400);assert(Number.isFinite(s.light)&&s.light>=0&&s.light<=1);});
(async()=>{
 frame(clock);
 await elements.freeEnter.onclick();assert(snapshot().playing);assert.equal(snapshot().audioState,'running');assert.equal(snapshot().experience,'free');
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
 patterns[1].onclick();advance(45);invariant();
 patterns[2].onclick();advance(1.5);assert(snapshot().stones.reduce((a,s)=>a+s.evaporation,0)>1);advance(60);assert(snapshot().stones.reduce((a,s)=>a+s.evaporation,0)>1);invariant();
 elements.pause.onclick();const elapsed=snapshot().elapsed;advance(3);assert.equal(snapshot().elapsed,elapsed);elements.pause.onclick();
 durations.find(b=>b.dataset.min==='5').onclick();advance(301);assert(!snapshot().playing);assert.equal(elements.ending.hidden,false);
 elements.backEntrance.onclick();await elements.freeEnter.onclick();durations.find(b=>b.dataset.min==='0').onclick();advance(1201);assert(snapshot().playing);invariant();
 elements.manual.onclick();elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});elements.pour.fire('blur');assert(!snapshot().pouring);
 for(let i=0;i<110;i++){clock+=50;tick();frame(clock);}assert(snapshot().lighting.dim<.02);invariant();
 const before=snapshot().elapsed;clock+=15000;tick();assert(snapshot().elapsed>=before+15);
 // Evening ritual has its own clock and never interrupts a partial pour.
 elements.backEntrance.onclick();await elements.enter.onclick();assert.equal(snapshot().phase,'ritual');assert.equal(snapshot().gain,0);advance(15);assert.equal(snapshot().elapsed,0);
 elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});advance(.8);elements.pour.fire('keyup',{code:'Space'});advance(8);assert.equal(snapshot().phase,'ritual');assert(snapshot().water>0);
 elements.putBack.onclick();assert.equal(snapshot().phase,'rest');assert.equal(snapshot().elapsed,0);assert.equal(elements.restControls.hidden,false);
 const leftInLadle=snapshot().water;elements.scene.fire('pointerdown',{pointerId:9,clientX:offset+745*scale,clientY:405*scale});assert.equal(elements.restPanel.hidden,false);assert(!snapshot().pouring);assert.equal(snapshot().water,leftInLadle);
 elements.restPause.onclick();const restElapsed=snapshot().elapsed;advance(5);assert.equal(snapshot().elapsed,restElapsed);assert.equal(elements.restPause.textContent,'再開する');elements.restPause.onclick();
 advance(161);assert.equal(snapshot().phase,'settling');assert.equal(snapshot().pouring,false);advance(21);assert.equal(snapshot().phase,'finished');assert.equal(snapshot().gain,0);assert(snapshot().lighting.dim>.8);assert.equal(elements.ending.hidden,false);
 elements.backEntrance.onclick();assert.equal(snapshot().phase,'idle');assert.equal(elements.welcome.hidden,false);
 await elements.restEnter.onclick();assert.equal(snapshot().phase,'rest');assert.equal(focusedId,'restPause');advance(9);assert.equal(elements.restCue.hidden,true);assert(snapshot().gain>.99);assert.equal(snapshot().secretFound,true);
 // Unequal water phrases have long gaps while the room bed keeps playing.
 advance(11);assert.equal(snapshot().stream,0);assert(snapshot().playing);advance(15);assert(snapshot().stream>0);advance(15);assert.equal(snapshot().stream,0);advance(18);assert(snapshot().stream>0);
 elements.finishEarly.onclick();assert.equal(snapshot().phase,'settling');advance(6);assert(snapshot().playing);assert(snapshot().gain>.9);assert.match(elements.restTime.textContent,/00:1[45]/);advance(15);assert.equal(snapshot().phase,'finished');assert.equal(snapshot().gain,0);
 // Emptying a complete cup hands off only after the last pour and its tail.
 elements.backEntrance.onclick();await elements.enter.onclick();assert.equal(focusedId,'fill');elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});advance(6.3);assert.equal(snapshot().phase,'ritual');assert.equal(snapshot().water,0);advance(3.5);assert.equal(snapshot().phase,'rest');invariant();
 elements.restPause.onclick();elements.finishEarly.onclick();assert.equal(snapshot().phase,'finished');assert(!snapshot().playing);assert.equal(focusedId,'endingTitle');
 elements.backEntrance.onclick();assert.equal(focusedId,'restEnter');await elements.restEnter.onclick();elements.restPause.onclick();assert.equal(elements.anotherPour.textContent,'再開して、もう一杯');elements.anotherPour.onclick();assert.equal(snapshot().phase,'ritual');assert(snapshot().playing);elements.fill.onclick();assert.equal(snapshot().water,160);
 console.log('PASS: free/manual/auto regression; thermal and render invariants; lighting; partial cup remains manual; explicit/empty-cup handoff; one-tap rest; independent clocks; pause; first tap consumed; gradual entry; supply-free ending; dark finished room; background clock.');
})().catch(e=>{console.error(e);process.exitCode=1;});
