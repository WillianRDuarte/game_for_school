// Regra dos 200 m: fora da zona segura, um meteoro de punição mata na hora; dentro, vale o sistema normal de 3 vidas.
// Uso: node --import ./tests/register.mjs tests/danger_test.mjs
import {Game,MAX_LIVES} from '../js/game.js';
import {STEP} from '../js/road.js';
import {DANGER_DIST,WARN_DIST} from '../js/meteors.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,M=g.meteors,P=g.player;g.input.poll=()=>{};
const IN={throttle:0,brake:0,steer:0};
const brute=(x,z)=>{let b=1e9;for(const s of g.track.samples.values()){const e=Math.hypot(x-s.x,z-s.z)-s.w;if(e<b)b=e;}return Math.max(0,b);};   // varredura TOTAL (referência lenta)
function place(s,edge,side,away=true,speed=20){   // carro a `edge` m da borda (ponto perpendicular), de lado `side` (±1), opcionalmente apontando para longe da pista
  const q=g.track.sampleAt(s),off=side*(q.w+edge);P.x=q.x+Math.cos(q.h)*off;P.z=q.z+Math.sin(q.h)*off;P.psi=q.h+(away?side:-side)*Math.PI/2;
  P.vx=Math.sin(P.psi)*speed;P.vz=-Math.cos(P.psi)*speed;P.speed=speed;P.yawRate=0;P.idx=Math.floor(s/STEP);P.y=null;P.update(0,IN);}
const fresh=()=>{M.reset();M.time=5;M.nextSpawn=1e9;g.state='running';g.lives=MAX_LIVES;g.invuln=0;g.ui.hideOver();g.ui.setLives(g.lives,MAX_LIVES);};
const run=(sec,pre)=>{for(let i=0;i<Math.round(sec*60)&&g.state==='running';i++){g.input.throttle=1;g.input.brake=0;g.input.steer=0;pre&&pre(i);g.update(dt);}};
const curvy=[],straight=[];{const T=g.track;for(let s=600;s<9000;s+=40){const a=T.sampleAt(s-300).h,b=T.sampleAt(s+300).h,d=Math.abs(b-a);if(d>.9&&curvy.length<10&&(!curvy.length||s-curvy[curvy.length-1]>500))curvy.push(s);if(d<.04&&straight.length<4&&(!straight.length||s-straight[straight.length-1]>600))straight.push(s);}}
console.log(`   trechos de teste: ${straight.length} retos, ${curvy.length} curvos/grampos`);

console.log('1) distância à pista: exata (rede inteira) e limite superior barato sempre válido');
{let maxDiff=0,n=0,bad=0,ubBad=0;
 for(const s of[...straight,...curvy])for(const side of[-1,1])for(const e of[20,120,180,215,300]){place(s,e,side);const E=g.track.edgeDist(P.x,P.z),B=brute(P.x,P.z);
   if(B<330){maxDiff=Math.max(maxDiff,Math.abs(E-B));n++;if(Math.abs(E-B)>.01)bad++;}
   const cheap=P.roadD-P.roadW;if(cheap<E-1e-6)ubBad++;}
 ok(n>50&&bad===0,`edgeDist = varredura total em ${n} pontos (curvas, grampos, dos dois lados) · maior diferença ${maxDiff.toExponential(1)} m`);
 ok(ubBad===0,'roadD−roadW (barato, já calculado todo frame) nunca é MENOR que a distância exata → "perto" nunca é falso');}

console.log('2) sem falso positivo: 6 km ao longo da pista a 185 m da borda, nos dois lados (inclui curvas, grampos, chunks novos)');
{fresh();M.nextSpawn=0;M.difficulty=()=>.5;let calls=0,maxEdge=0,out=0,minE=1e9;const eo=g.track.edgeDist.bind(g.track);g.track.edgeDist=(x,z)=>{calls++;return eo(x,z);};
 g.restart();const T=g.track;T.edgeDist=((o)=>(x,z)=>{calls++;return o(x,z);})(T.edgeDist.bind(T));M.time=5;
 for(let s=200,i=0;s<6200;s+=1.2,i++){g.lives=3;g.invuln=9;const side=((s/900)|0)%2?1:-1,q=T.sampleAt(s);   // troca de lado a cada 900 m (cruza a pista)
   P.x=q.x+Math.cos(q.h)*side*(q.w+185);P.z=q.z+Math.sin(q.h)*side*(q.w+185);P.psi=q.h;P.vx=Math.sin(q.h)*30;P.vz=-Math.cos(q.h)*30;P.idx=Math.floor(s/STEP);P.update(0,IN);
   g.world.update(P.x,P.z,P.s,5);M.update(dt);if(M.zone.out)out++;maxEdge=Math.max(maxEdge,M.zone.edge);}
 ok(out===0&&M.stats.lethal===0&&!M.lethalM,`nenhum disparo letal em ${Math.round(6000/1.2)} frames a 185 m (zona.out=0; maior distância medida ${maxEdge.toFixed(0)} m; pista descarregada atrás: ${T.minKept} amostras)`);
 g.state='running';}

console.log('3) dentro dos 200 m o sistema normal de 3 vidas continua igual');
for(const e of[30,150,185]){g.restart();fresh();place(straight[1],e,1,false,10);run(.5);
  const m=(()=>{M.spawn=Object.getPrototypeOf(M).spawn;const before=M.meteors.filter(m=>m.active);M.spawn();const m=M.meteors.find(m=>m.active&&!before.includes(m));m.ix=P.x;m.iz=P.z;m.t=m.T-.002;m.R=Math.max(m.R,6);return m;})();
  run(.1);ok(g.state==='running'&&g.lives===2,`a ${e} m da pista: impacto comum → 1 vida (vidas ${g.lives}, estado ${g.state}) · lethal=${M.stats.lethal}`);}
{g.restart();fresh();let r;g._onImpact({hit:true,lethal:false});r=g.lives;ok(r===2&&g.state==='running','_onImpact comum (hit) tira exatamente 1 vida');
 g.invuln=0;g._onImpact({hit:true,lethal:false});g.invuln=0;g._onImpact({hit:true,lethal:false});ok(g.lives===0&&g.state==='over','3 impactos comuns → game over (regra antiga intacta)');}

console.log('4) >200 m: meteoro de punição direcionado, cai rápido, visível, e mata na hora (mesmo com 3 vidas e invulnerável)');
for(const [label,e,inv] of[['250 m, 3 vidas',250,0],['230 m, invulnerável',230,2.2]]){
  g.restart();fresh();place(straight[0],e,-1);g.invuln=inv;g.lives=3;g.ui.setLives(3,3);
  let tLaunch=null,tDeath=null,mm=null,ys=[],visible=true,markerOK=true,t=0,edgeAtLaunch=null,aimErr=null;
  for(let i=0;i<5*60&&g.state==='running';i++){g.input.throttle=1;g.input.brake=0;g.input.steer=0;g.invuln=Math.max(g.invuln,inv);g.update(dt);t+=dt;
    if(M.lethalM&&tLaunch===null){tLaunch=t;mm=M.lethalM;edgeAtLaunch=M.zone.edge;}
    if(mm&&mm.active&&mm.lethal){ys.push(mm.root.position.y);visible=visible&&mm.root.visible;markerOK=markerOK&&!!mm.marker&&mm.marker.group.visible;aimErr=Math.hypot(mm.ix-P.x,mm.iz-P.z);}}
  tDeath=g.state==='over'?t:null;
  ok(tLaunch!==null&&tLaunch>=.25&&tLaunch<=.6,`${label}: meteoro disparado ${tLaunch?.toFixed(2)} s depois de passar de ${DANGER_DIST} m (distância medida ${edgeAtLaunch?.toFixed(0)} m)`);
  ok(ys.length>40&&ys[0]-ys[ys.length-1]>250&&ys.every((y,i)=>i===0||y<ys[i-1]),`${label}: desce continuamente e visível (${ys[0]?.toFixed(0)} → ${ys[ys.length-1]?.toFixed(0)} m de altura em ${ys.length} frames)`);
  ok(visible&&markerOK,`${label}: rocha visível o tempo todo e marcador de impacto no chão ativo`);
  ok(aimErr!==null&&aimErr<8,`${label}: mira acompanha o carro (erro no último frame ${aimErr?.toFixed(1)} m)`);
  ok(g.state==='over'&&g.lives===0&&M.stats.lethal===1,`${label}: GAME OVER instantâneo (vidas ${g.lives}, estado ${g.state}, letais ${M.stats.lethal})`);
  ok(tDeath!==null&&tDeath-tLaunch<=1.6,`${label}: queda de ${(tDeath-tLaunch).toFixed(2)} s (≤1,6 s)`);
  ok(__els.over.classList.contains('show')&&/meteoro fora da pista/.test(__els.overScore.textContent),`${label}: tela GAME OVER: "${__els.overScore.textContent}"`);
  ok(M.craterCells.size>0,`${label}: o meteoro deixa cratera/rocha no local, como os demais`);}

console.log('5) voltar para a zona segura antes do impacto cancela a punição');
{g.restart();fresh();place(straight[0],240,1);run(.5);const had=!!M.lethalM;ok(had,'meteoro de punição em voo');
 place(straight[0],40,1,false,20);for(let i=0;i<120&&g.state==='running';i++){g.input.throttle=1;g.input.brake=0;g.input.steer=0;g.update(dt);}
 ok(g.state==='running'&&g.lives===3&&M.stats.lethal===0&&!M.lethalM,`voltou a 40 m da pista: vivo, 3 vidas, nenhuma morte letal (letais ${M.stats.lethal})`);}

console.log('6) curvas, grampos e bifurcações: decisão correta em ambos os lados da pista (170 / 195 / 215 / 260 m)');
{let n=0,wrong=0;const lines=[];
 for(const s of curvy.slice(0,6))for(const side of[-1,1])for(const e of[170,195,215,260]){g.restart();fresh();place(s,e,side,true,15);const B=brute(P.x,P.z);
   run(.45,()=>{});   // > LETHAL_HOLD
   const fired=!!M.lethalM||g.state==='over'||M.stats.lethal>0,want=B>DANGER_DIST+.5,safe=B<DANGER_DIST-.5;
   // (o carro anda ~7 m nesse intervalo: só avalia quando a decisão não está na margem)
   const Bn=brute(P.x,P.z);n++;if((Bn<DANGER_DIST-8&&fired)||(Bn>DANGER_DIST+8&&B>DANGER_DIST+8&&!fired)){wrong++;lines.push(`s=${s} lado ${side} e=${e}: medido ${B.toFixed(0)}→${Bn.toFixed(0)} disparou=${fired}`);}}
 ok(wrong===0,`${n} posições em curvas/grampos: nenhuma decisão errada${wrong?' — '+lines.join('; '):''}`);}

console.log('7) custo: sem busca pesada perto da pista; busca exata ≤10×/s só longe');
{g.restart();fresh();const T=g.track;let calls=0;const o=T.edgeDist.bind(T);T.edgeDist=(x,z)=>{calls++;return o(x,z);};
 place(straight[0],10,1,false,30);for(let i=0;i<10*60;i++){g.lives=3;g.invuln=9;P.x+=0;g.input.throttle=1;g.input.steer=0;M.zone.edge=0;M._zoneUpdate(dt);}
 ok(calls===0,`perto da pista (10 s): ${calls} buscas exatas (usa só o roadD que o carro já calcula)`);
 calls=0;place(straight[0],160,1,false,0);M.lethalM=null;for(let i=0;i<10*60;i++){g.lives=3;g.invuln=9;M._zoneUpdate(dt);}
 ok(calls<=102,`a 160 m (zona de aviso) por 10 s: ${calls} buscas (≈10/s)`);}

console.log('8) aviso na tela');
{g.restart();fresh();place(straight[0],160,1,false,0);g.ui.setDanger(null);M.zone.edge=160;M.zone.out=false;g.ui.setDanger(M.zone,null);
 ok(__els.danger.classList.contains('on')&&/volte à pista/.test(__els.danger.textContent),`a 160 m: "${__els.danger.textContent}"`);
 M.zone.edge=230;M.zone.out=true;g.ui.setDanger(M.zone,null);ok(__els.danger.classList.contains('hot')&&/ZONA LETAL/.test(__els.danger.textContent),`>200 m: "${__els.danger.textContent}"`);
 M.zone.edge=20;M.zone.out=false;g.ui.setDanger(M.zone,null);ok(!__els.danger.classList.contains('on'),'perto da pista: aviso oculto');}

console.log('9) reinício limpa tudo');
{g.restart();fresh();place(straight[0],250,1);run(2.5);ok(g.state==='over','morreu fora da zona');
 __key('Enter');ok(g.state==='running'&&g.lives===3&&!M.lethalM&&!M.zone.out&&M.nActive===0,'Enter: jogo reinicia, sem meteoro de punição pendente, zona resetada');
 run(3);ok(g.state==='running','3 s depois do reinício: vivo (no início da pista, dentro da zona segura)');}
console.log('\nFIM · exitCode',process.exitCode||0);
