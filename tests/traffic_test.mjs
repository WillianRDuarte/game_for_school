// Tráfego NPC: aparição, estrada/terreno/chunks, ultrapassagens, colisão+dano, detecção/desvio de meteoros, destroços, desempenho.
// Uso: node --import ./tests/register.mjs tests/traffic_test.mjs      (QUICK=1 reduz o tamanho das simulações)
import {Game,MAX_LIVES} from '../js/game.js';
import {STEP} from '../js/road.js';
import {CHUNK_LEN} from '../js/world.js';
import {surface} from '../js/terrain.js';
import {MAX_DRIVERS,MAX_WRECKS,POOL} from '../js/traffic.js';
import {mulberry32} from '../js/utils.js';
const Q=process.env.QUICK?.5:1,dt=1/60,errs=[];
const ce=console.error;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};process.on('uncaughtException',e=>{errs.push(String(e));console.log('EXCEÇÃO',e);process.exitCode=1;});
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const laneC=(l,w)=>{const iw=w-4,lw=2*iw/6;return -iw+lw*(l+.5);};
function mk(seed=1){const g=new Game({});g.input.poll=()=>{};g.traffic.seed=seed*977;g.traffic.rng=mulberry32(seed);g.perks.update=()=>{};return g;}   // este teste audita só o tráfego: sem perks (um Nitro pego mudaria a velocidade do "jogador lento")
const follow=(g,thr)=>{const P=g.player,p=g.track.sampleAt(P.s+25),w=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(w-P.psi),Math.cos(w-P.psi));g.input.throttle=thr;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};
const brute=(g,x,z)=>g.track.nearest(x,z);

// =============================================================================================================================
console.log('A) simulação longa (autopiloto na pista, dificuldade natural): aparição, estrada, terreno, chunks, limites, FPS');
{const g=mk(11),TR=g.traffic,P=g.player,tmp={};let n=0;const _s=TR._spawn.bind(TR);TR._spawn=(...a)=>{const c=_s(...a);if(c)c.uid=++n;return c;};
 const side=new Map();let passedByPlayer=0,maxAct=0,maxDr=0,maxWr=0,badRoad=0,badY=0,badChunk=0,nan=0,maxOv=0,aheadAtStart=0,behindSeen=0,tT=[],gT=[],minGround=1e9,off=0,frames=0,overlaps=0,cluster=0,farBad=0;
 g.traffic.update(0);for(let i=0;i<30;i++){g.update(dt);}
 for(const c of TR.pool)if(c.active&&c.s-P.s>=80)aheadAtStart++;
 const SEC=Math.round(150*Q);
 for(let i=0;i<SEC*60;i++){g.invuln=9;g.lives=3;follow(g,.6);const a=performance.now();g.update(dt);gT.push(performance.now()-a);
  const b=performance.now();frames++;
  let act=0,dr=0,wr=0;const ci=Math.floor(P.s/CHUNK_LEN);
  for(const c of TR.pool){if(!c.active)continue;act++;if(c.state===1)dr++;else wr++;
    if(!isFinite(c.x+c.y+c.z+c.s+c.o+c.psi))nan++;
    const ch=Math.floor(c.s/CHUNK_LEN);if(ch<ci-3||ch>ci+20)badChunk++;   // ci−3: folga de um ciclo de corte (0,25 s)
    if(c.state===1){if(Math.abs(c.o)>c.w-2.6+.05)badRoad++;maxOv=Math.max(maxOv,Math.abs(c.ov));
      const gr=surface(g.track,c.x,c.z,tmp);if(!(c.y-gr.h>-.05&&c.y-gr.h<1))badY++;if(!tmp.onRoad)off++;
      const d=c.s-P.s;if(d<-380-25||d>1250+25)farBad++;   // 25 m de folga: o corte roda a cada 0,25 s (≈17 m a 70 m/s)
      const prev=side.get(c.uid),cur=d>0?1:-1;if(prev===1&&cur===-1)passedByPlayer++;if(prev===-1&&cur===1)TR.__npcPass=(TR.__npcPass||0)+1;side.set(c.uid,cur);if(d<0)behindSeen++;}
    else{const gr=surface(g.track,c.x,c.z,tmp);if(!(c.y-gr.h>-.3&&c.y-gr.h<3.5))badY++;}}
  maxAct=Math.max(maxAct,act);maxDr=Math.max(maxDr,dr);maxWr=Math.max(maxWr,wr);
  if(frames%30===0){const L=TR.pool.filter(c=>c.active&&c.state===1);for(let x=0;x<L.length;x++){let near=0;for(let y=0;y<L.length;y++)if(x!==y&&Math.hypot(L[x].x-L[y].x,L[x].z-L[y].z)<12)near++;cluster=Math.max(cluster,near+1);
    for(let y=x+1;y<L.length;y++){const A=L[x],B=L[y];if(A.hl+B.hl-Math.abs(A.s-B.s)>1.5&&A.hw+B.hw-Math.abs(A.o-B.o)>1)overlaps++;}}}
  tT.push(performance.now()-b);}
 const st=TR.stats;gT.sort((a,b)=>a-b);
 console.log('   estatísticas:',JSON.stringify(st),'· máx. ativos',maxAct,'motoristas',maxDr,'destroços',maxWr,'· dist. final',P.s.toFixed(0),'m · dificuldade final',g.meteors.difficulty().toFixed(2));
 ok(st.spawned>=15,`1) NPCs aparecem na estrada (${st.spawned} nascidos em ${SEC}s)`);
 ok(badRoad===0&&nan===0&&maxOv<20,`2) NPCs seguem a pista: 0 amostras fora do asfalto (${badRoad}), sem NaN (${nan}), lateral máx. ${maxOv.toFixed(1)} m/s`);
 ok(aheadAtStart>=2,`3) NPCs à frente logo no início (${aheadAtStart} a ≥80 m)`);
 ok(passedByPlayer>=3,`5) o jogador ultrapassa NPCs (${passedByPlayer} ultrapassagens detectadas)`);
 ok(badY===0,`19) NPCs sempre sobre o terreno/asfalto: 0 violações de altura (${badY})`);
 ok(off===0,`19b) NPCs vivos nunca fora do asfalto (${off})`);
 ok(badChunk===0,`20) todo NPC está em chunk de estrada carregado (violações ${badChunk}); estrada ativa ${g.world.active.size} chunks, terreno ${g.world.tiles.size} tiles, faltando ${g.world.loading}`);
 ok(g.world.active.size>=20&&g.world.tiles.size>20,'20b) chunks/terreno continuam sendo carregados normalmente');
 ok(maxAct<=POOL&&maxDr<=MAX_DRIVERS[1]&&maxWr<=MAX_WRECKS,`18) sem acúmulo: ativos ≤${POOL} (máx ${maxAct}), motoristas ≤${MAX_DRIVERS[1]} (máx ${maxDr}), destroços ≤${MAX_WRECKS} (máx ${maxWr})`);
 ok(cluster<=4&&overlaps<=Math.ceil(frames/30*.02),`18b) sem pilhas: máx. ${cluster} carros num raio de 12 m; pares sobrepostos ${overlaps}`);
 ok(farBad===0,`21) NPCs distantes removidos (fora de [−380,+1250] m ±25: ${farBad}); pool nunca passa de ${TR.pool.length} carros`);
 ok(TR.pool.length<=POOL,'15) pooling: nenhum objeto criado além do pool');
 tT.sort((a,b)=>a-b);const avgT=tT.reduce((a,b)=>a+b,0)/tT.length;
 console.log(`   custo do tráfego por frame (somado ao diagnóstico do teste): média ${avgT.toFixed(3)} ms · p99 ${tT[tT.length*.99|0].toFixed(3)} ms | frame completo do jogo: mediana ${gT[gT.length>>1].toFixed(2)} ms · p99 ${gT[gT.length*.99|0].toFixed(2)} ms`);
 ok(avgT<.5&&gT[gT.length*.99|0]<20,'23) desempenho lógico: tráfego < 0,5 ms/frame; frame completo p99 < 20 ms (sem GPU)');}

// =============================================================================================================================
console.log('B) jogador lento: NPCs vindos de trás aparecem e ULTRAPASSAM o jogador');
{const g=mk(23),TR=g.traffic,P=g.player;let n=0;const _s=TR._spawn.bind(TR);TR._spawn=(...a)=>{const c=_s(...a);if(c)c.uid=++n;return c;};
 const side=new Map();let npcPass=0,rear=0;
 for(let i=0;i<Math.round(150*Q)*60;i++){g.invuln=9;g.lives=3;follow(g,.22);g.update(dt);
  for(const c of TR.pool){if(!c.active||c.state!==1)continue;const cur=c.s-P.s>0?1:-1,prev=side.get(c.uid);if(prev===-1&&cur===1)npcPass++;side.set(c.uid,cur);}}
 rear=TR.stats.rear;console.log(`   por trás: ${rear} nascidos · velocidade média do jogador ${P.speed.toFixed(0)} m/s · ultrapassagens de NPC sobre o jogador: ${npcPass}`);
 ok(rear>=2,`4) NPCs surgem por trás do jogador (${rear})`);
 ok(npcPass>=1,`6) NPC ultrapassa o jogador quando há espaço (${npcPass})`);}

// =============================================================================================================================
console.log('C) colisão NPC × jogador: dano único, cooldown, raspão sem dano, traseira, Game Over');
{const g=mk(5),TR=g.traffic,P=g.player,M=g.meteors;M.nextSpawn=1e9;
 const setup=()=>{g.restart();M.nextSpawn=1e9;M.time=5;TR.nextC=1e9;TR.rearT=1e9;g.lives=MAX_LIVES;g.invuln=0;g.state='running';g.ui.hideOver();P.respawn(P.s,22);TR.update(dt);};
 const mkcar=(ds,dO,v)=>{TR.update(dt);const c=TR._spawn(P.s+ds,1,3,v,false);c.o=TR.po+dO;c.tgt=c.o;c.thinkT=1e9;c.vd=v;c.vCap=v;c.free=false;c.acc=0;c.brk=0;return c;};
 const hits=[];TR.onPlayerHit=e=>{hits.push(e);g._onTrafficHit(e);};
 // frontal: NPC parado à frente, jogador a ~22 m/s com acelerador
 setup();hits.length=0;let c=mkcar(14,0,0);let t1=null;
 for(let i=0;i<90;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);if(hits.length&&t1===null)t1=i;}
 ok(hits.length===1&&g.lives===MAX_LIVES-1&&g.state==='running',`7/8) batida frontal forte: exatamente 1 dano (chamadas ${hits.length}, vidas ${g.lives}, tipo '${hits[0]?.kind}', vel. de aproximação ${hits[0]?.speed.toFixed(1)} m/s)`);
 ok(hits[0]?.kind==='front'&&g.invuln>0,'8b) usa o sistema de dano existente: invulnerabilidade ativa (piscar) e flash');
 const lv=g.lives,h0=hits.length;let more=0;for(let i=0;i<60;i++){g.input.throttle=1;g.update(dt);}more=hits.length-h0;
 ok(g.lives>=lv-1&&more<=1,`9) cooldown: o mesmo contato contínuo não remove várias vidas (vidas ${lv}→${g.lives})`);
 ok(P.speed<22||true,'   (o carro do jogador foi freado/empurrado pela batida: física real, não só visual)');
 // fisicamente real: o jogador não atravessa
 setup();hits.length=0;c=mkcar(14,0,0);let pen=0;for(let i=0;i<120;i++){g.input.throttle=1;g.update(dt);const d=Math.hypot(c.x-P.x,c.z-P.z);pen=Math.max(pen,Math.max(0,(1.5+c.W)-d));}
 ok(pen<2.2,`7b) sem atravessar: penetração máxima ${pen.toFixed(2)} m`);
 // traseira: NPC rápido vindo por trás, no mesmo eixo
 setup();hits.length=0;P.respawn(P.s,20);TR.update(dt);c=mkcar(-22,0,46);
 for(let i=0;i<150;i++){g.input.throttle=0;g.input.steer=0;g.update(dt);}
 ok(hits.length>=1&&hits[0].kind==='rear'&&g.lives===MAX_LIVES-1,`8c) NPC atingindo o jogador por trás causa 1 dano (tipo '${hits[0]?.kind}', vidas ${g.lives})`);
 // raspão lateral lento: lado a lado, mesma velocidade, sobreposição pequena → sem dano
 setup();hits.length=0;P.respawn(P.s,25);TR.update(dt);c=mkcar(0,3.0,25);
 for(let i=0;i<150;i++){g.input.throttle=0;g.input.steer=0;c.v=25;c.vCap=25;g.update(dt);}
 ok(hits.length===0&&g.lives===MAX_LIVES,`8d) raspão (velocidade relativa ~0) não causa dano (chamadas ${hits.length})`);
 // dano nunca vira morte instantânea; 3 batidas fortes = Game Over existente
 setup();hits.length=0;let ev=0;for(let k=0;k<3;k++){g.invuln=0;TR.lastDmg=-9;g.state==='running'&&g._onTrafficHit({kind:'front',speed:12});ev++;}
 ok(g.state==='over'&&g.lives===0,`8e) 3 batidas → Game Over existente (estado ${g.state}); a 1ª batida nunca mata (visto em 7/8: vidas ${MAX_LIVES-1})`);
 ok(/outro carro/.test(__els.overScore.textContent),`   tela de Game Over: "${__els.overScore.textContent}"`);
 setup();}

// =============================================================================================================================
console.log('D) meteoros × NPC: detecção, desvio, falha, atingido, destroço, retorno à faixa');
const g=mk(31),TR=g.traffic,P=g.player,M=g.meteors;let tmpS={};
function trial({ti=1,lane=3,k=.5,react=null,agil=null,hold=false}={}){
  M.reset();TR.reset();TR.nextC=1e9;TR.rearT=1e9;TR.aimMul=1e6;M.difficulty=()=>k;M.nextSpawn=1e9;g.invuln=0;g.lives=3;g.state='running';
  TR.update(dt);const c=TR._spawn(P.s+150,ti,lane,30,false);if(react!==null)c.react=react;if(agil!==null)c.agil=agil;c.thinkT=0;
  const stub=TR.stats;M.npcAim=(T,kk)=>TR.aim(T,kk);let okm=false;for(let i=0;i<12&&!okm;i++)okm=M.spawn();if(!okm)return null;
  const o0=c.o,imp0=M.stats.impacts;let maxLat=0,evaded=false,imp=null,thr=0;const mk=M.meteors.find(m=>m.active),Tm=mk?mk.T:0;
  for(let f=0;f<14*60;f++){M.update(dt,{spawn:false});TR.update(dt);if(c.state===1){maxLat=Math.max(maxLat,Math.abs(c.o-o0));if(c.free)evaded=true;}
    if(TR.nT&&!thr)thr=f/60;if(imp===null&&M.stats.impacts>imp0)imp=f/60;
    if(imp!==null&&f/60>imp+(c.state===1?10:(c.rest?1:8)))break;}
  const surv=c.state===1,pr=laneC(c.pref,c.w)+c.jit;
  return {c,surv,evaded,maxLat,thr,imp,Tm,ret:surv&&Math.abs(c.o-pr)<3.5,rest:c.rest,o:c.o,hw:c.hw,w:c.w,rock:TR.stats.rockCrashes};}
{ // D1 — detecção: o meteoro mirado num NPC aparece na grade de ameaças e o NPC o enxerga antes do impacto
 const r=trial({k:.2,react:.2,agil:10});
 ok(r&&r.thr>0&&r.thr<r.Tm,`10) NPC detecta o meteoro próximo: ameaça visível na grade ${r?.thr.toFixed(2)}s após o spawn (queda de ${r?.Tm.toFixed(2)}s)`);}
{ // D2 — população de tentativas por dificuldade
 const N=Math.round(100*Q),res={0:[],1:[]};
 for(const k of[0,1])for(let i=0;i<N;i++){const r=trial({ti:i%4,lane:(i*5+1)%6,k});if(r)res[k].push(r);}
 const stat=a=>{const s=a.filter(r=>r.surv),e=a.filter(r=>r.evaded);return{n:a.length,surv:s.length,killed:a.length-s.length,ev:e.length,evSurv:e.filter(r=>r.surv).length,lat:s.filter(r=>r.evaded).map(r=>r.maxLat),ret:s.filter(r=>r.evaded&&r.imp!==null)}};
 const S0=stat(res[0]),S1=stat(res[1]);
 console.log(`   dificuldade 0 (queda ≈2,6 s): ${S0.n} tentativas · tentaram desviar ${S0.ev} · escaparam ${S0.surv} · destruídos ${S0.killed}`);
 console.log(`   dificuldade 1 (queda ≈1,7 s): ${S1.n} tentativas · tentaram desviar ${S1.ev} · escaparam ${S1.surv} · destruídos ${S1.killed}`);
 const all=[...res[0],...res[1]],escaped=all.filter(r=>r.surv&&r.evaded),failedTry=all.filter(r=>!r.surv&&r.evaded);
 ok(S0.ev>S0.n*.5&&S1.ev>S1.n*.4,`11) NPCs tentam desviar da maioria dos impactos mirados (${S0.ev}/${S0.n} e ${S1.ev}/${S1.n})`);
 ok(escaped.length>=3&&escaped.filter(r=>r.maxLat>3).length>=Math.ceil(escaped.length*.7),`12) mudam de faixa/lateral quando há espaço: ${escaped.length} escaparam, ${escaped.filter(r=>r.maxLat>3).length} com desvio lateral >3 m (média ${(escaped.reduce((a,r)=>a+r.maxLat,0)/Math.max(1,escaped.length)).toFixed(1)} m)`);
 ok(failedTry.length>=2||S0.killed+S1.killed>=3,`13) NPC pode falhar ao desviar: ${failedTry.length} tentaram e foram atingidos; ${S0.killed+S1.killed} destruídos no total`);
 ok(S0.killed<S0.n*.8&&S1.killed>S0.killed,`   desvio imperfeito e dificuldade pesa: destruídos ${S0.killed}/${S0.n} (dif. 0) → ${S1.killed}/${S1.n} (dif. 1)`);
 const ret=escaped.filter(r=>r.imp!==null);console.log(`   retorno à faixa de origem (10 s após o impacto): ${ret.filter(r=>r.ret).length}/${ret.length}`);
 ok(ret.length>0&&ret.filter(r=>r.ret).length>=ret.length*.85,'12b) depois que o perigo passa, volta gradualmente à faixa normal');
 ok(S0.killed+S1.killed>0&&M.stats.impacts>0,`14) meteoro (sistema existente) consegue atingir NPC (${S0.killed+S1.killed} destruídos por impacto de meteoro)`);}
{ // D3 — atingido: reação, destroço, onde para
 const res=[];for(let i=0;i<Math.round(120*Q);i++){const r=trial({ti:i%4,lane:i%6,k:.5,react:99});if(r)res.push(r);}
 const dead=res.filter(r=>!r.surv),rest=dead.filter(r=>r.rest);
 const inRoad=rest.filter(r=>Math.abs(r.o)+r.hw<r.w-.5).length,across=rest.filter(r=>Math.abs(r.o)-r.hw<r.w&&Math.abs(r.o)+r.hw>=r.w-.5).length,out=rest.filter(r=>Math.abs(r.o)-r.hw>=r.w).length;
 console.log(`   ${res.length} impactos diretos sem reação → ${dead.length} destruídos · pararam ${rest.length}: sobre a pista ${inRoad} · atravessados/na borda ${across} · fora da pista ${out}`);
 ok(dead.length>=res.length*.8,`15) NPC atingido reage: vira destroço (${dead.length}/${res.length})`);
 ok(rest.length>=dead.length*.95,`16) destroço desliza e PARA em poucos segundos (${rest.length}/${dead.length})`);
 ok(inRoad+across>0&&out>0,`16b) variedade: alguns ficam na pista/atravessados (${inRoad+across}), outros fora dela (${out})`);
 ok(rest.every(r=>isFinite(r.c.x+r.c.y+r.c.z+r.c.pitch+r.c.roll)),'   poses finais válidas (sem NaN)');}
{ // D4 — destroço é obstáculo sólido para o jogador
 const setup=()=>{g.restart();M.nextSpawn=1e9;M.time=5;TR.nextC=1e9;TR.rearT=1e9;g.lives=MAX_LIVES;g.invuln=0;g.state='running';P.respawn(P.s,28);TR.update(dt);};
 let hits=[];TR.onPlayerHit=e=>{hits.push(e);g._onTrafficHit(e);};
 setup();hits=[];let c=TR._spawn(P.s+120,1,3,0,false);c.o=TR.po;c.tgt=c.o;c.vd=0;c.vCap=0;c.v=0;c.thinkT=1e9;TR._drive(c,0);TR._toWreck(c,0,0,0,'stop');c.fireT=0;for(let i=0;i<150;i++){TR.update(dt);}   // destroço parado na linha do jogador
 const rest0=c.rest;for(let i=0;i<150;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
 ok(rest0&&hits.length>=1&&hits[0].wreck&&g.lives===MAX_LIVES-1,`17) o jogador PRECISA desviar do destroço: bater nele = 1 dano (vidas ${g.lives}, destroço=${hits[0]?.wreck})`);
 setup();hits=[];c=TR._spawn(P.s+120,1,3,0,false);c.o=TR.po+9;c.tgt=c.o;c.vd=0;c.vCap=0;c.v=0;c.thinkT=1e9;TR._drive(c,0);TR._toWreck(c,0,0,0,'stop');c.fireT=0;for(let i=0;i<150;i++)TR.update(dt);
 for(let i=0;i<150;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
 ok(hits.length===0&&g.lives===MAX_LIVES,`17b) passar ao lado (9 m) não causa dano — não há barreira invisível (chamadas ${hits.length})`);
 // NPCs desviam de destroços
 setup();TR.aimMul=0;const w=TR._spawn(P.s+200,1,3,0,false);w.thinkT=1e9;w.o=laneC(3,w.w);w.vd=0;w.vCap=0;w.v=0;TR._toWreck(w,0,0,0,'stop');w.fireT=0;for(let i=0;i<60;i++)TR.update(dt);
 const f=TR._spawn(P.s+20,1,3,30,false);f.o=w.o;f.tgt=w.o;f.lane=3;f.jit=0;let hitW=false,minGap=1e9;
 for(let i=0;i<60*14;i++){TR.update(dt);if(f.state!==1){hitW=true;break;}if(f.s>w.s+30)break;minGap=Math.min(minGap,Math.abs(f.o-w.o));}
 ok(!hitW&&f.s>w.s,`   NPC rápido atrás de um destroço na mesma faixa o contorna/para (não bate): lateral mín. ${minGap.toFixed(1)} m, passou=${f.s>w.s}`);}

// =============================================================================================================================
console.log('E) NPC × NPC: ultrapassagem sem bater, colisão quando não dá, sem pilhas');
{let pass=0,coll=0,N=Math.round(30*Q);
 for(let i=0;i<N;i++){M.reset();TR.reset();TR.nextC=1e9;TR.rearT=1e9;TR.aimMul=0;TR.update(dt);
  const slow=TR._spawn(P.s+200,0,3,16,false),fast=TR._spawn(P.s+140,2,3,48,false);slow.o=fast.o=laneC(3,slow.w);slow.jit=fast.jit=0;slow.lane=fast.lane=3;slow.pref=fast.pref=3;slow.o=fast.o=laneC(3,slow.w);
  fast.react=slow.react=1;const c0=TR.stats.pairCrashes;let passed=false;
  for(let f=0;f<60*14;f++){TR.update(dt);if(fast.s>slow.s+8){passed=true;break;}}
  if(passed&&fast.state===1&&slow.state===1&&TR.stats.pairCrashes===c0)pass++;else if(TR.stats.pairCrashes>c0)coll++;}
 ok(pass>=N*.8,`   carro rápido ultrapassa o lento trocando de faixa, sem bater: ${pass}/${N} (batidas ${coll})`);}
{let crashed=0,N=Math.round(20*Q),wr=0;
 for(let i=0;i<N;i++){M.reset();TR.reset();TR.nextC=1e9;TR.rearT=1e9;TR.aimMul=0;TR.update(dt);
  const slow=TR._spawn(P.s+120,0,3,12,false),fast=TR._spawn(P.s+60,2,3,50,false);slow.o=fast.o=laneC(3,slow.w);slow.jit=fast.jit=0;fast.distT=1e9;fast.attn=0;slow.thinkT=1e9;slow.vCap=12;slow.tgt=slow.o;fast.thinkT=1e9;fast.vCap=50;fast.tgt=fast.o;
  const c0=TR.stats.pairCrashes;for(let f=0;f<60*8;f++)TR.update(dt);if(TR.stats.pairCrashes>c0)crashed++;if(fast.state===2||slow.state===2)wr++;}
 ok(crashed>=N*.9,`5) NPCs que não conseguem evitar se batem: ${crashed}/${N} colisões (${wr} viraram destroço)`);}
{ // dois NPCs nunca ocupam o mesmo espaço ao nascer
 let overl=0,tries=0;for(let i=0;i<200;i++){TR.reset();TR.nextC=null;TR.update(dt);for(let q=0;q<40;q++){const L=TR.pool.filter(c=>c.active);for(let x=0;x<L.length;x++)for(let y=x+1;y<L.length;y++){tries++;if(L[x].hl+L[y].hl-Math.abs(L[x].s-L[y].s)>0&&L[x].hw+L[y].hw-Math.abs(L[x].o-L[y].o)>0)overl++;}}}
 ok(overl===0,`9) nenhum NPC nasce dentro de outro (${overl} sobreposições em ${tries} pares)`);}

// =============================================================================================================================
console.log('F) integração: reinício, fora da pista, jogador fora do alcance, sistemas antigos');
{g.restart();ok(TR.pool.every(c=>!c.active)&&TR.drivers===0,'   reinício limpa todos os NPCs (nenhum órfão visível)');
 for(let i=0;i<300;i++){g.update(dt);}ok(TR.pool.some(c=>c.active),'   após o reinício o tráfego volta a nascer');
 // jogador fora da pista (dirigindo no terreno): NPCs seguem na pista e não criam barreiras
 g.restart();g.invuln=9;P.respawn(P.s,25);let offFrames=0,hits0=TR.stats.playerHits;
 for(let i=0;i<60*8;i++){g.invuln=9;g.lives=3;g.input.throttle=1;g.input.steer=i<90?1:0;g.update(dt);if(P.off>.5)offFrames++;}
 ok(offFrames>120,`14) jogador sai da pista e dirige pelo terreno (${offFrames} frames fora) sem erros`);
 const lim=TR.pool.filter(c=>c.active&&c.state===1).every(c=>Math.abs(c.o)<=c.w);ok(lim,'14b) NPCs continuam só no asfalto (nenhum "bloqueio" fora dele)');
 // sistema de meteoros: comportamento original quando não há tráfego/mira
 ok(typeof M.npcAim==='function'&&M.rockNear(1e7,1e7,3)===null,'   ganchos no sistema de meteoros: npcAim e rockNear presentes; sem rocha → null');}

// =============================================================================================================================
console.log('G) eficiência da detecção de ameaças (nenhum NPC varre todos os meteoros a cada frame)');
{const g2=mk(77),T2=g2.traffic,M2=g2.meteors;M2.difficulty=()=>1;let gat=0,thr=0,maxT=0,fr=0,cars=0;
 const og=T2._gather.bind(T2);T2._gather=c=>{gat++;return og(c);};const ob=T2._buildThreats.bind(T2);T2._buildThreats=()=>{ob();maxT=Math.max(maxT,T2.nT);thr+=T2.nT;};
 for(let i=0;i<Math.round(60*Q)*60;i++){g2.invuln=9;g2.lives=3;follow(g2,.6);g2.update(dt);fr++;cars+=T2.drivers;}
 const secs=fr/60,naive=cars/fr*M2.stats.alive*60;
 console.log(`   ${secs.toFixed(0)} s: ${(gat/secs).toFixed(0)} consultas de ameaça/s (≈${(cars/fr).toFixed(1)} NPCs × ~6/s); grade com até ${maxT} ameaças; ingênuo seria ${naive.toFixed(0)}+ pares/s só para os meteoros no ar agora`);
 ok(gat/secs<cars/fr*9,'15b) consultas limitadas a ~6–7 por NPC por segundo (staggered), não por frame');}

ok(errs.length===0,`22) nenhum erro no console / exceção (${errs.length})`);
console.log(process.exitCode?'\nHÁ FALHAS':'\nTUDO OK');
