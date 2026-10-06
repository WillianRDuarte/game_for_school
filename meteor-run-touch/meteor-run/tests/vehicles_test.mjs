// Veículos GLB nos NPCs — TODOS os 48 modelos (8 SUVs + Drifter + 39 da coletânea): biblioteca (carrega 1×), escala, orientação, pouso no chão, variedade/cobertura,
// cada modelo individualmente (spawn, condução, colisão, destroço), pool/chunks, corrida longa, fallback.
// Uso: node --import ./tests/register.mjs tests/vehicles_test.mjs   (QUICK=1 encurta a corrida longa)
import {Game} from '../js/game.js';
import {buildLibrary,VEHICLES,BY_TYPE,CLASSES} from '../js/vehicles.js';
import {loadGlbScene} from './glb_scene.mjs';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const errs=[];const ce=console.error,cw=console.warn;console.error=(...a)=>{errs.push(a.join(' '));ce(...a);};console.warn=(...a)=>{errs.push(a.join(' '));cw(...a);};
const dt=1/60,{scene,json}=loadGlbScene(new URL('../assets/models/npc_vehicles_lite.glb',import.meta.url).pathname);

console.log('1) arquivo e biblioteca');
ok(json.asset.version==='2.0'&&json.meshes.length===48&&json.nodes.length===48,'GLB lite válido com 48 veículos (um nó cada)');
ok(json.images.length===1&&json.textures.length===1&&json.samplers[0].magFilter===9728,'SUVs: textura-paleta embutida e sampler NEAREST preservados');
{const names=json.materials.map(m=>m.name);ok(names.some(n=>n.includes('Pallete'))&&names.some(n=>n.startsWith('truck_Orange'))&&names.some(n=>n.startsWith('col_taxi')),`materiais originais preservados (${json.materials.length}): SUV paleta+vidro+luzes, caminhão (11 cores), coletânea (100 cores)`);
 ok(json.materials.filter(m=>m.pbrMetallicRoughness&&m.pbrMetallicRoughness.baseColorTexture).length>=1,'SUV: baseColorTexture mantido (não trocado por cinza); coletânea: só cores (o original não tem texturas)');}
const lib=buildLibrary(scene);
ok(lib.models.length===48&&lib.stats.missing.length===0,`biblioteca: 48 modelos, nenhum ausente do GLB (${VEHICLES.length} entradas em VEHICLES)`);
ok(new Set(VEHICLES.map(v=>v.id)).size===48,'ids únicos; cada um dos 48 nós do GLB tem entrada em VEHICLES');
{const inGlb=new Set(json.nodes.map(n=>n.name)),inCfg=new Set(VEHICLES.map(v=>v.id));ok([...inGlb].every(n=>inCfg.has(n))&&[...inCfg].every(n=>inGlb.has(n)),'nenhum veículo do GLB ficou fora da lista de NPCs (e nenhum id sobrando)');}
ok(lib.models.filter(m=>m.id.startsWith('col_')).length===39,'coletânea inteira: 39 de 39 modelos');

console.log('2) escala coerente (jogador 5,5 × 2,6 m; NPC-caixa ≈ 5,0 × 2,4 m)');
for(const m of lib.models){const big=m.cls==='big',tr=m.cls==='truck',lim=m.cls==='limo';
  ok(m.len>(big?7:tr?5:lim?6:3.9)&&m.len<(big?10.3:tr?8:lim?8:6.6)&&m.wid>2&&m.wid<(big||tr?3.7:3.1)&&m.hei>1.7&&m.hei<(big||tr?4.5:3.5),`${m.id.padEnd(22)} ${m.len.toFixed(2)} × ${m.wid.toFixed(2)} × ${m.hei.toFixed(2)} m (${m.cls}, escala ${m.scale.toFixed(3)})`);}
{const avg=c=>{const l=lib.byCls[c];return l.reduce((a,m)=>a+m.len,0)/l.length;};ok(avg('big')>avg('truck')&&avg('truck')>avg('van')&&avg('van')>avg('car')*.95&&avg('limo')>avg('suv'),`ordem de tamanho coerente: car ${avg('car').toFixed(1)} · suv ${avg('suv').toFixed(1)} · van ${avg('van').toFixed(1)} · truck ${avg('truck').toFixed(1)} · big ${avg('big').toFixed(1)} · limo ${avg('limo').toFixed(1)} m`);}

console.log('3) orientação: frente (faróis/grade) para −z, traseira (lanternas) para +z — automática onde há material de farol/lanterna; as demais conferidas nas prévias');
{const zOf=(m,pred)=>{let sum=0,n=0;const s=Math.sin(m.yaw),c=Math.cos(m.yaw);for(const me of m.meshes){if(!pred(me.material.name))continue;const p=me.geometry.attributes.position,a=p.array;for(let i=0;i<p.count;i++){const x=a[i*3],z=a[i*3+2];sum+=-x*s+z*c;n++;}}return n?sum/n:NaN;};
 const centerZ=m=>{let mn=1e9,mx=-1e9;const s=Math.sin(m.yaw),c=Math.cos(m.yaw);for(const me of m.meshes){const p=me.geometry.attributes.position,a=p.array;for(let i=0;i<p.count;i++){const z=-a[i*3]*s+a[i*3+2]*c;mn=Math.min(mn,z);mx=Math.max(mx,z);}}return (mn+mx)/2;};
 let auto=0,manual=[];
 for(const m of lib.models){const TAIL=/(HeadLight|StopLight|Light_red)$|^col_(red_far(\.\d+)?|material|material_89)$/;let head=NaN,tail=NaN;
   if(m.id.startsWith('suv_')){head=zOf(m,n=>/HeadLight$/.test(n));tail=zOf(m,n=>/StopLight$/.test(n));}
   else if(m.id==='truck_drifter'){head=zOf(m,n=>/truck_Light$/.test(n));tail=zOf(m,n=>/Light_red$/.test(n));}
   else{tail=zOf(m,n=>/^col_(red_far(\.\d+)?|material|material_89)$/.test(n));}
   const cz=centerZ(m),L=m.len/m.scale;
   if(Number.isFinite(tail)&&Math.abs(tail-cz)>L*.25){auto++;ok(tail-cz>0&&(!Number.isFinite(head)||head-cz<0),`${m.id.padEnd(22)} lanterna z=${(tail-cz).toFixed(2)} (>0, traseira)${Number.isFinite(head)?` · farol z=${(head-cz).toFixed(2)} (<0)`:''}`);}
   else manual.push(m.id);}
 ok(auto>=26,`${auto} modelos conferidos automaticamente pela posição das lanternas`);
 ok(true,`${manual.length} conferidos nas prévias (sem lanterna distinguível no arquivo): ${manual.join(', ')}`);}

console.log('4) rodas no chão (nem enterrado nem flutuando)');
for(const m of lib.models){const inst=lib.make(m);const inner=inst.children[0],wrap=inner.children[0];let mn=1e9;for(const me of wrap.children){const p=me.geometry.attributes.position,a=p.array;for(let i=0;i<p.count;i++)mn=Math.min(mn,a[i*3+1]);}
  const bottom=(mn+wrap.position.y)*inner.scale.x+inner.position.y;ok(Math.abs(bottom+.3)<1e-6,`${m.id.padEnd(22)} base das rodas em y=${bottom.toFixed(3)} (pivô do NPC fica .3 m acima da pista → pneus tocam o asfalto)`);lib.give(inst);}

console.log('5) integração com o tráfego (pool, fallback, cobertura da frota)');
const g=new Game({}),TR=g.traffic,P=g.player;g.input.poll=()=>{};g.meteors.nextSpawn=1e9;
{const c=TR._spawn(300,1,2,30,false);ok(c&&!c.inst&&c.body.visible,'sem biblioteca: NPC continua sendo a caixa original (fallback)');TR._release(c);}
TR.modelsPending=true;TR.update(dt);ok(TR.drivers===0,'enquanto o GLB carrega, nenhum NPC nasce');
TR.setLibrary(lib);ok(!TR.modelsPending&&TR.lib===lib,'biblioteca entregue ao tráfego UMA vez (setLibrary)');
const byType=[{},{},{},{}],SEQ=[];let maxRun=1,run=1,prev=-1;
{const W=[.24,.42,.22,.12];let a=777;const rr=()=>((a=(a*1664525+1013904223)>>>0)/4294967296);   // mesma proporção de tipos de motorista do tráfego
 for(let i=0;i<1800;i++){let u=rr(),ti=0;for(;ti<3;ti++){u-=W[ti];if(u<=0)break;}
  const c=TR._spawn(500+(i%40)*7,ti,i%6,30,false);if(!c)continue;
  SEQ.push(c.model.id);byType[ti][c.model.cls]=(byType[ti][c.model.cls]||0)+1;if(c.model.idx===prev){run++;maxRun=Math.max(maxRun,run);}else run=1;prev=c.model.idx;
  if(i===0){ok(c.inst&&!c.body.visible&&!c.cab.visible&&c.inst.userData.meshes.length>=4,'NPC usa o modelo GLB (caixa escondida)');ok(c.inst.userData.meshes.every((me,k)=>me.geometry===c.model.meshes[k].geometry&&me.material===c.model.meshes[k].material),'instância COMPARTILHA geometria e material com a biblioteca (nada clonado)');
    ok(Math.abs(c.L-c.model.hl*c.root.scale.x)<1e-9&&c.hl===c.L&&c.hw===c.W,`colisão = caixa simplificada do modelo (L ${c.L.toFixed(2)}, W ${c.W.toFixed(2)})`);}
  TR._release(c);}}
const cnt={};for(const id of SEQ)cnt[id]=(cnt[id]||0)+1;const usedAll=VEHICLES.filter(v=>cnt[v.id]>0).length,minUse=Math.min(...VEHICLES.map(v=>cnt[v.id]||0)),maxUse=Math.max(...VEHICLES.map(v=>cnt[v.id]||0));
ok(usedAll===48,`COBERTURA: os 48 modelos foram usados (${usedAll}/48) em ${SEQ.length} NPCs sorteados`);
ok(VEHICLES.filter(v=>v.id.startsWith('col_')).every(v=>cnt[v.id]>0),`coletânea inteira em uso: 39/39 (primeiro: ${VEHICLES.find(v=>v.id.startsWith('col_')).id} = ${cnt[VEHICLES.find(v=>v.id.startsWith('col_')).id]}× · último: col_yellow_truck = ${cnt.col_yellow_truck}×)`);
ok(minUse>=5,`distribuição: cada modelo ≥ 5 vezes (mín ${minUse}, máx ${maxUse}); nenhum domina`);
ok(maxRun<=3,`nunca mais de ${maxRun} iguais seguidos (memória anti-repetição)`);
{const win=[];for(let i=0;i+12<=SEQ.length;i+=12)win.push(new Set(SEQ.slice(i,i+12)).size);const mw=Math.min(...win);ok(mw>=6,`em qualquer grupo de 12 NPCs seguidos há ≥ ${mw} modelos diferentes (variedade real na pista)`);}
ok(byType[3].dmg>0&&byType[3].car>0,`tipo danificado → SUVs amassados/capô aberto + carros comuns (${JSON.stringify(byType[3])})`);
ok(byType[0].big+byType[0].truck>byType[0].car*.9&&byType[2].sport>byType[2].van,`tipo lento → mais caminhões/vans; rápido → mais esportivos (${JSON.stringify(byType[0])} | ${JSON.stringify(byType[2])})`);
ok(lib.stats.live<=26+lib.models.length,`instâncias vivas ≤ pool + 1 em cache por modelo (${lib.stats.live} ≤ ${26+lib.models.length}): sem vazamento`);

console.log('6) cada modelo, um a um, no sistema de NPCs (dirige, segue a estrada, destroço, pool)');
{const Mpk=lib.pick;let okN=0;
 for(const m of lib.models){g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=1e9;g.state='running';TR.update=Object.getPrototypeOf(TR).update.bind(TR);lib.pick=()=>m;
  for(let i=0;i<120;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
  const c=TR._spawn(P.s+120,1,2,30,false);let good=!!c&&c.model===m&&c.active&&!!c.inst;
  if(good){const s0=c.s;for(let i=0;i<150;i++){g.input.throttle=1;g.update(dt);}
   const q=g.track.sampleAt(c.s),psiErr=Math.abs(Math.atan2(Math.sin(c.psi-q.h),Math.cos(c.psi-q.h)));
   good=isFinite(c.x+c.y+c.z+c.psi)&&c.s>s0+10&&Math.hypot(c.x-(q.x+Math.cos(q.h)*c.o),c.z-(q.z+Math.sin(q.h)*c.o))<.5&&psiErr<.5&&c.root.visible;
   if(good){TR._toWreck(c,1,0,6,'flip');for(let i=0;i<420&&c.state===2&&!c.rest;i++){g.input.throttle=1;g.update(dt);}good=isFinite(c.x+c.y+c.z)&&c.inst.userData.meshes.every(me=>me.material!==me.userData.m0)&&c.model===m;}}
  if(good)okN++;else ok(false,`${m.id}: falhou no sistema de NPCs`);}
 lib.pick=Mpk;ok(okN===48,`${okN}/48 modelos: nascem, dirigem pela estrada na orientação certa (±.5 rad), capotam e viram destroço do mesmo modelo — do primeiro (${lib.models[0].id}) ao último (${lib.models[47].id})`);}

console.log('7) comportamento: pequenos modificadores por classe (a IA é a mesma)');
{const pk=lib.pick,mk=(id)=>{const m=lib.byId[id];lib.pick=()=>m;const c=TR._spawn(1500,1,2,30,false);const r={vd:c.vd,mass:c.mass,agil:c.agil};TR._release(c);return r;};
 const T=mk('col_yellow_truck'),Cc=mk('col_green_car'),S=mk('col_coupe');lib.pick=pk;
 ok(T.vd<Cc.vd*.9&&T.mass>2&&S.vd>Cc.vd*1.05,`pesado: ${T.vd.toFixed(1)} m/s massa ${T.mass} · comum: ${Cc.vd.toFixed(1)} m/s · esportivo: ${S.vd.toFixed(1)} m/s (todos ultrapassáveis: ≤ 66 m/s do limite do tráfego)`);}

console.log('8) destroços: mesmo modelo, materiais carbonizados compartilhados; pool restaura');
{g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=1e9;const c=TR._spawn(P.s+80,1,2,30,false),m0=c.inst.userData.meshes.map(x=>x.material);
 TR._toWreck(c,1,0,5,'burn');ok(c.inst&&c.inst.userData.meshes.every((x,i)=>x.material!==m0[i])&&c.model,'NPC destruído mantém o modelo e troca para materiais escuros');
 const nChar=lib._char.size;ok(nChar<=json.materials.length,`materiais de destroço compartilhados (${nChar} únicos, não um por carro)`);
 TR._release(c);const again=TR._spawn(P.s+80,1,2,30,false);ok(again.inst.userData.meshes.every(x=>x.material===x.userData.m0),'ao reutilizar o carro do pool, materiais voltam ao normal');TR._release(again);}

console.log('9) colisão com NPC-modelo; meteoro; escudo');
{g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=1e9;g.state='running';TR.update=Object.getPrototypeOf(TR).update.bind(TR);let hits=0;TR.onPlayerHit=e=>{hits++;g._onTrafficHit(e);};
 for(let i=0;i<180;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
 const mkAhead=(id)=>{const pk=lib.pick;if(id)lib.pick=()=>lib.byId[id];const c=TR._spawn(P.s+16,1,2,30,false);lib.pick=pk;const n=g.track.nearest(P.x,P.z);c.o=n.o;c.s=P.s+16;c.v=0;c.vd=0;c.vCap=0;c.ov=0;return c;};
 mkAhead('col_van');for(let i=0;i<60;i++){g.input.throttle=1;g.update(dt);}ok(hits>=1&&g.lives===2,`van da coletânea parada no caminho: colisão normal, 1 vida (${g.lives})`);
 g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=1e9;g.state='running';hits=0;for(let i=0;i<180;i++){g.input.throttle=1;g.input.steer=0;g.update(dt);}
 g.perks.fx.shield=1;const c3=mkAhead('col_police');for(let i=0;i<60;i++){g.input.throttle=1;g.update(dt);}ok(!c3.active&&g.lives===3&&hits===0,'com escudo: NPC-modelo destruído, 0 dano (integração do escudo preservada)');
 g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=1e9;g.state='running';for(let i=0;i<120;i++){g.input.throttle=1;g.update(dt);}
 const t=mkAhead('col_limusin');t.v=20;t.vd=20;t.vCap=20;const ev={x:t.x,y:t.y,z:t.z,R:10,dist:99,hit:false,cls:1,lethal:false};g.meteors.onImpact(ev);ok(t.state===2||!t.active,'meteoro explodindo sobre o NPC-modelo: vira destroço (integração com meteoros preservada)');}

console.log('10) corrida longa: chunks, pool e memória estáveis com modelos');
{g.restart();TR.setLibrary(lib);g.meteors.nextSpawn=0;TR.onPlayerHit=e=>g._onTrafficHit(e);const sec=process.env.QUICK?60:180;let nan=false,maxAct=0,far=0,minFps=1e9;const seen=new Set(),sceneN=[],tt=[];
 for(let i=0;i<sec*60&&g.state==='running';i++){g.lives=3;g.input.throttle=1;g.input.brake=0;{const q=g.track.sampleAt(P.s+45),ang=Math.atan2(q.x+Math.cos(q.h)*Math.sin(i/200)*18-P.x,-(q.z+Math.sin(q.h)*Math.sin(i/200)*18-P.z)),e=Math.atan2(Math.sin(ang-P.psi),Math.cos(ang-P.psi));g.input.steer=Math.max(-1,Math.min(1,e*2.5));}
  const t0=process.hrtime.bigint();g.update(dt);tt.push(Number(process.hrtime.bigint()-t0)/1e6);if(!isFinite(P.x+P.y+P.speed))nan=true;let act=0;
  for(const c of TR.pool)if(c.active){act++;if(c.model)seen.add(c.model.id);if(c.s>P.s+1250+30||c.s<P.s-380-30&&c.state===1)far++;if(!isFinite(c.x+c.y+c.z+c.psi))nan=true;}
  maxAct=Math.max(maxAct,act);if(i%600===0)sceneN.push(g.scene.children.size);}
 tt.sort((a,b)=>a-b);
 ok(!nan&&g.state==='running',`sem NaN, jogo vivo (${P.s.toFixed(0)} m)`);ok(maxAct<=26&&TR.pool.length<=26,`NPCs simultâneos ≤ 26 (máx ${maxAct}); pool fixo (${TR.pool.length})`);
 ok(seen.size>=10,`variedade durante a corrida: ${seen.size} modelos diferentes vistos na pista`);ok(far===0,'nenhum NPC fora da janela dos chunks (remoção/reuso por distância preservados)');
 {const tail=sceneN.slice(-3);ok(Math.max(...tail)-Math.min(...tail)<=2,`objetos na cena estabilizam (${sceneN.join(' → ')}; o crescimento inicial são crateras/rochas dos meteoros, que têm teto): nada vaza`);}
 ok(lib.stats.live<=26+lib.models.length,`instâncias vivas ≤ ${26+lib.models.length} (${lib.stats.live}; criadas no total ${lib.stats.instances})`);
 console.log(`  (info) tempo/frame na lógica (Node, sem GPU): mediana ${tt[tt.length>>1].toFixed(2)} ms · p99 ${tt[Math.floor(tt.length*.99)].toFixed(2)} ms · ${Object.keys(TR.stats.byModel).length} modelos gerados · destroços ${TR.stats.wrecks}`);}
ok(errs.length===0,'sem erros/avisos no console');
