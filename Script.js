const $=id=>document.getElementById(id),cv=$('c'),cx=cv.getContext('2d'),TILT=.5;
let W,H,zoom=1,px=0,py=0,t=0,sel=null;
const C=h=>[parseInt(h.slice(1,3),16),parseInt(h.slice(3,5),16),parseInt(h.slice(5,7),16)];
const N=(o,a,s)=>Math.sin(o*2+s+Math.sin(a*3+s*2))+.6*Math.sin(o*5-a*3+s*3)+.35*Math.sin(o*9+a*8+s*5);
const cr=t=>Math.sin(t.o*6+1)*Math.sin(t.a*8+2)*Math.sin(t.o*11+t.a*5);
const P={
sun:t=>{const n=N(t.o,t.a,1);return C(t.z>.85?'#fff6c0':n>1.1?'#ff9d1c':n>.3?'#ffc933':'#ffdc55')},
mer:t=>C(cr(t)>.5?'#5f5a54':N(t.o,t.a,2)>.6?'#7f7971':'#a29b92'),
ven:t=>{const n=N(t.o,t.a,3)+Math.sin(t.a*6)*.7;return C(n>.8?'#f1d08e':n>-.2?'#e2b06a':'#cf9748')},
ear:t=>{if(Math.abs(t.a)>1.28)return C('#f4f8ff');const n=N(t.o,t.a,4);return n>.55?C(N(t.o,t.a,9)>.5?'#2f7a3a':'#45a049'):C(n>-.3?'#6cbcf5':'#3a86d8')},
moo:t=>C(cr(t)>.5?'#9a9a9a':N(t.o,t.a,7)>.6?'#b4b4b4':'#e2e2e2'),
mar:t=>{if(Math.abs(t.a)>1.32)return C('#f4f4f4');const n=N(t.o,t.a,5);return C(n>.7?'#8f3320':n>-.2?'#c8512f':'#dd7a48')},
jup:t=>{const dx=Math.atan2(Math.sin(t.o-2),Math.cos(t.o-2)),dy=t.a+.35;if(dx*dx*.6+dy*dy*3<.12)return C('#b8452e');const b=Math.sin(t.a*9+N(t.o,t.a*.5,6)*.35);return C(b>.55?'#f0e2c8':b>0?'#d9b48a':b>-.6?'#b98558':'#a46a45')},
sat:t=>{const b=Math.sin(t.a*8+N(t.o,t.a*.5,8)*.2);return C(b>.4?'#f0e2b0':b>-.3?'#e3cd8c':'#c9ad6a')},
ura:t=>C(N(t.o,t.a,10)>.6?'#9aeef2':'#82d6dd'),
nep:t=>{const n=N(t.o,t.a,11);return C(n>.8?'#6a93ff':n>-.4?'#3a5fd9':'#2c46b0')}};
function gen(b,fr){
 const R=b.rs,g=b.g||0,h=2*(R+g),w=Math.round(h*(b.ring?2.3:1)),c=document.createElement('canvas');
 c.width=w;c.height=h;const x=c.getContext('2d'),im=x.createImageData(w,h),d=im.data,mx=w/2,my=h/2,rot=fr/b.nf*6.2832;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){
  const nx=(i+.5-mx)/R,ny=(j+.5-my)/R,r2=nx*nx+ny*ny,sph=r2<=1;let col=null;
  if(sph){const nz=Math.sqrt(1-r2);col=b.f({o:Math.atan2(nx,nz)+rot,a:Math.asin(ny),z:nz});
   if(!b.sun){const L=-.75*nx-.3*ny+.55*nz,k=L>.5?1:L>.25?.8:L>0?.6:.35;col=col.map(v=>v*k|0)}}
  else if(b.sun&&r2<1.8){const q=(i*73+j*151+fr*37)%11;col=r2<1.25&&q<5?C('#ff9a1a'):r2<1.55&&q<2?C('#ffb53a'):q<1?C('#ffd35a'):null}
  if(b.ring){const u=(i+.5-mx)/mx,v=(j+.5-my)/(R*.5),e=u*u+v*v;
   if(e<=1&&e>=.3&&!(e>.68&&e<.75)&&(v>0||!sph))col=C(e<.5?'#a8935f':e<.68?'#d9c590':'#c2aa72')}
  if(col){const q=(j*w+i)*4;d[q]=col[0];d[q+1]=col[1];d[q+2]=col[2];d[q+3]=255}}
 x.putImageData(im,0,0);return c}
// name, AU, world radius, sprite radius, texture, frames, spin frames/s
const defs=[['Sun',0,34,26,P.sun,8,2],['Mercury',.39,7,6,P.mer,16,1],['Venus',.72,11,10,P.ven,16,.6],['Earth',1,12,12,P.ear,16,2],['Mars',1.52,9,8,P.mar,16,2],['Jupiter',5.2,22,18,P.jup,16,4],['Saturn',9.58,18,13,P.sat,16,3],['Uranus',19.2,15,11,P.ura,16,3],['Neptune',30.1,15,11,P.nep,16,3],['Moon',0,4.5,5,P.moo,1,0]];
const B=defs.map(([n,a,r,rs,f,nf,sp],i)=>{const b={n,a,r,rs,f,nf,sp,ph:i*2.4+1,or:90*Math.log(1+4.5*a),w:.25/(a||1),x:0,y:0};
 if(n=='Sun'){b.sun=1;b.g=9}if(n=='Saturn')b.ring=1;b.spr=Array.from({length:nf},(_,k)=>gen(b,k));return b});
const SUN=B[0],EARTH=B[3],MOON=B[9];
const ST=Array.from({length:260},()=>({x:Math.random(),y:Math.random(),l:Math.random()*3|0,p:Math.random()*6}));
function size(){const d=Math.min(devicePixelRatio||1,2);W=innerWidth;H=innerHeight;cv.width=W*d;cv.height=H*d;cx.setTransform(d,0,0,d,0,0);cx.imageSmoothingEnabled=false}
function fit(){zoom=Math.min(W/1100,H/660);px=py=0}
const pr=(x,y)=>[W/2+px+x*zoom,H/2+py+y*zoom*TILT],ps=y=>Math.max(.6,1+y*.0005);
function zoomAt(mx,my,f){const nz=Math.min(8,Math.max(.3,zoom*f)),k=nz/zoom;px=(mx-W/2)-(mx-W/2-px)*k;py=(my-H/2)-(my-H/2-py)*k;zoom=nz}
function hit(mx,my){let best=null,bd=9;for(const b of B){const[sx,sy]=pr(b.x,b.y),rad=Math.max(b.r*zoom*ps(b.y),b.n=='Moon'?12:9),d=Math.hypot(mx-sx,my-sy)/rad;if(d<=1&&d<bd){bd=d;best=b}}return best}
function ring(x,y,r,n){for(let k=0;k<n;k++){const a=k/n*6.2832,[sx,sy]=pr(x+r*Math.cos(a),y+r*Math.sin(a));cx.fillRect(Math.round(sx),Math.round(sy),2,2)}}
function brackets(x,y,r){const a=Math.round(r+8+(Math.sin(t*5)+1)*1.5),l=Math.max(5,Math.round(a*.4)),th=3;x=Math.round(x);y=Math.round(y);
 cx.fillStyle='#ffd23f';for(const s of[-1,1]){const X=x+s*a;cx.fillRect(X-(s>0?th:0),y-a,th,2*a);const T=s>0?X-l:X;cx.fillRect(T,y-a,l,th);cx.fillRect(T,y+a-th,l,th)}}
function loop(ms){t=ms/1000;
 cx.fillStyle='#000';cx.fillRect(0,0,W,H);
 for(const s of ST){const f=[.04,.1,.22][s.l],X=((s.x*W+px*f)%W+W)%W,Y=((s.y*H+py*f)%H+H)%H;
  cx.globalAlpha=.3+.7*(.5+.5*Math.sin(t*(1+s.l)+s.p));cx.fillStyle=['#8aa0c8','#dfe8ff','#fff'][s.l];cx.fillRect(X|0,Y|0,s.l==2?2:1,s.l==2?2:1)}
 for(const b of B){if(b==SUN)continue;if(b==MOON){const q=t*1.1;b.x=EARTH.x+26*Math.cos(q);b.y=EARTH.y+26*Math.sin(q)}else{const q=b.ph+b.w*t;b.x=b.or*Math.cos(q);b.y=b.or*Math.sin(q)}}
 cx.globalAlpha=.3;cx.fillStyle='#9fc6ff';
 for(const b of B)if(b.or)ring(0,0,b.or,Math.max(70,Math.min(320,b.or*zoom*.7|0)));
 ring(EARTH.x,EARTH.y,26,36);cx.globalAlpha=1;
 const sx0=pr(0,0)[0];cx.textAlign='center';cx.font="8px 'Press Start 2P',monospace";
 for(const b of[...B].sort((p,q)=>p.y-q.y)){
  const[sx,sy]=pr(b.x,b.y),sc=b.r/b.rs*zoom*ps(b.y),s=b.spr[((t*b.sp)|0)%b.nf],dw=Math.round(s.width*sc),dh=Math.round(s.height*sc);
  cx.save();cx.translate(Math.round(sx),Math.round(sy));if(b!=SUN&&sx<sx0)cx.scale(-1,1);cx.drawImage(s,-dw/2,-dh/2,dw,dh);cx.restore();
  if(b!=MOON||zoom>2.2||sel==b){cx.fillStyle=sel==b?'#ffd23f':'rgba(180,215,255,.7)';cx.fillText(b.n,sx,sy+b.r*zoom*ps(b.y)+(b==SUN?20:14))}}
 if(sel){const[sx,sy]=pr(sel.x,sel.y);brackets(sx,sy,sel.r*zoom*ps(sel.y))}
 requestAnimationFrame(loop)}
const DATA={
Sun:{i:[['Type','G-type star'],['Diameter','1.39 million km'],['Surface temp.','~5,500 °C'],['Age','~4.6 billion yrs']],e:'The Sun holds 99.86% of the Solar System’s mass. Its core fuses hydrogen into helium, and its light takes about 8 min 20 s to reach Earth.'},
Mercury:{i:[['Type','Rocky planet'],['Diameter','4,879 km'],['Distance','0.39 AU'],['Year','88 Earth days']],e:'With almost no atmosphere, Mercury swings from about −180 °C at night to 430 °C by day. It is the smallest planet and has no moons.'},
Venus:{i:[['Type','Rocky planet'],['Diameter','12,104 km'],['Distance','0.72 AU'],['Year','225 Earth days']],e:'A thick carbon dioxide atmosphere traps heat, making Venus the hottest planet at about 465 °C. It spins backwards, and its day is longer than its year.'},
Earth:{i:[['Type','Rocky planet'],['Diameter','12,742 km'],['Distance','1 AU'],['Year','365.25 days'],['Moons','1']],e:'About 71% of Earth’s surface is water. Its magnetic field and atmosphere shield life, and its 23.4° axial tilt creates the seasons.'},
Moon:{i:[['Type','Natural satellite'],['Orbits','Earth'],['Diameter','3,474 km'],['Distance','384,400 km'],['Orbit period','27.3 days'],['Gravity','1.62 m/s²']],e:'The Moon is tidally locked, so we always see the same face. Some polar craters never see sunlight; in 1998 Lunar Prospector detected hydrogen there, consistent with water ice.',
 req:[['Spacecraft mass','~296 kg fueled (126 kg dry)'],['Travel time','105 hours (~4.4 days)'],['Spacecraft recommended','Lunar Prospector orbiter on an Athena II rocket']]},
Mars:{i:[['Type','Rocky planet'],['Diameter','6,779 km'],['Distance','1.52 AU'],['Year','687 Earth days'],['Moons','2']],e:'Iron oxide dust makes Mars red. Dry river valleys show liquid water once flowed there, and Olympus Mons is the tallest known volcano in the Solar System.'},
Jupiter:{i:[['Type','Gas giant'],['Diameter','139,820 km'],['Distance','5.2 AU'],['Year','11.9 Earth years'],['Moons','90+']],e:'Jupiter is mostly hydrogen and helium, with more than twice the mass of all other planets combined. Its Great Red Spot is a storm that has raged for centuries.'},
Saturn:{i:[['Type','Gas giant'],['Diameter','116,460 km'],['Distance','9.58 AU'],['Year','29.4 Earth years'],['Moons','140+']],e:'Saturn’s rings are mostly chunks of water ice. It is the least dense planet; less dense than water, it would float in a big enough bathtub.'},
Uranus:{i:[['Type','Ice giant'],['Diameter','50,724 km'],['Distance','19.2 AU'],['Year','84 Earth years']],e:'Uranus is tipped on its side, with an axial tilt of about 98°. Methane gives it a cyan color, and its atmosphere is the coldest of any planet.'},
Neptune:{i:[['Type','Ice giant'],['Diameter','49,244 km'],['Distance','30.1 AU'],['Year','165 Earth years']],e:'Neptune has the fastest winds in the Solar System, over 2,000 km/h. Mathematics predicted its position from Uranus’s orbit before it was first seen in 1846.'}};
function show(b){sel=b;const m=$('mis'),d=$('det');
 if(!b){m.classList.add('hid');d.classList.add('hid');return}
 const D=DATA[b.n],moon=b==MOON,row=r=>`<div class="r"><span>${r[0]}</span><span>${r[1]}</span></div>`;
 $('mb').innerHTML=moon?'<b class="y">Finding Polar Ice</b><p>Orbit the Moon’s poles and search for water ice hidden in permanently shadowed craters.</p>':'<div class="r"><span>Status</span><b class="y">Incoming</b></div>';
 $('dn').textContent=b.n;
 $('db').innerHTML='<h3>Info</h3>'+D.i.map(row).join('')+'<h3>Education</h3><p>'+D.e+'</p><h3>Requirements</h3>'+(moon?D.req.map(row).join(''):'<p class="dim">Unavailable</p>');
 d.scrollTop=0;m.classList.remove('hid');d.classList.remove('hid')}
let dn=0,mv=0,lx,ly;
cv.addEventListener('pointerdown',e=>{dn=1;mv=0;lx=e.clientX;ly=e.clientY;cv.setPointerCapture(e.pointerId)});
cv.addEventListener('pointermove',e=>{if(!dn){cv.style.cursor=hit(e.clientX,e.clientY)?'pointer':'grab';return}
 const dx=e.clientX-lx,dy=e.clientY-ly;mv+=Math.abs(dx)+Math.abs(dy);px+=dx;py+=dy;lx=e.clientX;ly=e.clientY;cv.style.cursor='grabbing'});
cv.addEventListener('pointerup',e=>{dn=0;if(mv<6)show(hit(e.clientX,e.clientY))});
cv.addEventListener('wheel',e=>{e.preventDefault();zoomAt(e.clientX,e.clientY,Math.exp(-e.deltaY*.0015))},{passive:false});
$('zi').onclick=()=>zoomAt(W/2,H/2,1.3);$('zo').onclick=()=>zoomAt(W/2,H/2,1/1.3);$('zr').onclick=fit;
addEventListener('resize',size);size();fit();requestAnimationFrame(loop);
