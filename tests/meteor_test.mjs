// Testes headless do sistema de meteoros integrado ao Game real. Uso: node --import ./tests/register.mjs tests/meteor_test.mjs
import {Game,MAX_LIVES,INVULN} from '../js/game.js';
import {surface} from '../js/terrain.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60;g.input.poll=()=>{};   // sem teclado: o piloto automático escreve em g.input
const bot={evade:false};
function drive(){ // segue a pista; opcionalmente desvia dos avisos
  const P=g.player,T=g.track,p=T.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z));let err=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi)),steer=err*3;
  if(bot.evade){for(const w of g.meteors.warnings){const fx=Math.sin(P.psi),fz=-Math.cos(P.psi),dx=P.x+fx*P.speed*Math.min(w.left,2)-w.x,dz=P.z+fz*P.speed*Math.min(w.left,2)-w.z,d=Math.hypot(dx,dz);
    if(w.left<3.6&&d<w.R*1.1+22){const lat=dx*Math.cos(P.psi)+dz*Math.sin(P.psi);steer=(lat>=0?1:-1);}}}
  g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,steer));}
const step=(n=1)=>{for(let i=0;i<n;i++){if(g.state==='running')drive();g.update(dt);}};
const M=g.meteors;

console.log('1) estado inicial');
ok(g.lives===3&&__els.lives.textContent==='❤️ ❤️ ❤️','3 vidas e HUD "'+__els.lives.textContent+'"');
ok(g.state==='running','jogo rodando');

console.log('2) spawn, trajetória e aviso (sem desvio, 40 s)');
const seen=[];let maxAlive=0,firstSpawnT=null,warnSeen=0,skyOK=true;
const origSpawn=M.spawn.bind(M);M.spawn=function(){const r=origSpawn();if(r){const m=this.meteors.filter(m=>m.active).pop();seen.push({m,t:this.time,s:g.player.s});
  if(firstSpawnT===null)firstSpawnT=this.time;if(m.sy-m.iy<300)skyOK=false;}return r;};
M.onImpact=(e)=>{g._onImpact(e);};
for(let i=0;i<40*60;i++){step();maxAlive=Math.max(maxAlive,M.stats.alive);if(M.warnings.length)warnSeen++;}
ok(firstSpawnT>=2.5,'primeiro meteoro só após 2,5 s (apareceu em t='+firstSpawnT?.toFixed(1)+' s)');
ok(seen.length>=60,'meteoros gerados em 40 s: '+seen.length);
ok(skyOK,'todos nascem a ≥300 m de altura (vêm do céu, nunca no chão)');
ok(seen.every(x=>x.m.T>=1.4),'tempo de queda ≥1,4 s — antes ≥2,5 s (mín. observado '+Math.min(...seen.map(x=>x.m.T)).toFixed(2)+' s)');
ok(warnSeen>0,'avisos de impacto ativos durante a queda');
ok(maxAlive<=140,'meteoros simultâneos ≤140 (máx. '+maxAlive+')');
console.log('   impactos',M.stats.impacts,'· acertos no carro',M.stats.hits,'· vidas',g.lives);

console.log('3) distribuição dos pontos de impacto (relativo ao carro) em dificuldade crescente');
const cats={},cnt={};
for(const k of[0,.5,1]){M.reset();g.lives=3;g.state='running';g.invuln=0;g.player.respawn(40);const rec=[];M.difficulty=()=>k;
  const o2=M._impact.bind(M);M._impact=function(m){const P=g.player,fx=Math.sin(P.psi),fz=-Math.cos(P.psi),rx=Math.cos(P.psi),rz=Math.sin(P.psi),dx=m.ix-P.x,dz=m.iz-P.z;
    const gs=surface(g.track,m.ix,m.iz,{});rec.push({along:dx*fx+dz*fz,lat:dx*rx+dz*rz,off:gs.d>gs.w+10,R:m.R,cls:m.cls,T:m.T});o2(m);};
  for(let i=0;i<300*60;i++){g.invuln=9;if(g.player.s>3000)g.player.respawn(g.player.s-2500);step();}M._impact=o2;
  const n=rec.length,beh=rec.filter(r=>r.along<-20).length,fr=rec.filter(r=>r.along>60).length,side=n-beh-fr,off=rec.filter(r=>r.off).length;
  const Rm=rec.reduce((a,r)=>a+r.R,0)/n,big=rec.filter(r=>r.cls===2).length;
  console.log(`   k=${k}: ${n} impactos em 300 s (1 a cada ${(300/n).toFixed(1)} s) · atrás ${(100*beh/n).toFixed(0)}% · lados ${(100*side/n).toFixed(0)}% · frente ${(100*fr/n).toFixed(0)}% · fora da pista ${(100*off/n).toFixed(0)}% · raio médio da cratera ${Rm.toFixed(0)} m · grandes ${(100*big/n).toFixed(0)}% · T ${Math.min(...rec.map(r=>r.T)).toFixed(1)}–${Math.max(...rec.map(r=>r.T)).toFixed(1)} s`);
  cnt[k]={n,beh:beh/n,off:off/n,Rm};}
M.difficulty=()=>Math.min(1,g.player.s/10000);
ok(cnt[1].n>cnt[0].n*2&&cnt[0].n>=350,'frequência cresce com a dificuldade ('+cnt[0].n+' → '+cnt[.5].n+' → '+cnt[1].n+')');
ok(cnt[1].Rm>cnt[0].Rm,'crateras maiores com a dificuldade ('+cnt[0].Rm.toFixed(1)+' → '+cnt[1].Rm.toFixed(1)+' m)');
ok(cnt[0].beh>.3&&cnt[0].beh<.8,'parte considerável cai atrás ('+(100*cnt[0].beh).toFixed(0)+'%), mas não todos');
ok(cnt[0].off>.4,'muitos impactos fora da pista ('+(100*cnt[0].off).toFixed(0)+'%)');

// ---------------------------------------------------------------- helpers
const forceHit=(onPlayer=true)=>{M.nextSpawn=1e9;const before=M.meteors.filter(m=>m.active);M.spawn=origSpawn;origSpawn();const m=M.meteors.find(m=>m.active&&!before.includes(m));
  const P=g.player;m.ix=P.x;m.iz=P.z;m.iy=surface(g.track,P.x,P.z,{}).h;m.t=m.T-.002;m.R=Math.max(m.R,6);return m;};
const wait=s=>{for(let i=0;i<Math.round(s*60);i++)g.update(dt);};   // jogador parado no tempo (sem piloto) — só deixa o relógio andar
console.log('4) vidas, invulnerabilidade, GAME OVER, reinício');
g.restart();M.difficulty=()=>0;M.nextSpawn=1e9;
ok(g.lives===3&&g.state==='running','reinício: 3 vidas');
forceHit();step(2);
ok(g.lives===2,'1º impacto no carro → 2 vidas (HUD "'+__els.lives.textContent+'")');
ok(__els.lives.textContent==='❤️ ❤️ 🖤','HUD ❤️ ❤️ 🖤');
ok(g.invuln>INVULN-.2,'invulnerável por '+INVULN+' s após o dano');
forceHit();step(2);
ok(g.lives===2,'2º impacto dentro da janela de invulnerabilidade NÃO remove vida (vidas '+g.lives+')');
const blink=[];for(let i=0;i<20;i++){step();blink.push(g.player.mesh.visible);}ok(blink.includes(true)&&blink.includes(false),'carro pisca enquanto invulnerável');
step(Math.ceil(INVULN*60));ok(g.invuln<=0&&g.player.mesh.visible,'invulnerabilidade terminou; carro visível');
forceHit();step(2);ok(g.lives===1&&__els.lives.textContent==='❤️ 🖤 🖤','3º impacto → 1 vida (HUD '+__els.lives.textContent+')');
step(Math.ceil(INVULN*60)+5);
M.stats.hits=0;forceHit();step(2);
ok(g.lives===0&&g.state==='over','4º impacto → 0 vidas e GAME OVER');
ok(__els.over.classList.contains('show')&&/Distância: \d+ m/.test(__els.overScore.textContent),'tela GAME OVER visível: "'+__els.overScore.textContent+'" / "'+__els.overBest.textContent+'"');
const frozen={s:g.player.s,x:g.player.x,z:g.player.z};for(let i=0;i<120;i++)g.update(dt);
ok(g.player.x===frozen.x&&g.player.z===frozen.z&&g.player.s===frozen.s,'gameplay interrompido no game over (carro parado)');
g.input.onPause();ok(g.state==='over','P no game over não "ressuscita" o jogo');
const lastS=g.player.s;
__key('Enter');
ok(g.state==='running'&&g.lives===3&&__els.lives.textContent==='❤️ ❤️ ❤️'&&!__els.over.classList.contains('show'),'Enter reinicia: 3 vidas, overlay oculto');
ok(g.player.s<100&&M.stats.spawned===0&&M.craterCells.size===0,'reinício: carro no início, meteoros/crateras zerados');
step(300);ok(g.state==='running'&&isFinite(g.player.x),'jogo continua normal após reinício (5 s)');
// reinícios por botão e por R
for(const how of['click','R']){M.nextSpawn=1e9;g.lives=1;g.invuln=0;forceHit();step(2);ok(g.state==='over','game over de novo ('+how+')');
  if(how==='click')__els.restart.click();else g.input.onReset();ok(g.state==='running'&&g.lives===3,'reinício por '+how);}
ok(g.best>=0&&localStorage.getItem('meteorRunBest')!==null,'recorde salvo: '+g.best+' m');

console.log('5) justiça: acertos por minuto sem desviar vs. com um piloto que reage aos avisos');
const fair={};
for(const k of[0,.5,1])for(const ev of[false,true]){g.restart();M.difficulty=()=>k;bot.evade=ev;const sp=origSpawn;let frames=0;
  for(let i=0;i<180*60;i++){g.lives=3;g.invuln=0;step();if(g.player.s>8000){g.player.respawn(g.player.s-6000);}frames++;}
  fair[k+':'+ev]=M.stats.hits;}
for(const k of[0,.5,1])console.log(`   k=${k}: acertos em 3 min — sem reagir ${fair[k+':false']} · reagindo aos avisos ${fair[k+':true']}`);
ok(fair['0:false']<=15,'início do jogo: acertos moderados mesmo sem reagir ('+fair['0:false']+' em 3 min; limite subiu de 6 → 15 com a nova intensidade)');
{const a=fair['0:false']+fair['0.5:false']+fair['1:false'],b=fair['0:true']+fair['0.5:true']+fair['1:true'];ok(b<a,'reagir aos avisos reduz os acertos (soma dos 3 níveis: '+a+' → '+b+'; o piloto de teste é simples, por nível o resultado é ruidoso)');}
bot.evade=false;M.difficulty=()=>Math.min(1,g.player.s/10000);

console.log('6) crateras sobre a MALHA real do terreno (não flutuam, não enterram)');
g.restart();M.difficulty=()=>.7;
for(let i=0;i<150*60;i++){g.invuln=9;g.lives=3;step();}
const meshH=(x,z)=>{let best=null;for(const t of g.world.tiles.values())if(x>=t.x0&&x<t.x0+t.size&&z>=t.z0&&z<t.z0+t.size&&(!best||t.size<best.size))best=t;if(!best)return null;
  const N=32,W=N+1,c=best.size/N,fx=(x-best.x0)/c,fz=(z-best.z0)/c,i=Math.min(N-1,Math.floor(fx)),j=Math.min(N-1,Math.floor(fz)),u=fx-i,v=fz-j,P=best.g.attributes.position.array,h=(a,b)=>P[(b*W+a)*3+1];
  return{h:u+v<=1?h(i,j)+(h(i+1,j)-h(i,j))*u+(h(i,j+1)-h(i,j))*v:h(i+1,j+1)+(h(i,j+1)-h(i+1,j+1))*(1-u)+(h(i+1,j)-h(i+1,j+1))*(1-v),size:best.size};};
const rows={0:[],1:[],2:[]};let nd=0,floating=0,buried=0,checked=0;const bySz={};
for(const d of M.decals){if(!d.crater)continue;const c=d.crater,P=d.mesh.geometry.attributes.position.array,cls=c.R<8?0:c.R<15?1:2;nd++;
  for(let k=0;k<P.length/3;k++){const x=c.x+P[k*3],z=c.z+P[k*3+2],y=d.mesh.position.y+P[k*3+1],m=meshH(x,z);if(!m||m.size>128)continue;   // só onde a malha está no LOD0 (4 m): onde o jogador de fato vê
    const gap=y-m.h;checked++;rows[cls].push(gap);if(gap<-.05)buried++;if(gap>c.R*.03+c.R*.004+.5+.3+c.R*.035)floating++;}}
const q=a=>{a=a.slice().sort((x,y)=>x-y);return a.length?`mín ${a[0].toFixed(2)} · mediana ${a[a.length>>1].toFixed(2)} · máx ${a[a.length-1].toFixed(2)} m`:'—';};
console.log(`   ${nd} crateras visíveis; ${checked} vértices comparados com a malha LOD0`);
console.log('   pequenas:',q(rows[0]),'\n   médias  :',q(rows[1]),'\n   grandes :',q(rows[2]));
ok(nd>=8,'crateras existem no mundo ('+nd+')');ok(checked>200,'vértices suficientes comparados ('+checked+')');
ok(buried/checked<.02,'enterradas: '+(100*buried/checked).toFixed(2)+'% dos vértices abaixo da malha');ok(floating/checked<.02,'flutuando: '+(100*floating/checked).toFixed(2)+'% dos vértices acima do esperado');

console.log('7) crateras por célula/chunk: sem duplicar, descarregam longe, sem vazamento');
{const cells0=M.craterCells.size;let total=0;for(const a of M.craterCells.values())total+=a.length;
 const vis=()=>M.decals.filter(d=>d.crater).length;ok(cells0>0&&total>=nd,'impactos guardados por célula de 256 m ('+total+' crateras em '+cells0+' células)');
 const P=g.player,sp0=P.s;M.reset();M.nextSpawn=1e9;const cx=P.x+Math.sin(P.psi)*40,cz=P.z-Math.cos(P.psi)*40;M._addCrater(cx,cz,10);M._addCrater(cx+30,cz,6);M.update(.016,{spawn:false});M.update(.016,{spawn:false});
 ok(vis()===2,'2 crateras novas → 2 decals');
 // afasta o jogador para além de LOAD_R (1200) e DROP_R (3500) e volta várias vezes
 const old={x:P.x,z:P.z};const move=(dx)=>{P.x=old.x+dx;M.cellTick=0;for(let i=0;i<4;i++)M.update(.016,{spawn:false});};
 for(let rep=0;rep<3;rep++){move(2000);const away=vis();move(0);const back=vis();ok(away===0&&back===2,`ida e volta #${rep+1}: longe 0 decals / de volta ${back} (sem duplicar)`);}
 move(5000);ok(M.craterCells.size===0&&vis()===0,'a >3,5 km: dados da célula descartados (chunk descarregado)');move(0);ok(vis()===0,'e não reaparecem quando o jogador volta (dados já liberados)');
}
console.log('8) vazamento / limites de pool em 3 min de caos máximo');
g.restart();M.difficulty=()=>1;const snaps=[];
for(let i=0;i<180*60;i++){g.invuln=9;g.lives=3;step();if(g.player.s>9000)g.player.respawn(g.player.s-8000);if(i%(30*60)===0)snaps.push({sc:g.scene.children.size,m:M.meteors.length,k:M.markers.length,d:M.decals.length,cells:M.craterCells.size});}
console.log('   (cena / meteoros / marcadores / decals / células):',snaps.map(s=>[s.sc,s.m,s.k,s.d,s.cells].join('/')).join('  '));
const last=snaps[snaps.length-1];ok(M.meteors.length<=140&&M.markers.length<=140&&M.decals.length<=300,'pools dentro dos limites (meteoros '+M.meteors.length+'/140, marcadores '+M.markers.length+'/140, decals '+M.decals.length+'/300)');
ok(snaps[snaps.length-1].sc-snaps[2].sc<=60,'objetos na cena estáveis (sem crescimento contínuo): '+snaps[2].sc+' → '+last.sc);
ok(M.fire.alive<=2400&&M.smoke.alive<=4800,'partículas dentro dos buffers fixos (fogo '+M.fire.alive+'/2400, fumaça '+M.smoke.alive+'/4800)');
g.state='paused';{const t0=performance.now();for(let i=0;i<5*60;i++)M.update(dt);}g.state='running';   // (só garante que continua rodando sem erro)
console.log('9) desempenho do sistema de meteoros no caos máximo');
{for(let i=0;i<10*60;i++){g.invuln=9;g.lives=3;if(g.state==='running')drive();g.player.update(dt,g.input);g.world.update(g.player.x,g.player.z,g.player.s,5);M.update(dt);}   // aquecimento (JIT)
 const ts=[];for(let i=0;i<20*60;i++){g.invuln=9;g.lives=3;if(g.state==='running')drive();g.player.update(dt,g.input);g.world.update(g.player.x,g.player.z,g.player.s,5);const a=performance.now();M.update(dt);ts.push(performance.now()-a);}
 ts.sort((a,b)=>a-b);console.log(`   M.update: média ${(ts.reduce((a,b)=>a+b,0)/ts.length).toFixed(2)} ms · p99 ${ts[ts.length*.99|0].toFixed(2)} ms · máx ${ts[ts.length-1].toFixed(2)} ms · meteoros ativos ${M.stats.alive} · decals ${M.stats.decals}`);
 ok(ts[ts.length*.99|0]<4,'p99 < 4 ms por frame');}
console.log('10) avisos de impacto fora da tela (HUD)');
{g.restart();g.update(dt);const P=g.player,cam=g.camera,W=1280,H=720,fx=Math.sin(P.psi),fz=-Math.cos(P.psi),rx=Math.cos(P.psi),rz=Math.sin(P.psi),y=P.y;const shown=()=>g.ui.wr.filter(e=>e.style.display==='block');
 const W1=(a,l)=>({x:P.x+fx*a+rx*l,y,z:P.z+fz*a+rz*l,left:3,T:4,R:10});
 g.ui.warnings([W1(120,0)],cam,W,H,P.x,P.z);ok(shown().length===0,'impacto à frente (visível na tela) → sem indicador (usa o marcador 3D)');
 g.ui.warnings([W1(-90,0)],cam,W,H,P.x,P.z);let e=shown()[0];ok(shown().length===1&&parseFloat(e.style.top)>H*.7&&Math.abs(parseFloat(e.style.left)-W/2)<W*.2,'impacto atrás → indicador na borda inferior (left '+parseFloat(e.style.left).toFixed(0)+', top '+parseFloat(e.style.top).toFixed(0)+')');
 g.ui.warnings([W1(10,90)],cam,W,H,P.x,P.z);e=shown()[0];ok(shown().length===1&&parseFloat(e.style.left)>W*.8,'impacto à direita → indicador na borda direita ('+parseFloat(e.style.left).toFixed(0)+')');
 g.ui.warnings([W1(10,-90)],cam,W,H,P.x,P.z);e=shown()[0];ok(shown().length===1&&parseFloat(e.style.left)<W*.2,'impacto à esquerda → indicador na borda esquerda ('+parseFloat(e.style.left).toFixed(0)+')');
 g.ui.warnings([W1(-90,0),W1(10,90),W1(10,-90)],cam,W,H,P.x,P.z);ok(shown().length===3,'vários avisos simultâneos');
 g.ui.warnings([W1(-900,0)],cam,W,H,P.x,P.z);ok(shown().length===0,'impactos muito distantes (>420 m) são ignorados');
 g.ui.warnings([],cam,W,H,P.x,P.z);ok(shown().length===0,'sem avisos → indicadores ocultos');}
console.log('\nFIM · exitCode',process.exitCode||0);
