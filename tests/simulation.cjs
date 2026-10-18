const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
let clock=0,tick,frame;
const gradient={addColorStop(){}};
const context=new Proxy({createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,ellipse(x,y,rx,ry){assert([x,y,rx,ry].every(Number.isFinite));assert(rx>=0&&ry>=0);}},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>(o[k]=v,true)});
class Element{
 constructor(id=''){this.id=id;this.style={};this.hidden=false;this.disabled=false;this.dataset={};this.events={};this.value='';this.textContent='';this.classList={add(){},remove(){},toggle(){}};this.nextElementSibling={textContent:''};this.firstChild={textContent:id};}
 addEventListener(n,f){(this.events[n]??=[]).push(f);}
 fire(n,data={}){for(const f of this.events[n]||[])f({preventDefault(){},...data});}
 getContext(){return context;}getBoundingClientRect(){return{width:1200,height:500,left:0,top:0};}setAttribute(){}setPointerCapture(){}showModal(){this.open=true;}close(){this.open=false;}querySelector(){return new Element();}
}
const elements={};for(const m of fs.readFileSync('public/index.html','utf8').matchAll(/id="([^"]+)"/g))elements[m[1]]=new Element(m[1]);
const patterns=['drops','thread','wave'].map(v=>{let b=new Element(v);b.dataset.pattern=v;return b;});
const durations=[5,10,20,0].map(v=>{let b=new Element();b.dataset.min=String(v);return b;});
const document={getElementById:id=>elements[id],createElement:()=>new Element(),body:new Element(),addEventListener(){},querySelectorAll:s=>s==='[data-pattern]'?patterns:s==='[data-min]'?durations:[]};
const param=()=>({value:0,setTargetAtTime(){},setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
const node=()=>({gain:param(),frequency:param(),Q:param(),pan:param(),threshold:param(),knee:param(),ratio:param(),attack:param(),release:param(),connect(){},disconnect(){},start(){},stop(){}});
class Audio{constructor(){this.sampleRate=8000;this.currentTime=0;this.destination={};this.state='running';}resume(){return Promise.resolve();}createGain(){return node();}createDynamicsCompressor(){return node();}createBiquadFilter(){return node();}createConvolver(){return node();}createStereoPanner(){return node();}createBufferSource(){return node();}createOscillator(){return node();}createBuffer(ch,len){const data=Array.from({length:ch},()=>new Float32Array(Math.ceil(len)));return{getChannelData:i=>data[i]};}}
const window={AudioContext:Audio,addEventListener(){}};
const sandbox={document,window,console,localStorage:{getItem(){return null;},setItem(){}},matchMedia:()=>({matches:false}),navigator:{},devicePixelRatio:1,performance:{now:()=>clock},requestAnimationFrame:f=>{frame=f;},setInterval:f=>{tick=f;},ResizeObserver:class{observe(){}}};
vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const snapshot=()=>window.yohaku.snapshot();
const advance=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){clock+=50;tick();if(i%20===0)frame(clock);}};
const invariant=()=>snapshot().stones.forEach(s=>{assert(Number.isFinite(s.surface)&&Number.isFinite(s.core));assert(s.water>=0);assert(s.evaporation>=0);assert(s.surface>90&&s.surface<400);});
(async()=>{
 frame(clock);
 await elements.enter.onclick();assert(snapshot().playing);assert.equal(snapshot().audioState,'running');
 const initial=snapshot().stones.map(s=>s.surface);
 elements.fill.onclick();assert.equal(snapshot().water,160);assert(!elements.pour.disabled);
 elements.pour.fire('keydown',{code:'Space',repeat:false});advance(2);elements.pour.fire('keyup',{code:'Space'});
 assert(snapshot().water<160&&snapshot().water>0);assert(!snapshot().pouring);
 assert(snapshot().stones.some((s,i)=>s.surface<initial[i]-5));
 const water=snapshot().water;advance(2);assert.equal(snapshot().water,water);invariant();
 elements.pour.fire('keydown',{code:'Space',repeat:false});advance(10);assert.equal(snapshot().water,0);assert(elements.pour.disabled);assert(!snapshot().pouring);
 elements.auto.onclick();assert.equal(snapshot().mode,'auto');advance(10);assert(snapshot().stones.some(s=>s.evaporation>0));invariant();
 patterns[1].onclick();advance(45);invariant();
 patterns[2].onclick();advance(1.5);assert(snapshot().stones.reduce((a,s)=>a+s.evaporation,0)>1);advance(60);assert(snapshot().stones.reduce((a,s)=>a+s.evaporation,0)>1);invariant();
 elements.pause.onclick();const elapsed=snapshot().elapsed;advance(3);assert.equal(snapshot().elapsed,elapsed);elements.pause.onclick();
 durations[0].onclick();advance(301);assert(!snapshot().playing);assert.equal(elements.ending.hidden,false);
 await elements.again.onclick();durations[3].onclick();advance(1201);assert(snapshot().playing);invariant();
 elements.manual.onclick();elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});elements.pour.fire('blur');assert(!snapshot().pouring);
 const before=snapshot().elapsed;clock+=15000;tick();assert(snapshot().elapsed>=before+15);
 console.log('PASS: audio initialization; fill/pour/release; local cooling; empty ladle; all 3 automatic patterns; 60-second repeat; pause/resume; timed fade/end; free session; focus loss; background clock; finite thermal states and non-negative water.');
})().catch(e=>{console.error(e);process.exitCode=1;});

