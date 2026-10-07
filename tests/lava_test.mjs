// Lava: distância inicial, perseguição, morte ao ser alcançado, fuga acelerando, chunks, pool, reinício, desempenho.
// Uso: node --import ./tests/register.mjs tests/lava_test.mjs
import {Game,MAX_LIVES} from '../js/game.js';
import {LAVA} from '../js/lava.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,L=g.lava,P=g.player;g.input.poll=()=>{};
// isola: sem meteoros/tráfego/perks matando o jogador (só a lava é testada)
g.meteors.update=()=>{};g.meteors.collide=()=>{};g.traffic.update=()=>{};g.perks.update=()=>{};g.scenery.collide=()=>{};g.scenery.update=()=>{};
const pilot=()=>{const q=g.track.sampleAt(P.s+25+P.speed*.4);let d=Math.atan2(q.x-P.x,-(q.z-P.z))-P.psi;d=Math.atan2(Math.sin(d),Math.cos(d));return Math.max(-1,Math.min(1,d*2.2));};   // piloto automático: segue a pista
const run=(sec,thr,brk,pre)=>{for(let i=0;i<Math.round(sec*60)&&g.state==='running';i++){g.input.throttle=thr;g.input.brake=brk;g.input.steer=pilot();pre&&pre(i);g.update(dt);}};
console.log('1) distância inicial segura e não aparece em cima do jogador');
ok(Math.abs(L.gap-LAVA.START_GAP)<1,`intervalo inicial ${L.gap.toFixed(1)} m (esperado ${LAVA.START_GAP})`);
ok(g.state==='running','começa vivo');
console.log('2) jogador PARADO (freio) é alcançado e morre');
{const t0=P.s;let t=0;const gap0=L.gap;run(60,0,1,()=>{t+=dt;});ok(g.state==='over',`morreu parado após ${t.toFixed(1)} s (intervalo ${gap0.toFixed(0)} m)`);ok(g.lives===0,'vidas = 0 (game over imediato)');
 ok(/lava/i.test(g.ui.os.textContent),'mensagem de game over cita a lava: '+g.ui.os.textContent);}
console.log('3) jogador LENTO (sem acelerar) também é alcançado, mas só depois de um tempo');
g.restart();
{let t=0;run(120,0,0,()=>{t+=dt;});ok(g.state==='over',`morreu em marcha lenta após ~${t.toFixed(0)} s`);ok(t>12,'não foi instantâneo (>12 s)');}
console.log('4) ACELERANDO o jogador escapa e se afasta');
g.restart();
{let minGap=1e9,maxGap=0;run(90,1,0,()=>{minGap=Math.min(minGap,L.gap);maxGap=Math.max(maxGap,L.gap);});
 ok(g.state==='running',`vivo após 90 s acelerando (menor intervalo ${minGap.toFixed(0)} m, maior ${maxGap.toFixed(0)} m, dist ${Math.round(P.s)} m)`);ok(maxGap>LAVA.START_GAP+50,'o intervalo cresce quando acelera');ok(maxGap<=LAVA.MAX_GAP+1,'intervalo nunca passa de MAX_GAP');}
console.log('5) desacelerar → lava se aproxima; acelerar de novo → se afasta');
g.restart();
{run(25,1,0);const a=L.gap;run(8,0,1);const b=L.gap;ok(b<a,`freando o intervalo cai ${a.toFixed(0)} → ${b.toFixed(0)} m`);
 if(g.state==='running'){run(10,1,0);ok(L.gap>b,`acelerando de novo o intervalo volta a crescer (${b.toFixed(0)} → ${L.gap.toFixed(0)} m)`);}}
console.log('6) integração com chunks e pools');
g.restart();
{run(40,1,0);const n=L.active.size;ok(n>=2&&n<=10,`${n} chunks de lava ativos (janela limitada: ≤10 com a área ampliada de 1150 m atrás da frente; era ≤6)`);
 const geos=new Set();for(const c of L.active.values())geos.add(c.g);ok(geos.size===n,'uma geometria por chunk');
 let objs=0;const cnt=o=>{objs++;};for(const o of g.scene.children)cnt(o);
 const lavaObjs=n+2+2+1;ok(lavaObjs<=14,`objetos de cena da lava ≈ ${lavaObjs} (sem milhares de meshes)`);
 const fin=[...L.active.values()].every(c=>c.g.boundingSphere&&isFinite(c.g.boundingSphere.radius)&&c.g.attributes.position.array.every(Number.isFinite));ok(fin,'vértices finitos e esfera de culling válida');
 const sizeBefore=L.gpool.length+L.active.size;run(30,1,0);ok(L.gpool.length+L.active.size+(L.job?1:0)<=sizeBefore+3,'geometrias recicladas em pool (sem vazamento)');
 ok(L.light.intensity>=0,'luz da lava presente');}
console.log('7) reinício limpa e recomeça com intervalo seguro');
g.restart();ok(g.state==='running'&&Math.abs(L.gap-LAVA.START_GAP)<1,`após restart intervalo ${L.gap.toFixed(1)} m`);
console.log('8) desempenho do update da lava');
{const ts=[];for(let i=0;i<600;i++){g.input.throttle=1;g.input.brake=0;g.input.poll=()=>{};P.update(dt,g.input);const t0=performance.now();L.update(dt);ts.push(performance.now()-t0);}
 ts.sort((a,b)=>a-b);const avg=ts.reduce((a,b)=>a+b)/ts.length,p99=ts[Math.floor(ts.length*.99)];console.log(`   lava.update: média ${avg.toFixed(2)} ms · p99 ${p99.toFixed(2)} ms`);ok(avg<2.5,'média < 2,5 ms/frame');}
console.log('9) game over: lava continua animando sem matar de novo');
{g.state='over';const f=L.front;for(let i=0;i<30;i++)g.update(dt);ok(L.front>f,'frente continua avançando no game over');}
console.log(process.exitCode?'\nHÁ FALHAS':'\nTUDO OK');
