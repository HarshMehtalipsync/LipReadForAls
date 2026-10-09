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
var S={cues:[],bank:{},updated:0}, limit=0;
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
  var still=sm.map(function(r){return Float32Array.from(r);});
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
  return {seq:out,secs:L/FPS,still:still.slice(a0,b0)};
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

/* ---------- free reading from mouth shapes (experimental) ----------
   Instead of matching a whole taught sentence, each moment of a mouthing is classed as one of five
   visible mouth shapes. Any Gujarati sentence can be turned into the shapes it should produce, so
   candidate sentences (his own list, plus guesses from a language model) are ranked by how well they fit.
   Many sounds look alike on the lips, so this narrows the options down; it cannot read exactly. */
var SHAPES=[{k:"M",g:"મ",how:"Lips pressed together, as when saying મ"},{k:"A",g:"આ",how:"Mouth wide open, as when saying આ"},
  {k:"I",g:"ઈ",how:"Lips spread wide, as when saying ઈ"},{k:"U",g:"ઊ",how:"Lips rounded and pushed forward, as when saying ઊ"},
  {k:"N",g:"અ",how:"Relaxed and slightly open, as when saying અ"}];
var SF=[0,1,2,3,5,6,8];
function shapesReady(){ return !!S.shapes&&SHAPES.every(function(s){return S.shapes[s.k];}); }
function shapeSpread(){ return SF.map(function(_,i){ var v=SHAPES.map(function(s){return S.shapes[s.k][i];}), m=v.reduce(function(a,b){return a+b;},0)/v.length;
  return Math.sqrt(v.reduce(function(a,b){return a+(b-m)*(b-m);},0)/v.length)+0.004; }); }
function shapeSeq(still){
  var sp=shapeSpread(), lab=still.map(function(r){ var best="N",bd=1e9; SHAPES.forEach(function(s){ var c=S.shapes[s.k],d=0;
      for(var i=0;i<SF.length;i++){ var e=(r[SF[i]]-c[i])/sp[i]; d+=e*e; } if(d<bd){bd=d;best=s.k;} }); return best; });
  lab=lab.map(function(x,i){ var a=lab[i-1],b=lab[i+1]; return (a&&b&&a===b&&a!==x)?a:x; });      // drop one-frame flickers
  var runs=[]; lab.forEach(function(x){ var l=runs[runs.length-1]; if(l&&l.k===x) l.n++; else runs.push({k:x,n:1}); });
  runs=runs.filter(function(r,i){ return r.n>=2||i===0||i===runs.length-1; });                      // a shape must last 2 frames
  var seq=[]; runs.forEach(function(r){ if(seq[seq.length-1]!==r.k) seq.push(r.k); });
  return seq;
}
var BILABIAL="પફબભમ";
function vowelShapes(code){
  switch(code){
    case 0x0A85: return ["N"];
    case 0x0A86: case 0x0ABE: return ["A"];
    case 0x0A87: case 0x0A88: case 0x0ABF: case 0x0AC0: case 0x0A8D: case 0x0A8F: case 0x0AC5: case 0x0AC7: return ["I"];
    case 0x0A89: case 0x0A8A: case 0x0A8B: case 0x0AC1: case 0x0AC2: case 0x0AC3: case 0x0A91: case 0x0A93: case 0x0AC9: case 0x0ACB: return ["U"];
    case 0x0A90: case 0x0AC8: return ["A","I"];
    case 0x0A94: case 0x0ACC: return ["A","U"];
  }
  return null;
}
/* The mouth shapes a Gujarati sentence should produce, in order. */
function textShapes(text){
  var out=[]; function push(k){ if(out[out.length-1]!==k) out.push(k); }
  String(text).replace(/[^઀-૿\s]/g," ").split(/\s+/).filter(Boolean).forEach(function(w){
    var ch=Array.from(w), i=0;
    while(i<ch.length){ var c=ch[i], code=c.charCodeAt(0);
      if(code>=0x0A95&&code<=0x0AB9){
        if(BILABIAL.indexOf(c)>=0) push("M"); else if(c==="વ") push("U");
        var j=i+1; if(ch[j]&&ch[j].charCodeAt(0)===0x0ABC) j++;                 // nukta
        var nc=ch[j]?ch[j].charCodeAt(0):0;
        if(nc===0x0ACD){ i=j+1; continue; }                                      // joined consonant: no vowel
        var vs=vowelShapes(nc);
        if(vs&&nc>=0x0ABE){ vs.forEach(push); i=j+1; continue; }
        var rest=ch.slice(j).filter(function(x){var cc=x.charCodeAt(0);return cc!==0x0A82&&cc!==0x0A83&&cc!==0x0A81;});
        if(rest.length||ch.length===1) push("N");                                // the built-in "a", silent at the end of a word
        i=j; continue;
      }
      var v=vowelShapes(code); if(v&&code<=0x0A94) v.forEach(push);
      i++;
    }
  });
  return out;
}
function shapeCost(a,b){ if(a===b) return 0; var p=a<b?a+b:b+a;
  return p==="AN"?0.5:p==="IN"?0.6:p==="NU"?0.6:p==="AI"?0.9:p==="AU"?0.9:(a==="M"||b==="M")?1.2:1; }
function gapCost(k,edge){ return k==="M"?(edge?0.15:1):k==="N"?0.35:0.7; }
function shapeFit(obs,exp){
  var n=obs.length,m=exp.length,d=[],i,j; for(i=0;i<=n;i++){d.push(new Float64Array(m+1));}
  for(i=1;i<=n;i++) d[i][0]=d[i-1][0]+gapCost(obs[i-1],true);
  for(j=1;j<=m;j++) d[0][j]=d[0][j-1]+gapCost(exp[j-1],true);
  for(i=1;i<=n;i++) for(j=1;j<=m;j++) d[i][j]=Math.min(d[i-1][j-1]+shapeCost(obs[i-1],exp[j-1]), d[i-1][j]+gapCost(obs[i-1],j===m), d[i][j-1]+gapCost(exp[j-1],i===n));
  return d[n][m]/Math.max(n,m,1);
}
function teachShape(k){
  return new Promise(function(res,rej){
    if(!cam.on){ rej(new Error("Start the camera first.")); return; }
    setTimeout(function(){ var t1=performance.now(), rows=buf.filter(function(s){return s.m&&s.t>=t1-1400;});
      if(rows.length<8){ rej(new Error("The face was not followed well enough. Try again.")); return; }
      var v=SF.map(function(f){ var a=rows.map(function(s){return s.m[f]/s.m[F];}).sort(num); return Math.round(a[Math.floor(a.length/2)]*10000)/10000; });
      if(!S.shapes) S.shapes={}; S.shapes[k]=v; save(); res(v); },2000);
  });
}
/* Ranks candidate sentences against what was mouthed. Candidates are his own sentences plus,
   when a language model is connected, its guesses for this shape sequence. */
async function freeRead(ft,ctx){
  var obs=shapeSeq(ft.still), cands={}, note="";
  S.cues.forEach(function(c){ cands[c.g]={g:c.g,m:c.m,src:"list"}; });
  if(cloud.on){
    try{ var r=await fetch("/api/guess",{method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({shapes:obs.join(" "),secs:ft.secs,recent:(ctx&&ctx.recent)||[],hour:new Date().getHours(),known:S.cues.map(function(c){return c.g;})})});
      if(r.status===501) note="No language model is connected, so it can only choose among the sentences on the Training page.";
      else if(!r.ok) throw await cloudError(r);
      else { var j=await r.json(); (j.candidates||[]).forEach(function(g){ g=String(g||"").trim(); if(g&&!cands[g]&&/[઀-૿]/.test(g)) cands[g]={g:g,m:"",src:"model"}; }); }
    }catch(e){ note="Language model problem: "+String(e.message||e); }
  } else note="Not signed in, so it can only choose among the sentences on the Training page.";
  var ranked=Object.keys(cands).map(function(g){ var c=cands[g]; c.fit=shapeFit(obs,textShapes(g)); return c; }).sort(function(a,b){return a.fit-b.fit;});
  return {shapes:obs,ranked:ranked,note:note};
}

/* ---------- storage ---------- */
function pack(){
  var b={}; S.cues.forEach(function(c){ b[c.k]=clips(c).map(function(s){return s.map(function(r){return Array.prototype.map.call(r,function(x){return Math.round(x*1000)/1000;});});}); });
  return {version:4,updated:S.updated,cues:S.cues,bank:b,shapes:S.shapes||null};
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
  var sh=null; if(o.shapes&&typeof o.shapes==="object"){ sh={}; SHAPES.forEach(function(s){ var v=o.shapes[s.k];
    if(Array.isArray(v)&&v.length===SF.length&&v.every(function(x){return typeof x==="number"&&isFinite(x);})) sh[s.k]=v; }); }
  S.cues=cues; S.bank=bank; S.shapes=sh; S.updated=Number(o.updated)||0; return true;
}
function save(keep){
  if(!keep) S.updated=Date.now();
  var ok=true; try{ localStorage.setItem(STORE,JSON.stringify(pack())); }catch(e){ ok=false; }
  if(!keep) cloudQueue(); return ok;
}
function load(){
  var ok=false; try{ ok=unpack(JSON.parse(localStorage.getItem(STORE)||"null")); }catch(e){}
  if(!ok){ S.cues=DEFAULTS.map(function(c){return {k:c.k,g:c.g,m:c.m};}); S.bank={}; S.shapes=null; S.updated=0; S.cues.forEach(function(c){S.bank[c.k]=[];}); }
  review(); return ok;
}
function addClip(c,seq){ var b=S.bank[c.k]||(S.bank[c.k]=[]); b.push(seq); if(b.length>MAXCLIPS) b.shift(); var ok=save(); review(); return ok; }
function popClip(c){ clips(c).pop(); save(); review(); }
function addCue(g,m){ var c={k:"c"+Date.now().toString(36),g:g.trim().slice(0,120),m:(m||"").trim().slice(0,120)}; S.cues.push(c); S.bank[c.k]=[]; save(); return c; }
function removeCue(c){ S.cues=S.cues.filter(function(x){return x!==c;}); delete S.bank[c.k]; save(); review(); }

/* ---------- cloud copy: only when hosted on Azure Static Web Apps and signed in ----------
   Training is saved under the signed-in user's own folder. The newest copy wins, by save time. */
var cloud={on:false,user:"",role:"",people:null,state:"checking",msg:"",timer:0,listener:null};
function cloudSay(state,msg){ cloud.state=state; cloud.msg=msg||""; if(cloud.listener) cloud.listener({state:state,msg:cloud.msg,user:cloud.user,on:cloud.on,role:cloud.role,people:cloud.people}); }
async function cloudError(r){ var j={}; try{ j=await r.json(); }catch(e){} return new Error(j.error||("The server answered with error "+r.status+".")); }
async function cloudPush(){
  if(!cloud.on) return; cloudSay("saving","Saving to the cloud…");
  try{ var r=await fetch("/api/training",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(pack())});
    if(!r.ok) throw await cloudError(r);
    cloudSay("synced","Saved to the cloud at "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})+".");
  }catch(e){ cloudSay("error",String(e.message||e)); }
}
function cloudQueue(){ if(!cloud.on) return; clearTimeout(cloud.timer); cloud.timer=setTimeout(cloudPush,1500); }
async function cloudPull(){
  try{ var r=await fetch("/api/training",{cache:"no-store"});
    if(r.status===404){ if(S.updated) await cloudPush(); else cloudSay("synced","Nothing is saved in the cloud yet."); return false; }
    if(!r.ok) throw await cloudError(r);
    var o=await r.json(), theirs=Number(o.updated)||0;
    if(theirs>S.updated){ if(unpack(o)){ save(true); review(); cloudSay("synced","Loaded training from the cloud."); return true; } throw new Error("The cloud copy could not be read."); }
    if(S.updated>theirs){ await cloudPush(); return false; }
    cloudSay("synced","Up to date with the cloud."); return false;
  }catch(e){ cloudSay("error",String(e.message||e)); return false; }
}
async function cloudStart(){
  try{ var r=await fetch("/.auth/me",{cache:"no-store"});
    if(!r.ok||(r.headers.get("content-type")||"").indexOf("json")<0){ cloudSay("unavailable"); return false; }
    var j=await r.json();
    if(!j.clientPrincipal){ cloudSay("signedout"); return false; }
    cloud.user=j.clientPrincipal.userDetails||"your account";
  }catch(e){ cloudSay("unavailable"); return false; }
  try{ var a=await fetch("/api/access",{cache:"no-store"}); if(!a.ok) throw await cloudError(a);
    var who=await a.json(); cloud.role=who.role||""; cloud.people=who.role==="admin"?{admins:who.admins||[],members:who.members||[]}:null;
    if(!cloud.role){ cloudSay("noaccess"); return false; }
    cloud.on=true;
  }catch(e){ cloudSay("error",String(e.message||e)); return false; }
  return cloudPull();
}
async function setPeople(admins,members){
  var r=await fetch("/api/access",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({admins:admins,members:members})});
  if(!r.ok) throw await cloudError(r);
  var who=await r.json(); cloud.people={admins:who.admins||[],members:who.members||[]}; cloudSay(cloud.state,cloud.msg); return cloud.people;
}
async function cloudCheck(){ var r=await fetch("/api/status",{cache:"no-store"}); if(!r.ok) throw await cloudError(r); return r.json(); }
async function uploadClip(c,ft){
  if(!cloud.on||!ft.raw||!ft.raw.frames.length) return false;
  try{ var r=await fetch("/api/clips",{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({version:1,cue:{k:c.k,g:c.g,m:c.m},taken:new Date().toISOString(),secs:ft.secs,width:ft.raw.w,height:ft.raw.h,turned:ft.raw.rot,frames:ft.raw.frames})});
    return r.ok; }catch(e){ return false; }
}

/* ---------- speech ---------- */
var synth=window.speechSynthesis||null, voices=[];
function loadVoices(){ try{voices=synth?synth.getVoices():[];}catch(e){voices=[];} }
if(synth){ loadVoices(); try{synth.addEventListener("voiceschanged",loadVoices);}catch(e){} }
function pick(pref){ return voices.filter(function(v){return String(v.lang||"").toLowerCase().replace("_","-").indexOf(pref)===0;})[0]||null; }
function toDeva(s){ return s.replace(/[઀-૿]/g,function(ch){return String.fromCharCode(ch.charCodeAt(0)-0x180);}); }
/* Sound on phones only plays after a tap. prime() is called from every tap that may lead to speech:
   it wakes the device voice and unlocks one audio player that the cloud voice later reuses. */
var player=null, spoken={}, cloudVoice=null;   // cloudVoice: null = not tried yet, true = works, false = not available
function silence(){ var n=800,b=new ArrayBuffer(44+n),v=new DataView(b); function w(o,s){for(var i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));}
  w(0,"RIFF"); v.setUint32(4,36+n,true); w(8,"WAVEfmt "); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,8000,true); v.setUint32(28,8000,true); v.setUint16(32,1,true); v.setUint16(34,8,true); w(36,"data"); v.setUint32(40,n,true);
  for(var i=0;i<n;i++) v.setUint8(44+i,128); return URL.createObjectURL(new Blob([b],{type:"audio/wav"})); }
function prime(voiceOnly){
  try{ if(!voiceOnly&&!player){ player=new Audio(); player.setAttribute("playsinline",""); player.src=silence(); var pr=player.play(); if(pr&&pr.catch) pr.catch(function(){}); } }catch(e){}
  if(!synth||!window.SpeechSynthesisUtterance) return;
  try{ loadVoices(); if(!synth.speaking){ var u=new SpeechSynthesisUtterance(" "); u.volume=0; synth.speak(u); } }catch(e){}
}
function deviceSpeak(text){
  if(!synth||!window.SpeechSynthesisUtterance) return "This browser cannot speak text aloud.";
  loadVoices(); var gu=pick("gu"), hi=pick("hi"), lang, msg;
  if(gu){ lang=gu.lang||"gu-IN"; msg="Spoken with this device's Gujarati voice."; }
  else { text=toDeva(text); lang="hi-IN";
    msg=hi?"This device has no Gujarati voice, so its Hindi voice is reading it. Pronunciation is approximate."
          :"This device has no Gujarati or Hindi voice, so you may hear nothing. Set up the cloud voice, or install a Hindi voice in the device settings."; }
  try{ if(synth.speaking||synth.pending) synth.cancel(); if(synth.paused) synth.resume();
    var u=new SpeechSynthesisUtterance(text); u.lang=lang; if(gu||hi) u.voice=gu||hi; u.rate=0.9; u.volume=1;
    setTimeout(function(){ try{ synth.speak(u); }catch(e){} },60); }
  catch(e){ msg="The voice did not play on this device."; }
  return msg;
}
/* Speaks a sentence and resolves with a short note about which voice was used. */
async function say(text){
  if(cloud.on&&cloudVoice!==false){
    try{
      if(!spoken[text]){ var r=await fetch("/api/speak",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text:text})});
        if(r.status===501){ cloudVoice=false; throw new Error("off"); }
        if(!r.ok) throw await cloudError(r);
        spoken[text]=URL.createObjectURL(await r.blob()); cloudVoice=true; }
      if(!player) player=new Audio();
      player.src=spoken[text]; await player.play();
      return "Spoken with the cloud Gujarati voice.";
    }catch(e){ var why=String(e.message||e); if(why!=="off") return deviceSpeak(text)+" (Cloud voice problem: "+why+")"; }
  }
  var reason=!cloud.on?(cloud.state==="signedout"?"Not signed in, so the cloud voice was not tried."
      :cloud.state==="unavailable"?"This address has no cloud voice."
      :"The cloud is not connected ("+(cloud.msg||cloud.state)+"), so the cloud voice was not tried.")
    :"The server reports that SPEECH_KEY or SPEECH_REGION is not set.";
  return deviceSpeak(text)+" "+reason;
}
function retryVoice(){ cloudVoice=null; }
function speak(text){ return deviceSpeak(text); }

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
  ft.raw={w:wc.width,h:wc.height,rot:rot.deg,frames:buf.filter(function(s){return s.p&&s.t>=t0&&s.t<=t1;}).map(function(s){
    return {t:Math.round(s.t-t0),p:Array.prototype.map.call(s.p,function(x){return Math.round(x*10)/10;})}; })};
  det.cool=t1+1200; if(o.segment) o.segment(ft,manual);
}
function onSample(t,pts){
  var m=pts?measure(pts):null; buf.push({t:t,m:m,p:pts}); while(buf.length&&buf[0].t<t-12000) buf.shift();
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
function within(promise,ms,msg){
  return new Promise(function(res,rej){ var t=setTimeout(function(){rej(new Error(msg));},ms);
    promise.then(function(v){clearTimeout(t);res(v);},function(e){clearTimeout(t);rej(e);}); });
}
/* Starts the camera and the tracker. Every step has a time limit and reports itself through o.step,
   so a stall shows where it happened instead of hanging silently. Returns "" or an error message. */
async function start(o){
  cam.o=o; prime(true); var step=o.step||function(){};
  if(location.protocol!=="https:"&&location.hostname!=="localhost"&&location.hostname!=="127.0.0.1") return "This page must be opened from an https address for the camera to work.";
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia) return "This browser does not offer a camera to web pages.";
  var s; step("Asking for the camera…");
  try{ s=await within(navigator.mediaDevices.getUserMedia({video:{facingMode:"user",width:{ideal:640},height:{ideal:480}},audio:false}),25000,"timeout"); }
  catch(e){ return e.message==="timeout"?"The camera did not answer. Close other apps or tabs that use the camera, then reload this page."
    :"The camera could not be opened ("+(e.name||"error")+"). Allow camera access for this site in the browser settings, then try again."; }
  step("Loading the lip tracker…");
  try{ await within(tracker(),45000,"The lip tracker did not load in time. Check the connection, then reload this page."); }
  catch(e){ s.getTracks().forEach(function(t){t.stop();}); return String(e.message||e); }
  step("Starting the picture…");
  o.video.srcObject=s; cam.stream=s; try{ await within(o.video.play(),4000,"slow"); }catch(e){}
  buf=[]; det.state="idle"; det.ema=null; det.onCount=0; rate.t=0; rate.n=0; rate.f=0; cam.on=true;
  try{ if(navigator.wakeLock) navigator.wakeLock.request("screen").then(function(w){cam.wake=w;},function(){}); }catch(e){}
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
  cloudStart:cloudStart,onCloud:function(f){cloud.listener=f;},cloudOn:function(){return cloud.on;},uploadClip:uploadClip,setPeople:setPeople,cloudCheck:cloudCheck,
  shapeList:SHAPES,shapesReady:shapesReady,hasShape:function(k){return !!(S.shapes&&S.shapes[k]);},teachShape:teachShape,freeRead:freeRead,textShapes:textShapes,shapeFit:shapeFit,
  speak:speak,say:say,retryVoice:retryVoice,voices:function(){loadVoices();return voices.map(function(v){return v.lang;});},prime:prime,start:start,stop:stop,readLast:readLast,rearm:rearm,beginCapture:beginCapture,endCapture:endCapture,rotation:function(){return rot.deg;},isOn:function(){return cam.on;},
  _onSample:onSample,_fakeOn:function(v){cam.on=v;},_setOpts:function(o){cam.o=o;},_fire:fire,_measure:measure,_reset:function(){if(fm&&fm.reset)fm.reset();},_debug:function(){return {deg:rot.deg,miss:rot.miss,locked:rot.locked,n:buf.length,found:buf.filter(function(s){return s.m;}).length,span:buf.length?buf[buf.length-1].t-buf[0].t:0};},_track:async function(cv){await tracker();return track(cv);}};
})();
