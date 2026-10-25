/* Dafi — faqat bosh (2D, SVG). Eng boshidagi oddiy ayiqcha yuzi + jonli animatsiya.
   mountDafiHead(el,'cheer',160) → inst.set('wave'|'think'|'miss'|'idle'|'cheer')  (GSAP kerak) */
(function(){
const BODY='#b07a4f',DARK='#8f5d38',BELLY='#f0cfa6',INK='#2a1a14';
const ART=`<svg viewBox="30 20 140 125" aria-hidden="true" style="overflow:visible;display:block;width:100%;height:100%">
<ellipse class="sh" cx="100" cy="140" rx="46" ry="6" fill="#000" opacity=".15"/>
<g class="fxl"></g>
<g class="all">
 <g class="earL"><circle cx="58" cy="46" r="21" fill="${BODY}"/><circle cx="58" cy="49" r="10.5" fill="#efc08f"/></g>
 <g class="earR"><circle cx="142" cy="46" r="21" fill="${BODY}"/><circle cx="142" cy="49" r="10.5" fill="#efc08f"/></g>
 <ellipse cx="100" cy="86" rx="55" ry="50" fill="${BODY}"/><ellipse cx="100" cy="124" rx="40" ry="9" fill="${DARK}" opacity=".35"/>
 <circle class="chL" cx="66" cy="102" r="9" fill="#ff8f7d" opacity=".55"/><circle class="chR" cx="134" cy="102" r="9" fill="#ff8f7d" opacity=".55"/>
 <ellipse cx="100" cy="103" rx="23" ry="18" fill="${BELLY}"/>
 <ellipse cx="100" cy="94" rx="9.5" ry="6.8" fill="${INK}"/><ellipse cx="97" cy="92" rx="3" ry="1.8" fill="#fff" opacity=".7"/>
 <path d="M100 100 V106" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
 <ellipse class="tg" cx="100" cy="116" rx="7" ry="4" fill="#ff8f8f" opacity="0"/>
 <path class="mo" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
 <g class="gz">
  <g class="eL"><ellipse cx="78" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="80.5" cy="76" r="2.8" fill="#fff"/></g>
  <g class="eR"><ellipse cx="122" cy="80" rx="7.5" ry="9.5" fill="${INK}"/><circle cx="124.5" cy="76" r="2.8" fill="#fff"/></g>
 </g>
 <g class="hL"><path d="M69 83 Q78 70 87 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <g class="hR"><path d="M113 83 Q122 70 131 83" stroke="${INK}" fill="none" stroke-width="4" stroke-linecap="round"/></g>
 <path class="bL" d="M67 65 L89 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/><path class="bR" d="M133 65 L111 61" stroke="#6e4326" stroke-width="4" stroke-linecap="round"/>
 <g class="fq"><circle cx="164" cy="34" r="16" fill="#fff" stroke="#e6dccf" stroke-width="2"/><text x="164" y="42" text-anchor="middle" font-family="Nunito,system-ui" font-weight="900" font-size="22" fill="#8b5cf6">?</text></g>
 <g class="fs"><path d="M148 52 Q157 66 148 75 Q139 66 148 52Z" fill="#7cc8ff"/></g>
 <g class="fst"><text x="30" y="46" font-size="20">⭐</text><text x="160" y="34" font-size="17">✨</text><text x="22" y="100" font-size="15">✨</text><text x="168" y="98" font-size="19">⭐</text></g>
</g></svg>`;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const N=()=>({y:0,sx:1,sy:1,rot:0,eBL:0,eBR:0,happy:0,winkR:0,brw:0,bLr:0,bRr:0,bLy:0,bRy:0,mw:12,mc:12,mo:0,cheek:0,stars:0,q:0,sw:0,swy:0,qy:0,gxB:0,gyB:0});
const tf=(x,y,t)=>`translate(${x} ${y}) ${t} translate(${-x} ${-y})`;
function Head(el,state,px){
  this.el=el;el.innerHTML=ART;const q=s=>el.querySelector(s);
  this.p={sh:q('.sh'),all:q('.all'),eaL:q('.earL'),eaR:q('.earR'),eL:q('.eL'),eR:q('.eR'),gz:q('.gz'),hL:q('.hL'),hR:q('.hR'),bL:q('.bL'),bR:q('.bR'),mo:q('.mo'),tg:q('.tg'),chL:q('.chL'),chR:q('.chR'),fq:q('.fq'),fs:q('.fs'),fst:q('.fst'),fxl:q('.fxl')};
  this.r=Object.assign(N(),{breath:0,hidle:0,blink:0,gx:0,gy:0,eL:0,eR:0,starRot:0});
  this.sp={eL:{x:0,v:0},eR:{x:0,v:0}};this.prevY=0;this.prevR=0;this.timers=[];this.gaze={x:0,y:0};
  this.reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  this.tick=()=>this.step();gsap.ticker.add(this.tick);
  if(!this.reduce)this.layers();this.set(state||'idle');this.render();}
const P=Head.prototype;
P.destroy=function(){gsap.ticker.remove(this.tick);gsap.killTweensOf(this.r);this.tl&&this.tl.kill();this.timers.forEach(clearTimeout);this.idle&&this.idle.forEach(t=>t.kill());};
P.later=function(f,ms){this.timers.push(setTimeout(f,ms));};
P.layers=function(){const r=this.r;
  this.idle=[gsap.to(r,{breath:1,duration:1.8,yoyo:true,repeat:-1,ease:'sine.inOut'}),gsap.to(r,{hidle:1,duration:2.6,yoyo:true,repeat:-1,ease:'sine.inOut'})];
  const blink=()=>{if(!this.el.isConnected)return;gsap.to(r,{blink:1,duration:.065,yoyo:true,repeat:Math.random()<.25?3:1});this.later(blink,1800+Math.random()*3200);};this.later(blink,900);
  const look=()=>{this.gaze={x:(Math.random()*2-1)*3.2,y:(Math.random()*2-1)*2};this.later(look,1400+Math.random()*2300);};look();
  const tw=()=>{this.sp[Math.random()<.5?'eL':'eR'].v+=(Math.random()<.5?-1:1)*(5+Math.random()*4);this.later(tw,4500+Math.random()*5000);};this.later(tw,2500);};
P.spr=function(s,t,k,d){s.v+=(t-s.x)*k;s.v*=d;s.x+=s.v;return s.x;};
P.step=function(){const r=this.r,vy=r.y-this.prevY,vr=r.rot-this.prevR;this.prevY=r.y;this.prevR=r.rot;
  r.eL=this.spr(this.sp.eL,r.eBL-vy*1.2+vr*1.4,.2,.82);r.eR=this.spr(this.sp.eR,r.eBR+vy*1.2+vr*1.4,.2,.82);
  r.gx+=(this.gaze.x+r.gxB-r.gx)*.18;r.gy+=(this.gaze.y+r.gyB-r.gy)*.18;this.render();};
P.render=function(){const r=this.r,p=this.p,br=r.breath;
  p.all.setAttribute('transform',tf(100,135,`translate(0 ${r.y}) rotate(${r.rot+r.hidle*1.2-.6}) scale(${r.sx*(1-.01*br)} ${r.sy*(1+.022*br)})`));
  const sc=clamp(1+r.y/120,.4,1.2);p.sh.setAttribute('transform',tf(100,140,`scale(${sc} ${sc})`));p.sh.setAttribute('opacity',.15*sc);
  p.eaL.setAttribute('transform',tf(62,64,`rotate(${r.eL})`));p.eaR.setAttribute('transform',tf(138,64,`rotate(${r.eR})`));
  const bl=Math.max(r.blink,r.happy);
  p.eL.setAttribute('transform',tf(78,80,`scale(1 ${1-.93*bl})`));p.eR.setAttribute('transform',tf(122,80,`scale(1 ${1-.93*Math.max(bl,r.winkR)})`));
  p.eL.setAttribute('opacity',1-r.happy);p.eR.setAttribute('opacity',1-r.happy);p.gz.setAttribute('transform',`translate(${r.gx} ${r.gy})`);
  p.hL.setAttribute('opacity',r.happy);p.hR.setAttribute('opacity',r.happy);
  p.bL.setAttribute('opacity',r.brw);p.bR.setAttribute('opacity',r.brw);
  p.bL.setAttribute('transform',tf(78,63,`translate(0 ${r.bLy}) rotate(${r.bLr})`));p.bR.setAttribute('transform',tf(122,63,`translate(0 ${r.bRy}) rotate(${r.bRr})`));
  const L=100-r.mw,R=100+r.mw,y0=106,op=r.mo>.04;
  p.mo.setAttribute('d',`M${L} ${y0} Q100 ${y0+r.mc} ${R} ${y0}`+(op?` Q100 ${y0+r.mc+r.mo*40} ${L} ${y0}Z`:''));p.mo.setAttribute('fill',op?'#7a2a2a':'none');
  p.tg.setAttribute('opacity',clamp(r.mo*1.3-.3,0,1));p.tg.setAttribute('cy',106+r.mc+r.mo*22);
  const c=1+.28*r.cheek;p.chL.setAttribute('transform',tf(66,102,`scale(${c})`));p.chR.setAttribute('transform',tf(134,102,`scale(${c})`));
  p.fq.setAttribute('opacity',r.q);p.fq.setAttribute('transform',`translate(0 ${r.qy})`);p.fs.setAttribute('opacity',r.sw);p.fs.setAttribute('transform',`translate(0 ${r.swy})`);
  p.fst.setAttribute('opacity',r.stars);p.fst.setAttribute('transform',tf(100,80,`rotate(${r.starRot})`));};
P.dust=function(){const ns='http://www.w3.org/2000/svg';[-1,1].forEach(s=>{for(let i=0;i<3;i++){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',100+s*(30+i*8));c.setAttribute('cy',136);c.setAttribute('r',4+i);c.setAttribute('fill','#fff');c.setAttribute('opacity',.85);this.p.fxl.appendChild(c);
  gsap.to(c,{attr:{cx:100+s*(58+i*16),cy:128-i*5,r:1},opacity:0,duration:.55+i*.1,ease:'power2.out',onComplete:()=>c.remove()});}});};
P.set=function(s){this.state=s;this.tl&&this.tl.kill();gsap.killTweensOf(this.r,Object.keys(N()).join(','));
  const tl=this.tl=gsap.timeline({defaults:{overwrite:'auto'}});tl.to(this.r,{...N(),duration:.35,ease:'back.out(1.6)'},0);if(this.reduce)return;
  ({wave:()=>this.wave(tl,.3),cheer:()=>this.cheer(tl,.12),think:()=>this.think(tl,.3),miss:()=>this.miss(tl,.1)}[s]||(()=>{}))();};
P.wave=function(tl,t){const r=this.r; // salom: bosh qiyshayadi, ko'z qisadi, katta tabassum
  tl.to(r,{mw:17,mc:10,mo:.5,cheek:1,brw:1,bLy:-3,bRy:-3,rot:5,duration:.45,ease:'back.out(2)'},t)
    .to(r,{rot:-4,duration:1.1,ease:'sine.inOut',yoyo:true,repeat:-1},t+.45)
    .to(r,{winkR:1,duration:.1,yoyo:true,repeat:1,repeatDelay:.35},t+.9).to(r,{winkR:1,duration:.1,yoyo:true,repeat:1,repeatDelay:.35},t+3.1);};
P.think=function(tl,t){const r=this.r;
  tl.to(r,{rot:-9,y:1,gxB:4,gyB:-4,brw:1,bLr:-9,bLy:-5,mw:8,mc:-1,mo:0,q:1,duration:.55,ease:'back.out(1.5)'},t)
    .to(r,{qy:-7,duration:1.1,ease:'sine.inOut',yoyo:true,repeat:-1},t+.55).to(r,{rot:-12,duration:1.8,ease:'sine.inOut',yoyo:true,repeat:-1},t+.6);};
P.miss=function(tl,t){const r=this.r;
  tl.to(r,{sy:1.06,sx:.97,duration:.12,ease:'power2.out'},t)
    .to(r,{sy:1,sx:1,rot:6,eBL:-22,eBR:22,brw:1,bLr:-15,bRr:15,mw:5,mc:2,mo:.5,gyB:3,sw:1,swy:-8,duration:.45,ease:'back.out(2.4)'},t+.12)
    .to(r,{swy:18,sw:0,duration:.9,ease:'power1.in',repeat:-1,repeatDelay:.5},t+.5).to(r,{rot:-5,duration:.18,ease:'sine.inOut',yoyo:true,repeat:5},t+.55);};
P.cheer=function(tl,t0){const r=this.r,self=this;let t=t0;
  const hop=(h,tilt,pause)=>{
    tl.to(r,{sy:.82,sx:1.14,y:3,mo:0,happy:0,duration:.17,ease:'power2.out'},t);t+=.17;
    tl.to(r,{y:-h,duration:.4,ease:'power2.out'},t).to(r,{sy:1.12,sx:.93,rot:tilt,happy:1,mw:18,mc:7,mo:.95,cheek:1,stars:1,brw:0,duration:.3,ease:'back.out(2.2)'},t);t+=.4;
    tl.to(r,{y:0,sy:1.03,sx:.98,rot:-tilt*.4,duration:.34,ease:'power2.in'},t);t+=.34;
    tl.add(()=>self.dust(),t).to(r,{sy:.76,sx:1.2,rot:0,duration:.08,ease:'power3.out'},t);t+=.08;
    tl.to(r,{sy:1,sx:1,duration:.7,ease:'elastic.out(1.1,.32)'},t);t+=.4;};
  tl.to(r,{starRot:360,duration:6,ease:'none',repeat:-1},t0);
  hop(30,-8);hop(40,9);hop(52,-11);tl.add(()=>self.set('wave'),t+.1);};
window.mountDafiHead=(el,state,px)=>{if(el._dh)el._dh.destroy();el.style.width=px+'px';el.style.height=Math.round(px*.9)+'px';el.style.display='inline-block';const d=new Head(el,state,px);el._dh=d;return d;};
})();
