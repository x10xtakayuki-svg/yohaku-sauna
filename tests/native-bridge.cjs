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
const commands=[],listeners={};const window={YohakuNative:{send:c=>commands.push(c)},AudioContext:class{constructor(){throw Error('Web Audio must not start in a native app');}},addEventListener:(name,fn)=>listeners[name]=fn};
const sandbox={document,window,console,localStorage:{getItem(){return storedPrefs;},setItem(k,v){storedPrefs=v;}},matchMedia:()=>({matches:false}),navigator:{},devicePixelRatio:1,performance:{now:()=>clock},requestAnimationFrame:f=>{frame=f;},setInterval:f=>{tick=f;},ResizeObserver:class{observe(){}}};
vm.runInNewContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const snapshot=()=>window.yohaku.snapshot();
const advance=seconds=>{for(let i=0;i<Math.ceil(seconds/.05);i++){clock+=50;tick();if(i%20===0)frame(clock);}};
const invariant=()=>snapshot().stones.forEach(s=>{assert(Number.isFinite(s.surface)&&Number.isFinite(s.core));assert(s.water>=0);assert(s.evaporation>=0);assert(s.surface>90&&s.surface<400);assert(Number.isFinite(s.light)&&s.light>=0&&s.light<=1);});
(async()=>{
 await elements.autoEnter.onclick();assert.equal(snapshot().audioState,'native');assert(commands.some(c=>c.type==='start'&&c.mode==='auto'));assert(commands.some(c=>c.type==='duration'&&c.value===0));
 advance(600);assert.equal(snapshot().elapsed,0); // No JS authority over native time.
 const stones=snapshot().stones.map(s=>({x:s.x,y:s.y,surface:310,core:350,water:0,evaporation:0,wet:0,light:0}));
 const nativeState={version:1,started:true,playing:true,pouring:false,mode:'auto',pattern:'thread',phase:'free',elapsed:135,gain:1,water:0,stream:0,pourX:745,pourY:405,tailTime:0,stones};
 const sent=commands.length;listeners['yohaku-native-state']({detail:nativeState});assert.equal(commands.length,sent);assert.equal(snapshot().elapsed,135);advance(80);assert.equal(snapshot().elapsed,135);assert.equal(snapshot().pattern,'thread');
 listeners['yohaku-native-state']({detail:{...nativeState,elapsed:NaN}});assert.equal(snapshot().elapsed,135);
 elements.pause.onclick();assert(commands.some(c=>c.type==='playing'&&c.value===false));
 listeners['yohaku-native-state']({detail:{...nativeState,playing:false}});assert(!snapshot().playing);
 elements.pause.onclick();elements.manual.onclick();listeners['yohaku-native-state']({detail:{...nativeState,mode:'manual'}});elements.fill.onclick();elements.pour.fire('keydown',{code:'Space',repeat:false});elements.pour.fire('keyup',{code:'Space'});assert(commands.some(c=>c.type==='fill'));assert(commands.some(c=>c.type==='pour'));assert(commands.some(c=>c.type==='stopPour'));
 elements.quickVolume.value='24';elements.quickVolume.fire('input');assert(commands.some(c=>c.type==='settings'&&c.volume===24));
 elements.finish.onclick();assert(commands.some(c=>c.type==='finish'));listeners['yohaku-native-state']({detail:{...nativeState,phase:'finished',playing:false,gain:0}});assert.equal(snapshot().phase,'finished');assert.equal(elements.ending.hidden,false);
 elements.backEntrance.onclick();assert(commands.some(c=>c.type==='stop'));listeners['yohaku-native-state']({detail:nativeState});assert.equal(snapshot().phase,'idle'); // Ignore a stale running snapshot after stop.
 listeners['yohaku-native-state']({detail:{...nativeState,started:false,playing:false,phase:'idle'}});await elements.autoEnter.onclick();listeners['yohaku-native-error']({detail:{message:'Cannot start'}});assert(!snapshot().started);assert.equal(elements.welcome.hidden,false);
 console.log('PASS: native bridge commands; no Web Audio or JS simulation; authoritative foreground restore; no command echo; pause/remote state; volume; finish; stale/invalid snapshot rejection; native errors.');
})().catch(e=>{console.error(e);process.exitCode=1;});
