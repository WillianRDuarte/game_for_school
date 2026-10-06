// TRÁFEGO NPC — outros sobreviventes fugindo dos meteoros. Módulo independente (nenhum sistema existente foi recriado).
//  · Motoristas vivem em COORDENADAS DE ESTRADA (s = distância ao longo da pista, o = deslocamento lateral): seguem curvas, subidas e descidas
//    de graça, ficam sobre o asfalto sem consultar o terreno (só destroços fora da pista usam surface()).
//  · Chunks: carros nascem quando o chunk de estrada (CHUNK_LEN do world.js) entra na faixa à frente do jogador (semente por chunk);
//    por trás, carros rápidos nascem a ~250 m (dentro dos chunks carregados) e podem ultrapassar o jogador. Longe demais → devolvidos ao pool.
//  · Meteoros: lê os indicadores de impacto que o MeteorSystem já publica (`warnings`) numa grade espacial refeita a 10 Hz; cada NPC só consulta as
//    células ao longo da própria trajetória, ~6×/s. O impacto/cratera/rocha/fogo continuam sendo do sistema de meteoros (onImpact → onMeteorImpact).
//  · Dano ao jogador: callback onPlayerHit → Game._damage() (o MESMO sistema de vidas/invulnerabilidade).
//  · Visual: carros-caixa originais OU modelos GLB (js/vehicles.js: 48 modelos, carregados uma vez; `setLibrary`). Instâncias compartilham geometria/materiais; destroços usam o MESMO modelo com materiais carbonizados.
//  · Carros destruídos viram DESTROÇOS: físicos (deslizam/capotam), sólidos para o jogador e para outros NPCs, por tempo limitado.
import * as THREE from 'three';
import {STEP} from './road.js';
import {CHUNK_LEN} from './world.js';
import {surface} from './terrain.js';
import {blastR,CAR_R,CAR_OFFS} from './meteors.js';
import {mulberry32,clamp,lerp,CAR_SIZE_MUL} from './utils.js';

export const MAX_DRIVERS=[8,16];   // motoristas simultâneos: dificuldade 0 → 1
export const MAX_WRECKS=10,POOL=26; // destroços simultâneos · tamanho do pool (motoristas + destroços; nada é criado além disso)
const AHEAD_CH=5;                   // chunks à frente do jogador que recebem tráfego (≈770–960 m)
const REAR_GAP=[235,300];           // nascimento por trás (m) — dentro dos chunks carregados (2 atrás ≥ 384 m)
const DESP_AHEAD=1250,DESP_BEHIND=380,WRECK_BEHIND=170;
const LANES=6,EDGE=2.6,LC_SPEED=3.4,LAT_ACC=16,HORIZON=3.6,SAFE=.9;
const TH_CELL=96,TH_CAP=192,TH_MASK=255;
const DRIVE=1,WRECK=2;
const COLORS=[0x2f6fb5,0xdcdcd8,0xe0b02a,0x3f8f4a,0x7d848c,0x8b5a2b,0xe8873a,0x5a3d8f];   // (o jogador é vermelho)
// tipos: peso · velocidade desejada (m/s) · faixas preferidas (0 = esquerda/rápida … 5 = direita/lenta) · erro de decisão · agilidade lateral (m/s) · reação (s)
const TYPES=[
  {w:.24,v:[15,26],ln:[3,5],err:[.10,.35],ag:[5,8],rc:[.35,.9],big:.35},                 // lento
  {w:.42,v:[28,42],ln:[2,4],err:[.08,.30],ag:[6,10],rc:[.25,.7],big:.10},                // normal
  {w:.22,v:[46,60],ln:[0,2],err:[.06,.22],ag:[8,12],rc:[.18,.5],big:0},                  // rápido
  {w:.12,v:[11,22],ln:[3,5],err:[.35,.60],ag:[3.5,6],rc:[.6,1.1],big:.2,dmg:true},       // danificado (fumaça, reage mal)
];
const RG=[8,16,26,38,52,68];
const laneC=(l,w)=>{const iw=w-4,lw=2*iw/LANES;return -iw+lw*(l+.5);};   // centro da faixa l (a pista tem 6 faixas: textura do world.js)
const hh=(cx,cz)=>((cx*73856093)^(cz*19349663))&TH_MASK;

export class TrafficSystem{
  constructor(scene,seed=(Math.random()*1e9)|0){
    this.scene=scene;this.seed=seed;this.rng=mulberry32(seed);this.track=null;this.P=null;this.M=null;this.onPlayerHit=null;this.shieldRam=null;this.onSmash=null;this.lib=null;this.modelsPending=false;this.aimMul=1;   // aimMul: multiplicador da chance de meteoro mirado em NPC (1 = jogo normal; testes usam valores altos)
    // geometrias e materiais COMPARTILHADOS por todos os carros (mesmo modelo do jogador, variações por escala/cor)
    this.gBody=new THREE.BoxGeometry(2,.7,4.2);this.gCab=new THREE.BoxGeometry(1.6,.6,1.9);
    this.mBody=COLORS.map(c=>new THREE.MeshLambertMaterial({color:c}));this.mCab=new THREE.MeshLambertMaterial({color:0x222831});
    this.mDmg=new THREE.MeshLambertMaterial({color:0x7a5a3c});this.mWreck=new THREE.MeshLambertMaterial({color:0x1d1b1a});this.mWreckCab=new THREE.MeshLambertMaterial({color:0x0e0e0f});
    this.pool=[];this.oth=[];this.pl={s:0,o:0,v:0,hl:2.75,hw:1.3,state:DRIVE,active:true,rest:false,isPlayer:true};
    this._qa={};this._qb={};this._qc={};this._g={};this._g2={};this.ld={gap:0,v:0,fixed:false,b:null};this.cd=new Float64Array(12);
    // grade de ameaças (impactos de meteoros): cadeia em tabela hash fixa
    this.head=new Int16Array(TH_MASK+1);this.nxt=new Int16Array(TH_CAP);this.tcx=new Int32Array(TH_CAP);this.tcz=new Int32Array(TH_CAP);
    this.tx=new Float64Array(TH_CAP);this.tz=new Float64Array(TH_CAP);this.tbr=new Float64Array(TH_CAP);this.tt=new Float64Array(TH_CAP);this.seen=new Int32Array(TH_CAP);this.gj=new Int16Array(24);this.stamp=0;this.nT=0;
    this.stats={spawned:0,rear:0,evades:0,dodged:0,killed:0,wrecks:0,pairCrashes:0,playerHits:0,rockCrashes:0,smashed:0,byModel:{}};
    this.reset();
  }
  bind(track,player,meteors){this.track=track;this.P=player;this.M=meteors;}
  reset(){
    for(const c of this.pool)this._release(c);
    this.t=0;this.live=true;this.nextC=null;this.first=true;this.rearT=3;this.tbT=0;this.cullT=0;this.drivers=0;this.wreckN=0;this.maxD=MAX_DRIVERS[0];
    this.ps=0;this.po=0;this.pOn=false;this.lastDmg=-9;this.nT=0;this.head.fill(-1);this.oth.length=0;
    for(const k in this.stats)this.stats[k]=0;this.stats.byModel={};
  }
  // ---------------------------------------------------------------- utilidades
  _at(s,o){const T=this.track,f=s/STEP,i=Math.floor(f),t=f-i,a=T.get(i),b=T.get(i+1);   // amostra da estrada em s, SEM alocar objeto
    o.x=a.x+(b.x-a.x)*t;o.y=a.y+(b.y-a.y)*t;o.z=a.z+(b.z-a.z)*t;o.h=a.h+(b.h-a.h)*t;o.w=a.w+(b.w-a.w)*t;o.sl=a.slope+(b.slope-a.slope)*t;o.cv=a.curv+(b.curv-a.curv)*t;return o;}
  _randn(){return Math.sqrt(-2*Math.log(1-this.rng()))*Math.cos(6.2831853*this.rng());}
  _nearLane(o,w){let b=0,bd=1e9;for(let l=0;l<LANES;l++){const d=Math.abs(laneC(l,w)-o);if(d<bd){bd=d;b=l;}}return b;}
  _pose(c){c.root.position.set(c.x,c.y,c.z);c.root.rotation.set(c.pitch,-c.psi,c.roll);}
  // ---------------------------------------------------------------- modelos GLB (js/vehicles.js)
  setLibrary(lib){this.lib=lib||null;this.modelsPending=false;}   // carros que já existem continuam com a caixa até serem devolvidos ao pool
  _look(c,m){   // troca o visual do carro do pool: modelo GLB `m` (ou volta à caixa se m=null). A instância antiga volta ao cache da biblioteca.
    const lib=this.lib;
    if(c.inst&&(!m||c.inst.userData.mid!==m.idx)){this._paint(c,false);c.root.remove(c.inst);lib.give(c.inst);c.inst=null;}   // (volta ao cache com os materiais originais)
    if(m){if(!c.inst){c.inst=lib.make(m);c.root.add(c.inst);}else this._paint(c,false);c.body.visible=c.cab.visible=false;c.model=m;}
    else{c.body.visible=c.cab.visible=true;c.model=null;}}
  _paint(c,wreck){if(!c.inst)return;const lib=this.lib;for(const me of c.inst.userData.meshes)me.material=wreck?lib.char(me.userData.m0):me.userData.m0;}
  _take(){let c=this.pool.find(c=>!c.active);if(c)return c;if(this.pool.length>=POOL)return null;
    const root=new THREE.Group();root.rotation.order='YXZ';const body=new THREE.Mesh(this.gBody,this.mBody[0]),cab=new THREE.Mesh(this.gCab,this.mCab);
    body.position.y=.35;cab.position.set(0,.95,.3);root.add(body,cab);root.visible=false;this.scene.add(root);
    c={root,body,cab,active:false,state:0,x:0,y:0,z:0,psi:0,pitch:0,roll:0,s:0,o:0,v:0,ov:0,hl:2.6,hw:1.25,L:2.6,W:1.25,H:1.5,h:0,w:40,cv:0,rest:false};this.pool.push(c);return c;}
  _release(c){c.active=false;c.state=0;c.root.visible=false;}
  // ---------------------------------------------------------------- chunks / aparição
  _pickType(r){let u=r()*1,i=0;for(;i<TYPES.length-1;i++){u-=TYPES[i].w;if(u<=0)break;}return i;}
  _free(s,o,L,W,extra){   // espaço livre para nascer? (sem carro/destroço por perto e longe do carro do jogador)
    for(const c of this.pool){if(!c.active)continue;if(Math.abs(c.s-s)<c.hl+L+10+extra&&Math.abs(c.o-o)<c.hw+W+3)return false;}
    if(Math.abs(this.ps-s)<110&&Math.abs(this.po-o)<9)return false;return true;}
  _spawn(s,ti,lane,vd,rear){
    const c=this._take();if(!c)return null;const T=TYPES[ti],rng=this.rng,big=rng()<T.big,q=this._qa;
    const K=CAR_SIZE_MUL,sx=(big?1.45:1.2+rng()*.12)*K,sy=(big?1.65:1.2+rng()*.1)*K,sz=(big?1.65:1.2+rng()*.12)*K;   // ×K: carros 22 % maiores (colisor L/W/H deriva destas escalas)
    c.root.scale.set(sx,sy,sz);c.L=2.1*sz;c.W=1.0*sx;c.H=1.25*sy;c.hl=c.L;c.hw=c.W;c.mass=big?1.8:1;
    const colorI=(rng()*COLORS.length)|0,M=this.lib?this.lib.pick(ti,rng):null;
    if(M){   // modelo GLB: dimensões vêm do modelo (pequena variação de tamanho); colisão = caixa simplificada que acompanha o visual
      const v=(.96+rng()*.08)*CAR_SIZE_MUL;c.root.scale.setScalar(v);c.L=M.hl*v;c.W=M.hw*v;c.H=M.hh*v;c.hl=c.L;c.hw=c.W;c.mass=M.mass;vd=vd*(rear?1:M.vMul);
      this.stats.byModel[M.id]=(this.stats.byModel[M.id]||0)+1;}
    this._look(c,M);if(!M){c.body.material=T.dmg?this.mDmg:this.mBody[colorI];c.cab.material=this.mCab;}
    Object.assign(c,{active:true,state:DRIVE,rest:false,dmg:!!T.dmg,type:ti,vd,v:vd*(rear?.98:1),ov:0,acc:rear?6:lerp(3.5,7,rng()),brk:lerp(9,13,rng()),pref:lane,lane,jit:(rng()-.5)*3.2,free:false,freeO:0,evadeT:0,brakeT:0,
      noticed:-1,lcT:this.t+rng()*2,thinkT:rng()*.15,distT:0,react:lerp(T.rc[0],T.rc[1],rng()),agil:lerp(T.ag[0],T.ag[1],rng())*(M?M.agil:1),err:lerp(T.err[0],T.err[1],rng()),
      attn:T.dmg?.07:lerp(.01,.04,rng()),hp:T.dmg?.55:1,hitT:-9,stuck:0,vCap:vd,evT:-9,smkT:rng(),fireT:0,burn:false,roll:T.dmg?(rng()-.5)*.08:0,pitch:0,s});
    this._at(s,q);c.w=q.w;c.cv=q.cv;c.h=q.h;const lim=c.w-EDGE;c.o=clamp(laneC(lane,c.w)+c.jit,-lim,lim);c.tgt=c.o;
    c.x=q.x+Math.cos(q.h)*c.o;c.z=q.z+Math.sin(q.h)*c.o;c.y=q.y+.3;c.psi=q.h;c.pitch=Math.atan(q.sl);c.root.visible=true;this._pose(c);this.drivers++;return c;}
  _seed(ch,k,maxD,minAhead){   // tráfego de UM chunk de estrada (determinístico por chunk): 0,9 → 2,0 carros por chunk de 192 m
    const r=mulberry32((this.seed+ch*7919)|0),n=Math.floor(lerp(.9,2,k)+r());
    for(let i=0;i<n&&this.drivers<maxD;i++){
      const s=(ch+r())*CHUNK_LEN,ti=this._pickType(r),T=TYPES[ti],lane=T.ln[0]+Math.floor(r()*(T.ln[1]-T.ln[0]+1)),vd=lerp(T.v[0],T.v[1],r());
      if(s<this.ps+minAhead||s<STEP*3)continue;this._at(s,this._qb);if(!this._free(s,laneC(lane,this._qb.w),3,1.5,12))continue;
      if(this._spawn(s,ti,lane,vd,false))this.stats.spawned++;}}
  _spawnRear(){   // carro rápido por trás: aproxima-se e pode ultrapassar quando há espaço
    const s=this.ps-lerp(REAR_GAP[0],REAR_GAP[1],this.rng());if(s<STEP*3)return;
    const ti=this.rng()<.7?2:1,T=TYPES[ti],lane=T.ln[0]+Math.floor(this.rng()*(T.ln[1]-T.ln[0]+1)),vd=clamp(this.P.speed+6+this.rng()*12,30,66);
    if(vd<this.P.speed+2)return;   // jogador rápido demais: este carro nunca o alcançaria (evita nascer/sumir à toa)
    this._at(s,this._qb);if(!this._free(s,laneC(lane,this._qb.w),3,1.5,45))return;
    if(this._spawn(s,ti,lane,vd,true)){this.stats.spawned++;this.stats.rear++;}}
  _spawnTick(dt){
    const k=this.M.difficulty(),maxD=Math.round(lerp(MAX_DRIVERS[0],MAX_DRIVERS[1],k));this.maxD=maxD;
    const ci=Math.floor(this.ps/CHUNK_LEN);if(this.nextC===null)this.nextC=ci;
    for(;this.nextC<=ci+AHEAD_CH;this.nextC++)this._seed(this.nextC,k,maxD,this.first?80:300);   // chunk novo entrou na faixa à frente → semeia
    this.first=false;this.rearT-=dt;
    if(this.rearT<=0){this.rearT=lerp(5.5,2.4,k)*(.7+.6*this.rng());let nb=0;for(const c of this.pool)if(c.active&&c.state===DRIVE&&c.s<this.ps&&c.v>this.P.speed-4)nb++;   // só conta quem ainda está se aproximando
      if(nb<Math.round(lerp(1,4,k))&&this.drivers<maxD)this._spawnRear();}
  }
  _cull(){   // devolve ao pool o que ficou longe / parado fora da vista
    const ps=this.ps;for(const c of this.pool){if(!c.active)continue;
      if(c.state===DRIVE){if(c.s>ps+DESP_AHEAD||c.s<ps-DESP_BEHIND||(c.stuck>8&&Math.abs(c.s-ps)>130))this._release(c);}
      else if(c.rest&&(c.s<ps-WRECK_BEHIND||c.s>ps+DESP_AHEAD||(c.age>80&&Math.abs(c.s-ps)>150)))this._release(c);}}
  // ---------------------------------------------------------------- jogador em coordenadas de estrada
  _player(){const P=this.P,nr=this.track.nearest(P.x,P.z),pl=this.pl;if(nr){pl.o=nr.o;this.pOn=nr.d<nr.w+8;}else this.pOn=false;pl.s=P.s;pl.v=Math.max(0,P.speed);this.ps=P.s;this.po=pl.o;}
  // ---------------------------------------------------------------- ameaças (indicadores de impacto do sistema de meteoros)
  _buildThreats(){
    const W=this.M.warnings,n=Math.min(W.length,TH_CAP);this.head.fill(-1);let m=0;
    for(let i=0;i<n;i++){const w=W[i];if(w.left<=0)continue;
      this.tx[m]=w.x;this.tz[m]=w.z;this.tbr[m]=blastR(w.R);this.tt[m]=this.t+w.left;
      const cx=Math.floor(w.x/TH_CELL),cz=Math.floor(w.z/TH_CELL),h=hh(cx,cz);this.tcx[m]=cx;this.tcz[m]=cz;this.nxt[m]=this.head[h];this.head[h]=m;m++;}
    this.nT=m;}
  _gather(c){   // só as ameaças perto da TRAJETÓRIA do carro (4 pontos até o horizonte), consultando poucas células
    if(!this.nT)return 0;let n=0;const st=++this.stamp,q=this._qb,now=this.t;
    for(let i=0;i<4;i++){this._at(c.s+c.v*HORIZON*i/3,q);const x=q.x+Math.cos(q.h)*c.o,z=q.z+Math.sin(q.h)*c.o,r=70;
      const x0=Math.floor((x-r)/TH_CELL),x1=Math.floor((x+r)/TH_CELL),z0=Math.floor((z-r)/TH_CELL),z1=Math.floor((z+r)/TH_CELL);
      for(let cx=x0;cx<=x1;cx++)for(let cz=z0;cz<=z1;cz++)for(let j=this.head[hh(cx,cz)];j>=0;j=this.nxt[j]){
        if(this.tcx[j]!==cx||this.tcz[j]!==cz||this.seen[j]===st)continue;this.seen[j]=st;
        const tl=this.tt[j]-now;if(tl>HORIZON||tl<.03)continue;if(n<24)this.gj[n++]=j;}}
    return n;}
  // folga (m) entre o centro do carro e o raio letal do meteoro j, se o carro estiver em lateral oEnd (e freando ou não) quando ele cair
  _clear(c,oEnd,brake,j,tl){
    let d=c.v*tl;if(brake){const st=c.v*c.v/(2*c.brk);d=c.v*tl-.5*c.brk*tl*tl;if(tl>c.v/c.brk)d=st;}
    const q=this._qb;this._at(c.s+d,q);const lim=q.w-EDGE,o=clamp(oEnd,-lim,lim),x=q.x+Math.cos(q.h)*o,z=q.z+Math.sin(q.h)*o;
    return Math.hypot(x-this.tx[j],z-this.tz[j])-(this.tbr[j]+1);}
  _evade(c,now){
    const n=this._gather(c);
    if(!n){c.noticed=-1;if(c.free&&now>c.evadeT){c.free=false;c.lane=this._nearLane(c.o,c.w);}return false;}
    const planO=c.free?c.freeO:c.tgt,lm=c.free?c.agil:LC_SPEED,brk=now<c.brakeT;let worst=1e9;
    for(let i=0;i<n;i++){const j=this.gj[i],tl=this.tt[j]-now,mv=clamp(planO-c.o,-lm*tl,lm*tl);worst=Math.min(worst,this._clear(c,c.o+mv,brk,j,tl));}
    if(worst>SAFE){c.noticed=-1;if(c.free&&now>c.evadeT){c.free=false;c.lane=this._nearLane(c.o,c.w);}return c.free;}   // o plano atual já escapa
    if(c.noticed<0)c.noticed=now;
    if(!c.free&&now-c.noticed<c.react)return false;                                                                    // ainda não reagiu (tempo de reação do motorista)
    this._decide(c,n,now);return true;}
  _decide(c,n,now){   // escolhe para onde ir: faixas, "lados" do ponto de impacto, com ou sem freada; motorista ruim erra a avaliação
    const q=this._qb,w=c.w,lim=w-EDGE,cd=this.cd;let tmin=9,tmax=0,jm=this.gj[0];
    for(let i=0;i<n;i++){const j=this.gj[i],tl=this.tt[j]-now;if(tl<tmin){tmin=tl;jm=j;}if(tl>tmax)tmax=tl;}
    let m=0;cd[m++]=c.o;for(let l=0;l<LANES;l++)cd[m++]=laneC(l,w);
    this._at(c.s+c.v*Math.max(tmin,.1),q);const lat=(this.tx[jm]-q.x)*Math.cos(q.h)+(this.tz[jm]-q.z)*Math.sin(q.h),e=this.tbr[jm]+2.4;cd[m++]=lat+e;cd[m++]=lat-e;
    let best=-1e9,bo=c.o,bb=false;
    for(let i=0;i<m;i++){const oc=clamp(cd[i],-lim,lim),occ=i===0||this._sideClear(c,oc)?0:5,mv=Math.abs(oc-c.o);
      for(let b=0;b<2;b++){if(b&&c.v<8)break;let cl=1e9;
        for(let g=0;g<n;g++){const j=this.gj[g],tl=Math.max(.05,this.tt[j]-now-.1),mk=clamp(oc-c.o,-c.agil*tl,c.agil*tl);cl=Math.min(cl,this._clear(c,c.o+mk,b===1,j,tl));}
        const sc=Math.min(cl,5)-occ-.06*mv-(b?1.2:0)+this._randn()*c.err*4;if(sc>best){best=sc;bo=oc;bb=b===1;}}}
    if(this.rng()<c.err*.25){bo=clamp(cd[(this.rng()*m)|0],-lim,lim);bb=false;}   // decisão errada
    if(!c.free)this.stats.evades++;
    c.free=true;c.freeO=bo;c.evadeT=now+tmax+.9;c.brakeT=bb?now+tmin+.5:0;c.lcT=now+1.2;c.evT=now;}
  // ---------------------------------------------------------------- tráfego: líder, laterais, rochas
  _lead(c,oc,look){let best=null,bg=look;const o=this.oth;
    for(let i=0;i<o.length;i++){const b=o[i];if(b===c)continue;const gap=b.s-c.s-c.hl-b.hl;if(gap<-1.5||gap>=bg)continue;if(Math.abs(b.o-oc)>=c.hw+b.hw+.9)continue;bg=gap;best=b;}
    if(!best)return false;const ld=this.ld;ld.gap=Math.max(0,bg);ld.v=best.v;ld.fixed=best.v<1;ld.b=best;return true;}
  _sideClear(c,oc){const o=this.oth;
    for(let i=0;i<o.length;i++){const b=o[i];if(b===c)continue;const rel=b.v-c.v,ds=b.s-c.s,beh=c.hl+b.hl+6+Math.max(0,rel)*1.1,ah=c.hl+b.hl+9+Math.max(0,-rel)*1.1;
      if(ds<-beh||ds>ah)continue;if(Math.abs(b.o-oc)<c.hw+b.hw+1.3)return false;}
    return true;}
  _rockGap(c,oc,lk){const M=this.M;if(!M.craterCells.size)return 1e9;const q=this._qb;
    for(let i=0;i<RG.length;i++){const d=RG[i];if(d>lk)break;this._at(c.s+d,q);if(M.rockNear(q.x+Math.cos(q.h)*oc,q.z+Math.sin(q.h)*oc,c.W+.9))return d-c.L;}return 1e9;}
  _think(c,now){
    const q=this._qc;this._at(c.s+30,q);let kap=Math.abs(q.cv);this._at(c.s+70,q);kap=Math.max(kap,Math.abs(q.cv),Math.abs(c.cv));
    let vt=Math.min(c.vd,Math.sqrt(8/Math.max(kap,1e-4)));          // reduz nas curvas (≈ 27 m/s num grampo)
    this._evade(c,now);                                              // 1) meteoros têm prioridade
    if(c.distT>0)c.distT-=.15;else if(this.rng()<c.attn*.15)c.distT=1.2+this.rng()*1.6;   // motorista distraído: ignora carros à frente por instantes
    const w=c.w,look=25+c.v*1.6;let has=this._lead(c,c.o,look),gap=has?this.ld.gap:1e9,lv=has?this.ld.v:0;
    const rg=this._rockGap(c,c.o,Math.min(look,70));if(rg<gap){gap=rg;lv=0;has=true;}
    if(has&&c.distT>0&&lv>=1)has=false;
    if(has){const dg=6+c.v*.5;vt=lv<1?Math.min(vt,Math.sqrt(Math.max(0,18*(gap-5)))):Math.min(vt,lv+(gap-dg)*.6);if(gap<4)vt=0;
      if(!c.free&&now>=c.lcT&&gap<look*.85&&(lv<1||lv<c.vd-2.5))this._changeLane(c,now,gap,look);}
    else if(!c.free&&c.lane!==c.pref&&now>=c.lcT)this._backToPref(c,now,look);
    if(now<c.brakeT)vt=Math.min(vt,c.v*.3);
    c.vCap=Math.max(0,vt);const lim=w-EDGE;c.tgt=clamp(c.free?c.freeO:laneC(c.lane,w)+c.jit,-lim,lim);
    c.stuck=c.v<1.5?c.stuck+.15:0;}
  _changeLane(c,now,gap,look){   // ultrapassagem / desvio de obstáculo parado: tenta faixas vizinhas (esquerda primeiro)
    const w=c.w,L=c.lane,ord=c.vd>=40?[L-1,L+1,L-2,L+2]:[L-1,L+1,L+2,L-2],sloppy=this.rng()<c.err*.4;
    for(const l of ord){if(l<0||l>=LANES)continue;const oc=laneC(l,w)+c.jit;if(!sloppy&&!this._sideClear(c,oc))continue;   // motorista descuidado nem olha o retrovisor
      let g2=this._lead(c,oc,look)?this.ld.gap:1e9;g2=Math.min(g2,this._rockGap(c,oc,Math.min(look,70)));
      if(g2>gap+18||g2>=look){c.lane=l;c.lcT=now+2.4;return;}}}
  _backToPref(c,now,look){   // depois da ultrapassagem/desvio volta, uma faixa por vez, para a faixa de origem
    const l=c.lane+Math.sign(c.pref-c.lane),oc=laneC(l,c.w)+c.jit;if(!this._sideClear(c,oc))return;
    let g2=this._lead(c,oc,look)?this.ld.gap:1e9;if(g2<look*.8||this._rockGap(c,oc,Math.min(look,70))<look*.8)return;c.lane=l;c.lcT=now+2.2;}
  // ---------------------------------------------------------------- movimento do motorista
  _drive(c,dt){
    const q=this._qa;c.v+=clamp(Math.min(c.vCap,c.vd)-c.v,-c.brk*dt,c.acc*dt);
    const lm=c.free?c.agil:LC_SPEED,des=clamp((c.tgt-c.o)*2.2,-lm,lm);c.ov+=clamp(des-c.ov,-LAT_ACC*dt,LAT_ACC*dt);
    let o=c.o+c.ov*dt;const lim=c.w-EDGE;if(o>lim){o=lim;if(c.ov>0)c.ov=0;}else if(o<-lim){o=-lim;if(c.ov<0)c.ov=0;}
    c.o=o;c.s+=c.v*dt/(1-clamp(o*c.cv,-.5,.5));   // pista curva: faixa interna é mais curta
    this._at(c.s,q);c.w=q.w;c.cv=q.cv;c.h=q.h;c.x=q.x+Math.cos(q.h)*o;c.z=q.z+Math.sin(q.h)*o;c.y=q.y+.3;
    c.psi=q.h+Math.atan2(c.ov,Math.max(c.v,6));c.pitch=Math.atan(q.sl);this._pose(c);}
  _puff(c,dt,strong){   // fumaça/fogo: reutiliza os pools de partículas do sistema de meteoros (só perto do jogador)
    c.smkT-=dt;if(c.smkT>0)return;c.smkT=(strong?.28:.45)+this.rng()*.25;const P=this.P;if(Math.abs(c.x-P.x)>260||Math.abs(c.z-P.z)>260)return;const r=this.rng.bind(this),M=this.M;
    M.smoke.emit(c.x,c.y+1.3,c.z,(r()-.5)*1.5,2.5+r()*2,(r()-.5)*1.5,2.2+r(),c.W*(1.2+r()*.6),2.2,-.4,.5,[.2,.19,.18,.55],[.4,.4,.4,0]);
    if(c.burn&&c.fireT>0)M.fire.emit(c.x+(r()-.5)*c.W,c.y+1,c.z+(r()-.5)*c.L,(r()-.5)*2,3+r()*2,(r()-.5)*2,.5+r()*.4,c.W*.9,.8,-1,.8,[1,.7,.3,.9],[.9,.25,.05,0]);}
  _rockCrash(c){   // bateu numa rocha de meteoro já caída (mesma estrutura de colisão do jogador)
    const M=this.M;if(!M.craterCells.size)return;const fx=Math.sin(c.psi),fz=-Math.cos(c.psi);
    const rk=M.rockNear(c.x+fx*c.L*.7,c.z+fz*c.L*.7,c.W*.7)||M.rockNear(c.x,c.z,c.W*.7);if(!rk)return;
    this.stats.rockCrashes++;if(c.v>14)this._away(c,rk.x,rk.z,5,c.v/30);else{c.v*=.3;c.s-=1.2;}}
  // ---------------------------------------------------------------- destroços
  _outcome(str){const u=this.rng(),f=str>1?.1:0;return u<.30-f?'stop':u<.60?'flip':u<.85?'burn':'push';}
  _away(c,ox,oz,kick,sev){let dx=c.x-ox,dz=c.z-oz;const d=Math.hypot(dx,dz);if(d<1e-3){const a=this.rng()*6.283;dx=Math.cos(a);dz=Math.sin(a);}else{dx/=d;dz/=d;}this._toWreck(c,dx,dz,kick,this._outcome(sev));}
  _toWreck(c,kx,kz,kick,out){
    if(c.state!==DRIVE)return;const rng=this.rng,f=c.v*.85;
    if(out==='push'){const sg=c.o>=0?1:-1,lx=Math.cos(c.h)*sg,lz=Math.sin(c.h)*sg,mx=kx*.35+lx*.65,mz=kz*.35+lz*.65,ml=Math.hypot(mx,mz)||1;kx=mx/ml;kz=mz/ml;}   // "empurrado": a força joga o carro para o acostamento mais próximo
    c.vx=Math.sin(c.psi)*f+Math.cos(c.h)*c.ov+kx*kick*(out==='push'?1.8:1);c.vz=-Math.cos(c.psi)*f+Math.sin(c.h)*c.ov+kz*kick*(out==='push'?1.8:1);
    c.state=WRECK;c.rest=false;c.age=0;c.wz=(rng()<.5?-1:1)*(1.5+rng()*3.5)*(out==='flip'?1.3:1);c.fireT=out==='burn'?14:out==='flip'?6:5;c.burn=out==='burn';c.smkT=0;
    c.rollG=out==='flip'?(rng()<.5?Math.PI:(rng()<.5?1.55:-1.55)):0;c.hl=c.L;c.hw=c.W;c.v=0;c.ov=0;c.free=false;
    c.s0=c.s;c.o0=c.o;c.h0=c.h;c.x0=c.x;c.z0=c.z;c.hitT=-9;
    if(c.inst)this._paint(c,true);else{c.body.material=this.mWreck;c.cab.material=this.mWreckCab;}this.drivers--;this.wreckN++;this.stats.wrecks++;
    if(this.wreckN>MAX_WRECKS){let w=null;for(const q of this.pool)if(q.active&&q.state===WRECK&&q.rest&&q!==c&&(!w||q.s<w.s))w=q;if(w){this._release(w);this.wreckN--;}}}   // teto de destroços: some o mais para trás
  _settle(c){   // parou: fixa a pose (4 pontos do terreno, uma vez só) e vira obstáculo estático em coordenadas de estrada
    c.rest=true;c.vx=c.vz=c.wz=0;const dx=c.x-c.x0,dz=c.z-c.z0;
    c.s=c.s0+dx*Math.sin(c.h0)-dz*Math.cos(c.h0);c.o=c.o0+dx*Math.cos(c.h0)+dz*Math.sin(c.h0);
    const d=c.psi-c.h0,cd=Math.abs(Math.cos(d)),sd=Math.abs(Math.sin(d));c.hl=cd*c.L+sd*c.W;c.hw=sd*c.L+cd*c.W;c.v=0;c.ov=0;
    const T=this.track,g=this._g,s=Math.sin(c.psi),cc=-Math.cos(c.psi),rx=Math.cos(c.psi),rz=Math.sin(c.psi),a=c.L*.8,b=c.W*.8,H=(l,r)=>surface(T,c.x+s*l+rx*r,c.z+cc*l+rz*r,g).h;
    const h0=H(a,-b),h1=H(a,b),h2=H(-a,-b),h3=H(-a,b);c.pitch=Math.atan2((h0+h1-h2-h3)/2,2*a);
    c.y=(h0+h1+h2+h3)/4+.3+c.H*(1-Math.cos(c.rollG))*.5;c.roll=c.rollG+Math.atan2((h1+h3-h0-h2)/2,2*b);this._pose(c);}
  _wreckStep(c,dt){
    c.age+=dt;if(c.fireT>0){c.fireT-=dt;this._puff(c,dt,c.burn);}if(c.rest)return;
    const sp=Math.hypot(c.vx,c.vz);if(sp>0){const k=Math.max(0,sp-14*dt)/sp;c.vx*=k;c.vz*=k;}
    c.x+=c.vx*dt;c.z+=c.vz*dt;c.psi+=c.wz*dt;c.wz*=Math.exp(-1.7*dt);
    const rk=this.M.rockNear(c.x,c.z,c.W+.4);   // desliza e esbarra nas rochas dos meteoros
    if(rk){const dx=c.x-rk.x,dz=c.z-rk.z,d=Math.hypot(dx,dz)||1,nx=dx/d,nz=dz/d,pen=Math.max(0,rk.rr+c.W+.4-d);c.x+=nx*pen;c.z+=nz*pen;const vn=c.vx*nx+c.vz*nz;if(vn<0){c.vx-=1.5*vn*nx;c.vz-=1.5*vn*nz;}}
    c.roll+=(c.rollG-c.roll)*(1-Math.exp(-6*dt));
    c.y=surface(this.track,c.x,c.z,this._g).h+.3+c.H*(1-Math.cos(c.roll))*.5;
    if(sp<.5&&Math.abs(c.wz)<.2)this._settle(c);else this._pose(c);}
  // ---------------------------------------------------------------- meteoro × NPC (usa o impacto do sistema existente)
  onMeteorImpact(e){
    if(!this.track)return;const br=blastR(e.R),now=this.t;
    for(const c of this.pool){if(!c.active)continue;const d=Math.hypot(c.x-e.x,c.z-e.z);
      if(c.state===DRIVE){
        if(d<br+1){this.stats.killed++;this._away(c,e.x,e.z,6+(1-d/(br+1))*14+this.rng()*4,e.cls>=2?1.3:.8);}              // dentro do raio letal: destruído
        else if(d<br*1.7+3){const f=1-(d-br)/(br*.7+3);c.hp-=.7*f;c.ov+=(c.o>=0?1:-1)*3*f;c.v*=1-.3*f;                    // onda de choque: empurra e danifica
          if(c.hp<=0||this.rng()<.2*f){this.stats.killed++;this._away(c,e.x,e.z,5*f+2,.8);}else if(now-c.evT<5)this.stats.dodged++;}
        else if(d<br+14&&now-c.evT<5)this.stats.dodged++;                                                                    // escapou do desvio
      }else if(c.rest&&d<br*1.5+3){let dx=c.x-e.x,dz=c.z-e.z;const dd=Math.hypot(dx,dz)||1,k=6+this.rng()*8;c.rest=false;c.vx=dx/dd*k;c.vz=dz/dd*k;c.wz=(this.rng()-.5)*5;c.fireT=Math.max(c.fireT,4);}   // destroço empurrado
    }}
  // meteoro mirado num NPC visível (o sistema de meteoros pergunta a cada spawn; quase sempre devolve null). Cresce com a dificuldade.
  aim(T,k){
    if(!this.live||!this.track||this.rng()>lerp(.004,.010,k)*this.aimMul)return null;let pick=null,n=0;
    for(const c of this.pool)if(c.active&&c.state===DRIVE&&c.v>3&&c.s>this.ps-40&&c.s<this.ps+450&&this.rng()*(++n)<1)pick=c;
    if(!pick)return null;const q=this._qb;this._at(pick.s+pick.v*T+(this.rng()-.5)*6,q);const o=pick.o+pick.ov*T*.4+(this.rng()-.5)*5;
    const a=this._aim||(this._aim={x:0,z:0,cat:'npc'});a.x=q.x+Math.cos(q.h)*o;a.z=q.z+Math.sin(q.h)*o;return a;}
  // ---------------------------------------------------------------- colisões
  _pairs(){   // NPC×NPC (caixas em coordenadas de estrada; destroço parado = obstáculo fixo) · destroço deslizando × NPC (círculos)
    const P=this.pool,n=P.length;
    for(let i=0;i<n;i++){const a=P[i];if(!a.active||a.state!==DRIVE)continue;
      for(let j=0;j<n;j++){const b=P[j];if(j===i||!b.active)continue;
        if(b.state===DRIVE){if(j<i)continue;this._aabb(a,b);}
        else if(b.rest)this._aabb(a,b);
        else if(Math.hypot(a.x-b.x,a.z-b.z)<(a.L+b.L)*.8){this.stats.pairCrashes++;this._away(a,b.x,b.z,4,.8);b.vx*=.6;b.vz*=.6;}
        if(a.state!==DRIVE)break;}}}
  _aabb(a,b){
    const dS=b.s-a.s,dO=b.o-a.o,ox=a.hl+b.hl-Math.abs(dS),oy=a.hw+b.hw-Math.abs(dO);if(ox<=0||oy<=0)return;
    const fixed=b.state===WRECK,wa=fixed?1:.5,wb=fixed?0:.5;let sev=0;
    if(ox<oy){const sg=dS>=0?1:-1;a.s-=sg*ox*wa;b.s+=sg*ox*wb;sev=(a.v-b.v)*sg;                                   // batida na traseira
      if(sev>0){if(fixed)a.v*=.15;else{const m=(a.v*a.mass+b.v*b.mass)/(a.mass+b.mass);a.v=b.v=Math.max(0,m);}}}
    else{const so=dO>=0?1:-1;a.o-=so*oy*wa;b.o+=so*oy*wb;sev=Math.abs(a.ov-b.ov)*1.2;                            // raspão/lateral
      const co=(a.ov-b.ov)*so;if(co>0){if(fixed)a.ov*=-.2;else{const m=(a.ov+b.ov)/2;a.ov=m-so*1;b.ov=m+so*1;}}}
    if(sev<=0)return;this.stats.pairCrashes++;a.hp-=sev/30;if(!fixed)b.hp-=sev/30;
    if(sev>16||a.hp<=0){this._away(a,b.x,b.z,2+sev*.3,sev/16);}
    if(!fixed&&b.state===DRIVE&&(sev>16||b.hp<=0))this._away(b,a.x,a.z,2+sev*.3,sev/16);}
  _smash(c){   // destruído pelo escudo do jogador: estouro (fogo/fumaça dos pools do MeteorSystem) e o carro/destroço sai do mundo (volta ao pool)
    const M=this.M,r=this.rng;this.stats.smashed++;
    for(let i=0;i<10;i++){const a=r()*6.283,sp=4+r()*10;M.fire.emit(c.x,c.y+1,c.z,Math.cos(a)*sp,3+r()*6,Math.sin(a)*sp,.35+r()*.3,c.W*(.8+r()),1.5,-2,1.2,[1,.8,.4,.95],[.9,.25,.05,0]);}
    for(let i=0;i<6;i++){const a=r()*6.283,sp=2+r()*5;M.smoke.emit(c.x,c.y+1.2,c.z,Math.cos(a)*sp,2+r()*4,Math.sin(a)*sp,1.6,c.W*(1.2+r()),2.2,-.5,.6,[.2,.19,.18,.7],[.42,.42,.42,0]);}
    if(this.onSmash)this.onSmash(c.x,c.y+1,c.z,c.W);this._release(c);}
  _playerHits(){   // NPC/destroço × carro do jogador: círculos (mesma geometria da colisão com rochas). Dano só em batida FORTE, 1 vida por colisão.
    const P=this.P,now=this.t,fx=Math.sin(P.psi),fz=-Math.cos(P.psi),rx=Math.cos(P.psi),rz=Math.sin(P.psi);
    for(const c of this.pool){if(!c.active||Math.abs(c.x-P.x)>10||Math.abs(c.z-P.z)>10)continue;
      const cs=Math.sin(c.psi),cc=-Math.cos(c.psi),a=c.L-c.W,m=CAR_R+c.W;let best=0,nx=0,nz=0;
      for(let i=0;i<CAR_OFFS.length;i++){const px=P.x+fx*CAR_OFFS[i],pz=P.z+fz*CAR_OFFS[i];
        for(let k=-1;k<=1;k++){const dx=px-(c.x+cs*a*k),dz=pz-(c.z+cc*a*k),d=Math.hypot(dx,dz);
          if(d<m&&m-d>best){best=m-d;if(d<1e-4){nx=-fx;nz=-fz;}else{nx=dx/d;nz=dz/d;}}}}
      if(best<=0)continue;if(P.phase>0){P.phaseHold=true;continue;}                                                 // perk FASE: atravessa carros/destroços (sem dano nem empurrão)
      if(this.shieldRam&&this.shieldRam(c)){this._smash(c);continue;}                                               // perk ESCUDO: o carro/destroço é DESTRUÍDO (removido), sem dano nem empurrão
      // n: do NPC para o jogador
      const fixed=c.state===WRECK&&c.rest,drv=c.state===DRIVE,pw=fixed?1:.6;
      P.x+=nx*best*pw;P.z+=nz*best*pw;P.mesh.position.x=P.x;P.mesh.position.z=P.z;
      let vx,vz;if(drv){vx=Math.sin(c.psi)*c.v+Math.cos(c.h)*c.ov;vz=-Math.cos(c.psi)*c.v+Math.sin(c.h)*c.ov;}else{vx=c.vx||0;vz=c.vz||0;}
      const cl=(vx-P.vx)*nx+(vz-P.vz)*nz;                                                                           // velocidade de aproximação ao longo da normal
      if(cl>0){const mN=fixed?1e6:drv?c.mass*1.1:2.2,j=1.2*cl/(1+1/mN);P.vx+=j*nx;P.vz+=j*nz;
        if(!fixed){const dvx=-j/mN*nx,dvz=-j/mN*nz;if(drv){c.v=Math.max(0,c.v+dvx*Math.sin(c.h)-dvz*Math.cos(c.h));c.ov+=dvx*Math.cos(c.h)+dvz*Math.sin(c.h);}else{c.vx+=dvx;c.vz+=dvz;}}
        P.speed=Math.max(0,P.vx*fx+P.vz*fz);const lat=(c.x-P.x)*rx+(c.z-P.z)*rz;P.yawRate+=-(lat>=0?1:-1)*clamp(cl/40,0,.45)*.6;
        const thr=drv?7.5:5.5;
        if(cl>=thr&&now-c.hitT>2.5&&now-this.lastDmg>1){                                                            // batida forte: UM dano; latch por carro + invulnerabilidade do Game
          const df=-(nx*fx+nz*fz),kind=df>.55?'front':df<-.55?'rear':'side';c.hitT=now;this.lastDmg=now;this.stats.playerHits++;
          if(this.onPlayerHit)this.onPlayerHit({kind,speed:cl,wreck:!drv});
          if(drv&&cl>=14&&c.state===DRIVE)this._away(c,P.x,P.z,3+cl*.2,cl/14);}}                                  // batida muito forte também destrói o NPC
      if(!fixed){const dx=-nx*best*(1-pw),dz=-nz*best*(1-pw);
        if(drv){c.s+=dx*Math.sin(c.h)-dz*Math.cos(c.h);c.o+=dx*Math.cos(c.h)+dz*Math.sin(c.h);}else{c.x+=dx;c.z+=dz;}}}}
  // ---------------------------------------------------------------- loop
  update(dt,{live=true}={}){
    if(!this.P||!this.track)return;dt=Math.min(dt,.05);this.t+=dt;this.live=live;const now=this.t;
    if(live){this._player();this.tbT-=dt;if(this.tbT<=0){this.tbT=.1;this._buildThreats();}}
    const oth=this.oth;oth.length=0;let dr=0,wr=0;
    for(const c of this.pool){if(!c.active)continue;if(c.state===DRIVE){dr++;oth.push(c);}else{wr++;if(c.rest)oth.push(c);}}
    this.drivers=dr;this.wreckN=wr;if(live&&this.pOn&&!(this.P.phase>0))oth.push(this.pl);
    if(live&&!this.modelsPending)this._spawnTick(dt);   // (espera o GLB carregar — ou falhar — para não nascer carro-caixa e trocar depois)
    for(const c of this.pool){if(!c.active)continue;
      if(c.state===DRIVE){if(!live)continue;c.thinkT-=dt;if(c.thinkT<=0){c.thinkT=.13+this.rng()*.08;this._think(c,now);}this._drive(c,dt);if(c.dmg)this._puff(c,dt,false);this._rockCrash(c);}
      else this._wreckStep(c,dt);}
    if(live){this._pairs();this._playerHits();}
    this.cullT-=dt;if(this.cullT<=0){this.cullT=.25;this._cull();}
  }
}
