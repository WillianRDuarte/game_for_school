// Rasterizador de software (sem GPU) do CENÁRIO visto pela câmera do jogo: terreno (ground()), pista e as instâncias reais de prédios/árvores
// (matrizes dos InstancedMesh, geometria do GLB, cor da paleta/atlas pelo UV). Uso: node --import ./tests/register.mjs tests/scenery_render.mjs <dir> [s1 s2 ...]
import {Game} from '../js/game.js';
import {buildSceneryLibrary} from '../js/scenery_models.js';
import {CHUNK_LEN} from '../js/world.js';
import {ground} from '../js/terrain.js';
import {loadGlbScene} from './glb_scene.mjs';
import fs from 'node:fs';
import sharp from '/home/claude/.npm-global/lib/node_modules/sharp/lib/index.js';
const out=process.argv[2]||'/tmp/shots',SS=process.argv.slice(3).map(Number);fs.mkdirSync(out,{recursive:true});
const GLB=new URL('../assets/models/scenery_lite.glb',import.meta.url).pathname,{scene,json}=loadGlbScene(GLB);
// texturas do GLB (pixels) por índice de material
const raw=fs.readFileSync(GLB);let o=12,bin;while(o<raw.length){const cl=raw.readUInt32LE(o),ct=raw.readUInt32LE(o+4);if(ct===0x004E4942)bin=raw.subarray(o+8,o+8+cl);o+=8+cl;}
const TEX=[];for(const im of json.images){const bv=json.bufferViews[im.bufferView],b=bin.subarray(bv.byteOffset||0,(bv.byteOffset||0)+bv.byteLength);const r=await sharp(b).removeAlpha().raw().toBuffer({resolveWithObject:true});TEX.push({d:r.data,w:r.info.width,h:r.info.height});}
const texOf=id=>id.startsWith('tree')?TEX[2]:/hotel|apt|house/.test(id)?TEX[0]:TEX[1];
const lib=buildSceneryLibrary(scene);
const g=new Game({});g.input.poll=()=>{};g.scenery.setLibrary(lib);const S=g.scenery,T=g.track;
const W=1280,H=640,HOR=[.74,.85,.93],ZEN=[.31,.56,.85],L=(()=>{const v=[-.5,1,.6],m=Math.hypot(...v);return v.map(x=>x/m);})(),FOGN=450,FOGF=5600;
function shot(cam,look,name,fov=70){
  const fw=[look.x-cam.x,look.y-cam.y,look.z-cam.z],fl=Math.hypot(...fw);fw.forEach((_,i)=>fw[i]/=fl);let rt=[-fw[2],0,fw[0]];const rl=Math.hypot(rt[0],rt[2]);rt=[rt[0]/rl,0,rt[2]/rl];
  const up=[rt[1]*fw[2]-rt[2]*fw[1],rt[2]*fw[0]-rt[0]*fw[2],rt[0]*fw[1]-rt[1]*fw[0]],f=1/Math.tan(fov*Math.PI/360),asp=W/H,img=new Float32Array(W*H*3),zb=new Float32Array(W*H).fill(1e9);
  for(let y=0;y<H;y++){const t=Math.pow(Math.max(0,1-y/(H*.5)),.55);for(let x=0;x<W;x++)for(let c=0;c<3;c++)img[(y*W+x)*3+c]=HOR[c]+(ZEN[c]-HOR[c])*t;}
  const proj=(x,y,z)=>{const dx=x-cam.x,dy=y-cam.y,dz=z-cam.z;return[dx*rt[0]+dz*rt[2],dx*up[0]+dy*up[1]+dz*up[2],dx*fw[0]+dy*fw[1]+dz*fw[2]];};
  const tri=(A,B,C,col,bias=0)=>{const pa=proj(...A),pb=proj(...B),pc=proj(...C);if(pa[2]<1||pb[2]<1||pc[2]<1)return;
    const sx=[pa,pb,pc].map(p=>(p[0]/p[2]*f/asp*.5+.5)*W),sy=[pa,pb,pc].map(p=>(.5-p[1]/p[2]*f*.5)*H),sz=[pa[2],pb[2],pc[2]];
    const area=(sx[1]-sx[0])*(sy[2]-sy[0])-(sx[2]-sx[0])*(sy[1]-sy[0]);if(Math.abs(area)<1e-6)return;
    const x0=Math.max(0,Math.floor(Math.min(...sx))),x1=Math.min(W-1,Math.ceil(Math.max(...sx))),y0=Math.max(0,Math.floor(Math.min(...sy))),y1=Math.min(H-1,Math.ceil(Math.max(...sy)));if(x1<0||y1<0||x0>=W||y0>=H)return;const ia=1/area;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=x+.5,py=y+.5,w0=((sx[1]-px)*(sy[2]-py)-(sx[2]-px)*(sy[1]-py))*ia,w1=((sx[2]-px)*(sy[0]-py)-(sx[0]-px)*(sy[2]-py))*ia,w2=1-w0-w1;if(w0<0||w1<0||w2<0)continue;
      const z=w0*sz[0]+w1*sz[1]+w2*sz[2]-bias,zi=y*W+x;if(z>=zb[zi])continue;zb[zi]=z;const fk=Math.min(1,Math.max(0,(z-FOGN)/(FOGF-FOGN))),k=zi*3;for(let c=0;c<3;c++)img[k+c]=col[c]+(HOR[c]-col[c])*fk;}};
  const lit=(A,B,C,base)=>{const ux=B[0]-A[0],uy=B[1]-A[1],uz=B[2]-A[2],vx=C[0]-A[0],vy=C[1]-A[1],vz=C[2]-A[2];let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
    const mx=(A[0]+B[0]+C[0])/3-cam.x,my=(A[1]+B[1]+C[1])/3-cam.y,mz=(A[2]+B[2]+C[2])/3-cam.z;if(nx*mx+ny*my+nz*mz>0){nx=-nx;ny=-ny;nz=-nz;}   // dupla face
    const d=Math.max(0,nx*L[0]+ny*L[1]+nz*L[2]),li=.45+.65*d*.8+.25*(.5+.5*ny)*.5;return base.map(c=>c*li);};
  // terreno: grade em torno do ponto de olhar (células de 5 m até 260 m, depois 14 m)
  const gtmp={},cx=look.x,cz=look.z;
  for(const [R,cell] of[[300,5],[900,16]]){const n=Math.ceil(R*2/cell);const hs=new Float32Array((n+1)*(n+1));
    for(let j=0;j<=n;j++)for(let i=0;i<=n;i++){ground(T,cx-R+i*cell,cz-R+j*cell,gtmp,0);hs[j*(n+1)+i]=gtmp.h;}
    for(let j=0;j<n;j++)for(let i=0;i<n;i++){const x=cx-R+i*cell,z=cz-R+j*cell;if(R===900&&Math.abs(i*cell-R)<290&&Math.abs(j*cell-R)<290)continue;
      const p=(a,b)=>[x+a*cell,hs[(j+b)*(n+1)+i+a],z+b*cell],A=p(0,0),B=p(1,0),C=p(0,1),D=p(1,1);
      const sl=Math.hypot(B[1]-A[1],C[1]-A[1])/cell,hh=A[1],gcol=sl>.55?[.34,.31,.28]:hh>420?[.9,.92,.95]:[.2+.1*Math.min(1,sl*2),.38-.06*Math.min(1,sl*2),.12];
      tri(A,C,B,lit(A,C,B,gcol),R===900?1.5:0);tri(B,C,D,lit(B,C,D,gcol),R===900?1.5:0);}}
  // pista
  for(let s=Math.max(0,cam.s-80);s<cam.s+900;s+=4){const a=T.sampleAt(s),b=T.sampleAt(s+4),ra=[Math.cos(a.h),Math.sin(a.h)],rb=[Math.cos(b.h),Math.sin(b.h)];
    const P=(p,r,o)=>[p.x+r[0]*o,p.y+.05,p.z+r[1]*o],c=[.2,.2,.22];for(const [o0,o1,cc] of[[-a.w,a.w,c],[-1.2,1.2,[.7,.55,.1]]]){const A=P(a,ra,o0),B=P(a,ra,o1),C=P(b,rb,o0),D=P(b,rb,o1);tri(A,C,B,cc,3);tri(B,C,D,cc,3);}}
  // instâncias do cenário (as MESMAS matrizes que vão para a GPU)
  let ntri=0;
  for(const [mi,pool] of S.pools){if(!pool.n)continue;const m=lib.models[mi],G=m.geometry,P=G.attributes.position.array,UV=G.attributes.uv.array,ix=G.index.array,tx=texOf(m.id),M=pool.mesh.instanceMatrix.array;
    for(let n=0;n<pool.n;n++){const e=M.subarray(n*16,n*16+16),w=i=>{const x=P[i*3],y=P[i*3+1],z=P[i*3+2];return[e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]];};
      const dd=Math.hypot(e[12]-cam.x,e[14]-cam.z);if(dd>1500)continue;
      for(let t=0;t<ix.length;t+=3){const a=ix[t],b=ix[t+1],c=ix[t+2],u=(UV[a*2]+UV[b*2]+UV[c*2])/3,v=(UV[a*2+1]+UV[b*2+1]+UV[c*2+1])/3,px=Math.min(tx.w-1,Math.max(0,Math.floor(u*tx.w))),py=Math.min(tx.h-1,Math.max(0,Math.floor(v*tx.h))),k=(py*tx.w+px)*3;
        const base=[tx.d[k]/255,tx.d[k+1]/255,tx.d[k+2]/255].map(c=>Math.pow(c,2.2)*1.15),A=w(a),B=w(b),C=w(c);tri(A,B,C,lit(A,B,C,base).map(c=>Math.pow(Math.min(1,c),1/1.6)));ntri++;}}}
  // fundações
  const pp=S.plinth;if(pp)for(let n=0;n<pp.n;n++){const e=pp.mesh.instanceMatrix.array.subarray(n*16,n*16+16),Bx=[[-.5,0,-.5],[.5,0,-.5],[.5,0,.5],[-.5,0,.5],[-.5,-1,-.5],[.5,-1,-.5],[.5,-1,.5],[-.5,-1,.5]].map(([x,y,z])=>[e[0]*x+e[4]*y+e[8]*z+e[12],e[1]*x+e[5]*y+e[9]*z+e[13],e[2]*x+e[6]*y+e[10]*z+e[14]]);
    for(const q of[[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){tri(Bx[q[0]],Bx[q[1]],Bx[q[2]],lit(Bx[q[0]],Bx[q[1]],Bx[q[2]],[.3,.28,.25]));tri(Bx[q[0]],Bx[q[2]],Bx[q[3]],lit(Bx[q[0]],Bx[q[2]],Bx[q[3]],[.3,.28,.25]));}}
  const buf=Buffer.alloc(W*H*3);for(let i=0;i<W*H*3;i++)buf[i]=Math.round(255*Math.pow(Math.min(1,Math.max(0,img[i])),1/2.2));
  return sharp(buf,{raw:{width:W,height:H,channels:3}}).png().toFile(`${out}/${name}.png`).then(()=>console.log(name,'· instâncias desenhadas:',ntri,'tris'));
}
for(const s of SS){const P=g.player;P.respawn(s,40);for(let i=0;i<5;i++)g.update(1/60);P.respawn(s,40);g.rig.init=false;g.update(1/60);S.flush();S._refresh(g.camera);
  const c=g.rig.pos,l=g.rig.look;await shot({x:c.x,y:c.y,z:c.z,s},{x:l.x,y:l.y,z:l.z},'s'+s);}
