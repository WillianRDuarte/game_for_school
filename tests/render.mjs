// Rasterizador de software (sem GPU) para inspecionar visualmente as malhas reais geradas pelo jogo.
// Uso: node --import ./tests/register.mjs tests/render.mjs <saida_dir>
import * as THREE from 'three';
import sharp from '/home/claude/.npm-global/lib/node_modules/sharp/lib/index.js';
import {Track,STEP,THEMES} from '../js/road.js';
import {World} from '../js/world.js';
import {surface} from '../js/terrain.js';
const out=process.argv[2]||'/tmp/shots',W=960,H=540;
import fs from 'node:fs';fs.mkdirSync(out,{recursive:true});
const HOR=[.74,.85,.93],ZEN=[.31,.56,.85],FOGN=450,FOGF=5600,L=(()=>{const v=[-.5,1,.3],m=Math.hypot(...v);return v.map(x=>x/m);})();
const lin2srgb=c=>Math.round(255*Math.pow(Math.min(1,Math.max(0,c)),1/2.2));
function shot(T,cam,look,name,fov=70){
  const scene=new THREE.Scene(),world=new World(scene,T);const s0=Math.max(0,cam.s);world.preload(look.x,look.z,s0,1e9);
  const fw=[look.x-cam.x,look.y-cam.y,look.z-cam.z],fl=Math.hypot(...fw);fw.forEach((_,i)=>fw[i]/=fl);
  let rt=[-fw[2],0,fw[0]];const rl=Math.hypot(rt[0],rt[2]);rt=[rt[0]/rl,0,rt[2]/rl];const up=[rt[1]*fw[2]-rt[2]*fw[1],rt[2]*fw[0]-rt[0]*fw[2],rt[0]*fw[1]-rt[1]*fw[0]];
  const f=1/Math.tan(fov*Math.PI/360),asp=W/H,img=new Float32Array(W*H*3),zb=new Float32Array(W*H).fill(1e9);
  for(let y=0;y<H;y++){const t=Math.pow(Math.max(0,(1-y/(H*.52))),.55);for(let x=0;x<W;x++)for(let c=0;c<3;c++)img[(y*W+x)*3+c]=y>H*.52?HOR[c]:HOR[c]+(ZEN[c]-HOR[c])*t;}
  const proj=(x,y,z)=>{const dx=x-cam.x,dy=y-cam.y,dz=z-cam.z,cx=dx*rt[0]+dz*rt[2],cy=dx*up[0]+dy*up[1]+dz*up[2],cz=dx*fw[0]+dy*fw[1]+dz*fw[2];return[cx,cy,cz];};
  const draw=(P,N,C,idx,ox,oz,kind)=>{
    const n=P.length/3,sx=new Float32Array(n),sy=new Float32Array(n),sz=new Float32Array(n),wx=new Float32Array(n*3);
    for(let i=0;i<n;i++){const X=P[i*3]+ox,Y=P[i*3+1],Z=P[i*3+2]+oz,[cx,cy,cz]=proj(X,Y,Z);wx[i*3]=X;wx[i*3+1]=Y;wx[i*3+2]=Z;sz[i]=cz;sx[i]=(cx/cz*f/asp*.5+.5)*W;sy[i]=(.5-cy/cz*f*.5)*H;}
    for(let t=0;t<idx.length;t+=3){const a=idx[t],b=idx[t+1],c=idx[t+2];if(sz[a]<1||sz[b]<1||sz[c]<1)continue;
      const area=(sx[b]-sx[a])*(sy[c]-sy[a])-(sx[c]-sx[a])*(sy[b]-sy[a]);if(area>=0)continue;
      const x0=Math.max(0,Math.floor(Math.min(sx[a],sx[b],sx[c]))),x1=Math.min(W-1,Math.ceil(Math.max(sx[a],sx[b],sx[c]))),y0=Math.max(0,Math.floor(Math.min(sy[a],sy[b],sy[c]))),y1=Math.min(H-1,Math.ceil(Math.max(sy[a],sy[b],sy[c])));
      if(x1<0||y1<0||x0>=W||y0>=H)continue;const ia=1/area;
      for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5;
        const w0=((sx[b]-px)*(sy[c]-py)-(sx[c]-px)*(sy[b]-py))*ia,w1=((sx[c]-px)*(sy[a]-py)-(sx[a]-px)*(sy[c]-py))*ia,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
        const z=w0*sz[a]+w1*sz[b]+w2*sz[c]-(kind==='road'?2+sz[a]*.0008:0);const zi=y*W+x;if(z>=zb[zi])continue;zb[zi]=z;
        let r,g,bl,nx,ny,nz;
        if(kind==='terr'){nx=w0*N[a*3]+w1*N[b*3]+w2*N[c*3];ny=w0*N[a*3+1]+w1*N[b*3+1]+w2*N[c*3+1];nz=w0*N[a*3+2]+w1*N[b*3+2]+w2*N[c*3+2];const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
          r=w0*C[a*3]+w1*C[b*3]+w2*C[c*3];g=w0*C[a*3+1]+w1*C[b*3+1]+w2*C[c*3+1];bl=w0*C[a*3+2]+w1*C[b*3+2]+w2*C[c*3+2];}
        else{nx=0;ny=1;nz=0;const iz=w0/sz[a]+w1/sz[b]+w2/sz[c],u=(w0*C[a*2]/sz[a]+w1*C[b*2]/sz[b]+w2*C[c*2]/sz[c])/iz,v=(w0*C[a*2+1]/sz[a]+w1*C[b*2+1]/sz[b]+w2*C[c*2+1]/sz[c])/iz;r=g=bl=.11;const vv=v-Math.floor(v);
          if(Math.abs(u-.5)<.0045&&true){r=.8;g=.55;bl=.05;}else if(u<.078||u>.922){r=g=bl=.14;if(Math.abs(u-.072)<.008||Math.abs(u-.928)<.008){r=g=bl=.8;}}
          else{for(const q of[1,2,4,5]){if(Math.abs(u-(.078+.844*q/6))<.0035&&vv<.375){r=g=bl=.8;}}}}
        const dif=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]),hemi=.5+.5*ny,li=.25+.65*dif+.35*hemi*.6;
        r*=li*1.15;g*=li*1.15;bl*=li*1.15;
        const dist=z,fk=Math.min(1,Math.max(0,(dist-FOGN)/(FOGF-FOGN)));
        const o=zi*3;img[o]=r+(HOR[0]-r)*fk;img[o+1]=g+(HOR[1]-g)*fk;img[o+2]=bl+(HOR[2]-bl)*fk;}}};
  for(const m of scene.children){const P=m.geometry.attributes.position.array,idx=m.geometry.index.array;
    if(m.geometry.attributes.color)draw(P,m.geometry.attributes.normal.array,m.geometry.attributes.color.array,idx,m.position.x,m.position.z,'terr');
    else draw(P,null,m.geometry.attributes.uv.array,idx,0,0,'road');}
  // carro
  { const cs=[[-1.3,0,-2.7],[1.3,0,-2.7],[1.3,1.5,-2.7],[-1.3,1.5,-2.7]];}
  const buf=Buffer.alloc(W*H*3);for(let i=0;i<W*H*3;i++)buf[i]=lin2srgb(img[i]);
  return sharp(buf,{raw:{width:W,height:H,channels:3}}).png().toFile(`${out}/${name}.png`).then(()=>console.log('ok',name));
}
const T=new Track(7);T.ensureZ(-60000);const S=i=>T.samples.get(i);
const view=(s,back=14,up=6,ahead=60,dy=2)=>{const p=T.sampleAt(s),q=T.sampleAt(s+ahead);const fx=Math.sin(p.h),fz=-Math.cos(p.h);return[{x:p.x-fx*back,y:p.y+up,z:p.z-fz*back,s},{x:q.x,y:q.y+dy,z:q.z}];};
// escolhe lugares interessantes
let hp=0,hi=0,crest=0,ci=0;for(let i=200;i<5000;i++){if(Math.abs(S(i).curv)>hp&&S(i).th>=2){hp=Math.abs(S(i).curv);hi=i;}}
for(let i=200;i<5000;i++){const a=S(i);if(a.slope>.05&&S(i+60).slope<-.05&&a.y>crest){crest=a.y;ci=i;}}
const shots=[['01_inicio',50*STEP],['02_curva_fechada',(hi-60)*STEP],['03_topo',(ci-110)*STEP],['04_plano',300*STEP],['05_serra',1500*STEP]];
for(const [n,s] of shots){const [c,l]=view(s,14,6,70,2);await shot(T,c,l,n);}
// fora da pista: 120 m ao lado, olhando para a pista
{const s=(hi-150)*STEP,p=T.sampleAt(s),q=T.sampleAt(s+200),rx=Math.cos(p.h),rz=Math.sin(p.h);const cx=p.x+rx*130,cz=p.z+rz*130,gh=surface(T,cx,cz,{}).h;await shot(T,{x:cx,y:gh+9,z:cz,s},{x:q.x,y:q.y,z:q.z},'06_fora_da_pista',75);}
console.log('curva mais fechada em s=',hi*STEP,'raio',(1/hp).toFixed(0),'· topo em s=',ci*STEP,'y=',crest.toFixed(0));
{const [c,l]=view((ci-40)*STEP,14,25,500,30);await shot(T,c,l,'07_horizonte_alto',80);
 // região de maior "zs" ao longo do percurso
 let best=0,bi=0;for(let i=300;i<8000;i+=10){const p=S(i);if(p.th===4&&p.y>best){best=p.y;bi=i;}}
 const [c2,l2]=view(bi*STEP,14,20,400,25);await shot(T,c2,l2,'08_serra_alta',80);}
// vistas laterais (fora da pista, câmera sobre o terreno) em três pontos diferentes do percurso
for(const [n,i] of[['09_lateral_a',1200],['10_lateral_b',4500],['11_lateral_c',8200]]){const p=T.sampleAt(i*STEP),q=T.sampleAt(i*STEP+300),rx=Math.cos(p.h),rz=Math.sin(p.h),cx=p.x+rx*90,cz=p.z+rz*90;
  await shot(T,{x:cx,y:surface(T,cx,cz,{}).h+8,z:cz,s:i*STEP},{x:q.x+rx*150,y:q.y+10,z:q.z+rz*150},n,75);}
