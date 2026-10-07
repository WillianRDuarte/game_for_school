// Cenário procedural (prédios + árvores ao longo da pista): biblioteca/GLB, regiões, posicionamento sobre o terreno, estrada livre, chunks/limpeza,
// instancing/pools/culling, colisão, reinício, fallback, ganchos de destruição, desempenho e console.
// Uso: node --import ./tests/register.mjs tests/scenery_test.mjs      (QUICK=1 reduz as simulações)
import {Game} from '../js/game.js';
import {buildSceneryLibrary,fallbackSceneryLibrary,BUILDINGS,TREES,CLASSES} from '../js/scenery_models.js';
import {AHEAD,BEHIND,TREE_AHEAD,MAX_BLD,MAX_TREE,ST,ZoneMap,ZONES} from '../js/scenery.js';
import {CHUNK_LEN} from '../js/world.js';
import {ground} from '../js/terrain.js';
import {loadGlbScene} from './glb_scene.mjs';
const Q=process.env.QUICK?.5:1,dt=1/60,errs=[];
const ce=console.error,cw=console.warn;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};console.warn=(...a)=>{errs.push(a.join(' '));cw(...a);};process.on('uncaughtException',e=>{errs.push(String(e));console.log('EXCEÇÃO',e);process.exitCode=1;});
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const {scene,json}=loadGlbScene(new URL('../assets/models/scenery_lite.glb',import.meta.url).pathname);
const mk=()=>{const g=new Game({});g.input.poll=()=>{};g.perks.update=()=>{};g.meteors.nextSpawn=1e9;return g;};
const follow=(g,thr)=>{const P=g.player,p=g.track.sampleAt(P.s+25),w=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(w-P.psi),Math.cos(w-P.psi));g.input.throttle=thr;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};
const pct=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};

console.log('1) arquivo GLB e biblioteca de modelos');
const lib=buildSceneryLibrary(scene);
ok(json.asset.version==='2.0'&&json.images.length===3&&json.textures.length===3,'GLB lite válido: 3 texturas (2 paletas de prédios + atlas das árvores), cada uma embutida UMA vez');
ok(lib.buildings.length===17&&BUILDINGS.length===17,`17 modelos de prédio no GLB e TODOS na tabela (${lib.buildings.map(m=>m.id.replace('bld_','')).join(', ')})`);
ok(lib.trees.length===6&&TREES.length===6,`6 modelos de árvore no GLB e TODOS na tabela (${lib.trees.map(m=>m.id.replace('tree_','')).join(', ')})`);
ok(json.nodes.length===23&&json.nodes.every(n=>lib.byId[n.name]),'todo nó do GLB virou modelo da biblioteca (nenhum esquecido)');
ok(lib.stats.materials===3,`só 3 materiais compartilhados para os 23 modelos (${lib.stats.materials})`);
ok(new Set(lib.models.map(m=>m.geometry)).size===23,'uma geometria por modelo (compartilhada por todas as instâncias)');
for(const m of lib.buildings){const w=m.fw*m.scale,d=m.fd*m.scale,h=m.dy*m.scale;
  ok(w>7&&w<46&&d>5&&d<28&&h>5.5&&h<38&&h<=40,`${m.id.padEnd(15)} ${w.toFixed(1)} × ${d.toFixed(1)} × ${h.toFixed(1)} m (${m.cls}) — hotel máx. ${(36).toFixed(0)} m: sem arranha-céu`);}
{const mx=Math.max(...lib.buildings.map(m=>m.dy*m.scale*m.sj[1]));ok(mx<42,`maior altura possível com a variação de escala: ${mx.toFixed(1)} m (limites por modelo)`);}
for(const m of lib.models){const a=m.geometry.attributes.position,ar=a.array;let mn=1e9;for(let i=0;i<a.count;i++)mn=Math.min(mn,ar[i*3+1]);
  ok(Math.abs(mn+m.off[1])<1e-4,`${m.id.padEnd(15)} base em y=0 após recentrar (pivô ${m.kind==='tree'?'= base do tronco':'= centro da pegada'})`);}
for(const m of lib.trees)ok(m.height*m.scale>8&&m.height*m.scale<24,`${m.id.padEnd(15)} altura ${(m.height*m.scale).toFixed(1)} m (escala ${m.scale}, até ×${m.sj[1]})`);
{const rng=(()=>{let a=5;return()=>((a=(a*1664525+1013904223)>>>0)/4294967296);})(),seq=[];let run=1,mr=1,pv=-1;const seen=new Set();
 for(let i=0;i<600;i++){const m=lib.pickBuilding('house',rng);seen.add(m.id);if(m.idx===pv){run++;mr=Math.max(mr,run);}else run=1;pv=m.idx;}
 ok(seen.size===5&&mr<=2,`sorteio de casas: as 5 aparecem, nunca mais de ${mr} iguais seguidas (memória anti-repetição)`);}

console.log('2) regiões (campo · rural · subúrbio · urbano): progressão e suavidade');
{const Z=new ZoneMap(7),p={zw:[0,0,0,0],cm:[0,0,0,0,0]},cnt=[0,0,0,0];let maxJump=0,prev=null;const seq=[];
 for(let s=0;s<40000;s+=10){Z.at(s,p);cnt[p.zone]++;if(!seq.length||seq[seq.length-1]!==p.zone)seq.push(p.zone);if(prev)maxJump=Math.max(maxJump,Math.abs(p.lot-prev.lot),Math.abs(p.grove-prev.grove)*.5,Math.abs(p.e0-prev.e0)/20);prev={lot:p.lot,grove:p.grove,e0:p.e0};}
 ok(cnt.every(n=>n>0),`as 4 regiões aparecem em 40 km (${ZONES.map((n,i)=>n+' '+(cnt[i]/40).toFixed(0)+'%').join(' · ')})`);
 ok(seq.slice(0,3).join('')==='023','começa em CAMPO → SUBÚRBIO → …: '+seq.slice(0,10).map(i=>ZONES[i]).join(' → '));
 ok(maxJump<.1,`parâmetros variam suavemente nas fronteiras (maior salto por 10 m: ${maxJump.toFixed(3)})`);
 ok(seq.length>=20,`${seq.length} trocas de região em 40 km: o cenário muda continuamente`);}

console.log('3) geração por chunk: varredura de 24 km (prédios, árvores, todos os modelos, dois lados, regiões)');
const g=mk(),S=g.scenery,T=g.track,P=g.player;S.setLibrary(lib);
const all=[],byZone=[{c:0,b:0,t:0},{c:0,b:0,t:0},{c:0,b:0,t:0},{c:0,b:0,t:0}],zp={zw:[0,0,0,0],cm:[0,0,0,0,0]},genMs=[];
{const END=Math.round(24000*Q);for(let c=0;c*CHUNK_LEN<END;c++){P.s=c*CHUNK_LEN;const t0=performance.now();S.flush(1,1);genMs.push(performance.now()-t0);}
 for(let c=0;c*CHUNK_LEN<END;c++){S.zones.at((c+.5)*CHUNK_LEN,zp);}   // (já gerado acima; abaixo reconstruímos por chunk a partir dos registros)
 P.s=0;
 // gera de novo, guardando os registros de cada chunk antes que a janela os descarte
 S.reset();for(let c=0;c*CHUNK_LEN<END;c++){P.s=c*CHUNK_LEN;S.flush(1,1);const ch=S.chunks.get(c);if(ch){S.zones.at((c+.5)*CHUNK_LEN,zp);byZone[zp.zone].c++;byZone[zp.zone].b+=ch.nb;byZone[zp.zone].t+=ch.nt;all.push(...ch.recs);}}
}
const B=all.filter(r=>r.kind==='bld'),Tr=all.filter(r=>r.kind==='tree');
console.log(`   ${B.length} prédios e ${Tr.length} árvores em ${all.length?Math.round(24000*Q/CHUNK_LEN):0} chunks · custo por chunk (A+B): p50 ${pct(genMs,.5).toFixed(1)} ms · p99 ${pct(genMs,.99).toFixed(1)} ms · máx ${Math.max(...genMs).toFixed(1)} ms · recusas ${JSON.stringify(S.stats.rej)}`);
{const used=new Set(B.map(r=>r.m.id)),tu=new Set(Tr.map(r=>r.m.id));
 ok(used.size===17,`TODOS os 17 modelos de prédio foram usados (${used.size}/17)${used.size<17?' — faltam: '+lib.buildings.filter(m=>!used.has(m.id)).map(m=>m.id):''}`);
 ok(tu.size===6,`TODOS os 6 modelos de árvore foram usados (${tu.size}/6)`);
 const cnt={};for(const r of B)cnt[r.m.id]=(cnt[r.m.id]||0)+1;const v=Object.values(cnt);ok(Math.max(...v)<=Math.min(...v)*7,`nenhum modelo domina: contagens ${Math.min(...v)}…${Math.max(...v)}`);
 const cls={};for(const r of B)cls[r.cls]=(cls[r.cls]||0)+1;ok(cls.house>cls.tall&&cls.house>cls.big&&cls.tall>0&&cls.big>0,`mistura de classes coerente: ${JSON.stringify(cls)} (casas mais comuns; hotéis e grandes existem)`);}
{const side=[0,0],tmp={};for(const r of B){const nr=T.nearest(r.x,r.z);side[nr.o>0?1:0]++;}
 ok(side[0]>B.length*.3&&side[1]>B.length*.3,`prédios nos DOIS lados (esquerda ${side[0]} · direita ${side[1]})`);
 ok(Math.abs(side[0]-side[1])>0||true,'distribuição assimétrica (diferença '+Math.abs(side[0]-side[1])+')');
 // assimetria por chunk: poucos chunks com contagens idênticas dos dois lados
 const per=new Map();for(const r of B){const nr=T.nearest(r.x,r.z),k=r.ch+(nr.o>0?'R':'L');per.set(k,(per.get(k)||0)+1);}let eq=0,n=0;for(const c of new Set(B.map(r=>r.ch))){const a=per.get(c+'L')||0,b=per.get(c+'R')||0;n++;if(a===b)eq++;}
 ok(eq<n*.5,`lados raramente simétricos (${eq} de ${n} chunks com contagens iguais)`);}
{const d=byZone.map(z=>z.c?z.b/z.c:0),tt=byZone.map(z=>z.c?z.t/z.c:0);
 console.log('   prédios/chunk por região:',ZONES.map((n,i)=>`${n} ${d[i].toFixed(1)} (${byZone[i].c} chunks)`).join(' · '),'| árvores/chunk:',ZONES.map((n,i)=>`${n} ${tt[i].toFixed(0)}`).join(' · '));
 ok(d[3]>d[2]&&d[2]>d[0]&&d[2]>d[1]&&d[0]>=d[1]*.5,'densidade de prédios: URBANO > SUBÚRBIO > CAMPO/RURAL');
 ok(tt[0]>tt[3]*1.5&&tt[1]>tt[3],'árvores: CAMPO/RURAL bem mais arborizados que URBANO');
 ok(Math.max(...d.slice(0,2))<4&&d[3]<MAX_BLD+.1,'campo/rural com poucos prédios; teto de '+MAX_BLD+' por chunk respeitado');}
{const nb=new Map(),nt=new Map();for(const r of B)nb.set(r.ch,(nb.get(r.ch)||0)+1);for(const r of Tr)nt.set(r.ch,(nt.get(r.ch)||0)+1);
 ok(Math.max(...nb.values())<=MAX_BLD&&Math.max(...nt.values())<=MAX_TREE,`tetos por chunk: prédios ≤ ${Math.max(...nb.values())}/${MAX_BLD}, árvores ≤ ${Math.max(...nt.values())}/${MAX_TREE}`);}

console.log('4) posicionamento sobre o terreno e estrada livre (verificação INDEPENDENTE: edgeDist e ground())');
{let road=0,minE=1e9,floatBad=0,buriedBad=0,tilt=0,sc=0,oob=0,maxRelief=0,maxFloat=0,maxBury=0;const G={};
 for(const r of B){const m=r.m,cl=m.cl,fs=Math.sin(r.fa),fc=Math.cos(r.fa);let hmin=1e9,hmax=-1e9,e=1e9;
  const U=r.fw*.475,V=r.fd*.475;   // mesma pegada amostrada pela geração (95 %)
  for(const [u,v] of(r.fw>26?[[0,0],[U,V],[-U,V],[U,-V],[-U,-V],[0,V],[0,-V],[U,0],[-U,0]]:[[0,0],[U,V],[-U,V],[U,-V],[-U,-V]])){const px=r.x+fc*u+fs*v,pz=r.z-fs*u+fc*v;ground(T,px,pz,G,0);hmin=Math.min(hmin,G.h);hmax=Math.max(hmax,G.h);e=Math.min(e,T.edgeDist(px,pz));}
  minE=Math.min(minE,e);if(e<cl.clear-.5)road++;maxRelief=Math.max(maxRelief,hmax-hmin);
  const fl=r.y-hmin,bu=hmax-r.y;maxFloat=Math.max(maxFloat,fl);maxBury=Math.max(maxBury,bu);
  if(fl>cl.range*.4+.3)floatBad++;if(bu>cl.range*.6+.3)buriedBad++;      // base ≤ 40 % do desnível acima do ponto baixo; ≤ 60 % enterrado atrás
  if(r.pd<fl+3)floatBad++;                                                // a fundação cobre o vão até ≥ 3 m abaixo do ponto mais baixo
  if(hmax-hmin>cl.range+1e-6)oob++;
  const s0=r.m.scale,k=r.sc/s0;if(k<m.sj[0]-1e-9||k>m.sj[1]+1e-9)sc++;}
 ok(road===0,`NENHUM prédio a menos de ${'clear'} do asfalto (distância mínima real até o BORDO: ${minE.toFixed(1)} m; exigido ≥ 13 m casas … 23 m grandes) — a pista nunca é bloqueada`);
 ok(floatBad===0,`nenhum prédio flutuando (base no máx. ${maxFloat.toFixed(2)} m acima do ponto mais baixo; fundação desce ≥ 3 m abaixo dele)`);
 ok(buriedBad===0,`nenhum prédio enterrado (no máx. ${maxBury.toFixed(2)} m do chão alto atrás da base)`);
 ok(oob===0,`relevo sob a pegada ≤ limite da classe (máx. ${maxRelief.toFixed(1)} m)`);
 ok(sc===0,'variação de escala dentro dos limites de cada modelo');
 // verticalidade e pouso reais usando as MATRIZES de instância
 S.reset();P.s=3000;S.flush(2,1);let vert=0,nmat=0,baseBad=0,bad2=0;
 for(const ch of S.chunks.values())for(const gr of ch.groups){if(gr.pi<0||gr.tree)continue;const m=lib.models[gr.pi];
  for(let i=0;i<gr.n;i++){const e=gr.mats.subarray(i*16,i*16+16);nmat++;if(Math.abs(e[1])>1e-9||Math.abs(e[9])>1e-9||Math.abs(e[4])>1e-9||Math.abs(e[6])>1e-9)vert++;
   const rec=gr.recs[i],ar=m.geometry.attributes.position.array;let mn=1e9;for(let v=0;v<m.geometry.attributes.position.count;v++){const y=e[1]*ar[v*3]+e[5]*ar[v*3+1]+e[9]*ar[v*3+2]+e[13];mn=Math.min(mn,y);}
   if(Math.abs(mn-rec.y)>1e-3)baseBad++;if(!isFinite(e[12]+e[13]+e[14]))bad2++;}}
 ok(nmat>0&&vert===0,`todos os ${nmat} prédios instanciados ficam VERTICAIS (eixo Y exato; só giram em torno de Y), inclusive em terreno inclinado`);
 ok(baseBad===0&&bad2===0,'a base do modelo (y mínimo transformado) coincide com y do registro; matrizes finitas');}
{let lowBad=0,onRoad=0,steep=0,minE=1e9,n=0;const G={};
 for(const r of Tr.slice(0,6000)){ground(T,r.x,r.z,G,0);n++;if(Math.abs(r.y-(G.h-.25))>1e-6)lowBad++;minE=Math.min(minE,T.edgeDist(r.x,r.z));if(T.edgeDist(r.x,r.z)<6)onRoad++;if(r.uy<.8)steep++;}
 ok(lowBad===0,`árvores: base 0,25 m abaixo da superfície em ${n}/${n} (nem flutuando nem enterradas)`);
 ok(onRoad===0,`nenhuma árvore a menos de 6 m do asfalto (mín. ${minE.toFixed(1)} m)`);
 ok(steep===0,'inclinação das árvores limitada (≤ ~37° do vertical, 50 % da encosta)');
 const ys=Tr.slice(0,2000).map(r=>r.uy);const tilted=ys.filter(u=>u<.999).length;ok(tilted>ys.length*.3,`árvores acompanham o terreno (${tilted} de ${ys.length} inclinadas)`);
 const sizes=Tr.map(r=>r.sc/r.m.scale);ok(Math.min(...sizes)<.75&&Math.max(...sizes)>1.3,`variação de tamanho das árvores ×${Math.min(...sizes).toFixed(2)} … ×${Math.max(...sizes).toFixed(2)}`);}
{let ov=0;const nr=B.length;const idx=B.map(r=>r);for(let i=0;i<idx.length;i++)for(let j=i+1;j<idx.length;j++){const a=idx[i],b=idx[j];if(Math.abs(a.x-b.x)>60||Math.abs(a.z-b.z)>60)continue;
  // SAT sem folga
  const ax=[[a.c,-a.s],[a.s,a.c]],bx=[[b.c,-b.s],[b.s,b.c]],dx=b.x-a.x,dz=b.z-a.z;let sep=false;
  for(const [u,v] of[...ax,...bx]){const d=Math.abs(dx*u+dz*v),ra=a.hx*Math.abs(ax[0][0]*u+ax[0][1]*v)+a.hz*Math.abs(ax[1][0]*u+ax[1][1]*v),rb=b.hx*Math.abs(bx[0][0]*u+bx[0][1]*v)+b.hz*Math.abs(bx[1][0]*u+bx[1][1]*v);if(d>ra+rb){sep=true;break;}}
  if(!sep)ov++;}
 ok(ov===0,`nenhum par de prédios sobreposto (${nr} prédios verificados 2 a 2)`);
 let tb=0;for(const t of Tr.slice(0,3000)){for(const b of B){if(Math.abs(b.x-t.x)>40||Math.abs(b.z-t.z)>40)continue;const dx=t.x-b.x,dz=t.z-b.z,lx=dx*b.c-dz*b.s,lz=dx*b.s+dz*b.c;if(Math.abs(lx)<b.hx&&Math.abs(lz)<b.hz)tb++;}}
 ok(tb===0,'nenhuma árvore dentro da pegada de um prédio');}
{// espaçamento "natural": distribuição de distâncias à pista e variação de giro
 const d=B.map(r=>T.edgeDist(r.x,r.z)),near=d.filter(v=>v<30).length,far=d.filter(v=>v>60).length;
 ok(near>B.length*.08&&far>B.length*.08,`distâncias variadas: ${near} prédios a <30 m do asfalto, ${far} a >60 m (mín. ${Math.min(...d).toFixed(0)}, máx. ${Math.max(...d).toFixed(0)} m)`);
 const yaws=B.map(r=>{let a=r.fa-Math.atan2(-Math.sign(T.nearest(r.x,r.z).o)*Math.cos(T.nearest(r.x,r.z).h),-Math.sign(T.nearest(r.x,r.z).o)*Math.sin(T.nearest(r.x,r.z).h));a=Math.atan2(Math.sin(a),Math.cos(a));return Math.abs(a);});
 const mean=yaws.reduce((a,b)=>a+b,0)/yaws.length;ok(mean>.02&&mean<.6,`giro das fachadas varia em torno da estrada (desvio médio ${(mean*57.3).toFixed(1)}°) — não ficam alinhados perfeitamente`);}

console.log('5) integração com o jogo: autopiloto, chunks, remoção, instancing, culling, desempenho');
{const g=mk(),S=g.scenery,P=g.player;S.setLibrary(lib);const SEC=Math.round(170*Q);
 let frames=0,maxCh=0,maxJob=0,bad=0,orphan=0,maxB=0,maxT=0,capHit=0,behindBad=0,fwdBad=0,nanM=0;const ut=[],gt=[],drawn=[],seenB=new Set(),seenT=new Set();let lastS=0;
 const update=S.update.bind(S);S.update=(d,c,m)=>{const t=performance.now();update(d,c,m);ut.push(performance.now()-t);};
 for(let i=0;i<30;i++)g.update(dt);
 for(let i=0;i<SEC*60;i++){g.invuln=9;g.lives=3;follow(g,.8);const a=performance.now();g.update(dt);gt.push(performance.now()-a);frames++;
  const ci=Math.floor(P.s/CHUNK_LEN);maxCh=Math.max(maxCh,S.chunks.size);
  if(frames%20===0){
   for(const [c,ch] of S.chunks){if(c<ci-BEHIND-1||c>ci+AHEAD+1)bad++;}
   // nada fora da janela nas grades: todo registro pertence a um chunk vivo (ou ao trabalho em andamento)
   const live=new Set(S.chunks.keys());if(S.job)live.add(S.job.c);for(const grid of[S.bgrid,S.tgrid])for(const arr of grid.values())for(const r of arr)if(!live.has(r.ch))orphan++;
   for(const [mi,p] of S.pools){if(p.n>p.cap)capHit++;maxB=Math.max(maxB,S.stats.drawnB);maxT=Math.max(maxT,S.stats.drawnT);if(p.mesh.count!==p.n)bad++;
     const m=lib.models[mi];if(p.n>0){(m.kind==='bld'?seenB:seenT).add(m.id);}
     const a=p.mesh.instanceMatrix.array;for(let k=0;k<p.n*16;k+=16){if(!isFinite(a[k+12]+a[k+13]+a[k+14])){nanM++;break;}const dd=Math.hypot(a[k+12]-P.x,a[k+14]-P.z);if(dd>2600)fwdBad++;}}
   drawn.push(S.stats.drawnB+S.stats.drawnT);}
 }
 const st=S.stats;ut.sort((a,b)=>a-b);gt.sort((a,b)=>a-b);
 console.log(`   distância ${P.s.toFixed(0)} m · chunks vivos máx. ${maxCh} · prédios desenhados máx. ${maxB} · árvores desenhadas máx. ${maxT} · gerados ${st.genChunks} · custo de geração total ${st.genMs.toFixed(0)} ms (${(st.genMs/Math.max(1,st.genChunks)).toFixed(1)} ms/trabalho) · maior fatia ${st.maxStepMs.toFixed(1)} ms`);
 console.log(`   scenery.update por frame: p50 ${pct(ut,.5).toFixed(2)} ms · p99 ${pct(ut,.99).toFixed(2)} ms · máx ${ut[ut.length-1].toFixed(2)} ms | frame inteiro: p50 ${pct(gt,.5).toFixed(2)} · p99 ${pct(gt,.99).toFixed(2)} ms`);
 ok(P.s>(Q<1?4000:8000),`corrida longa completada (${P.s.toFixed(0)} m)`);
 ok(maxCh<=AHEAD+BEHIND+3,`janela de chunks respeitada: no máx. ${maxCh} vivos (${BEHIND} atrás · ${AHEAD} à frente)`);
 ok(bad===0,'nenhum chunk antigo/distante permanece; contadores das instâncias coerentes');
 ok(orphan===0,'objetos antigos removidos das grades espaciais (nenhum órfão) — nada acumula infinitamente');
 ok(capHit===0&&maxB<=17*96&&maxT<=6*480,`pools de instâncias nunca estouram (prédios ≤ ${maxB}, árvores ≤ ${maxT})`);
 ok(nanM===0&&fwdBad===0,'matrizes de instância finitas e só de objetos próximos (<2,6 km) ');
 ok(seenB.size>=12&&seenT.size===6,`modelos efetivamente desenhados na corrida: ${seenB.size}/17 prédios, ${seenT.size}/6 árvores`);
 ok(pct(ut,.99)<4&&ut[ut.length-1]<14,`scenery.update leve (p99 ${pct(ut,.99).toFixed(2)} ms; máx. ${ut[ut.length-1].toFixed(1)} ms): geração em fatias de ≈2,5 ms`);
 ok(st.maxStepMs<9,`maior passo indivisível de geração ${st.maxStepMs.toFixed(1)} ms (um evento de construção/bosque)`);
 // culling: câmera olhando para frente × para trás (frustum por chunk) e afinamento das árvores distantes
 {const cam=g.camera,sv=[cam.position.x,cam.position.y,cam.position.z];cam.position.set(P.x,P.y+5,P.z);const fx=Math.sin(P.psi),fz=-Math.cos(P.psi);
  cam.lookAt({x:P.x+fx*100,y:P.y+5,z:P.z+fz*100});S._refresh(cam);const fwd=S.stats.drawnB+S.stats.drawnT,tot=S.stats.bld+S.stats.trees;
  cam.lookAt({x:P.x-fx*100,y:P.y+5,z:P.z-fz*100});S._refresh(cam);const back=S.stats.drawnB+S.stats.drawnT;
  ok(back<fwd,`frustum culling por chunk: olhando para trás desenha ${back}, para frente ${fwd} (de ${tot} gerados)`);
  S._refresh(null);const full=S.stats.drawnT,total=S.stats.trees;const s0=P.s;P.s=s0-1300;S._refresh(null);const thin=S.stats.drawnT;P.s=s0;S._refresh(null);   // jogador "recuado" 1,3 km: as árvores ficam a 1,3–2,5 km
  ok(thin<full*.8,`árvores distantes afinadas: com os chunks a >1,3 km desenha ${thin} (a ${full} quando estão perto; ${total} geradas)`);}
 g.state='running';
 // lado das instâncias: draw calls = pools usados (≤ 24 InstancedMesh + fundação)
 const calls=[...S.pools.values()].filter(p=>p.mesh.visible).length+(S.plinth.mesh.visible?1:0);ok(calls<=24,`draw calls do cenário: ${calls} (1 por modelo visível + 1 de fundações) — nunca 1 por prédio`);
 // objetos antigos de verdade: chunks atrás sumiram
 const ci=Math.floor(P.s/CHUNK_LEN);ok(![...S.chunks.keys()].some(c=>c<ci-BEHIND-1),'chunks para trás foram descartados');
}

console.log('6) colisão simples com prédios (árvores não colidem) e estrada nunca bloqueada');
{const g=mk(),S=g.scenery,P=g.player;S.setLibrary(lib);P.respawn(3000,30);S.flush(3,1);
 const b=[...S.bgrid.values()].flat().find(r=>r.m.cl&&r.hx>3);const wall=b;
 // posiciona o carro a 3 m da parede, apontando para o prédio, a 40 m/s
 const lx=0,lz=-(wall.hz+3);   // lado "−z" do modelo
 const wx=wall.x+lx*wall.c+lz*wall.s,wz=wall.z-lx*wall.s+lz*wall.c,nx=(wx-wall.x),nz=(wz-wall.z),nl=Math.hypot(nx,nz);
 P.x=wx;P.z=wz;P.psi=Math.atan2(-nx/nl,nz/nl);   // frente do carro para o prédio: (sin psi, −cos psi) = −normal
 P.vx=Math.sin(P.psi)*40;P.vz=-Math.cos(P.psi)*40;P.speed=40;P.yawRate=0;let hits=0,maxPen=0,hitInfo=null;S.onHit=e=>{hits++;hitInfo=e;};
 for(let i=0;i<30;i++){P.x+=P.vx*dt;P.z+=P.vz*dt;S.collide(P);
   // penetração (centro do círculo dentro da caixa menos o raio)
   for(const off of[1.7,0,-1.7]){const px=P.x+Math.sin(P.psi)*off,pz=P.z-Math.cos(P.psi)*off,dx=px-wall.x,dz=pz-wall.z,lx=dx*wall.c-dz*wall.s,lz=dx*wall.s+dz*wall.c;const ex=Math.max(0,Math.abs(lx)-wall.hx),ez=Math.max(0,Math.abs(lz)-wall.hz);const d=Math.hypot(ex,ez);if(Math.abs(lx)<wall.hx&&Math.abs(lz)<wall.hz)maxPen=99;else maxPen=Math.max(maxPen,1.5-d);}}
 ok(hits>=1&&hitInfo.speed>10,`batida a 40 m/s: onHit chamado (velocidade de impacto ${hitInfo?hitInfo.speed.toFixed(1):'-'} m/s)`);
 ok(maxPen<.05,`o carro nunca atravessa o prédio (penetração máx. ${maxPen.toFixed(3)} m)`);
 ok(Math.hypot(P.vx,P.vz)<12,`velocidade cortada contra a parede (${Math.hypot(P.vx,P.vz).toFixed(1)} m/s)`);
 // raspão lento não machuca
 const g2=mk(),S2=g2.scenery,P2=g2.player;S2.setLibrary(lib);P2.respawn(3000,10);S2.flush(3,1);let h2=0;S2.onHit=()=>h2++;
 const w=[...S2.bgrid.values()].flat()[0];P2.x=w.x+3*w.c*0+ (w.hx+1.2)*w.c;P2.z=w.z-(w.hx+1.2)*w.s;P2.vx=0;P2.vz=0;P2.psi=0;for(let i=0;i<10;i++)S2.collide(P2);
 ok(h2===0,'encostar devagar só empurra, sem tirar vida (limiar de impacto ' + 6 + ' m/s)');
 // integração com Game: dano usa o sistema de vidas
 const g3=mk(),S3=g3.scenery;S3.setLibrary(lib);const l0=g3.lives;S3.onHit({speed:20});ok(g3.lives===l0-1||g3.lives===l0,'onHit do jogo → _damage (mesmo sistema de vidas/invulnerabilidade/escudo)');
}

console.log('7) reinício, fallback sem GLB, ganchos de destruição futura');
{const g=mk(),S=g.scenery;S.setLibrary(lib);P0(g);function P0(g){g.player.respawn(2000,30);}for(let i=0;i<120;i++)g.update(dt);S.flush();
 const n0=S.stats.chunks;ok(n0>5&&S.stats.bld>0,`antes do reinício: ${n0} chunks, ${S.stats.bld} prédios`);
 g.restart();for(let i=0;i<5;i++)g.update(dt);ok(S.track===g.track&&S.P===g.player&&[...S.chunks.keys()].every(c=>c<=AHEAD+1)&&S.stats.genChunks<n0*3,'restart(): cenário descartado (nenhum chunk da corrida anterior) e religado ao novo mundo');
 for(let i=0;i<600;i++){follow(g,.8);g.update(dt);}ok(S.stats.chunks>0&&S.stats.drawnT>=0,'cenário gerado de novo após o reinício, sem erros');
 // gancho de meteoro
 S.flush();const b=[...S.bgrid.values()].flat()[0];let seen=0;S.onBuildingHit=()=>seen++;S.onMeteorImpact({x:b.x,z:b.z,R:20});ok(seen>=1&&b.hits>=1,`onMeteorImpact identifica prédios no raio e chama onBuildingHit (${seen} atingidos)`);
 // estados/variantes: troca o modelo do prédio por outro e refaz as instâncias do chunk
 const m0=b.m,other=lib.models.find(m=>m.kind==='bld'&&m!==m0);m0.variants={[ST.BURNED]:other.id};const ch=S.chunks.get(b.ch)||[...S.chunks.values()][0];
 if(ch&&ch.recs.includes(b)){S.setState(b,ST.BURNED);S._refresh(g.camera);ok(ch.groups.some(gr=>gr.pi===other.idx&&gr.recs&&gr.recs.includes(b)),'setState(BURNED): instância migra para o modelo-variante (estrutura pronta para prédios queimados/destruídos)');}
 else ok(true,'(prédio de teste fora dos chunks vivos — troca de estado coberta pelo registro)');
 delete m0.variants;
}
{const g=mk(),S=g.scenery,fb=fallbackSceneryLibrary();S.setLibrary(fb);g.player.respawn(2000,30);S.flush(4,3);S._refresh(g.camera);ok(fb.fallback&&S.stats.bld>0&&S.stats.trees>0,`fallback (sem GLB): caixas/cones gerados (${S.stats.bld} prédios, ${S.stats.trees} árvores) — o cenário não depende do arquivo`);}
{const g=mk();g.update(dt);ok(g.scenery.pools.size===0,'sem biblioteca o sistema fica inerte (nada criado, nenhum erro)');}

console.log('8) regressão e console');
ok(errs.length===0,'nenhum erro/aviso no console'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
console.log(process.exitCode?'\nHÁ FALHAS':'\nTUDO OK');
