// Mapa aéreo do cenário gerado (PNG): pista, prédios (retângulos orientados, cor por classe), árvores (pontos) e regiões.
// Uso: node --import ./tests/register.mjs tests/scenery_map.mjs <saida.png> [s0=0] [s1=6000]
import {Game} from '../js/game.js';
import {buildSceneryLibrary} from '../js/scenery_models.js';
import {CHUNK_LEN} from '../js/world.js';
import {loadGlbScene} from './glb_scene.mjs';
import sharp from '/home/claude/.npm-global/lib/node_modules/sharp/lib/index.js';
const out=process.argv[2]||'/tmp/map.png',S0=+process.argv[3]||0,S1=+process.argv[4]||6000;
const {scene}=loadGlbScene(new URL('../assets/models/scenery_lite.glb',import.meta.url).pathname);const lib=buildSceneryLibrary(scene);
const g=new Game({});g.scenery.setLibrary(lib);const S=g.scenery,T=g.track;
const recs=[];for(let c=Math.floor(S0/CHUNK_LEN);c<=Math.floor(S1/CHUNK_LEN);c++){g.player.s=c*CHUNK_LEN;S.flush(1,1);for(const [k,ch] of S.chunks)if(k===c||k===c+1)for(const r of ch.recs)if(!recs.includes(r))recs.push(r);}
// bounding box do trecho
const pts=[];for(let s=S0;s<=S1;s+=8){const p=T.sampleAt(s);pts.push(p);}
let x0=1e9,x1=-1e9,z0=1e9,z1=-1e9;for(const r of recs.concat(pts)){x0=Math.min(x0,r.x);x1=Math.max(x1,r.x);z0=Math.min(z0,r.z);z1=Math.max(z1,r.z);}
const M=60,W=1600,sc=Math.min((W-2*M)/(x1-x0),2400/(z1-z0)),H=Math.round((z1-z0)*sc+2*M),px=x=>(x-x0)*sc+M,pz=z=>(z-z0)*sc+M;
const COL={house:'#e08030',shop:'#e0c020',mid:'#3090e0',tall:'#a040d0',big:'#e03030'},ZC=['#d9e8c0','#e6eec8','#e8e0d0','#cfcfd8'];
let svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#bcd29a"/>`;
// faixa de cor por região ao longo da pista
for(let s=S0;s<S1;s+=24){const p=T.sampleAt(s),q=T.sampleAt(s+24),zp={zw:[0,0,0,0],cm:[0,0,0,0,0]};S.zones.at(s,zp);svg+=`<line x1="${px(p.x)}" y1="${pz(p.z)}" x2="${px(q.x)}" y2="${pz(q.z)}" stroke="${ZC[zp.zone]}" stroke-width="${(2*p.w+60)*sc}" stroke-linecap="butt" opacity=".9"/>`;}
for(let s=S0;s<S1;s+=24){const p=T.sampleAt(s),q=T.sampleAt(s+24);svg+=`<line x1="${px(p.x)}" y1="${pz(p.z)}" x2="${px(q.x)}" y2="${pz(q.z)}" stroke="#444" stroke-width="${2*p.w*sc}"/>`;}
for(const r of recs){if(r.kind==='tree')svg+=`<circle cx="${px(r.x)}" cy="${pz(r.z)}" r="${Math.max(1.2,r.r*sc*.6)}" fill="#2a7a2a" opacity=".75"/>`;}
for(const r of recs){if(r.kind!=='bld')continue;const a=-r.yaw*180/Math.PI;   // SVG gira no sentido horário (z para baixo) = rotação do modelo
  svg+=`<g transform="translate(${px(r.x)},${pz(r.z)}) rotate(${r.yaw*180/Math.PI})"><rect x="${-r.hx*sc}" y="${-r.hz*sc}" width="${2*r.hx*sc}" height="${2*r.hz*sc}" fill="${COL[r.cls]}" stroke="#222" stroke-width="1"/></g>`;}
for(let s=Math.ceil(S0/500)*500;s<S1;s+=500){const p=T.sampleAt(s);svg+=`<text x="${px(p.x)+12}" y="${pz(p.z)}" font-size="16" fill="#000">${s} m</text>`;}
svg+='</svg>';await sharp(Buffer.from(svg)).png().toFile(out);
const nb=recs.filter(r=>r.kind==='bld'),nt=recs.length-nb.length,by={};for(const r of nb)by[r.m.id]=(by[r.m.id]||0)+1;
console.log('mapa',out,W+'x'+H,'· prédios',nb.length,'árvores',nt,'· por modelo',JSON.stringify(by),'· recusas',JSON.stringify(S.stats.rej));
