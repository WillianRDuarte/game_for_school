// Testa ground(): desempenho, continuidade (sem degraus), integração com a estrada, inclinações. Uso: node tests/ground_test.mjs
import {Track,STEP} from '../js/road.js';
import {ground,surface} from '../js/terrain.js';
const T=new Track(7);T.ensureZ(-30000);
const g={},o={};
// 1) custo por chamada
let t0=performance.now(),n=0;for(let i=0;i<40000;i++){ground(T,(i%200)*7-700,-3000-(i/200|0)*11,g);n++;}
console.log('ground() perto/longe da pista:',((performance.now()-t0)/n*1000).toFixed(1),'µs/chamada');
// pontos ao longo da pista
const S=i=>T.samples.get(i);
// 2) sob a pista: altura = leito-0.1; e o eixo não é enterrado
let bad=0,maxErr=0;
for(let i=100;i<3000;i+=7){const s=S(i);for(const off of[-s.w+1,-s.w*.5,0,s.w*.5,s.w-1]){
  const x=s.x+Math.cos(s.h)*off,z=s.z+Math.sin(s.h)*off;ground(T,x,z,g,0);const err=Math.abs(g.h-(g.roadY-.1));maxErr=Math.max(maxErr,err);if(g.d>g.w||err>.02)bad++;}}
console.log('pontos sob a pista com altura ≠ leito:',bad,'· erro máx',maxErr.toFixed(3),'m');
// 3) continuidade lateral e longitudinal (amostras a 2 m): maior variação de altura por metro
let maxSlope=0,maxAt=null,jumps=0;const hist=new Array(12).fill(0);
for(let i=200;i<2600;i+=5){const s=S(i);let prev=null;
  for(let d=-600;d<=600;d+=2){const off=d,x=s.x+Math.cos(s.h)*off,z=s.z+Math.sin(s.h)*off;ground(T,x,z,g,0);
    if(prev!==null){const sl=Math.abs(g.h-prev)/2;if(sl>maxSlope){maxSlope=sl;maxAt={i,d,dh:g.h-prev};}if(sl>3)jumps++;hist[Math.min(11,Math.floor(sl/.2))]++;}prev=g.h;}}
console.log('inclinação máx do terreno (tg):',maxSlope.toFixed(2),'≈',(Math.atan(maxSlope)*180/Math.PI).toFixed(0)+'°','· saltos > tg 3:',jumps);
const tot=hist.reduce((a,b)=>a+b,0);console.log('distribuição da inclinação (tg em faixas de 0,2):',hist.map(v=>(100*v/tot).toFixed(1)+'%').join(' '));
// 4) continuidade em torno da fronteira do índice espacial (170 m): varre linhas perpendiculares em passos finos
let maxJ=0;for(let i=300;i<3000;i+=9){const s=S(i);let prev=null;for(let d=100;d<=420;d+=.5){const x=s.x+Math.cos(s.h)*(s.w+d),z=s.z+Math.sin(s.h)*(s.w+d);ground(T,x,z,g,0);if(prev!==null)maxJ=Math.max(maxJ,Math.abs(g.h-prev)/.5);prev=g.h;}}
console.log('maior inclinação (tg) na faixa 100–420 m da borda (fronteira do índice):',maxJ.toFixed(2));
// 5) perfil médio: relevo vs distância à borda
for(const [nm,lo,hi] of[['acostamento 0–4 m',0,4],['10–30 m',10,30],['100–200 m',100,200],['400–800 m',400,800],['1000–3000 m',1000,3000]]){
  const v=[];for(let i=400;i<2800;i+=23){const s=S(i);for(const sd of[-1,1])for(let d=lo;d<=hi;d+=Math.max(1,(hi-lo)/8)){const x=s.x+Math.cos(s.h)*sd*(s.w+d),z=s.z+Math.sin(s.h)*sd*(s.w+d);ground(T,x,z,g,0);v.push(g.h-s.y);}}
  v.sort((a,b)=>a-b);console.log(`altura vs leito a ${nm}: p5 ${v[v.length*.05|0].toFixed(0)}  mediana ${v[v.length>>1].toFixed(0)}  p95 ${v[v.length*.95|0].toFixed(0)} m`);}
// 6) o mundo é dirigível longe da pista (sem "fim de mapa")
const far=[];for(const [dx,dz] of[[2000,0],[-2500,-500],[0,3000],[4000,-3000]]){ground(T,dx,-2000+dz,g,0);far.push(g.h.toFixed(0));}
console.log('alturas em pontos a 2–5 km da pista:',far.join(', '));
// 7) onde estão as inclinações > tg 1,2?
{const pts=[];for(let i=200;i<2600;i+=5){const s=S(i);let prev=null;for(let d=-600;d<=600;d+=2){const x=s.x+Math.cos(s.h)*d,z=s.z+Math.sin(s.h)*d;ground(T,x,z,g,0);
  if(prev!==null&&Math.abs(g.h-prev)/2>1.2)pts.push([i,d,(Math.abs(g.h-prev)/2).toFixed(2),g.d.toFixed(0),g.zs.toFixed(2)]);prev=g.h;}}
  console.log('trechos com tg>1,2:',pts.length,pts.slice(0,8).map(p=>p.join('/')).join('  '));}
