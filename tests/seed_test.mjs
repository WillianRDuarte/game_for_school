// Seed por partida: cada restart() gera estrada/terreno/cenário/tráfego/perks/meteoros novos, com largada segura e continuidade.
// Uso: node --import ./tests/register.mjs tests/seed_test.mjs   (GAMES=n muda o nº de partidas; padrão 12)
globalThis.__LEGACY_MAP=false;   // seeds reais por partida
import {Game} from '../js/game.js';
import {STEP} from '../js/road.js';
import {ground} from '../js/terrain.js';
import {fallbackSceneryLibrary} from '../js/scenery_models.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const g=new Game({}),dt=1/60,P=g.player;g.input.poll=()=>{};g.scenery.setLibrary(fallbackSceneryLibrary());
const errs=[];const ce=console.error;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};
const N=+process.env.GAMES||12,games=[];
const sig=()=>{   // "impressão digital" do mapa: pista, terreno e posição de objetos
  const T=g.track,S=i=>T.get(i),pts=[],ter=[],o={};
  for(const i of[100,200,300,400,600,800,1000])pts.push(S(i).x.toFixed(0)+','+S(i).z.toFixed(0)+','+S(i).y.toFixed(0));
  for(const[dx,dz]of[[150,-300],[-200,-600],[300,-900]]){ground(T,dx,dz,o,0);ter.push(o.h.toFixed(0));}
  return{pts:pts.join('|'),ter:ter.join(',')};};
function play(sec){let minLives=3;for(let i=0;i<sec*60&&g.state==='running';i++){
  // autopiloto: segue a pista e acelera
  const p=g.track.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z)),err=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));
  g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,err*3));g.update(dt);}}
const seedsSeen=new Set(),sigs=new Set(),terrs=new Set();let startOK=0,contOK=true,safeCurv=true,minFront=1e9,noErr=true,scenN=[],trafN=[],perkN=[],themes=new Set(),maxHead=0,maxGrade=0;
for(let n=0;n<N;n++){
  if(n>0){g.state='over';g.restart();}
  seedsSeen.add(g.seed);const sg=sig();sigs.add(sg.pts);terrs.add(sg.ter);
  const T=g.track;T.get(300);   // inspeção da largada (primeiros ~880 m)
  let mc=0,mg=0;for(let i=0;i<220;i++){const s=T.get(i);mc=Math.max(mc,Math.abs(s.curv));mg=Math.max(mg,Math.abs(s.slope));}
  safeCurv=safeCurv&&mc<1/190+1e-9&&T.get(10).curv===0&&T.get(60).curv===0;maxGrade=Math.max(maxGrade,mg);   // sem raio < 220 m; reta inicial ≥ 250 m
  themes.add(T.get(0).th);
  // continuidade: rumo, posição e altitude sem saltos entre amostras consecutivas
  for(let i=1;i<600;i++){const a=T.get(i-1),b=T.get(i);if(Math.hypot(b.x-a.x,b.z-a.z)>STEP*1.01||Math.abs(b.h-a.h)>.05||Math.abs(b.y-a.y)>STEP*.3)contOK=false;}
  const px0=P.x,pz0=P.z;startOK+=(Math.abs(px0)<1&&Math.abs(pz0+40)<12&&g.state==='running'&&g.lives===3)?1:0;
  play(25);
  // nada "colado" na frente do jogador logo na largada: rochas/NPCs/perks a < 60 m do ponto de partida
  minFront=Math.min(minFront,...g.traffic.pool.filter(c=>c.active).map(c=>Math.hypot(c.x-px0,c.z-pz0)).concat([1e9]));
  scenN.push(g.scenery.stats.bld+g.scenery.stats.trees);trafN.push(g.traffic.stats.spawned);perkN.push(g.perks.stats.spawned);
  if(g.state!=='running'&&n<3)console.log('   (partida',n,'terminou durante o teste:',g.ui.overCause||'',')');
}
console.log(`${N} partidas seguidas`);
ok(seedsSeen.size===N,`seeds todas diferentes (${seedsSeen.size}/${N}), nenhuma repetida em partidas consecutivas`);
ok(sigs.size===N,`traçado da pista diferente em todas as partidas (${sigs.size}/${N})`);
ok(terrs.size>=N-1,`terreno diferente nas mesmas coordenadas (${terrs.size}/${N})`);
ok(themes.size>=2,`região inicial varia (${[...themes].join(',')})`);
ok(startOK===N,`ponto inicial do jogador intacto e vivo em ${startOK}/${N} partidas`);
ok(safeCurv,`largada: reta inicial e nenhuma curva mais fechada que R=190 m nos primeiros 880 m (greide máx. ${maxGrade.toFixed(3)})`);
ok(contOK,'continuidade da estrada (posição/rumo/altitude sem saltos)');
ok(minFront>=50,`nenhum NPC nasce a < 50 m do ponto de largada (mín. ${minFront>1e8?'—':minFront.toFixed(0)} m)`);
ok(new Set(scenN).size>=N/2&&new Set(trafN).size>=2,`cenário/tráfego variam: prédios+árvores ${scenN.join(',')} · NPCs ${trafN.join(',')} · perks ${perkN.join(',')}`);
ok(errs.length===0,'sem erros no console');
// seeds de sistemas realmente mudam entre partidas
const a={tr:g.traffic.seed,pk:g.perks.seed,sc:g.scenery.seed},s0=g.seed;g.state='over';g.restart();
ok(g.traffic.seed!==a.tr&&g.perks.seed!==a.pk&&g.scenery.seed!==a.sc&&g.seed!==s0,'tráfego, perks e cenário recebem sub-seeds novas no restart');
// chunks: geração incremental (pista só existe até onde foi pedida)
ok(g.track.count<2500,`pista gerada por chunks, não inteira (${g.track.count} amostras após reinício)`);
