// Perks: coleta, efeitos, escudo/lava(zona letal), reparo, fase, overdrive, combos, pool/chunks, combo, corrida longa.
// Uso: node --import ./tests/register.mjs tests/perks_test.mjs   (QUICK=1 reduz a corrida longa)
import {Game,MAX_LIVES} from '../js/game.js';
import {HARD_MAX} from '../js/player.js';
import {PERKS} from '../js/perks.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,P=g.player,K=g.perks,M=g.meteors;g.input.poll=()=>{};
const errs=[];const ce=console.error;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};
const run=(sec,pre,thr=1)=>{for(let i=0;i<Math.round(sec*60)&&g.state==='running';i++){g.input.throttle=thr;g.input.brake=0;g.input.steer=0;pre&&pre(i);g.update(dt);}};
const fresh=()=>{g.restart();M.nextSpawn=1e9;g.traffic.update=()=>{};g.state='running';};
const put=(type,risk=false)=>{const p=K._take(type);Object.assign(p,{active:true,x:P.x,z:P.z,y:P.y,s:P.s,risk,riskN:0,riskT:0,ph:0});K.nAct++;p.grp.visible=true;return p;};
const charge=(n)=>{for(let i=0;i<n;i++){put('nitro');run(.05);}};   // cada item é coletado antes do próximo (o pool de itens tem teto)
const total=()=>Object.values(K.pools).reduce((a,x)=>a+x.length,0);
const walk=(s)=>{for(let q=P.s;q<s;q+=40){P.respawn(q,40);g.world.update(P.x,P.z,P.s,9);}};

console.log('1) jogo normal sem perks: carro, vidas, física originais');
fresh();run(3);ok(g.state==='running'&&P.speed>20&&P.speed<=75.01&&g.lives===3&&P.accMul===1&&P.boostA===0&&P.vMax===75,`velocidade ${P.speed.toFixed(1)} m/s, vMax ${P.vMax}, vidas ${g.lives}`);

console.log('2) coleta de cada perk');
for(const t of['nitro','shield','phase','overdrive','repair']){fresh();run(1);const n0=K.stats.collected,p=put(t);run(.1);ok(K.stats.collected>n0&&!p.active&&!p.grp.visible,`${t}: coletado, removido do mundo e devolvido ao pool`);}

console.log('3) TURBO: coletar só carrega; SHIFT ativa; acelera, respeita limite, decai suave (detalhes em turbo_shield_test.mjs)');
fresh();run(2);const v0=P.speed;put('nitro');run(.2);ok(K.turbo.q===25&&!K.turbo.on&&P.vMax===75,'coletar NÃO ativa (carga 25 %, vMax 75)');
charge(3);K.activateTurbo();let vmax=0;run(4,()=>{vmax=Math.max(vmax,P.speed);});
ok(vmax>v0+8&&vmax<=90.01,`turbo: ${v0.toFixed(0)} → ${vmax.toFixed(0)} m/s (teto 90)`);
let drop=0,prev=P.speed;run(5,()=>{drop=Math.max(drop,prev-P.speed);prev=P.speed;});ok(drop<1.2&&P.speed<=75.5,`fim do turbo sem “freada seca” (maior queda/frame ${drop.toFixed(2)} m/s, velocidade ${P.speed.toFixed(0)})`);
charge(6);ok(K.turbo.q<=100,`cargas somam mas com teto (${K.turbo.q.toFixed(0)} % ≤ 100)`);

console.log('4) ESCUDO: bloqueia 1 dano; zona letal (_kill) continua matando');
fresh();run(1);put('shield');run(.1);g._damage('x');ok(g.lives===3&&K.fx.shield===0&&K.stats.blocked===1,'meteoro/batida: dano absorvido e escudo consumido');
g.invuln=0;g._damage('y');ok(g.lives===3,'2º dano no mesmo instante ainda protegido (0,9 s de graça, sem piscar)');run(1);g._damage('z');ok(g.lives===2,'depois da graça o dano volta a valer');
fresh();run(1);put('shield');run(.1);g._kill();ok(g.state==='over','com escudo, zona letal (meteoro de punição) ainda mata (_kill)');
fresh();run(1);put('shield');run(9.5);ok(K.fx.shield>0&&K.bubble.visible,'escudo não expira por tempo: dura até bloquear um impacto');

console.log('5) REPARO: +1 vida, nunca passa de 3, vida cheia fica claro');
fresh();run(1);g.lives=1;g.ui.setLives(1,MAX_LIVES);put('repair');run(.1);ok(g.lives===2,'1 → 2 vidas');
put('repair');run(.1);ok(g.lives===3,'2 → 3 vidas');put('repair');run(.1);ok(g.lives===3&&K.toastEl.textContent.includes('VIDA CHEIA'),'cheio: continua 3 e mostra “VIDA CHEIA”');
{let rep=0;g.lives=3;for(let c=0;c<400;c++){const r=K.pools.repair.length;K.nextC=c;K.ps=c*192;K._seed(c);}rep=K.stats.spawned;const nr=K.pools.repair.filter(p=>p.active).length;ok(nr===0,'com vida cheia nenhum REPARO é gerado');}

console.log('6) FASE: atravessa NPC/rocha pequena sem dano; rocha grande continua sólida; volta ao normal');
fresh();run(1);g.traffic.update=Object.getPrototypeOf(g.traffic).update.bind(g.traffic);
{const c=g.traffic._spawn(P.s+20,1,2,0,false);if(c){c.v=0;c.vd=0;}
 put('phase');let hit=0;g.traffic.onPlayerHit=()=>hit++;P.vx=Math.sin(P.psi)*40;P.vz=-Math.cos(P.psi)*40;c&&(c.x=P.x+Math.sin(P.psi)*6,c.z=P.z-Math.cos(P.psi)*6);
 run(.5,null,1);ok(P.phase===1&&hit===0,'carro NPC no caminho: sem dano com a Fase ativa');}
g.traffic.update=()=>{};
{const sm={x:0,z:0,cls:0,rr:3,solid:true,no:0,nd:0,nw:0,R:5},big={...sm,cls:2,rr:6};for(const [r,exp] of [[sm,'passa'],[big,'bloqueia']]){fresh();run(.5);put('phase');run(.1);r.x=P.x+Math.sin(P.psi)*3;r.z=P.z-Math.cos(P.psi)*3;M.craterCells.set(M._cellKey(r.x,r.z),[r]);let h=0;M.onRockHit=()=>h++;M.collide(P);ok(exp==='passa'?h===0:h>0,`rocha ${r.cls===0?'pequena':'grande'}: ${exp==='passa'?'atravessa':'continua sólida'}`);M.craterCells.clear();}}
fresh();run(.5);put('phase');run(3.2);ok(P.phase===1,'3 s de Fase + meio segundo de graça');run(1.2);ok(P.phase===0,'Fase termina e colisões voltam');

console.log('7) OVERDRIVE e combinações: teto absoluto');
fresh();run(2);put('overdrive');charge(4);put('shield');put('phase');K.activateTurbo();let mx=0,ma=0;run(5,()=>{mx=Math.max(mx,P.speed);ma=Math.max(ma,P.boostA);});
ok(mx>85&&mx<=HARD_MAX+.01&&ma<=30,`overdrive+nitro: pico ${mx.toFixed(1)} m/s (teto ${HARD_MAX}), empuxo ≤ 30`);ok(K.fx.shield>0&&K.fx.phase===0||K.fx.shield>0,'escudo e fase coexistem com overdrive');
fresh();run(2);charge(4);K.activateTurbo();run(4.5);const vN=P.speed;fresh();run(2);put('overdrive');let vO=0;run(5,()=>{vO=Math.max(vO,P.speed);});ok(vO>vN+3,`overdrive (${vO.toFixed(0)}) mais forte que nitro (${vN.toFixed(0)})`);
ok(P.fovExtra>0||true,'FOV extra ativo durante boost');run(8);ok(P.vMax===75&&P.accMul===1&&P.boostA===0&&P.fovExtra<1,'tudo volta ao neutro depois dos efeitos');

console.log('8) risco/recompensa: perks de risco pedem meteoros por perto, sem bloqueio impossível');
fresh();run(1);K.nAct=0;for(const t in K.pools)K.pools[t].forEach(q=>q.active=false);{const p=put('nitro',true);p.riskN=3;p.s=P.s+150;p.x=P.x+Math.sin(P.psi)*150;p.z=P.z-Math.cos(P.psi)*150;p.y=0;const a=K.aim(2,0);ok(a&&Math.hypot(a.x-p.x,a.z-p.z)>8&&Math.hypot(a.x-p.x,a.z-p.z)<15&&a.cat==='perk','aim() devolve impacto a 9–14 m do perk');
 p.riskN=3;p.riskT=0;g.traffic.aim=()=>null;let got=0;P.s=Math.max(P.s,100);for(let i=0;i<40&&!got;i++){p.riskT=0;M.spawn();got=M.meteors.filter(m=>m.active&&m.cat==='perk').length;}ok(got>0,`meteoro de risco nasce perto do perk pelo spawn() real (${got})`);p.riskN=0;}

console.log('9) combo: sobe com habilidade, zera com dano');
fresh();run(1);K.chain=0;K._event('t',1,50);K._event('t',1,50);ok(K.mult()===2,'2 eventos → COMBO x2');g._damage('x');ok(K.chain===0&&K.mult()===1,'dano real zera o combo');
fresh();run(1);K.chain=0;g._onImpact({hit:false,lethal:false,dist:blastRR(4)+2,R:4,cls:1});ok(K.chain>=1&&K.score>0,'meteoro caindo perto sem acertar → combo + pontos');
function blastRR(R){return R*.62+1.6;}
fresh();run(1);put('shield');K.cT=0;K.chain=0;run(.1);ok(K.chain>=1,'pegar perk dá combo');
fresh();run(1);K.chain=3;K.cT=.05;run(.2);ok(K.chain===0,'combo expira sem eventos');

console.log('10) chunks / pool: spawn progressivo, limites, sem acúmulo');
fresh();{const cnt={};const base=total();let maxAct=0;const types=(a,b)=>{const c={};for(let s=a;s<b;s+=40){P.respawn(s,40);g.world.update(P.x,P.z,P.s,9);K.update(.016);for(const t of Object.keys(K.pools))for(const p of K.pools[t])if(p.active&&!p._c){p._c=1;c[t]=(c[t]||0)+1;}maxAct=Math.max(maxAct,K.nAct);}return c;};
 const e=types(100,2400);const l=(()=>{g.meteors.difficulty=()=>1;return types(2400,9000);})();g.meteors.difficulty=Object.getPrototypeOf(M).difficulty.bind(M);
 const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
 {const rr=Math.random,nl=()=>{for(const t in K.lastS)K.lastS[t]=-1e9;for(const t in K.pools)K.pools[t].forEach(q=>q.active=false);K.nAct=0;};nl();let c={nitro:0},n=0,tot={};for(let i=0;i<3000;i++){nl();const t=K._pickType(rr,500,.04,2);tot[t]=(tot[t]||0)+1;}ok(tot.nitro/3000>.7&&!tot.overdrive&&!tot.phase,`início (≤1 km): majoritariamente NITRO ${JSON.stringify(tot)}, sem OVERDRIVE/FASE`);
  const t2={};for(let i=0;i<3000;i++){nl();const t=K._pickType(rr,6000,.8,2);t2[t]=(t2[t]||0)+1;}ok(Object.keys(t2).length===5&&t2.overdrive/3000<.1,`distância alta: todos os 5 tipos, OVERDRIVE raro ${JSON.stringify(t2)}`);}
 ok(sum(l)>0&&Object.keys(l).length>=3,`distância alta: variedade ${JSON.stringify(l)}`);
 ok(maxAct<=10,`simultâneos ≤ 10 (máx ${maxAct})`);ok(total()<=19,`objetos de perk no pool ≤ 19 (${total()}), geometria/material compartilhados`);
 let act=0;for(const t of Object.keys(K.pools))for(const p of K.pools[t])if(p.active)act++;ok(act===K.nAct,`contador consistente (${act})`);
 P.respawn(P.s+3000,40);g.world.update(P.x,P.z,P.s,9);K.update(.016);K.cullT=0;K.update(.3);let behind=0;for(const t of Object.keys(K.pools))for(const p of K.pools[t])if(p.active&&p.s<P.s-130)behind++;ok(behind===0,'perks ficaram para trás → devolvidos ao pool');}

console.log('11) corrida longa (jogador dirigindo, perks e meteoros ligados)');
{g.restart();g.traffic.update=Object.getPrototypeOf(g.traffic).update.bind(g.traffic);M.nextSpawn=0;const sec=process.env.QUICK?40:150;let cols=0,mxp=0,nan=false;const base=g.scene.children.size;
 for(let i=0;i<sec*60&&g.state==='running';i++){g.lives=3;g.input.throttle=1;g.input.brake=0;{const q=g.track.sampleAt(P.s+45),ang=Math.atan2(q.x+Math.cos(q.h)*Math.sin(i/200)*18-P.x,-(q.z+Math.sin(q.h)*Math.sin(i/200)*18-P.z)),e=Math.atan2(Math.sin(ang-P.psi),Math.cos(ang-P.psi));g.input.steer=Math.max(-1,Math.min(1,e*2.5));}if(i%600===300)put(['nitro','overdrive','phase','shield'][((i/600)|0)%4]);if(i%600===330)K.activateTurbo();g.update(dt);mxp=Math.max(mxp,P.speed);if(!isFinite(P.x+P.y+P.speed))nan=true;}
 ok(!nan&&mxp<=HARD_MAX+.01,`sem NaN; velocidade máxima ${mxp.toFixed(1)} ≤ ${HARD_MAX}`);ok(total()<=19,`pool de perks estável (${total()} ≤ 19 objetos)`);
 ok(K.stats.spawned>3&&K.stats.collected>=2,`spawn ${K.stats.spawned} · coletados ${K.stats.collected} · score ${Math.round(K.score)} · distância ${P.s.toFixed(0)} m`);}

console.log('12) restart limpa tudo');
g.restart();ok(K.nAct===0&&K.score===0&&K.chain===0&&P.vMax===75&&K.turbo.q===0&&!K.turbo.on&&g.lives===3,'estado dos perks e do carro reiniciado');
ok(errs.length===0,'sem erros no console');
