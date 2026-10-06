// Testes dos METEOROS NO CHÃO (obstáculos persistentes). Uso: node --import ./tests/register.mjs tests/rocks_test.mjs
import {Game,INVULN} from '../js/game.js';
import {surface} from '../js/terrain.js';
import {blastR,markR} from '../js/meteors.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,M=g.meteors;g.input.poll=()=>{};g.perks.update=()=>{};   // este teste audita só meteoros/rochas: os perks (rastro do nitro, explosão de coleta) usam o mesmo pool de partículas de fogo
const allRecs=()=>{const a=[];for(const arr of M.craterCells.values())a.push(...arr);return a;};
const follow=()=>{const P=g.player,T=g.track,p=T.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));
  g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};
const aim=c=>{const P=g.player,want=Math.atan2(c.x-P.x,-(c.z-P.z)),e=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*4));};

console.log('1) cai → explode → cratera → rocha permanece; efeitos pesados somem');
g.restart();M.reset();M.nextSpawn=1e9;M.difficulty=()=>0;
{ok(M.spawn(),'spawn manual');const m=M.meteors.find(m=>m.active),ix=m.ix,iz=m.iz;ok(m.sy-m.iy>=300,'nasce no céu ('+(m.sy-m.iy).toFixed(0)+' m)');
 let t=0;while(m.active&&t<12){g.update(dt);t+=dt;}
 const c=allRecs().find(c=>c.x===ix&&c.z===iz);
 ok(!m.active&&M.stats.impacts===1,'impacto ocorreu');
 ok(c&&c.solid&&c.slot>=0&&M.stats.rocks===1,'rocha instanciada e sólida');ok(c.decal&&c.decal.mesh.visible,'cratera criada junto');
 ok(c.heat&&M.fire.alive+M.smoke.alive>0,'fogo/fumaça/brilho logo após o impacto');
 for(let i=0;i<20*60;i++)g.update(dt);
 ok(c.slot>=0&&c.solid&&M.stats.rocks>=1,'20 s depois a rocha continua no chão');ok(!c.heat&&M.fire.alive===0,'efeitos pesados terminaram');}

console.log('2) tamanhos + 3) superfície real + estrada/fora da estrada (2 min, dificuldade .7)');
g.restart();M.difficulty=()=>.7;
for(let i=0;i<120*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
{const by={0:[],1:[],2:[]};for(const c of allRecs())by[c.cls].push(c);const avg=a=>a.reduce((s,c)=>s+c.rr,0)/(a.length||1);
 console.log(`   pequenos ${by[0].length} (${avg(by[0]).toFixed(1)} m) · médios ${by[1].length} (${avg(by[1]).toFixed(1)} m) · grandes ${by[2].length} (${avg(by[2]).toFixed(1)} m)`);
 ok(by[0].length&&by[1].length&&by[2].length&&avg(by[0])<avg(by[1])&&avg(by[1])<avg(by[2]),'três classes, colisores crescentes');
 let n=0,fl=0,bu=0,on=0,off=0;
 for(const c of allRecs()){if(c.slot<0)continue;n++;const r=c.radius;let lo=1e9,hi=-1e9;
  for(let a=0;a<8;a++){const h=surface(g.track,c.x+Math.cos(a*.785)*c.rr*.85,c.z+Math.sin(a*.785)*c.rr*.85,{}).h;lo=Math.min(lo,h);hi=Math.max(hi,h);}
  const ctr=surface(g.track,c.x,c.z,{});if(c.ry-r*.85*.7>lo+.05)fl++;if(c.ry+r*.85*.7<ctr.h+.1)bu++;if(ctr.d>=0&&ctr.d<=ctr.w)on++;else off++;}
 ok(n>=20,'rochas avaliadas: '+n);ok(fl===0,'nenhuma flutuando ('+fl+')');ok(bu===0,'nenhuma soterrada ('+bu+')');ok(on>0&&off>0,`há rochas na pista (${on}) e fora (${off})`);}

console.log('4) colisão carro × rocha');
{g.restart();M.nextSpawn=1e9;M.reset();g.lives=3;g.invuln=0;const P=g.player;P.respawn(300,30);for(let i=0;i<20;i++)g.update(dt);
 const fx=Math.sin(P.psi),fz=-Math.cos(P.psi);const c=M._addCrater(P.x+fx*40,P.z+fz*40,11,{radius:3,cls:1});M.update(dt,{spawn:false});
 let minD=1e9,l1=null,i1=null,sp0=P.speed,hits=0;
 for(let t=0;t<5&&g.state==='running';t+=dt){aim(c);const b=M.stats.rockHits;g.update(dt);
  for(const o of[1.7,0,-1.7])minD=Math.min(minD,Math.hypot(P.x+Math.sin(P.psi)*o-c.x,P.z-Math.cos(P.psi)*o-c.z));
  if(M.stats.rockHits>b){hits++;if(l1===null){l1=g.lives;i1=g.invuln;}}if(hits>=6)break;}
 ok(hits>0,'colisão detectada ('+hits+' frames)');ok(l1===2,'remove exatamente 1 vida (vidas '+l1+')');ok(i1>INVULN-.1,'invulnerabilidade ativada');
 ok(minD>=c.rr+1.5-.35,'não atravessa a rocha ('+minD.toFixed(2)+' m)');ok(P.speed<sp0*.7,'perde velocidade ('+(sp0*3.6).toFixed(0)+' → '+(P.speed*3.6).toFixed(0)+' km/h)');
 for(let i=0;i<40;i++){aim(c);g.update(dt);}ok(g.lives===2,'encostar durante a invulnerabilidade não tira outra vida');
 g.invuln=0;P.respawn(P.s,30);for(let i=0;i<5;i++)g.update(dt);{const fx2=Math.sin(P.psi),fz2=-Math.cos(P.psi),c2=M._addCrater(P.x+fx2*18,P.z+fz2*18,6,{radius:1.4,cls:0});M.update(dt,{spawn:false});for(let i=0;i<120;i++){aim(c2);g.update(dt);}}
 ok(g.lives===1,'após a invulnerabilidade, nova batida remove 1 vida (vidas '+g.lives+')');
 g.restart();M.nextSpawn=1e9;g.lives=3;g.invuln=0;{const Q=g.player;Q.respawn(300,30);for(let i=0;i<20;i++)g.update(dt);const fx3=Math.sin(Q.psi),fz3=-Math.cos(Q.psi),rx3=Math.cos(Q.psi),rz3=Math.sin(Q.psi);
  M._addCrater(Q.x+fx3*50+rx3*12,Q.z+fz3*50+rz3*12,11,{radius:3,cls:1});M.update(dt,{spawn:false});for(let i=0;i<150;i++){g.input.throttle=1;g.input.brake=0;g.input.steer=0;g.update(dt);}}
 ok(g.lives===3,'passar a 12 m de uma rocha média não causa dano');}

console.log('5) estrada nunca bloqueada (2 min, caos máximo, sem desviar)');
{g.restart();M.difficulty=()=>1;let minFree=1e9,blocked=0,samples=0;const T=g.track;
 for(let i=0;i<120*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);
  if(i%120===0){const P=g.player;for(let a=20;a<=300;a+=20){const sp=T.sampleAt(P.s+a),w=sp.w,iv=[];
   for(const c of allRecs()){const al=(c.x-sp.x)*Math.sin(sp.h)-(c.z-sp.z)*Math.cos(sp.h);if(Math.abs(al)>c.rr+3)continue;const la=(c.x-sp.x)*Math.cos(sp.h)+(c.z-sp.z)*Math.sin(sp.h);if(Math.abs(la)>w+c.rr+5)continue;iv.push([la-c.rr-1.5,la+c.rr+1.5]);}
   iv.sort((x,y)=>x[0]-y[0]);let cur=-w,best=0;for(const [x0,x1] of iv){if(x0>cur)best=Math.max(best,x0-cur);if(x1>cur)cur=x1;}best=Math.max(best,w-cur);samples++;minFree=Math.min(minFree,best);if(best<2)blocked++;}}}
 console.log(`   ${samples} seções · menor corredor livre ${minFree.toFixed(1)} m · rochas guardadas ${M.stats.records}`);ok(blocked===0,'nenhuma seção bloqueada');}

console.log('7) chunks: descarrega longe, volta sem duplicar');
{g.restart();M.nextSpawn=1e9;M.reset();const P=g.player,cx=P.x+Math.sin(P.psi)*60,cz=P.z-Math.cos(P.psi)*60;
 for(let i=0;i<5;i++)M._addCrater(cx+i*14,cz,40,{radius:2+i*.3,cls:1});for(let i=0;i<9;i++)M.update(dt,{spawn:false});
 const inst=()=>M.rockMeshes.reduce((a,r)=>a+r.n,0),old={x:P.x,z:P.z},move=dx=>{P.x=old.x+dx;M.cellTick=0;for(let i=0;i<10;i++)M.update(.016,{spawn:false});};
 ok(inst()===5,'5 rochas instanciadas');
 for(let r=0;r<3;r++){move(2000);const a=inst();move(0);const b=inst();ok(a===0&&b===5,`ida e volta #${r+1}: longe ${a} · de volta ${b}`);}
 move(5000);ok(M.craterCells.size===0&&inst()===0,'a >3 km: dados e instâncias descartados');move(0);ok(inst()===0,'não reaparecem');}

console.log('8) limites/vazamento em 4 min de caos máximo');
{g.restart();M.difficulty=()=>1;const snaps=[];let maxRec=0,maxInst=0;
 for(let i=0;i<240*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);if(i%30===0){maxRec=Math.max(maxRec,M.stats.records);maxInst=Math.max(maxInst,M.stats.rocks);}if(i%(40*60)===0)snaps.push(g.scene.children.size);}
 console.log('   objetos na cena:',snaps.join(' → '),'· registros máx',maxRec,'· rochas máx',maxInst);
 ok(maxRec<=4000&&maxInst<=300,'registros ≤4000, rochas ≤300');ok(snaps[snaps.length-1]-snaps[2]<=40,'cena estável');
 ok(M.meteors.length<=140&&M.markers.length<=140&&M.decals.length<=300,'pools dentro dos limites');
 ok(M.fire.alive<=2400&&M.smoke.alive<=4800,'partículas dentro dos buffers');}

console.log('9) desempenho (caos máximo)');
{const ts=[],tc=[];for(let i=0;i<20*60;i++){g.invuln=9;g.lives=3;follow();g.player.update(dt,g.input);g.world.update(g.player.x,g.player.z,g.player.s,5);
  const a=performance.now();M.update(dt);const b=performance.now();M.collide(g.player);tc.push(performance.now()-b);ts.push(b-a);}
 ts.sort((a,b)=>a-b);tc.sort((a,b)=>a-b);console.log(`   update p99 ${ts[ts.length*.99|0].toFixed(2)} ms · colisão p99 ${tc[tc.length*.99|0].toFixed(3)} ms`);
 ok(ts[ts.length*.99|0]<5,'update p99 < 5 ms');ok(tc[tc.length*.99|0]<.5,'colisão p99 < 0,5 ms');}

console.log('10) indicadores menores');
{const fs=await import('node:fs'),css=fs.readFileSync(new URL('../css/style.css',import.meta.url),'utf8'),w=+/#warn i\{[^}]*?width:(\d+)px/.exec(css)[1];
 ok(w/34>=.2&&w/34<=.5,'ícone de borda: '+w+' px = '+(100*w/34).toFixed(0)+'% de 34 px');
 ok([8,15,26].every(r=>markR(r)<blastR(r)*1.1*.35),'indicador no chão ≥65% menor que o anterior para todos os tamanhos');}
console.log('\nFIM · exitCode',process.exitCode||0);
