// Verifica, para cada nível de LOD, se a malha do terreno fica ABAIXO da pista (pista nunca enterrada) e se tiles vizinhos concordam nas bordas.
import {Track} from '../js/road.js';
import {ground,TileSampler,TILE_N,MIN_TILE,PAD,TILE_VERTS} from '../js/terrain.js';
const T=new Track(7);T.ensureZ(-20000);const sm=new TileSampler();
function tile(x0,z0,l){T.ensureZ(z0-1150);sm.begin(x0,z0,l);while(!sm.step(T,Infinity));const pos=new Float32Array(TILE_VERTS*3),n=new Float32Array(TILE_VERTS*3),c=new Float32Array(TILE_VERTS*3);sm.finish(pos,n,c);return{pos,x0,z0,l,cell:MIN_TILE*2**l/TILE_N};}
function hAt(t,x,z){const N=TILE_N,W=N+1,fx=(x-t.x0)/t.cell,fz=(z-t.z0)/t.cell,i=Math.min(N-1,Math.max(0,Math.floor(fx))),j=Math.min(N-1,Math.max(0,Math.floor(fz))),u=fx-i,v=fz-j;
  const h=(a,b)=>t.pos[((b*W)+a)*3+1];// mesma triangulação do índice: (p,r,q),(q,r,s)
  if(u+v<=1)return h(i,j)+(h(i+1,j)-h(i,j))*u+(h(i,j+1)-h(i,j))*v;return h(i+1,j+1)+(h(i,j+1)-h(i+1,j+1))*(1-u)+(h(i+1,j)-h(i+1,j+1))*(1-v);}
const S=i=>T.samples.get(i);
for(let l=0;l<6;l++){const size=MIN_TILE*2**l;let worst=-1e9,n=0,buried=0;
  for(let i=300;i<2400;i+=37){const s=S(i);for(const off of[-s.w,-s.w*.8,-s.w*.4,0,s.w*.4,s.w*.8,s.w]){
    const x=s.x+Math.cos(s.h)*off,z=s.z+Math.sin(s.h)*off,x0=Math.floor(x/size)*size,z0=Math.floor(z/size)*size;const t=tile(x0,z0,l);const gap=hAt(t,x,z)-(s.y+.05);n++;worst=Math.max(worst,gap);if(gap>0.02)buried++;}}
  console.log(`LOD${l} (célula ${size/TILE_N} m, pad ${PAD[l]} m): pontos da pista cobertos pelo terreno ${buried}/${n} · maior excesso ${worst.toFixed(2)} m`);}
// bordas: tiles vizinhos do mesmo nível
let mx=0;for(const l of[0,2,4]){const size=MIN_TILE*2**l,s=S(900),x0=Math.floor(s.x/size)*size,z0=Math.floor(s.z/size)*size,a=tile(x0,z0,l),b=tile(x0+size,z0,l);
  for(let j=0;j<=TILE_N;j++)mx=Math.max(mx,Math.abs(a.pos[((j*(TILE_N+1))+TILE_N)*3+1]-b.pos[((j*(TILE_N+1)))*3+1]));}
console.log('diferença máx de altura na borda entre tiles vizinhos (mesmo nível):',mx.toExponential(1),'m');
