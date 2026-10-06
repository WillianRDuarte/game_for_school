// Renderiza (rasterizador de software) o estado REAL do jogo com meteoros: céu, rastro, marcador, explosão, crateras.
// Uso: node --import ./tests/register.mjs tests/meteor_render.mjs <dir>
import sharp from '/home/claude/.npm-global/lib/node_modules/sharp/lib/index.js';
import fs from 'node:fs';
import * as THREE from 'three';
import {Game} from '../js/game.js';
const out=process.argv[2]||'/tmp/mshots';fs.mkdirSync(out,{recursive:true});
const g=new Game({}),M=g.meteors,dt=1/60,W=960,H=540;g.input.poll=()=>{};M.difficulty=()=>.75;
const HOR=[.74,.85,.93],ZEN=[.31,.56,.85],FOGN=450,FOGF=5600,L=(()=>{const v=[-.5,1,.3],m=Math.hypot(...v);return v.map(x=>x/m);})();
function drive(){const P=g.player,p=g.track.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z)),err=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,err*3));}
const step=n=>{for(let i=0;i<n;i++){drive();g.invuln=9;g.lives=3;g.update(dt);}};
function render(cam,name){
  const mw=cam.matrixWorldInverse,pj=cam.projectionMatrix,img=new Float32Array(W*H*3),zb=new Float32Array(W*H).fill(1e9);
  for(let y=0;y<H;y++){const t=Math.pow(Math.max(0,(1-y/(H*.5))),.55);for(let x=0;x<W;x++)for(let c=0;c<3;c++)img[(y*W+x)*3+c]=y>H*.5?HOR[c]:HOR[c]+(ZEN[c]-HOR[c])*t;}
  const proj=(x,y,z)=>{const v=new THREE.Vector3(x,y,z).applyMatrix4(mw);const d=-v.z;if(d<1)return null;const n=v.clone().applyMatrix4(pj);return[(n.x*.5+.5)*W,(.5-n.y*.5)*H,d];};
  const tri=(A,B,C,fn,zbias,alpha)=>{const area=(B[0]-A[0])*(C[1]-A[1])-(C[0]-A[0])*(B[1]-A[1]);if(area>=0&&!alpha)return;const ia=1/area;
    const x0=Math.max(0,Math.floor(Math.min(A[0],B[0],C[0]))),x1=Math.min(W-1,Math.ceil(Math.max(A[0],B[0],C[0]))),y0=Math.max(0,Math.floor(Math.min(A[1],B[1],C[1]))),y1=Math.min(H-1,Math.ceil(Math.max(A[1],B[1],C[1])));
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,w0=((B[0]-px)*(C[1]-py)-(C[0]-px)*(B[1]-py))*ia,w1=((C[0]-px)*(A[1]-py)-(A[0]-px)*(C[1]-py))*ia,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
      const z=w0*A[2]+w1*B[2]+w2*C[2]-zbias,zi=y*W+x;if(z>=zb[zi])continue;const c=fn(w0,w1,w2);if(!c)continue;
      if(alpha){const a=c[3],o=zi*3;img[o]=img[o]*(1-a)+c[0]*a;img[o+1]=img[o+1]*(1-a)+c[1]*a;img[o+2]=img[o+2]*(1-a)+c[2]*a;}else{zb[zi]=z;const fk=Math.min(1,Math.max(0,(z-FOGN)/(FOGF-FOGN))),o=zi*3;for(let k=0;k<3;k++)img[o+k]=c[k]+(HOR[k]-c[k])*fk;}}};
  const meshes=[];const walk=(o,ox,oy,oz,sc)=>{if(o.geometry&&o.geometry.index&&o.geometry.attributes.position)meshes.push({o,ox:ox+o.position.x,oy:oy+o.position.y,oz:oz+o.position.z,sx:o.scale.x,sy:o.scale.y,sz:o.scale.z});for(const c of o.children||[])walk(c,ox+o.position.x,oy+o.position.y,oz+o.position.z);};
  for(const o of g.scene.children)if(o.visible!==false)walk(o,0,0,0);
  for(const pass of[0,1]){for(const m of meshes){const G=m.o.geometry,P=G.attributes.position.array,C=G.attributes.color,Nn=G.attributes.normal,U=G.attributes.uv,ix=G.index.array;if(!C&&!U)continue;if(m.o.material===M.rockMat||m.o===undefined)continue;
      const isRoad=!!U&&!C,alpha=C&&C.itemSize===4;if((pass===1)!==!!alpha)continue;if(m.o.visible===false)continue;
      const pts=[];for(let i=0;i<P.length/3;i++)pts.push(proj(m.ox+P[i*3]*m.sx,m.oy+P[i*3+1]*m.sy,m.oz+P[i*3+2]*m.sz));
      for(let t=0;t<ix.length;t+=3){const a=ix[t],b=ix[t+1],c=ix[t+2],A=pts[a],B=pts[b],Cc=pts[c];if(!A||!B||!Cc)continue;
        if(alpha&&G.attributes.color.array[a*4+3]===0&&G.attributes.color.array[b*4+3]===0&&G.attributes.color.array[c*4+3]===0)continue;
        const bias=alpha?(m.o.material===M.markMat?6:3):0;
        tri(A,B,Cc,(w0,w1,w2)=>{if(alpha){const ca=C.array;return[(w0*ca[a*4]+w1*ca[b*4]+w2*ca[c*4]),(w0*ca[a*4+1]+w1*ca[b*4+1]+w2*ca[c*4+1]),(w0*ca[a*4+2]+w1*ca[b*4+2]+w2*ca[c*4+2]),w0*ca[a*4+3]+w1*ca[b*4+3]+w2*ca[c*4+3]];}
          if(isRoad){const u=w0*U.array[a*2]+w1*U.array[b*2]+w2*U.array[c*2];let r=.17,gg=.17,bl=.18;if(Math.abs(u-.5)<.006){r=.8;g_=0;gg=.55;bl=.05;}else if(u<.078||u>.922){r=gg=bl=.2;}return[r*1.1,gg*1.1,bl*1.1];}
          const ca=C.array,na=Nn.array,nx=w0*na[a*3]+w1*na[b*3]+w2*na[c*3],ny=w0*na[a*3+1]+w1*na[b*3+1]+w2*na[c*3+1],nz=w0*na[a*3+2]+w1*na[b*3+2]+w2*na[c*3+2],nl=Math.hypot(nx,ny,nz)||1,li=.28+.62*Math.max(0,(nx*L[0]+ny*L[1]+nz*L[2])/nl)+.25*(.5+.5*ny/nl);
          return[(w0*ca[a*3]+w1*ca[b*3]+w2*ca[c*3])*li*1.15,(w0*ca[a*3+1]+w1*ca[b*3+1]+w2*ca[c*3+1])*li*1.15,(w0*ca[a*3+2]+w1*ca[b*3+2]+w2*ca[c*3+2])*li*1.15];},isRoad?2:0,alpha);}}}
  const disc=(p,r,col,add)=>{if(!p)return;const R=Math.max(1,r);for(let y=Math.max(0,Math.floor(p[1]-R));y<=Math.min(H-1,p[1]+R);y++)for(let x=Math.max(0,Math.floor(p[0]-R));x<=Math.min(W-1,p[0]+R);x++){const d=Math.hypot(x+.5-p[0],y+.5-p[1])/R;if(d>1)continue;const zi=y*W+x;if(p[2]>zb[zi])continue;const a=col[3]*(1-d*d)**2,o=zi*3;
      if(add){for(let k=0;k<3;k++)img[o+k]=Math.min(1.4,img[o+k]+col[k]*a);}else for(let k=0;k<3;k++)img[o+k]=img[o+k]*(1-a)+col[k]*a;}};
  const focal=H*.5/Math.tan(cam.fov*Math.PI/360);
  for(const pr of[M.smoke,M.fire]){const a=pr.pos,s=pr.size,c=pr.col;for(let i=0;i<pr.n;i++){if(s[i]<=0||c[i*4+3]<=.01)continue;const p=proj(a[i*3],a[i*3+1],a[i*3+2]);if(p)disc(p,s[i]*focal*.5/p[2],[c[i*4],c[i*4+1],c[i*4+2],c[i*4+3]],pr===M.fire);}}
  for(const m of M.meteors){if(!m.active)continue;const rp=m.root.position,sp=Math.hypot(m.vx,m.vy,m.vz),len=34+m.radius*20;
    for(let k=0;k<40;k++){const f=k/40,p=proj(rp.x-m.vx/sp*len*f,rp.y-m.vy/sp*len*f,rp.z-m.vz/sp*len*f);disc(p,Math.max(2,(m.radius*(1-f*.7))*focal/(p?p[2]:1)),[1,.6-.3*f,.2,.9*(1-f)],true);}
    const p=proj(rp.x,rp.y,rp.z);disc(p,Math.max(2,m.radius*focal/(p?p[2]:1)),[.42,.34,.28,1],false);disc(p,Math.max(4,(m.radius*4.5+3)*focal/(p?p[2]:1)),[1,.7,.35,.5],true);}
  const buf=Buffer.alloc(W*H*3);for(let i=0;i<W*H*3;i++)buf[i]=Math.round(255*Math.pow(Math.min(1,Math.max(0,img[i])),1/2.2));
  return sharp(buf,{raw:{width:W,height:H,channels:3}}).png().toFile(`${out}/${name}.png`).then(()=>console.log('ok',name));
}
const free=(x,y,z,tx,ty,tz,fov=70)=>{const c=new THREE.PerspectiveCamera(fov,W/H,1,7000);c.position.set(x,y,z);c.lookAt({x:tx,y:ty,z:tz});return c;};
let g_=0;
// -- cena 1: câmera do jogo, aviso+meteoro em queda (espera um que esteja no campo de visão)
step(60*12);let shot1=false;
for(let i=0;i<60*60&&!shot1;i++){step(1);const vis=M.meteors.filter(m=>m.active&&m.root.position.y<m.iy+220&&m.t>.8);
  const cam=g.camera;for(const m of vis){const v=new THREE.Vector3(m.root.position.x,m.root.position.y,m.root.position.z).applyMatrix4(cam.matrixWorldInverse);if(v.z<-60){const n=v.applyMatrix4(cam.projectionMatrix);if(Math.abs(n.x)<.7&&n.y>-.2&&n.y<.8){await render(cam,'01_meteoro_no_ceu_camera_do_jogo');shot1=true;break;}}}}
// -- cena 2: impacto acontecendo (explosão): câmera livre olhando um impacto recente
step(60*10);let hit=null;M._ex=M._explode;M._explode=function(x,y,z,R,c){hit={x,y,z,R};return this._ex(x,y,z,R,c);};
for(let i=0;i<60*20&&!hit;i++)step(1);
if(hit){step(10);const P=g.player,fx=Math.sin(P.psi),fz=-Math.cos(P.psi);await render(free(hit.x-fx*90,hit.y+25,hit.z-fz*90,hit.x,hit.y+8,hit.z),'02_explosao');}
// -- cena 3: crateras acumuladas vistas de cima/atrás
step(60*60);const P=g.player,fx=Math.sin(P.psi),fz=-Math.cos(P.psi);
await render(free(P.x-fx*35,P.y+30,P.z-fz*35,P.x-fx*160,P.y-4,P.z-fz*160,75),'03_crateras_atras');
await render(g.camera,'04_camera_do_jogo_caos');
console.log('meteoros',M.stats.alive,'crateras visíveis',M.stats.decals);
