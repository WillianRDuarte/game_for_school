// Atmosfera vulcânica: lógica pura (sem GPU). node --import ./tests/register.mjs tests/atmosphere_test.mjs
import {makeClouds,puffRel,puffTextureData,Atmosphere,LAYERS} from '../js/atmosphere.js';
import * as THREE from 'three';
let fails=0;const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)fails++;};
const D=makeClouds(2024,false),M=makeClouds(2024,true);
ok(D.puffs.length>300&&D.puffs.length<700,`nuvens desktop: ${D.masses.length} massas, ${D.puffs.length} puffs`);
const AM=new Atmosphere(new THREE.Scene(),{mobile:true});ok(AM.cg.instanceCount<D.puffs.length*.6,`celular (nível 1) desenha bem menos puffs (${AM.cg.instanceCount} vs ${D.puffs.length})`);
const again=makeClouds(2024,false);ok(JSON.stringify(again.puffs[7])===JSON.stringify(D.puffs[7]),'geração determinística');
// wrap: as massas dos anéis de mundo ficam sempre dentro de ±R em volta da câmera, qualquer que seja a posição
let bad=0;const o=[0,0,0,0];
for(const cx of[0,1e3,-77777,123456.7])for(const t of[0,50,900])for(const p of D.puffs.slice(0,200)){const m=D.masses[p.m];if(!m.R)continue;puffRel(m,p,cx,0,cx*.3,t,o);if(Math.abs(o[0]-p.ox)>m.R+1e-6||Math.abs(o[2]-p.oz)>m.R+1e-6||!(o[3]>=0&&o[3]<=1))bad++;}
ok(bad===0,'anéis de mundo ficam em ±R ao redor da câmera (sem sumir/explodir longe da origem)');
// paralaxe real: andar 400 m para a frente muda a posição das nuvens próximas muito mais que as do horizonte
const nearP=D.puffs.find(p=>D.masses[p.m].layer==='near'),farP=D.puffs.find(p=>D.masses[p.m].layer==='far');
const a=puffRel(D.masses[nearP.m],nearP,0,0,0,0,[0,0,0,0]).slice(),b=puffRel(D.masses[nearP.m],nearP,0,0,-400,0,[0,0,0,0]).slice();
const c=puffRel(D.masses[farP.m],farP,0,0,0,0,[0,0,0,0]).slice(),d=puffRel(D.masses[farP.m],farP,0,0,-400,0,[0,0,0,0]).slice();
ok(Math.hypot(a[2]-b[2])>300&&Math.abs(c[2]-d[2])<1,'nuvem próxima passa (paralaxe); anel do horizonte quase não se mexe');
const tx=puffTextureData(32);let amax=0,amin=255;for(let i=3;i<tx.length;i+=4){amax=Math.max(amax,tx[i]);amin=Math.min(amin,tx[i]);}
ok(amax>200&&amin<10,'textura do puff: miolo denso, bordas transparentes');
// níveis de qualidade
const sc=new THREE.Scene(),A=new Atmosphere(sc,{mobile:false});const n2=A.cg.instanceCount;A.setTier(1);const n1=A.cg.instanceCount;A.setTier(0);const n0=A.cg.instanceCount;
ok(n0<n1&&n1<n2,`tiers reduzem os puffs (${n0} < ${n1} < ${n2})`);
// custo por frame (CPU)
A.setTier(2);const cam=new THREE.PerspectiveCamera(70,1.7,1,7000),pl={psi:0,y:0};let t0=performance.now();const N=600;
for(let i=0;i<N;i++){cam.position.set(0,50,-i*1.2);A.update(1/60,cam,pl,[0,0,200],150);}
const ms=(performance.now()-t0)/N;ok(ms<1.0,`Atmosphere.update ${ms.toFixed(3)} ms/frame (média)`);
console.log(fails?`\n${fails} FALHA(S)`:'\nTUDO OK');process.exit(fails?1:0);
