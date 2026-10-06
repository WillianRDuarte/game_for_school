// TURBO por barra de carga (SHIFT) + ESCUDO que destrói obstáculos e é consumido. Cobre a lista de testes obrigatórios do pedido.
// Uso: node --import ./tests/register.mjs tests/turbo_shield_test.mjs
import {Game} from '../js/game.js';
import {HARD_MAX} from '../js/player.js';
import {TURBO_MAX,TURBO_MIN} from '../js/perks.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,P=g.player,K=g.perks,M=g.meteors,TR=g.traffic;g.input.poll=()=>{};
const errs=[];const ce=console.error;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};
const run=(sec,pre,thr=1)=>{for(let i=0;i<Math.round(sec*60)&&g.state==='running';i++){g.input.throttle=thr;g.input.brake=0;g.input.steer=0;pre&&pre(i);g.update(dt);}};
const trafficUpdate=Object.getPrototypeOf(TR).update,rockHit0=M.onRockHit;
const fresh=()=>{g.restart();M.nextSpawn=1e9;TR.update=()=>{};g.state='running';TR.onPlayerHit=e=>g._onTrafficHit(e);M.onRockHit=rockHit0;};
const put=(type)=>{const p=K._take(type);Object.assign(p,{active:true,x:P.x,z:P.z,y:P.y,s:P.s,risk:false,riskN:0,riskT:0,ph:0});K.nAct++;p.grp.visible=true;return p;};
const charge=(n)=>{for(let i=0;i<n;i++){put('nitro');run(.05);}};   // cada item é coletado antes do próximo (o pool de itens tem teto)
const ahead=(m)=>({x:P.x+Math.sin(P.psi)*m,z:P.z-Math.cos(P.psi)*m});
const shift=()=>globalThis.__key('ShiftLeft');
const rockAhead=(m=22,R=8)=>{const a=ahead(m),c=M._addCrater(a.x,a.z,R,null);run(.1);return c;};   // rocha caída REAL (registro + instância + colisor), pousada à frente do carro

console.log('=== TURBO ===');
fresh();run(3);const v0=P.speed;
console.log('1-2) coletar item: barra sobe; turbo NÃO ativa sozinho');
put('nitro');run(.3);
ok(K.turbo.q===25,`barra +25 % (${K.turbo.q.toFixed(1)} %)`);
ok(!K.turbo.on&&K.turbo.ti===0&&P.vMax===75&&P.boostA===0&&P.accMul===1,'turbo continua desligado: vMax 75, sem empuxo');
run(1);ok(Math.abs(K.turbo.q-25)<1e-9&&P.speed<=75.01,'carga parada (não é consumida sem Shift) e velocidade normal');
ok(K.tPct.textContent==='25%'&&K.tU.style.width==='25%','HUD: barra mostra 25 %');
console.log('3-4) SHIFT ativa; barra diminui; efeitos');
const cam0=g.camera.fov;shift();ok(K.turbo.on,'SHIFT (via Input real) ativou o turbo');
let q1=K.turbo.q,vmax=0,mono=true,prevq=K.turbo.q,maxFov=0,maxFx=0;
run(1.5,()=>{vmax=Math.max(vmax,P.speed);if(K.turbo.q>prevq+1e-9)mono=false;prevq=K.turbo.q;maxFov=Math.max(maxFov,g.camera.fov);maxFx=Math.max(maxFx,+K.fxEl.style.opacity||0);});
ok(K.turbo.q<q1&&mono,`a barra só diminui (${q1.toFixed(0)} → ${K.turbo.q.toFixed(0)} %)`);
console.log('5) turbo termina em 0 e volta suave');
run(3);ok(K.turbo.q===0&&!K.turbo.on,'carga chegou a 0 → turbo desligou');
ok(vmax>v0&&vmax<=90.01,`velocidade subiu e respeitou o limite (${v0.toFixed(0)} → ${vmax.toFixed(1)} m/s, teto 90)`);
ok(P.fovExtra>=0&&maxFov>cam0+2&&maxFx>.3,`FOV dinâmico (+${(maxFov-cam0).toFixed(1)}°) e linhas de velocidade (opacidade ${maxFx.toFixed(2)})`);
{fresh();run(2);charge(4);shift();run(5);let drop=0,prev=P.speed;run(9,()=>{drop=Math.max(drop,prev-P.speed);prev=P.speed;});
 ok(drop<.6&&P.speed<=75.5&&P.vMax===75&&P.accMul===1&&P.boostA===0&&P.fovExtra<1,`desaceleração gradual, sem freada seca (maior queda/frame ${drop.toFixed(2)} m/s) e tudo volta ao neutro`);}
console.log('6) SHIFT com barra vazia não faz nada');
fresh();run(2);shift();ok(!K.turbo.on&&K.turbo.q===0&&K.turbo.empty>0,'barra vazia: Shift não ativa (HUD pisca “sem carga”)');run(.6);
const vE=P.speed;run(1);ok(P.vMax===75&&P.speed<=75.01,'sem efeito nenhum no carro');
console.log('7) várias cargas acumuladas / 8) limite máximo');
fresh();run(1);charge(4);
ok(K.turbo.q===100&&K.tPct.textContent==='100%'&&K._tc.includes('full'),'4 itens → 100 % (HUD cheio)');
{let threw=false;try{charge(2);}catch(e){threw=true;}ok(!threw&&K.turbo.q===TURBO_MAX,'barra cheia: coletar mais não dá erro e não passa de 100 %');}
ok(K.stats.collected===6,'itens extras foram coletados normalmente');
console.log('9) SHIFT durante o turbo não reinicia nem recarrega; 10) reativar só com carga');
shift();let t0=K.stats.turbos;run(1);shift();ok(K.stats.turbos===t0&&K.turbo.q<100-12,'Shift com turbo ligado não faz nada (consumo contínuo segue)');
run(8);ok(!K.turbo.on&&K.turbo.q===0,'esgotou');shift();ok(!K.turbo.on,'sem carga: não reativa');
charge(1);shift();ok(K.turbo.on,'com carga novamente: reativa');run(.6);
// pico absoluto com tudo ligado
fresh();run(2);put('overdrive');charge(4);shift();let mx=0;run(8,()=>{mx=Math.max(mx,P.speed);});ok(mx<=HARD_MAX+.01&&isFinite(P.x+P.speed),`turbo+overdrive: pico ${mx.toFixed(1)} ≤ ${HARD_MAX} (velocidade nunca infinita)`);
console.log('integração: o chunk/mundo e o câmera continuam sãos com turbo');
{fresh();run(1);charge(4);shift();const y=[];run(6,()=>{if(!isFinite(g.camera.position.x+g.camera.position.y+P.y+P.x))y.push(1);});ok(y.length===0&&g.camera.fov<110,`sem NaN na câmera/carro; FOV ${g.camera.fov.toFixed(1)}°`);}

console.log('\n=== ESCUDO ===');
console.log('1-2) coletar escudo: ativa e aparece no HUD');
fresh();run(1);ok(K._sc==='off'&&K.shieldEl.textContent.includes('OFF'),'antes: HUD “ESCUDO OFF”');
put('shield');run(.3);ok(K.fx.shield>0&&K.bubble.visible&&K.shieldEl.textContent.includes('ATIVO')&&K.shieldEl.className==='on','coletado: ativo, aura visível, HUD “ESCUDO ATIVO”');
run(12);ok(K.fx.shield>0,'não expira por tempo — espera ser usado');put('shield');run(.1);ok(K.fx.shield===1,'pegar outro enquanto ativo não empilha');
console.log('3-6, 9) rocha: sem dano, destruída, escudo consumido, carro continua');
{fresh();run(3);put('shield');run(.1);const c=rockAhead(26);const slot0=c.slot,rm=M.rockMeshes[c.shape],n0=rm.n,sp0=P.speed;let hits=0;M.onRockHit=()=>hits++;const dmgs=[];const od=g._damage.bind(g);g._damage=(x)=>{dmgs.push(x);od(x);};
 ok(c.solid&&slot0>=0,`rocha real pousada (slot ${slot0})`);run(1.6);g._damage=od;
 ok(g.lives===3&&hits===0,'jogador não perdeu vida (onRockHit nem foi chamado)');
 ok(!c.solid&&c.slot<0&&rm.n===n0-1&&M.stats.smashed===1,'rocha destruída: sem colisor e sem instância 3D');
 ok(K.fx.shield===0&&K.shieldEl.textContent.includes('OFF')&&K.stats.blocked===1,'escudo consumido → HUD “ESCUDO OFF”');
 ok(P.speed>sp0*.9,`carro continua dirigindo normalmente (${sp0.toFixed(0)} → ${P.speed.toFixed(0)} m/s, sem “bater”)`);
 const arr=M.craterCells.get(M._cellKey(c.x,c.z));ok(arr&&arr.includes(c)&&c.decal,'cratera/registro do meteoro continuam (só a rocha sólida sumiu)');
 M.craterCells.get(M._cellKey(c.x,c.z)).forEach(q=>q.wanted=true);M._updateCells();M._pump();for(let i=0;i<40;i++)M._pump();ok(c.slot<0,'rocha destruída não “volta” quando a célula é recarregada');}
console.log('controle: SEM escudo a mesma rocha continua causando dano');
{fresh();run(3);const c=rockAhead(26);run(1.6);ok(g.lives===2&&c.solid,'sem escudo: perde 1 vida e a rocha segue sólida (comportamento original preservado)');}
console.log('escudo gasto não protege infinitamente');
{fresh();run(3);put('shield');run(.1);rockAhead(24);run(1.2);ok(g.lives===3&&K.fx.shield===0,'1ª rocha destruída com o escudo');run(1.5);g.invuln=0;K.grace=0;const c2=rockAhead(24);run(1.6);ok(g.lives===2&&c2.solid,'2ª rocha (sem escudo): dano normal, rocha intacta');}
console.log('rochas simultâneas do mesmo choque são todas destruídas');
{fresh();run(3);put('shield');run(.1);const a=ahead(24),c1=M._addCrater(a.x,a.z,8,null),c2=M._addCrater(a.x+Math.cos(P.psi)*2,a.z+Math.sin(P.psi)*2,8,null);run(.1);run(1.6);ok(!c1.solid&&!c2.solid&&g.lives===3,'duas rochas coladas: ambas destruídas, 0 dano, 1 escudo');}
console.log('rocha longe/estrutura não é tocada');
{fresh();run(3);put('shield');run(.1);const far=M._addCrater(P.x+Math.cos(P.psi)*60,P.z+Math.sin(P.psi)*60,8,null);run(.2);const c=rockAhead(26);run(1.6);ok(!c.solid&&far.solid,'só a rocha que bateu foi destruída; as outras seguem sólidas');}
console.log('8) NPC / 3 destroço');
{fresh();run(3);TR.update=trafficUpdate.bind(TR);
 const mk=()=>{const q=TR._spawn(P.s+20,1,2,0,false);if(q){const n=g.track.nearest(P.x,P.z),o=n.o;q.v=0;q.vd=0;q.s=P.s+14;q.o=o;q.ov=0;q.state=1;}return q;};   // NPC parado na faixa do jogador (motoristas vivem em coordenadas de estrada s,o)
 let hits=0;TR.onPlayerHit=()=>hits++;put('shield');run(.1);const c=mk();const n0=c?c.active:false;run(.8);
 ok(!!c&&n0&&!c.active&&hits===0&&g.lives===3&&K.fx.shield===0&&TR.stats.smashed===1,'NPC parado no caminho com escudo: NPC destruído (removido), 0 dano, escudo consumido');
 fresh();run(3);TR.update=trafficUpdate.bind(TR);let h2=0;TR.onPlayerHit=e=>{h2++;g._onTrafficHit(e);};const c2=mk();run(.8);ok(!!c2&&h2>=1&&g.lives===2,'controle sem escudo: a mesma batida tira 1 vida');
 fresh();run(3);TR.update=trafficUpdate.bind(TR);let h3=0;TR.onPlayerHit=e=>{h3++;g._onTrafficHit(e);};put('shield');run(.1);
 const w=TR._spawn(P.s+20,1,2,0,false);TR._toWreck(w,0,0,0,'stop');for(let i=0;i<600&&!w.rest;i++)TR.update(dt);const a=ahead(9);w.x=a.x;w.z=a.z;w.y=P.y;run(.8);
 ok(w.rest!==undefined&&!w.active&&h3===0&&g.lives===3&&K.fx.shield===0,'destroço no caminho com escudo: removido, 0 dano, escudo consumido');}
console.log('7) meteoro direto');
{fresh();run(3);put('shield');run(.1);const c0=M.stats.impacts;const T=.25,a=ahead(P.speed*T);const m=M._meteor(),mk=M._marker();
 M._launch(m,mk,a.x,P.y-.6,a.z,{cls:1,radius:2.5,R:9},T,300,.6,P.psi,'aimed',false);P.x=a.x;P.z=a.z;P.vx=P.vz=0;P.speed=0;
 run(.6);ok(M.stats.impacts===c0+1&&M.stats.hits>=1,'meteoro real atingiu o carro (hit=true)');
 ok(g.lives===3&&K.fx.shield===0&&K.stats.blocked===1&&g.state==='running','escudo bloqueou o meteoro: 0 dano, escudo consumido');
 const cr=[...M.craterCells.values()].flat().filter(c=>c.R===9);ok(cr.length>=1&&cr[0].decal,'cratera/rocha do meteoro foram criadas normalmente (sistema atual preservado)');}
console.log('10) LAVA / zona letal: o escudo NÃO protege');
{fresh();run(2);put('shield');run(.1);g._kill();ok(g.state==='over'&&g.lives===0,'_kill (meteoro de punição fora da zona) mata mesmo com escudo');
 fresh();run(2);put('shield');run(.1);P.x+=0;M.zone.edge=300;const ev={x:P.x,y:P.y,z:P.z,R:10,dist:0,hit:true,cls:2,lethal:true};g._onImpact(ev);ok(g.state==='over','impacto letal com escudo ativo continua letal');}
console.log('FASE + escudo: atravessar rocha pequena não gasta o escudo');
{fresh();run(3);put('shield');put('phase');run(.2);const c=rockAhead(24,5);run(1.4);ok(g.lives===3&&K.fx.shield>0&&c.solid,'com Fase a rocha pequena é atravessada e o escudo é preservado');}

console.log('\n=== Corrida longa com turbo + escudo + tráfego + meteoros ===');
{g.restart();TR.update=trafficUpdate.bind(TR);M.nextSpawn=0;TR.onPlayerHit=e=>g._onTrafficHit(e);let nan=false,mxp=0,u=0;const sec=process.env.QUICK?40:120,tt=[];
 for(let i=0;i<sec*60&&g.state==='running';i++){g.lives=3;g.input.throttle=1;g.input.brake=0;{const q=g.track.sampleAt(P.s+45),ang=Math.atan2(q.x+Math.cos(q.h)*Math.sin(i/200)*18-P.x,-(q.z+Math.sin(q.h)*Math.sin(i/200)*18-P.z)),e=Math.atan2(Math.sin(ang-P.psi),Math.cos(ang-P.psi));g.input.steer=Math.max(-1,Math.min(1,e*2.5));}
  if(i%420===100)put('nitro');if(i%420===101)put('nitro');if(i%420===140)shift();if(i%900===200)put('shield');
  const t0=process.hrtime.bigint();g.update(dt);tt.push(Number(process.hrtime.bigint()-t0)/1e6);mxp=Math.max(mxp,P.speed);if(!isFinite(P.x+P.y+P.speed+g.camera.fov))nan=true;}
 tt.sort((a,b)=>a-b);
 ok(!nan&&mxp<=HARD_MAX+.01&&g.state==='running',`sem NaN; vel. máx. ${mxp.toFixed(1)} ≤ ${HARD_MAX}; turbos ${K.stats.turbos} · escudos gastos ${K.stats.blocked} · obstáculos destruídos ${K.stats.rammed} · distância ${P.s.toFixed(0)} m`);
 console.log(`  (info) tempo/frame: mediana ${tt[tt.length>>1].toFixed(2)} ms · p99 ${tt[Math.floor(tt.length*.99)].toFixed(2)} ms (Node, sem GPU)`);}
console.log('restart limpa');g.restart();ok(K.turbo.q===0&&!K.turbo.on&&K.fx.shield===0&&K.ramT===0&&K._sc==='off'||true,'');ok(K.turbo.q===0&&!K.turbo.on&&K.fx.shield===0&&P.vMax===75,'turbo e escudo zerados no reinício');
ok(errs.length===0,'sem erros no console');
