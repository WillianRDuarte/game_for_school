// Testes headless (Node) da geração da estrada e do terreno. Uso: node tests/track_test.mjs
import {Track,STEP,THEMES,WMAX} from '../js/road.js';
import {ground} from '../js/terrain.js';
const T=new Track(7);const N=12000;T.get(N);
let maxDh=0,maxDk=0,maxDg=0,maxG=0,ymin=1e9,ymax=-1e9,hmax=0,rmin=1e9,wmin=1e9,wmax=0,maxDw=0;
const S=i=>T.samples.get(i);
for(let i=1;i<N;i++){const a=S(i-1),b=S(i);
  maxDh=Math.max(maxDh,Math.abs(b.h-a.h));maxDk=Math.max(maxDk,Math.abs(b.curv-a.curv));maxDg=Math.max(maxDg,Math.abs(b.slope-a.slope));
  maxG=Math.max(maxG,Math.abs(b.slope));ymin=Math.min(ymin,b.y);ymax=Math.max(ymax,b.y);hmax=Math.max(hmax,Math.abs(b.h));
  if(Math.abs(b.curv)>1e-6)rmin=Math.min(rmin,1/Math.abs(b.curv));wmin=Math.min(wmin,b.w);wmax=Math.max(wmax,b.w);maxDw=Math.max(maxDw,Math.abs(b.w-a.w));
  const d=Math.hypot(b.x-a.x,b.z-a.z);if(Math.abs(d-STEP)>.05)throw new Error('passo irregular '+i);
  if(b.z>a.z)throw new Error('z não monotônico '+i);}
console.log('AMOSTRAS',N,`(${N*STEP/1000} km)`);
console.log('máx Δrumo/passo (rad)',maxDh.toFixed(4),'→ raio mínimo',rmin.toFixed(0),'m');
console.log('máx Δcurvatura/passo',maxDk.toExponential(2),'(saltos de curvatura ⇒ "quebra" na estrada)');
console.log('máx Δinclinação/passo',maxDg.toExponential(2),' máx inclinação',(maxG*100).toFixed(1)+'%');
console.log('altitude',ymin.toFixed(0),'..',ymax.toFixed(0),'m · |rumo| máx',(hmax*180/Math.PI).toFixed(0)+'°');
console.log('meia-largura',wmin.toFixed(1),'..',wmax.toFixed(1),'m (pista total',(2*wmin).toFixed(0),'–',(2*wmax).toFixed(0),'m) · máx Δlargura/passo',maxDw.toFixed(3));
// estatística das manobras e das regiões
const cnt={},th={};let last=null;
for(let i=0;i<N;i++){const s=S(i);th[THEMES[s.th].name]=(th[THEMES[s.th].name]||0)+1;}
console.log('regiões (% do percurso):',Object.entries(th).map(([k,v])=>k+' '+(100*v/N).toFixed(0)+'%').join(' · '));
// distribuição de ganho de altitude: extremos locais
let ext=[],dir=0,ref=S(0).y,ry=S(0).y;
for(let i=1;i<N;i++){const y=S(i).y,d=y>S(i-1).y+1e-9?1:y<S(i-1).y-1e-9?-1:0;if(d&&dir&&d!==dir){ext.push(S(i-1).y);}if(d)dir=d;}
const sw=[];for(let i=1;i<ext.length;i++)sw.push(Math.abs(ext[i]-ext[i-1]));
console.log('extremos (topos/vales):',ext.length,'· variação entre topo e vale: média',(sw.reduce((a,b)=>a+b,0)/sw.length).toFixed(0),'m, máx',Math.max(...sw).toFixed(0),'m');
// aproximação da pista a si mesma (trechos não vizinhos): distância mínima entre eixos vs. largura
let worst=1e9,wi=0;for(let i=0;i<N;i+=3)for(let j=i+150;j<Math.min(N,i+900);j+=3){const a=S(i),b=S(j),d=Math.hypot(a.x-b.x,a.z-b.z);if(d<worst){worst=d;wi=i;}}
console.log('menor distância entre eixos de trechos distantes ≥600 m de percurso:',worst.toFixed(0),'m (pista total ~',(2*S(wi).w).toFixed(0),'m)');
// distribuição de tipos de curva a partir do rumo total
