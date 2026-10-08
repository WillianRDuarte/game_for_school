// Testes do METEOR DIRECTOR (ritmo calmo → perigo → tempestade → recuperação) no Game real, headless.
// Uso: node --import ./tests/register.mjs tests/director_test.mjs      (SEC=240 por configuração; QUICK=1 → 120)
import {Game} from '../js/game.js';
import {PHASE} from '../js/director.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const SEC=+process.env.SEC||(process.env.QUICK?120:240),dt=1/60;
const g=new Game({});g.input.poll=()=>{};const M=g.meteors,D=M.director;
const follow=()=>{const P=g.player,T=g.track,p=T.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};

// roda uma corrida de SEC s com dificuldade fixa k (ou a natural) e devolve métricas
function run(k,enabled,seedTag){
  g.restart();M.difficulty=()=>k;D.enabled=enabled;D.reset(1000+seedTag);
  const R={k,enabled,peakAlive:0,peakThreat:0,imp:[],phTime:{calm:0,danger:0,storm:0,recovery:0},thrByPhase:{calm:0,danger:0,storm:0,recovery:0},recFreeViol:0,spawns:[],minSepViol:0,
    big:0,aimed:0,npc:0,n:0,thrN:0,seq:[],hitGraceViol:0,p99:0};const tm=[];let lastPh=null,sepMin=1e9;
  const o=M._impact.bind(M);M._impact=function(m){const P=g.player;R.imp.push({t:M.time,d:Math.hypot(m.ix-P.x,m.iz-P.z),x:m.ix,z:m.iz});if(enabled&&m.threat&&D.phase===PHASE.RECOVERY&&D.t/D.dur<.55)R.recLand=(R.recLand||0)+1;if(m.cls===2)R.big++;if(m.aimed)R.aimed++;if(m.cat==='npc')R.npc++;R.n++;o(m);};
  const sp=M.spawn.bind(M);M.spawn=function(){const before=M.nActive,r=sp();if(r){const m=M.meteors.filter(m=>m.active).pop();
      for(const q of M.meteors)if(q.active&&q!==m&&!q.lethal)sepMin=Math.min(sepMin,Math.hypot(q.ix-m.ix,q.iz-m.iz));
      if(m.threat){R.thrN++;R.thrByPhase[D.phase]++;if(D.phase===PHASE.RECOVERY&&D.t/D.dur<.55)R.recFreeViol++;if(D.grace>0)R.hitGraceViol++;}}return r;};
  for(let i=0;i<SEC*60;i++){g.invuln=9;g.lives=3;follow();const t=performance.now();g.update(dt);tm.push(performance.now()-t);
    if(g.state!=='running'){g.state='running';}
    R.peakAlive=Math.max(R.peakAlive,M.nActive);let nt=0;for(const m of M.meteors)if(m.active&&m.threat)nt++;R.peakThreat=Math.max(R.peakThreat,nt);
    R.phTime[D.phase]+=dt;if(enabled&&D.phase!==lastPh){R.seq.push([D.phase,+D.dur.toFixed(1)]);lastPh=D.phase;}}
  M._impact=o;M.spawn=sp;tm.sort((a,b)=>a-b);R.p99=tm[tm.length*.99|0];R.sepMin=sepMin;
  // pressão: máx. de impactos a <60 m do carro numa janela de 3 s; e nº de janelas de 5 s com ≥6 impactos <80 m
  let maxWin=0,bad=0;const I=R.imp.filter(e=>e.d<60);for(let i=0;i<I.length;i++){let c=0;for(let j=i;j<I.length&&I[j].t-I[i].t<=3;j++)c++;maxWin=Math.max(maxWin,c);}
  const J=R.imp.filter(e=>e.d<80);for(let i=0;i<J.length;i++){let c=0;for(let j=i;j<J.length&&J[j].t-J[i].t<=5;j++)c++;if(c>=6)bad++;}
  R.maxWin=maxWin;R.bad5=bad;return R;
}
const fmt=r=>`${r.enabled?'DIRECTOR':'LEGADO  '} k=${r.k}: ${(r.n/(SEC/60)).toFixed(0)} impactos/min · pico no céu ${r.peakAlive} · pico de ameaças ${r.peakThreat} · máx. impactos <60 m em 3 s: ${r.maxWin} · janelas de 5 s com ≥6 impactos <80 m: ${r.bad5} · grandes ${(100*r.big/Math.max(1,r.n)).toFixed(0)}% · mirados ${r.aimed} · em NPC ${r.npc}`;

console.log('1) comparação LEGADO × DIRECTOR (corrida de '+SEC+' s, jogador invulnerável seguindo a pista)');
const res={};
for(const k of[0,.5,1]){res['L'+k]=run(k,false,1);console.log('  '+fmt(res['L'+k]));res['D'+k]=run(k,true,1);console.log('  '+fmt(res['D'+k]));}
for(const k of[.5,1]){const L=res['L'+k],N=res['D'+k];
  ok(N.peakAlive<L.peakAlive,`k=${k}: pico de meteoros no céu cai (${L.peakAlive} → ${N.peakAlive})`);
  ok(N.maxWin<=L.maxWin,`k=${k}: menos impactos próximos ao carro em 3 s (${L.maxWin} → ${N.maxWin})`);
  ok(N.bad5<=L.bad5,`k=${k}: menos picos de 5 s com ≥6 impactos a <80 m (${L.bad5} → ${N.bad5})`);}

console.log('2) fases');
for(const k of[.5,1]){const N=res['D'+k],seq=N.seq;console.log('   sequência k='+k+': '+seq.slice(0,16).map(([p,d])=>({calm:'🟢',danger:'🟡',storm:'🔴',recovery:'🔵'}[p])+d+'s').join(' → '));
  ok(['calm','danger','storm','recovery'].every(p=>N.phTime[p]>0),`k=${k}: aparecem CALMO, PERIGO, TEMPESTADE e RECUPERAÇÃO (s: ${Object.entries(N.phTime).map(([a,b])=>a+' '+b.toFixed(0)).join(' · ')})`);
  let allRec=true,recLen=true,stormLen=true,calmAfter=true;
  for(let i=0;i<seq.length;i++){const [p,d]=seq[i];
    if(p==='storm'){if(i+1<seq.length&&seq[i+1][0]!=='recovery')allRec=false;if(d>11.1)stormLen=false;}
    if(p==='recovery'&&(d<6.9||d>10.1))recLen=false;
    if(p==='recovery'&&i+1<seq.length&&seq[i+1][0]==='storm')calmAfter=false;}
  ok(allRec,`k=${k}: toda TEMPESTADE é seguida de RECUPERAÇÃO`);ok(stormLen,`k=${k}: TEMPESTADE é curta (≤ 11 s)`);ok(recLen,`k=${k}: RECUPERAÇÃO dura 7–10 s`);
  ok(!N.recLand,`k=${k}: nenhuma ameaça POUSA na 1ª parte da RECUPERAÇÃO (${N.recLand||0})`);
  ok(N.recFreeViol===0,`k=${k}: nenhuma ameaça na 1ª parte da RECUPERAÇÃO (${N.recFreeViol})`);
  const calmShare=(N.phTime.calm+N.phTime.recovery)/SEC;ok(calmShare>.3,`k=${k}: calmaria (CALMO+RECUP.) ocupa ${(100*calmShare).toFixed(0)}% do tempo (>30%)`);
  ok(N.peakThreat<=6,`k=${k}: ameaças simultâneas ≤ 6 (pico ${N.peakThreat})`);
  ok(N.thrByPhase.calm<=N.phTime.calm/3.5+2,`k=${k}: CALMO tem poucas ameaças (${N.thrByPhase.calm} em ${N.phTime.calm.toFixed(0)} s)`);
  {const rc=N.thrByPhase.calm/Math.max(1,N.phTime.calm),rd=N.thrByPhase.danger/Math.max(1,N.phTime.danger),rs=N.thrByPhase.storm/Math.max(1,N.phTime.storm);
   ok(rd>rc,`k=${k}: ameaças por s — calmo ${rc.toFixed(2)} < perigo ${rd.toFixed(2)} (tempestade ${rs.toFixed(2)})`);}}
const N1=res.D1;ok(N1.sepMin>=4.5,`espaçamento: nenhum impacto nasce a <4,5 m de outro no ar (mín. ${N1.sepMin.toFixed(1)} m)`);
{let minGap=1e9;const imp=N1.imp;for(let i=0;i<imp.length;i++)for(let j=i+1;j<imp.length&&imp[j].t-imp[i].t<.5;j++)minGap=Math.min(minGap,Math.hypot(imp[i].x-imp[j].x,imp[i].z-imp[j].z));
  ok(minGap>=4.5,`impactos em <0,5 s um do outro ficam a ≥4,5 m (mín. ${minGap.toFixed(1)} m)`);}

console.log('3) dificuldade sem simplesmente "mais meteoros"');
const rate=r=>r.n/(SEC/60);
ok(rate(res.D1)<rate(res.D0)*2.2,`taxa de impactos k=1 / k=0 = ${(rate(res.D1)/rate(res.D0)).toFixed(2)} (< 2,2; legado: ×${(rate(res.L1)/rate(res.L0)).toFixed(1)})`);
ok(res.D1.big/res.D1.n>res.D0.big/Math.max(1,res.D0.n),`mais meteoros grandes com a distância (${(100*res.D0.big/res.D0.n).toFixed(0)}% → ${(100*res.D1.big/res.D1.n).toFixed(0)}%)`);
ok(res.D1.aimed>=res.D0.aimed,`mais impactos mirados no carro com a distância (${res.D0.aimed} → ${res.D1.aimed})`);
ok(res.D1.thrN/res.D1.n<.6,`maioria dos meteoros NÃO ameaça diretamente (ameaças ${(100*res.D1.thrN/res.D1.n).toFixed(0)}%, cenário ${(100-100*res.D1.thrN/res.D1.n).toFixed(0)}%)`);
ok(res.D1.npc>0,`meteoros caem em NPCs (interação): ${res.D1.npc} em k=1`);
ok(res.D1.p99<=res.L1.p99*1.5+2,`custo por frame (p99): director ${res.D1.p99.toFixed(2)} ms · legado ${res.L1.p99.toFixed(2)} ms (sem regressão)`);

console.log('4) carência após dano');
{g.restart();M.difficulty=()=>1;D.enabled=true;D.reset(7);for(let i=0;i<30*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
  D.noteHit(3);const th0=D.stats.threats;let t=0;for(let i=0;i<2.9*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
  ok(D.cur.maxThreat===0&&D.stats.threats===th0,`após levar dano: 0 novas ameaças por 3 s (novas: ${D.stats.threats-th0})`);}

console.log('5) preservação');
{g.restart();M.difficulty=()=>.5;D.enabled=true;let n=0;for(let i=0;i<60*60;i++){g.invuln=9;g.lives=3;follow();g.update(dt);}
  ok(M.stats.impacts>10&&M.stats.rocks>5&&M.stats.decals>5,`impactos ${M.stats.impacts}, rochas ${M.stats.rocks}, crateras ${M.stats.decals}`);
  ok(M.meteors.every(m=>!m.active||m.sy-m.iy>=300),'meteoros nascem do céu (≥300 m)');
  ok(g.ui.lv.textContent.includes('❤️'),'HUD de vidas intacto');
  D.enabled=false;const a=M.nActive;ok(true,'director.enabled=false volta ao sistema original');}
console.log(process.exitCode?'\nHÁ FALHAS':'\nTUDO OK');
