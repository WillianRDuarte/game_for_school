// Objetos órfãos do sistema de meteoros: o indicador de impacto tem que estar na cena, sumir no impacto e nada pode ficar para trás.
// Uso: node --import ./tests/register.mjs tests/orphan_test.mjs
import {Game} from '../js/game.js';
import {surface} from '../js/terrain.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,M=g.meteors,P=g.player;g.input.poll=()=>{};
const follow=()=>{const T=g.track,p=T.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};
const inScene=()=>new Set(g.scene.children);
g.traffic.update=()=>{};   // este teste audita SÓ o sistema de meteoros: carros danificados/destroços em chamas do tráfego emitem fumaça no mesmo pool de partículas (por desenho) e não são "órfãos de meteoro"

console.log('1) o indicador de impacto está na cena (pool completo)');
M.difficulty=()=>1;for(let i=0;i<10*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
{const S=inScene();ok(M.markers.length>0&&M.markers.every(k=>S.has(k.group)),`${M.markers.filter(k=>S.has(k.group)).length}/${M.markers.length} marcadores na cena`);
 ok(M.meteors.every(m=>S.has(m.root)),`${M.meteors.length}/${M.meteors.length} meteoros em queda na cena`);}

console.log('2) um meteoro: indicador aparece antes da queda e some no impacto');
{g.restart();M.nextSpawn=1e9;M.time=5;M.difficulty=()=>0;const before=M.meteors.filter(m=>m.active);M.spawn();const m=M.meteors.find(m=>m.active&&!before.includes(m)),mk=m.marker;
 ok(mk&&mk.used&&mk.group.visible&&inScene().has(mk.group),'recém-lançado: marcador em uso, visível e na cena');
 for(let i=0;i<Math.floor((m.T-.2)*60);i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
 ok(m.active&&mk.group.visible,`a 0,2 s do impacto: marcador ainda visível (t=${m.t.toFixed(2)}/${m.T.toFixed(2)} s)`);
 for(let i=0;i<30&&m.active;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
 ok(!m.active&&!mk.used&&!mk.group.visible&&!m.root.visible&&m.marker===null,'depois do impacto: meteoro e marcador devolvidos ao pool, invisíveis');
 const c=[...M.craterCells.values()].flat();ok(c.length===1,'a cratera/rocha do impacto foi criada normalmente ('+c.length+')');}

console.log('3) caos: nunca há marcador/meteoro visível sem dono (a cada frame, 40 s, 2 dificuldades)');
for(const k of[.4,1]){g.restart();M.difficulty=()=>k;let bad=0,fr=0,peak=0;
 for(let i=0;i<40*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);fr++;
  const own=new Set(M.meteors.filter(m=>m.active&&m.marker).map(m=>m.marker));peak=Math.max(peak,own.size);
  for(const q of M.markers){if(q.used!==own.has(q))bad++;if(q.group.visible&&!own.has(q))bad++;}
  for(const m of M.meteors)if(!m.active&&(m.root.visible||m.marker))bad++;}
 ok(bad===0,`dificuldade ${k}: ${fr} frames, pico ${peak} marcadores em uso, inconsistências ${bad}`);}

console.log('4) depois do último spawn não sobra nenhum objeto temporário');
{M.nextSpawn=1e9;for(let i=0;i<20*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
 const L={ativos:M.nActive,marcVis:M.markers.filter(k=>k.group.visible).length,marcUso:M.markers.filter(k=>k.used).length,heat:M.heat.filter(h=>h.s.visible).length,flash:M.flashes.filter(f=>f.visible).length,fogo:M.fire.alive,fumaca:M.smoke.alive,rootsVis:M.meteors.filter(m=>m.root.visible).length};
 ok(Object.values(L).every(v=>v===0),'20 s depois: '+JSON.stringify(L));
 ok(M.stats.decals>0&&M.stats.rocks>0,`crateras (${M.stats.decals}) e rochas no chão (${M.stats.rocks}) permanecem, como deve ser`);}

console.log('5) o meteoro de punição também devolve o marcador');
{g.restart();M.nextSpawn=1e9;M.time=5;const q=g.track.sampleAt(600),w=q.w+250;P.x=q.x+Math.cos(q.h)*w;P.z=q.z+Math.sin(q.h)*w;P.psi=q.h+Math.PI/2;P.vx=Math.sin(P.psi)*20;P.vz=-Math.cos(P.psi)*20;P.speed=20;P.idx=150;P.update(0,{throttle:0,brake:0,steer:0});
 for(let i=0;i<4*60&&g.state==='running';i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
 for(let i=0;i<60;i++)g.update(dt);
 ok(g.state==='over'&&M.nActive===0&&M.markers.every(k=>!k.used&&!k.group.visible),'morte por meteoro de punição: nenhum marcador ficou na cena');}
console.log('\nFIM · exitCode',process.exitCode||0);
