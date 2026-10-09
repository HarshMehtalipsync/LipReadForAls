/* Shared code for the live page and the training page.
   Video never leaves the device. Only lip measurements of taught clips are stored, in this browser. */
(function(){
"use strict";
var LO=[61,146,91,181,84,17,314,405,321,375,291,409,270,269,267,0,37,39,40,185];
var LI=[78,95,88,178,87,14,317,402,318,324,308,415,310,311,312,13,82,81,80,191];
var ER=33, EL=263, FPS=20, MAXCLIPS=10, STORE="lipcue.v4";
var PAIRS=[[13,14],[0,17],[78,308],[61,291],[0,2],[152,2],[81,178],[311,402],[82,87],[312,317],[61,2],[291,2]], F=PAIRS.length;
var DEFAULTS=[{k:"water",g:"મને પાણી જોઈએ છે",m:"I want water"},{k:"pain",g:"મને દુખે છે",m:"I am in pain"},
  {k:"light",g:"લાઈટ બંધ કરો",m:"Turn off the light"},{k:"howareyou",g:"તમે કેમ છો?",m:"How are you?"}];
var S={cues:[],bank:{}}, limit=0;
function num(a,b){return a-b;}
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim();}
function d2(p,a,b){return Math.hypot(p[2*a]-p[2*b],p[2*a+1]-p[2*b+1]);}
/* Raw lip distances in pixels, plus the eye distance as the last value. The eye distance is only used as a
   slowly changing size reference, so a covered or badly estimated eye does not shake the lip measurements. */
function measure(p){var o=new Float32Array(F+1);for(var i=0;i<F;i++)o[i]=d2(p,PAIRS[i][0],PAIRS[i][1]);o[F]=d2(p,ER,EL)+1e-6;return o;}

/* ---------- lip measurements -> comparable sequence ---------- */
function features(seq){
  seq=seq.slice(); var n=seq.length,i,j,k;
  if(n<Math.round(0.5*FPS)||seq.filter(Boolean).length<Math.max(6,n*0.7)) return {err:"face"};
  for(i=0;i<n;i++){ if(seq[i]) continue;
    var a=-1,b=-1; for(k=i-1;k>=0;k--) if(seq[k]){a=k;break;} for(k=i+1;k<n;k++) if(seq[k]){b=k;break;}
    var o=new Float32Array(F+1);
    if(a<0) o.set(seq[b]); else if(b<0) o.set(seq[a]); else { var w=(i-a)/(b-a); for(j=0;j<=F;j++) o[j]=seq[a][j]*(1-w)+seq[b][j]*w; }
    seq[i]=o;
  }
  var raw=seq, half=Math.round(0.5*FPS);
  seq=raw.map(function(r,i){ var s=0,c=0; for(var q=Math.max(0,i-half);q<=Math.min(n-1,i+half);q++){s+=raw[q][F];c++;} s/=c;
    var o=new Float32Array(F); for(var j=0;j<F;j++) o[j]=r[j]/s; return o; });
  var sm=seq.map(function(_,i){var o=new Float32Array(F),x=seq[Math.max(0,i-1)],y=seq[i],z=seq[Math.min(n-1,i+1)];for(var j=0;j<F;j++)o[j]=(x[j]+2*y[j]+z[j])/4;return o;});
  for(j=0;j<F;j++){ var col=sm.map(function(r){return r[j];}).sort(num), med=col[Math.floor(n/2)]; for(i=0;i<n;i++) sm[i][j]-=med; }
  var op=sm.map(function(r){return r[0];}); if(Math.max.apply(null,op)-Math.min.apply(null,op)<0.03) return {err:"still"};
  var e=[0]; for(i=1;i<n;i++){var s=0;for(j=0;j<F;j++)s+=Math.abs(sm[i][j]-sm[i-1][j]);e.push(s);}
  var es=e.map(function(_,i){var s=0,c=0;for(var q=-2;q<=2;q++){if(e[i+q]!==undefined){s+=e[i+q];c++;}}return s/c;});
  var peak=es.slice().sort(num)[Math.floor((n-1)*0.95)]||0, on=[];
  es.forEach(function(x,i){if(x>0.2*peak)on.push(i);});
  var pad=Math.round(0.15*FPS), a0=0, b0=n;
  if(on.length){ a0=Math.max(0,on[0]-pad); b0=Math.min(n,on[on.length-1]+pad+1); if(b0-a0<Math.round(0.4*FPS)){a0=0;b0=n;} }
  var cut=sm.slice(a0,b0), L=cut.length, rms=0;
  for(i=0;i<L;i++) for(j=0;j<F;j++) rms+=cut[i][j]*cut[i][j];
  rms=Math.sqrt(rms/(L*F))+1e-6;
  var out=[];
  for(i=0;i<L;i++){ var r=new Float32Array(F*2), pv=cut[Math.max(0,i-1)], nx=cut[Math.min(L-1,i+1)];
    for(j=0;j<F;j++){ r[j]=cut[i][j]/rms; r[F+j]=(nx[j]-pv[j])/rms*1.5; } out.push(r); }
  return {seq:out,secs:L/FPS};
}
function dist(a,b){
  var n=a.length,m=b.length,w=Math.ceil(0.25*Math.max(n,m))+2,INF=1e18,prev=new Float64Array(m+1).fill(INF),cur=new Float64Array(m+1);
  prev[0]=0;
  for(var i=1;i<=n;i++){ cur.fill(INF); var c=Math.round(i*m/n), lo=Math.max(1,c-w), hi=Math.min(m,c+w);
    for(var j=lo;j<=hi;j++){ var s=0,x=a[i-1],y=b[j-1]; for(var k=0;k<x.length;k++){var e=x[k]-y[k];s+=e*e;}
      cur[j]=Math.sqrt(s)+Math.min(prev[j],prev[j-1],cur[j-1]); }
    var t=prev;prev=cur;cur=t; }
  return prev[m]/(n+m);
}
function clips(c){return S.bank[c.k]||[];}
function taught(){return S.cues.filter(function(c){return clips(c).length>=2;}).length;}
function scoreAgainst(seq,skip){
  return S.cues.map(function(c){ var ds=clips(c).filter(function(x){return x!==skip;}).map(function(x){return dist(seq,x);}).sort(num);
    return {c:c,d:ds.length?(ds.length>1?(ds[0]+ds[1])/2:ds[0]):Infinity}; }).sort(function(a,b){return a.d-b.d;});
}
function review(){
  var own=[], tot=0, hit=0, miss={}, ready=taught()>=2;
  S.cues.forEach(function(c){ clips(c).forEach(function(x){
    var o=clips(c).filter(function(y){return y!==x;}).map(function(y){return dist(x,y);}).sort(num); if(o.length) own.push(o[0]);
    if(ready&&clips(c).length>=2){ var sc=scoreAgainst(x,x); tot++;
      if(sc[0].c===c) hit++; else { var key="“"+c.g+"” read as “"+sc[0].c.g+"”"; miss[key]=(miss[key]||0)+1; } } }); });
  own.sort(num); limit=own.length>=4?own[Math.floor((own.length-1)*0.9)]*1.6:0;
  return {tot:tot,hit:hit,miss:miss};
}
function classify(seq){
  if(taught()<2) return null;
  var sc=scoreAgainst(seq,null).filter(function(s){return isFinite(s.d);});
  var inv=sc.map(function(s){return 1/(s.d+1e-6);}), tot=inv.reduce(function(a,b){return a+b;},0);
  sc.forEach(function(s,i){s.share=inv[i]/tot;});
  return {ranked:sc, close:sc.length>1&&sc[1].d/sc[0].d<1.1, far:limit>0&&sc[0].d>limit};
}

/* ---------- storage ---------- */
function pack(){
  var b={}; S.cues.forEach(function(c){ b[c.k]=clips(c).map(function(s){return s.map(function(r){return Array.prototype.map.call(r,function(x){return Math.round(x*1000)/1000;});});}); });
  return {version:4,cues:S.cues,bank:b};
}
function unpack(o){
  if(!o||!Array.isArray(o.cues)) return false;
  var cues=[],bank={};
  o.cues.forEach(function(c){ if(!c||typeof c.k!=="string"||typeof c.g!=="string"||!c.g.trim()) return;
    cues.push({k:c.k,g:c.g.slice(0,120),m:String(c.m||"").slice(0,120)}); bank[c.k]=[];
    ((o.bank||{})[c.k]||[]).forEach(function(s){
      if(Array.isArray(s)&&s.length>5&&s.every(function(r){return Array.isArray(r)&&r.length===F*2&&r.every(function(x){return typeof x==="number"&&isFinite(x);});}))
        bank[c.k].push(s.map(function(r){return Float32Array.from(r);})); }); });
  if(!cues.length) return false;
  S.cues=cues; S.bank=bank; return true;
}
function save(){ try{ localStorage.setItem(STORE,JSON.stringify(pack())); return true; }catch(e){ return false; } }
function load(){
  var ok=false; try{ ok=unpack(JSON.parse(localStorage.getItem(STORE)||"null")); }catch(e){}
  if(!ok){ S.cues=DEFAULTS.map(function(c){return {k:c.k,g:c.g,m:c.m};}); S.bank={}; S.cues.forEach(function(c){S.bank[c.k]=[];}); }
  review(); return ok;
}
function addClip(c,seq){ var b=S.bank[c.k]||(S.bank[c.k]=[]); b.push(seq); if(b.length>MAXCLIPS) b.shift(); var ok=save(); review(); return ok; }
function popClip(c){ clips(c).pop(); save(); review(); }
function addCue(g,m){ var c={k:"c"+Date.now().toString(36),g:g.trim().slice(0,120),m:(m||"").trim().slice(0,120)}; S.cues.push(c); S.bank[c.k]=[]; save(); return c; }
function removeCue(c){ S.cues=S.cues.filter(function(x){return x!==c;}); delete S.bank[c.k]; save(); review(); }

/* ---------- speech ---------- */
var synth=window.speechSynthesis||null, voices=[];
function loadVoices(){ try{voices=synth?synth.getVoices():[];}catch(e){voices=[];} }
if(synth){ loadVoices(); try{synth.addEventListener("voiceschanged",loadVoices);}catch(e){} }
function pick(pref){ return voices.filter(function(v){return String(v.lang||"").toLowerCase().replace("_","-").indexOf(pref)===0;})[0]||null; }
function toDeva(s){ return s.replace(/[઀-૿]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0x180);}); }
function prime(){ if(!synth||!window.SpeechSynthesisUtterance) return; try{ var u=new SpeechSynthesisUtterance(" "); u.volume=0; synth.speak(u);}catch(e){} }
function speak(text){
  if(!synth||!window.SpeechSynthesisUtterance) return "This browser cannot speak text aloud.";
  loadVoices(); var gu=pick("gu"), hi=pick("hi"), lang="gu-IN", msg;
  if(gu) msg="Spoken with this device's Gujarati voice.";
  else if(hi){ text=toDeva(text); lang="hi-IN"; msg="No Gujarati voice on this device, so a Hindi voice is reading it. Pronunciation is approximate."; }
  else msg="No Gujarati voice was found on this device, so you may hear nothing.";
  try{ synth.cancel(); var u=new SpeechSynthesisUtterance(text); u.lang=lang; if(gu||hi) u.voice=gu||hi; u.rate=0.9; synth.speak(u); }
  catch(e){ msg="The voice did not play on this device."; }
  return msg;
}

/* ---------- tracker ---------- */
var fm=null, lastRes=null;
async function tracker(){
  if(fm) return fm;
  if(!window.FaceMesh) throw new Error("The tracker files did not load.");
  var m=new FaceMesh({locateFile:function(f){return "fm/"+f+(/\.(data|binarypb)$/.test(f)?".wasm":"");}});
  m.setOptions({maxNumFaces:1,refineLandmarks:false,minDetectionConfidence:0.3,minTrackingConfidence:0.3});
  m.onResults(function(r){lastRes=r;});
  await m.initialize(); fm=m; return m;
}
async function track(cv){
  lastRes=null; await fm.send({image:cv});
  var lm=lastRes&&lastRes.multiFaceLandmarks&&lastRes.multiFaceLandmarks[0]; if(!lm) return null;
  var p=new Float32Array(lm.length*2); for(var j=0;j<lm.length;j++){p[2*j]=lm[j].x*cv.width;p[2*j+1]=lm[j].y*cv.height;} return p;
}

/* ---------- live camera with a rolling buffer ---------- */
var cam={on:false,stream:null,working:false,wake:null,o:null}, buf=[], wc=document.createElement("canvas");
var det={state:"idle",es:0,ema:null,lastT:0,onCount:0,quiet:0,start:0,hist:[],floor:0.02,cool:0}, rate={t:0,n:0,f:0};
function resample(t0,t1){
  var out=[],j=0;
  for(var t=t0;t<=t1;t+=1000/FPS){
    while(j<buf.length-1&&buf[j+1].t<=t) j++;
    var a=buf[j],b=buf[j+1];
    if(!a||a.t>t){ out.push(null); continue; }
    if(!b){ out.push(a.m&&t-a.t<150?a.m:null); continue; }
    if(!a.m||!b.m||b.t-a.t>300){ out.push(a.m&&t-a.t<80?a.m:null); continue; }
    var w=(t-a.t)/(b.t-a.t),o=new Float32Array(F+1); for(var k=0;k<=F;k++) o[k]=a.m[k]*(1-w)+b.m[k]*w; out.push(o);
  }
  return out;
}
function fire(t0,t1,manual){
  var rs=resample(t0,t1); while(rs.length&&!rs[0]) rs.shift(); while(rs.length&&!rs[rs.length-1]) rs.pop();
  var ft=features(rs), o=cam.o||{};
  if(ft.err){ if(o.miss) o.miss(ft.err,manual); return; }
  det.cool=t1+1200; if(o.segment) o.segment(ft,manual);
}
function onSample(t,pts){
  var m=pts?measure(pts):null; buf.push({t:t,m:m}); while(buf.length&&buf[0].t<t-12000) buf.shift();
  if(!m){ det.ema=null; return; }
  var mm=new Float32Array(F); for(var q=0;q<F;q++) mm[q]=m[q]/m[F];
  if(!det.ema){ det.ema=mm; det.lastT=t; return; }
  var dt=Math.max(10,t-det.lastT), e=0; det.lastT=t;
  for(var k=0;k<F;k++){ var nv=0.5*det.ema[k]+0.5*mm[k]; e+=Math.abs(nv-det.ema[k]); det.ema[k]=nv; }
  det.es=0.6*det.es+0.4*(e/dt*50);
  var on=Math.max(0.035,3*det.floor), off=on*0.6;
  if(cam.o&&cam.o.auto===false) return;
  if(t<det.cool){ det.state="idle"; det.onCount=0; return; }
  if(det.state==="idle"){
    if(det.es>on){ if(++det.onCount>=3){ det.state="moving"; det.start=t-250; det.quiet=0; } }
    else { det.onCount=0; det.hist.push(det.es); if(det.hist.length>200) det.hist.shift();
      if(det.hist.length>20){ var s=det.hist.slice().sort(num); det.floor=s[Math.floor(s.length/2)]; } }
  } else {
    if(det.es<off){ if(!det.quiet) det.quiet=t; else if(t-det.quiet>700){ det.state="idle"; det.onCount=0; fire(det.start-400,t-300,false); } }
    else det.quiet=0;
    if(det.state==="moving"&&t-det.start>6500){ det.state="idle"; det.onCount=0; fire(det.start-400,t,false); }
  }
}
function drawRoll(c,now){
  if(!c) return; var x=c.getContext("2d"),W=c.width,H=c.height; x.clearRect(0,0,W,H);
  var pts=buf.filter(function(s){return s.t>=now-3000&&s.m;}); if(pts.length<2) return;
  var ys=pts.map(function(s){return s.m[0]/s.m[F];}), mn=Math.min.apply(null,ys), mx=Math.max.apply(null,ys), rg=Math.max(mx-mn,0.08);
  x.strokeStyle=(det.state==="moving"||capT)?css("--live"):css("--accent"); x.lineWidth=4; x.lineJoin="round"; x.beginPath();
  pts.forEach(function(s,i){ var px=12+(s.t-(now-3000))/3000*(W-24), py=H-16-(ys[i]-mn)/rg*(H-32); if(i) x.lineTo(px,py); else x.moveTo(px,py); });
  x.stroke();
}
function drawView(c,pts,w,h){
  if(!c) return; if(c.width!==w||c.height!==h){c.width=w;c.height=h;} var x=c.getContext("2d"); x.drawImage(wc,0,0); if(!pts) return;
  x.fillStyle=css("--dot"); var r=Math.max(2,w/200);
  LO.concat(LI).forEach(function(i){x.beginPath();x.arc(pts[2*i],pts[2*i+1],r,0,6.3);x.fill();});
}
/* The tracker only finds upright faces. If he is lying down or the device is on its side, the face is
   rotated in the picture, so when no face is found the frame is tried at 90, 180 and 270 degrees. */
var rot={deg:0,miss:0,locked:false};
function grab(v){
  var sc=Math.min(1,480/Math.max(v.videoWidth,v.videoHeight)), vw=Math.round(v.videoWidth*sc), vh=Math.round(v.videoHeight*sc);
  var side=rot.deg%180!==0, w=side?vh:vw, h=side?vw:vh;
  if(wc.width!==w||wc.height!==h){wc.width=w;wc.height=h;}
  var x=wc.getContext("2d"); x.save(); x.translate(w/2,h/2); x.rotate(rot.deg*Math.PI/180); x.drawImage(v,-vw/2,-vh/2,vw,vh); x.restore();
}
function turn(found){
  if(found){ rot.miss=0; rot.locked=true; return; }
  if(++rot.miss>=(rot.locked?30:6)){ rot.deg=(rot.deg+90)%360; rot.miss=0; rot.locked=false; }
}
function showRate(now,found){
  rate.n++; if(found) rate.f++; if(!rate.t){rate.t=now;return;} if(now-rate.t<2000) return;
  var fps=rate.n/((now-rate.t)/1000), seen=rate.f/rate.n, o=cam.o||{}; rate.t=now; rate.n=0; rate.f=0; if(!o.status) return;
  if(seen<0.5) o.status("Camera is on, but no face is being followed. Face the camera with light on your face.",true);
  else if(fps<10) o.status("Tracking at "+fps.toFixed(0)+" frames a second. That is too slow to read lips well on this device.",true);
  else o.status("Tracking at "+fps.toFixed(0)+" frames a second.",false);
}
async function loop(){
  if(!cam.on) return; var v=cam.o.video;
  if(!cam.working&&v.readyState>=2&&v.videoWidth){
    cam.working=true;
    try{
      grab(v);
      var pts=await track(wc), now=performance.now();
      onSample(now,pts); drawView(cam.o.view,pts,wc.width,wc.height); drawRoll(cam.o.roll,now); showRate(now,!!pts); turn(!!pts);
    }catch(e){}
    cam.working=false;
  }
  requestAnimationFrame(loop);
}
async function start(o){
  cam.o=o; prime();
  if(location.protocol!=="https:"&&location.hostname!=="localhost"&&location.hostname!=="127.0.0.1") return "This page must be opened from an https address for the camera to work.";
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) return "This browser does not offer a camera to web pages.";
  var s; try{ s=await navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false}); }
  catch(e){ return "The camera could not be opened. Allow camera access for this site in the browser settings, then try again."; }
  try{ await tracker(); }catch(e){ s.getTracks().forEach(function(t){t.stop();}); return String(e.message||e); }
  o.video.srcObject=s; cam.stream=s; try{ await o.video.play(); }catch(e){}
  buf=[]; det.state="idle"; det.ema=null; det.onCount=0; rate.t=0; rate.n=0; rate.f=0; cam.on=true;
  try{ if(navigator.wakeLock) cam.wake=await navigator.wakeLock.request("screen"); }catch(e){}
  loop(); return "";
}
function stop(){
  cam.on=false; if(cam.stream) cam.stream.getTracks().forEach(function(t){t.stop();});
  try{ if(cam.wake) cam.wake.release(); }catch(e){}
  if(cam.o&&cam.o.video) cam.o.video.srcObject=null;
}
function readLast(){ prime(); var now=performance.now(); det.state="idle"; det.onCount=0; fire(now-3000,now,true); }
var capT=0;
function beginCapture(){ prime(); capT=performance.now(); det.state="idle"; det.onCount=0; }
function endCapture(){ if(!capT) return; var now=performance.now(), t0=Math.max(capT-300,now-9000); capT=0; fire(t0,now,true); }
function rearm(){ det.state="idle"; det.onCount=0; det.cool=performance.now()+400; }

window.Lip={state:S,load:load,save:save,pack:pack,unpack:function(o){var ok=unpack(o); if(ok){save();review();} return ok;},
  clips:clips,taught:taught,review:review,classify:classify,addClip:addClip,popClip:popClip,addCue:addCue,removeCue:removeCue,
  speak:speak,prime:prime,start:start,stop:stop,readLast:readLast,rearm:rearm,beginCapture:beginCapture,endCapture:endCapture,rotation:function(){return rot.deg;},isOn:function(){return cam.on;},
  _onSample:onSample,_setOpts:function(o){cam.o=o;},_fire:fire,_measure:measure,_reset:function(){if(fm&&fm.reset)fm.reset();},_debug:function(){return {deg:rot.deg,miss:rot.miss,locked:rot.locked,n:buf.length,found:buf.filter(function(s){return s.m;}).length,span:buf.length?buf[buf.length-1].t-buf[0].t:0};},_track:async function(cv){await tracker();return track(cv);}};
})();
