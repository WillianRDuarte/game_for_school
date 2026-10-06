// Simula o jogo headless: streaming de tiles, cobertura do terreno (sem buracos), carro na pista e fora dela.
// Uso: node --import ./tests/register.mjs tests/world_test.mjs
import * as THREE from 'three';
import {Track,STEP} from '../js/road.js';
import {World} from '../js/world.js';
import {Player} from '../js/player.js';
import {ground,surface} from '../js/terrain.js';
const T=new Track(7),scene=new THREE.Scene(),world=new World(scene,T),P=new Player(T);
let t0=performance.now();world.preload(P.x,P.z,P.s);console.log('preload:',(performance.now()-t0).toFixed(0),'ms · tiles',world.tiles.size,'· faltam',world.loading);
// cobertura: pontos em anéis ao redor do carro devem estar dentro de algum tile pronto
function coverage(r){let miss=0,n=0;for(let a=0;a<360;a+=10)for(const d of[r*.25,r*.5,r]){const x=P.x+Math.cos(a*Math.PI/180)*d,z=P.z+Math.sin(a*Math.PI/180)*d;n++;
  let ok=false;for(const t of world.tiles.values())if(x>=t.x0&&x<t.x0+t.size&&z>=t.z0&&z<t.z0+t.size){ok=true;break;}if(!ok)miss++;}return{miss,n};}
console.log('cobertura logo após preload (r=500 m):',JSON.stringify(coverage(500)));
const inp={throttle:1,brake:0,steer:0};let worstFrame=0,holes500=0,holes1500=0,frames=0,maxTiles=0,hist=[];
const dtF=1/60;let steerPlan=0;
function run(sec,label,ctl){
  for(let f=0;f<sec*60;f++){ctl(f);P.update(dtF,inp);const a=performance.now();world.update(P.x,P.z,P.s,5);const d=performance.now()-a;worstFrame=Math.max(worstFrame,d);frames++;
    if(f%30===0){const c=coverage(500);holes500+=c.miss;if(frames>300){const c2=coverage(1500);holes1500+=c2.miss;}}maxTiles=Math.max(maxTiles,world.tiles.size);
    if(!isFinite(P.x+P.y+P.z))throw new Error('NaN no carro');}
  const s=surface(T,P.x,P.z,{});console.log(label.padEnd(34),'s',P.s.toFixed(0).padStart(6),'m · v',(P.speed*3.6).toFixed(0).padStart(3),'km/h · fora',P.off.toFixed(2),'· y',P.y.toFixed(1),'· chão',s.h.toFixed(1),'· tiles',world.tiles.size,'· faltam',world.loading);}
// autopiloto simples que segue a pista
function follow(f){const p=T.sampleAt(P.s+25),dx=p.x-P.x,dz=p.z-P.z,want=Math.atan2(dx,-dz),err=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));inp.steer=Math.max(-1,Math.min(1,err*3));}
run(20,'na pista 20 s',follow);
run(40,'na pista +40 s',follow);
// saída da pista: gira forte para a direita por 2 s e depois segue em linha reta por ~20 s
run(2,'guina para fora',f=>{inp.steer=1;});
let maxOff=0,offT=0;run(20,'dirige no terreno (reto)',f=>{inp.steer=0;const c=surface(T,P.x,P.z,{});maxOff=Math.max(maxOff,c.d-c.w);});
console.log('  distância máx. da borda da pista:',maxOff.toFixed(0),'m');
// volta para a pista: apontar para o ponto mais próximo
let backOn=false;run(40,'volta para a pista',f=>{if(surface(T,P.x,P.z,{}).onRoad)backOn=true;let bi=P.idx,bd=1e18;for(let i=Math.max(T.minKept,P.idx-400);i<P.idx+400;i++){const s=T.get(i),d=(s.x-P.x)**2+(s.z-P.z)**2;if(d<bd){bd=d;bi=i;}}
  const s=T.get(bi),want=Math.atan2(s.x-P.x,-(s.z-P.z)),err=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));inp.steer=Math.max(-1,Math.min(1,err*3));});
const c=surface(T,P.x,P.z,{});console.log('  voltou à pista em algum momento?',backOn,'· no fim onRoad',c.onRoad,'(d',c.d.toFixed(0),'w',c.w.toFixed(0),')');
// R (respawn) funciona
P.respawn(P.s);run(1,'respawn',follow);
console.log('pior custo de world.update num frame:',worstFrame.toFixed(1),'ms · máx. tiles simultâneos',maxTiles,'· tiles construídos',world.stats.built);
console.log('buracos de cobertura (amostras sem tile): r=500 m →',holes500,' r=1500 m →',holes1500);
