// CENÁRIO PROCEDURAL ao longo da ESTRADA PRINCIPAL (sem subestradas): prédios e árvores reais no mundo 3D, nas duas laterais, em regiões que variam
// (CAMPO · RURAL · SUBÚRBIO · URBANO). Módulo independente — nenhum sistema existente foi recriado (estrada, terreno, chunks, tráfego, meteoros, perks, câmera).
//  · CHUNKS: usa a mesma grade do world.js (CHUNK_LEN = 192 m, índice c = floor(s / CHUNK_LEN)) e a mesma janela do carro: 2 chunks atrás; prédios até 9 à
//    frente (≈1,7 km), árvores até 6 (≈1,15 km). Chunk novo → gera prédios (fase A) e depois árvores (fase B), em FATIAS DE TEMPO (≈2,5 ms por frame, nunca
//    um engasgo); chunk que sai da janela → seus objetos saem das grades e das instâncias (nada acumula). O custo de um chunk é medido em tests/scenery_test.mjs.
//  · TERRENO: cada objeto é posicionado com `ground()` (a MESMA função da malha e da física). Prédios: amostram a pegada (centro + cantos [+ meios]) e um anel em
//    volta; recusam encostas (relevo máximo por classe), vales/barrancos, qualquer ponto a menos de `clear` m do BORDO do asfalto (qualquer trecho de pista,
//    inclusive grampos que voltam perto) e sobreposição com outros prédios/árvores. Ficam SEMPRE verticais (só giram em torno de Y) e apoiados numa FUNDAÇÃO
//    (caixa instanciada que desce até 3,4 m abaixo do ponto mais baixo → nunca flutuam, nem sobre a malha grossa de LOD de tiles distantes). Árvores
//    acompanham 50 % da inclinação do terreno e entram ~0,3 m no chão.
//  · REGIÕES: ZoneMap — segmentos de 400–1200 m em cadeia de Markov (campo→subúrbio→urbano→…), parâmetros misturados suavemente nas fronteiras (150 m) +
//    ruído de baixa frequência INDEPENDENTE por lado → densidade variável, manchas, lados diferentes, grupos e clareiras, nunca fileiras uniformes.
//  · PERFORMANCE: cada modelo do GLB é carregado uma vez (scenery_models.js) e desenhado com UM InstancedMesh (geometria/material/textura compartilhados);
//    as matrizes ficam guardadas por chunk e só os chunks visíveis (frustum + distância) são copiados para os buffers (a 10 Hz); árvores distantes são
//    afinadas (subconjunto fixo por chunk); tetos por chunk (16 prédios, 72 árvores) e por pool; sem colisão para árvores; prédios usam UMA caixa orientada.
//  · COLISÃO: caixa simples por prédio (o carro = 3 círculos, como nas rochas): empurra o carro para fora, corta a velocidade contra a parede; batida forte
//    chama onHit → Game._damage (mesmo sistema de vidas). Os prédios ficam ≥ 13 m do asfalto: a pista nunca é bloqueada.
//  · FUTURO (destruição): cada objeto é um registro {state, m, …}; `setState(rec, ST.BURNED…)` troca o modelo por uma variante (`model.variants[state]`) e
//    refaz as instâncias do chunk; `onMeteorImpact` já identifica os prédios atingidos e chama `onBuildingHit`. Nada visual é feito ainda.
import * as THREE from 'three';
import {CHUNK_LEN,CHUNK_N} from './world.js';
import {ground} from './terrain.js';
import {mulberry32,lerp,smoothstep,clamp,gnoise2} from './utils.js';
import {CAR_R,CAR_OFFS} from './meteors.js';
import {CLS_ORDER} from './scenery_models.js';
import {gradeMaterial} from './atmosphere.js';

export const AHEAD=9,BEHIND=2,TREE_AHEAD=6;   // janela em chunks
export const MAX_BLD=16,MAX_TREE=72;           // tetos por chunk
export const ST={INTACT:0,DAMAGED:1,BURNED:2,RUINED:3};   // estados de um prédio (só INTACT é usado hoje)
export const ZONES=['CAMPO','RURAL','SUBÚRBIO','URBANO'];
const TAU=Math.PI*2,GRID=64,BIN=24,PLINTH_EXTRA=3.4,BL=150,REFRESH=.1,HIT_SPEED=6;
const key=(i,j)=>(i+32768)*65536+(j+32768);

// ------------------------------------------------------------------------------------------------------ regiões
// lot: eventos de construção por 100 m (por lado) · grove: bosques por 100 m · iso: árvores isoladas por 100 m · e0/e1: distância ao asfalto da 1ª fila (m)
// grp: tamanho médio do grupo · rows: chance de 2ª fila · jit: giro aleatório da fachada (rad) · gv: variação do vão entre prédios (m)
const ZP=[
  {lot:.12,grove:1.7,iso:4.5,e0:16,e1:130,grp:1.2,rows:0,  jit:.35,gv:30},   // CAMPO: muitas árvores, poucos prédios
  {lot:.07,grove:1.0,iso:2.6,e0:24,e1:170,grp:1.0,rows:0,  jit:.6, gv:50},   // RURAL: casas isoladas, grandes áreas abertas
  {lot:.75,grove:.8,iso:3.2,e0:13,e1:62, grp:2.0,rows:.4, jit:.12,gv:16},   // SUBÚRBIO: casas, algumas árvores, poucos prédios maiores
  {lot:1.25,grove:.3,iso:1.8,e0:10,e1:36, grp:2.6,rows:.55,jit:.06,gv:8},   // URBANO: mais prédios, hotéis, construções grandes, pouco vazio
];
const ZMIX=[[.72,.2,.05,0,.03],[.9,.08,0,0,.02],[.58,.17,.15,.04,.06],[.12,.2,.3,.2,.18]];   // casa · comércio · apartamento · hotel · grande
const ZTR=[[.12,.33,.55,0],[.35,.15,.5,0],[.2,.1,.15,.55],[.1,0,.55,.35]];                      // transições: de CAMPO/RURAL/SUBÚRBIO/URBANO para …
const FIELDS=['lot','grove','iso','e0','e1','grp','rows','jit','gv'];
export class ZoneMap{
  constructor(seed){this.rng=mulberry32(Math.imul(seed,0x9e3779b1)^0x9e3779b9);this.segs=[];this.k=0;}
  _more(){
    const L=this.segs[this.segs.length-1];let z,len;
    if(!L){z=0;len=420+this.rng()*220;}                                    // a corrida começa em campo aberto…
    else if(this.segs.length===1){z=2;len=560+this.rng()*300;}             // …e logo vira subúrbio (o cenário evolui cedo)
    else{const w=ZTR[L.z];let r=this.rng()*(w[0]+w[1]+w[2]+w[3]);z=3;for(let i=0;i<4;i++){r-=w[i];if(r<=0){z=i;break;}}len=z===3?420+this.rng()*520:520+this.rng()*700;}
    const a=L?L.b:0;this.segs.push({a,b:a+len,z});
  }
  seg(s){while(!this.segs.length||this.segs[this.segs.length-1].b<=s+BL+10)this._more();
    let k=Math.min(this.k,this.segs.length-1);while(k>0&&s<this.segs[k].a)k--;while(s>=this.segs[k].b)k++;this.k=k;return k;}
  // parâmetros em s (misturados com a região vizinha perto das fronteiras → sem degraus). `o` é reaproveitado.
  at(s,o){
    const k=this.seg(s),sg=this.segs[k],zw=o.zw||(o.zw=[0,0,0,0]),cm=o.cm||(o.cm=[0,0,0,0,0]);zw[0]=zw[1]=zw[2]=zw[3]=0;
    const wp=k>0&&s-sg.a<BL?.5*(1-(s-sg.a)/BL):0,wn=sg.b-s<BL?.5*(1-(sg.b-s)/BL):0;
    zw[sg.z]+=1-wp-wn;if(wp)zw[this.segs[k-1].z]+=wp;if(wn)zw[this.segs[k+1].z]+=wn;
    for(const f of FIELDS){let v=0;for(let z=0;z<4;z++)v+=zw[z]*ZP[z][f];o[f]=v;}
    for(let c=0;c<5;c++){let v=0;for(let z=0;z<4;z++)v+=zw[z]*ZMIX[z][c];cm[c]=v;}
    let bz=0;for(let z=1;z<4;z++)if(zw[z]>zw[bz])bz=z;o.zone=bz;return o;
  }
}
const pickW=(w,rng)=>{let t=0;for(let i=0;i<w.length;i++)t+=w[i];let r=rng()*t;for(let i=0;i<w.length;i++){r-=w[i];if(r<=0)return i;}return w.length-1;};
const gauss=rng=>(rng()+rng()+rng()-1.5)*1.15;

// ------------------------------------------------------------------------------------------------------ geometria 2D
// caixa orientada de um prédio: centro (x,z), giro yaw do modelo, meias-extensões nos eixos do MODELO (hx em x, hz em z)
const toLocal=(b,x,z,o)=>{const dx=x-b.x,dz=z-b.z;o.x=dx*b.c-dz*b.s;o.z=dx*b.s+dz*b.c;return o;};   // inverso de Ry(yaw): (lx,lz) → mundo = (lx·c+lz·s, −lx·s+lz·c)
const _q={x:0,z:0};
function obbDist(b,x,z,m=0){   // distância (m) de um ponto à caixa (0 = dentro) — usada com folga m já subtraída pelo chamador
  toLocal(b,x,z,_q);const ex=Math.max(0,Math.abs(_q.x)-b.hx-m),ez=Math.max(0,Math.abs(_q.z)-b.hz-m);return Math.hypot(ex,ez);}
function obbOverlap(a,b,m){   // SAT em 2D, com folga m entre as caixas
  const ax=[a.c,-a.s,a.s,a.c],bx=[b.c,-b.s,b.s,b.c],dx=b.x-a.x,dz=b.z-a.z;
  for(const [u,v] of[[ax[0],ax[1]],[ax[2],ax[3]],[bx[0],bx[1]],[bx[2],bx[3]]]){   // eixos: (c,−s) é o eixo x do modelo, (s,c) o eixo z
    const d=Math.abs(dx*u+dz*v);
    const ra=a.hx*Math.abs(ax[0]*u+ax[1]*v)+a.hz*Math.abs(ax[2]*u+ax[3]*v),rb=b.hx*Math.abs(bx[0]*u+bx[1]*v)+b.hz*Math.abs(bx[2]*u+bx[3]*v);
    if(d>ra+rb+m)return false;}
  return true;
}

// ------------------------------------------------------------------------------------------------------ sistema
const _g={},_g1={},_g2={},_zp={zw:[0,0,0,0],cm:[0,0,0,0,0]};
export class SceneryManager{
  constructor(scene,{seed=7}={}){
    this.scene=scene;this.seed=seed;this.lib=null;this.track=null;this.P=null;this.onHit=null;this.onBuildingHit=null;
    this.zones=new ZoneMap(seed);this.chunks=new Map();this.job=null;this.bgrid=new Map();this.tgrid=new Map();this.pools=new Map();this.plinth=null;
    this.dirty=true;this.rt=0;this.tw=[];this._pl=new Float64Array(24);this._M=new Float64Array(16);
    this.stats={chunks:0,bld:0,trees:0,drawnB:0,drawnT:0,hits:0,genChunks:0,genMs:0,maxStepMs:0,collisions:0,byModel:{},rej:{}};
  }
  bind(track,player){this.track=track;this.P=player;}
  // biblioteca de modelos (scenery_models.js), entregue UMA vez
  setLibrary(lib){
    this.lib=lib;if(!lib)return;const T=THREE;
    for(const m of lib.models){const cap=m.kind==='bld'?96:480,mesh=new T.InstancedMesh(m.geometry,m.material,cap);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;mesh.name='sc_'+m.id;this.scene.add(mesh);
      this.pools.set(m.idx,{mesh,cap,n:0});}
    // fundação dos prédios: caixa unitária (topo em y=0, desce 1) esticada por instância; UM InstancedMesh para todos
    const bg=new T.BoxGeometry(1,1,1);if(bg.translate)bg.translate(0,-.5,0);const bm=gradeMaterial(new T.MeshLambertMaterial({color:0x77726a}),{sat:.6,bright:.8,tint:[1.1,.9,.76]}),pm=new T.InstancedMesh(bg,bm,192);
    pm.instanceMatrix.setUsage(T.DynamicDrawUsage);pm.frustumCulled=false;pm.count=0;pm.visible=false;pm.name='sc_plinth';this.scene.add(pm);this.plinth={mesh:pm,cap:192,n:0,geo:bg,mat:bm};
    this.tw=new Array(lib.trees.length).fill(1);this.dirty=true;
  }
  reseed(seed){this.seed=seed;}   // nova semente da partida (chamar antes de reset())
  reset(){   // novo mundo (reinício): descarta tudo (as instâncias e as grades); a biblioteca e os pools de instâncias continuam
    this.chunks.clear();this.job=null;this.bgrid.clear();this.tgrid.clear();this.zones=new ZoneMap(this.seed);this.dirty=true;this.rt=0;
    for(const p of this.pools.values()){p.n=0;p.mesh.count=0;p.mesh.visible=false;}if(this.plinth){this.plinth.n=0;this.plinth.mesh.count=0;this.plinth.mesh.visible=false;}
    for(const k of['chunks','bld','trees','drawnB','drawnT','hits','genChunks','genMs','maxStepMs','collisions'])this.stats[k]=0;this.stats.byModel={};this.stats.rej={};
  }
  // ---------------------------------------------------------------- grades espaciais
  _cells(grid,x,z,r,fn){const i0=Math.floor((x-r)/GRID),i1=Math.floor((x+r)/GRID),j0=Math.floor((z-r)/GRID),j1=Math.floor((z+r)/GRID);
    for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)fn(i,j);}
  _add(grid,rec,r){this._cells(grid,rec.x,rec.z,r,(i,j)=>{const k=key(i,j);let a=grid.get(k);if(!a)grid.set(k,a=[]);a.push(rec);});}
  _del(grid,rec,r){this._cells(grid,rec.x,rec.z,r,(i,j)=>{const k=key(i,j),a=grid.get(k);if(!a)return;const n=a.indexOf(rec);if(n>=0){a[n]=a[a.length-1];a.pop();}if(!a.length)grid.delete(k);});}
  _rad(rec){return rec.kind==='bld'?Math.hypot(rec.hx,rec.hz)+1:rec.r+1;}
  _drop(ch){for(const r of ch.recs)this._del(r.kind==='bld'?this.bgrid:this.tgrid,r,this._rad(r));ch.recs.length=0;ch.groups.length=0;}
  // ---------------------------------------------------------------- amostragem do terreno
  _rej(k){this.stats.rej[k]=(this.stats.rej[k]||0)+1;return null;}
  _gnd(x,z,o=_g){return ground(this.track,x,z,o,0);}
  _mod(s,sd){return clamp(1+.8*gnoise2(s/430+sd*17.3+(this.seed%100003)*.37,sd*3.1+.5),.15,2);}   // ruído de baixa frequência INDEPENDENTE por lado: manchas e lados diferentes
  // ---------------------------------------------------------------- fase A: prédios de um chunk (gerador: cede a vez entre eventos)
  *_genA(ch){
    const rng=mulberry32((this.seed*7919+ch.c*104729+11)>>>0),zp=_zp,tr=this.track;
    tr.ensureZ(tr.get((ch.c+1)*CHUNK_N).z-1200);   // a pista precisa existir além do alcance dos filtros do terreno (≈950 m) → alturas definitivas
    const n=CHUNK_LEN/BIN;
    for(const sd of(rng()<.5?[-1,1]:[1,-1])){
      for(let b=0;b<n&&ch.nb<MAX_BLD;b++){
        const s=ch.s0+(b+rng())*BIN;this.zones.at(s,zp);
        if(rng()>=Math.min(.92,zp.lot*this._mod(s,sd)*BIN/100))continue;
        this._group(ch,rng,s,sd,zp);yield;
      }
    }
  }
  _group(ch,rng,s,sd,zp){
    const lib=this.lib,g=Math.min(4,1+Math.floor(-Math.log(1-rng()*.999)*(zp.grp-1))),ed0=lerp(zp.e0,zp.e1,Math.pow(rng(),1.7));let cur=s;
    for(let i=0;i<g&&ch.nb<MAX_BLD&&cur<ch.s1;i++){
      const m=lib.pickBuilding(CLS_ORDER[pickW(zp.cm,rng)],rng);if(!m)continue;
      // o terreno ao lado da pista é talude: busca chão plano afastando-se aos poucos (até 5 posições alternativas por lote)
      let rec=null,edj=Math.max(m.cl.clear,ed0+(rng()-.5)*(6+zp.jit*30));for(let t=0;t<5&&!rec;t++)rec=this._place(ch,m,cur+(t?(rng()-.5)*40:0),sd,edj+t*(8+rng()*16),rng,zp);
      if(rec){
        cur+=rec.fw/2+m.cl.gap+rng()*zp.gv+8;
        if(rng()<zp.rows&&ch.nb<MAX_BLD){   // 2ª fila, atrás da primeira
          const m2=lib.pickBuilding(CLS_ORDER[pickW(zp.cm,rng)],rng);
          if(m2)this._place(ch,m2,Math.min(ch.s1-.01,Math.max(ch.s0,s+(rng()-.5)*14)),sd,ed0+rec.fd+8+rng()*10,rng,zp);}
      }else cur+=10+rng()*14;   // lote recusado (estrada/encosta/sobreposição): tenta mais adiante
    }
  }
  _place(ch,m,s,sd,ed,rng,zp){
    const cl=m.cl,sc=m.scale*lerp(m.sj[0],m.sj[1],rng()),fw=m.fw*sc,fd=m.fd*sc,hb=m.dy*sc,tr=this.track;
    s=clamp(s,ch.s0,ch.s1-1e-3);const sp=tr.sampleAt(s),rx=Math.cos(sp.h),rz=Math.sin(sp.h);
    let j=(rng()-.5)*2*zp.jit;if(zp.jit>.3&&rng()<.12)j=rng()*TAU;                     // campo/rural: às vezes uma casa "torta"
    const yF=Math.atan2(-sd*rx,-sd*rz)+j,fs=Math.sin(yF),fc=Math.cos(yF);               // fachada (+z alinhado) aponta para a estrada ± giro; f=(fs,fc), t=(fc,−fs)
    const hl=Math.abs(Math.cos(j))*fd/2+Math.abs(Math.sin(j))*fw/2,lat=sd*(sp.w+ed+hl),x=sp.x+rx*lat,z=sp.z+rz*lat;
    // pontos de amostra na pegada (u ao longo da fachada, v ao longo da frente): centro, 4 cantos e (prédios longos) meios das bordas
    const big=fw>26,U=fw*.475,V=fd*.475,pts=big?[[0,0],[U,V],[-U,V],[U,-V],[-U,-V],[0,V],[0,-V],[U,0],[-U,0]]:[[0,0],[U,V],[-U,V],[U,-V],[-U,-V]];
    let hmin=1e9,hmax=-1e9;
    for(const [u,v] of pts){const px=x+fc*u+fs*v,pz=z-fs*u+fc*v,G=this._gnd(px,pz);
      if(G.e>=0&&G.e<cl.clear)return this._rej('estrada');                              // perto demais do asfalto (de QUALQUER trecho da pista)
      if(G.h<hmin)hmin=G.h;if(G.h>hmax)hmax=G.h;if(hmax-hmin>cl.range)return this._rej('relevo');}   // encosta/relevo demais sob a pegada
    const y0=hmin+.4*(hmax-hmin);   // base mais perto do ponto baixo: no máx. 60 % do desnível fica enterrado atrás; o resto é coberto pela fundação
    // anel em volta: barranco (chão muito mais baixo) ou morro colado (chão muito mais alto) → recusa
    const au=fw/2+5,av=fd/2+5;let rhi=-1e9,rlo=1e9;
    for(const [u,v] of[[au,0],[-au,0],[0,av],[0,-av]]){const G=this._gnd(x+fc*u+fs*v,z-fs*u+fc*v);if(G.h>rhi)rhi=G.h;if(G.h<rlo)rlo=G.h;}
    if(rhi-y0>.42*hb||y0-rlo>.7*hb)return this._rej('anel');
    const yaw=yF+m.fy,rec={kind:'bld',m,x,y:y0,z,yaw,c:Math.cos(yaw),s:Math.sin(yaw),sc,fw,fd,hx:m.dx*sc/2,hz:m.dz*sc/2,h:hb,fa:yF,pd:y0-hmin+PLINTH_EXTRA,state:ST.INTACT,vm:null,hits:0,ch:ch.c,cls:m.cls};
    const R=this._rad(rec);let bad=false;
    this._cells(this.bgrid,x,z,R+cl.gap,(i,j)=>{if(bad)return;const a=this.bgrid.get(key(i,j));if(a)for(const o of a)if(o!==rec&&obbOverlap(rec,o,Math.max(cl.gap,o.m.cl.gap))){bad=true;return;}});
    if(bad)return this._rej('sobreposição');
    this._cells(this.tgrid,x,z,R+4,(i,j)=>{if(bad)return;const a=this.tgrid.get(key(i,j));if(a)for(const t of a)if(obbDist(rec,t.x,t.z,t.r*.5+1.5)<=0){bad=true;return;}});
    if(bad)return this._rej('árvore');
    this._add(this.bgrid,rec,R);ch.recs.push(rec);ch.nb++;return rec;
  }
  // ---------------------------------------------------------------- fase B: árvores de um chunk
  *_genB(ch){
    const rng=mulberry32((this.seed*7919+ch.c*104729+977)>>>0),zp=_zp,n=CHUNK_LEN/BIN;
    for(const sd of(rng()<.5?[1,-1]:[-1,1])){
      for(let b=0;b<n&&ch.nt<MAX_TREE;b++){
        const s=ch.s0+(b+rng())*BIN;this.zones.at(s,zp);const mod=this._mod(s,sd);
        if(rng()<Math.min(.9,zp.grove*mod*BIN/100)){   // bosque: centro + espalhamento gaussiano (grupo irregular, não fileira)
          const ec=lerp(7,Math.max(20,zp.e1*.8),Math.pow(rng(),1.5)),rad=10+rng()*30,cnt=3+Math.floor(rng()*(5+10*smoothstep(0,1.2,zp.grove)));
          for(let i=0;i<cnt;i++)this._tree(ch,rng,s+gauss(rng)*rad*.9,sd,ec+gauss(rng)*rad*.8,.75+.35*rng(),zp);
        }
        const k=zp.iso*mod*BIN/100,ni=Math.floor(k)+(rng()<k-Math.floor(k)?1:0);
        for(let i=0;i<ni;i++)this._tree(ch,rng,ch.s0+(b+rng())*BIN,sd,6.5+Math.pow(rng(),1.8)*(Math.max(30,zp.e1)),1,zp);
        yield;
      }
    }
  }
  _tree(ch,rng,s,sd,ed,size,zp){
    if(ch.nt>=MAX_TREE||s<ch.s0||s>=ch.s1)return this._rej('t:fora');
    const lib=this.lib,T=lib.trees;for(let i=0;i<T.length;i++){let v=0;for(let z=0;z<4;z++)v+=zp.zw[z]*(T[i].zw?T[i].zw[z]:1);this.tw[i]=v;}
    const m=lib.pickTree(this.tw,rng);if(!m)return null;
    const sc=m.scale*lerp(m.sj[0],m.sj[1],Math.pow(rng(),1.5))*size*(rng()<.04?1.4:1),r=m.crown*sc;   // 4 %: árvore "velha" bem maior
    if(ed<6.5+r*.2)ed=6.5+r*.2;
    const tr=this.track,sp=tr.sampleAt(s),rx=Math.cos(sp.h),rz=Math.sin(sp.h),lat=sd*(sp.w+ed),x=sp.x+rx*lat,z=sp.z+rz*lat;
    const G=this._gnd(x,z);if(G.e>=0&&G.e<6.5+r*.2)return this._rej('t:estrada');
    const h0=G.h;let bad=false;
    this._cells(this.tgrid,x,z,r+2,(i,j)=>{if(bad)return;const a=this.tgrid.get(key(i,j));if(a)for(const t of a){const dx=t.x-x,dz=t.z-z,mm=.5*(t.r+r);if(dx*dx+dz*dz<mm*mm){bad=true;return;}}});
    if(bad)return this._rej('t:árvore');
    this._cells(this.bgrid,x,z,r+4,(i,j)=>{if(bad)return;const a=this.bgrid.get(key(i,j));if(a)for(const b of a)if(obbDist(b,x,z,r*.5+1.5)<=0){bad=true;return;}});
    if(bad)return this._rej('t:prédio');
    const G1=this._gnd(x+3,z,_g1),gx=(G1.h-h0)/3,G2=this._gnd(x,z+3,_g2),gz=(G2.h-h0)/3;   // inclinação local (2 amostras extras só para árvores aceitas)
    if(Math.hypot(gx,gz)>.85)return this._rej('t:encosta');
    const il=1/Math.hypot(gx,1,gz),ux=.5*(-gx*il),uy=.5+.5*il,uz=.5*(-gz*il),ul=1/Math.hypot(ux,uy,uz);   // meio-termo entre vertical e normal do terreno
    const rec={kind:'tree',m,x,y:h0-.25,z,yaw:rng()*TAU,sc,r,ux:ux*ul,uy:uy*ul,uz:uz*ul,k:rng(),ch:ch.c,state:0};
    this._add(this.tgrid,rec,r+1);ch.recs.push(rec);ch.nt++;return rec;
  }
  // ---------------------------------------------------------------- matrizes de instância (column-major) guardadas por chunk
  _mB(a,o,rec,m){const k=rec.sc,c=rec.c*k,s=rec.s*k,f=m.off;   // eixos X=(c,0,−s)k  Y=(0,k,0)  Z=(s,0,c)k  (+ recentragem do modelo)
    a[o]=c;a[o+1]=0;a[o+2]=-s;a[o+3]=0;a[o+4]=0;a[o+5]=k;a[o+6]=0;a[o+7]=0;a[o+8]=s;a[o+9]=0;a[o+10]=c;a[o+11]=0;
    a[o+12]=rec.x+c*f[0]+s*f[2];a[o+13]=rec.y+k*f[1];a[o+14]=rec.z-s*f[0]+c*f[2];a[o+15]=1;}
  _mT(a,o,rec,m){const k=rec.sc,ux=rec.ux,uy=rec.uy,uz=rec.uz,cy=Math.cos(rec.yaw),sy=Math.sin(rec.yaw),d=cy*ux;   // Y = vetor "para cima"; X = eixo yaw projetado ⟂ Y; Z = X×Y
    let xx=cy-d*ux,xy=-d*uy,xz=-sy-d*uz;const xl=1/Math.hypot(xx,xy,xz);xx*=xl;xy*=xl;xz*=xl;
    const zx=xy*uz-xz*uy,zy=xz*ux-xx*uz,zz=xx*uy-xy*ux,f=m.off;
    a[o]=xx*k;a[o+1]=xy*k;a[o+2]=xz*k;a[o+3]=0;a[o+4]=ux*k;a[o+5]=uy*k;a[o+6]=uz*k;a[o+7]=0;a[o+8]=zx*k;a[o+9]=zy*k;a[o+10]=zz*k;a[o+11]=0;
    a[o+12]=rec.x+xx*k*f[0]+ux*k*f[1]+zx*k*f[2];a[o+13]=rec.y+xy*k*f[0]+uy*k*f[1]+zy*k*f[2];a[o+14]=rec.z+xz*k*f[0]+uz*k*f[1]+zz*k*f[2];a[o+15]=1;}
  _mP(a,o,rec){const c=rec.c,s=rec.s,W=rec.hx*2*.97,D=rec.hz*2*.97,H=rec.pd;   // fundação: topo em y (um pouco abaixo), desce pd
    a[o]=c*W;a[o+1]=0;a[o+2]=-s*W;a[o+3]=0;a[o+4]=0;a[o+5]=H;a[o+6]=0;a[o+7]=0;a[o+8]=s*D;a[o+9]=0;a[o+10]=c*D;a[o+11]=0;a[o+12]=rec.x;a[o+13]=rec.y-.02;a[o+14]=rec.z;a[o+15]=1;}
  _build(ch){   // (re)monta as matrizes do chunk a partir dos registros vivos; calcula a esfera de culling
    const by=new Map(),lib=this.lib;let sx=0,sz=0,sy=0,n=0;const pl=[];
    for(const r of ch.recs){const m=r.vm||r.m;let a=by.get(m.idx);if(!a)by.set(m.idx,a=[]);a.push(r);sx+=r.x;sy+=r.y;sz+=r.z;n++;if(r.kind==='bld')pl.push(r);}
    ch.groups.length=0;let cx=0,cy=0,cz=0,cr=0;
    if(n){cx=sx/n;cy=sy/n;cz=sz/n;for(const r of ch.recs){const d=Math.hypot(r.x-cx,r.z-cz)+(r.kind==='bld'?r.h*.5+Math.hypot(r.hx,r.hz):r.r*2+r.m.height*r.sc*.5);if(d>cr)cr=d;}}
    ch.cx=cx;ch.cy=cy;ch.cz=cz;ch.cr=cr+20;
    for(const [mi,arr] of by){const m=lib.models[mi],tree=m.kind==='tree';if(tree)arr.sort((p,q)=>p.k-q.k);   // árvores ordenadas por k: o afinamento por distância usa sempre o mesmo subconjunto
      const mats=new Float32Array(arr.length*16);for(let i=0;i<arr.length;i++)(tree?this._mT:this._mB).call(this,mats,i*16,arr[i],m);
      ch.groups.push({pi:mi,n:arr.length,mats,thin:tree,tree,recs:arr});}
    if(pl.length){const mats=new Float32Array(pl.length*16);for(let i=0;i<pl.length;i++)this._mP(mats,i*16,pl[i]);ch.groups.push({pi:-1,n:pl.length,mats,thin:false,tree:false});}
    ch.dirty=false;
  }
  // ---------------------------------------------------------------- ciclo de vida dos chunks
  _newChunk(c){return{c,s0:c*CHUNK_LEN,s1:(c+1)*CHUNK_LEN,recs:[],nb:0,nt:0,A:false,B:false,groups:[],cx:0,cy:0,cz:0,cr:0,dirty:true};}
  _nextJob(ci,hiA,hiB){   // próximo trabalho: do chunk atual para a frente (A = prédios; B = árvores, só com os prédios do chunk seguinte já prontos), depois os de trás
    const order=[];for(let i=ci;i<=ci+hiA;i++)order.push(i);for(let i=ci-1;i>=ci-BEHIND;i--)order.push(i);
    for(const i of order){
      if(i<0)continue;const ch=this.chunks.get(i);
      if(!ch){const nc=this._newChunk(i);this.job={c:i,ch:nc,gen:this._genA(nc),phase:'A',ms:0};return true;}
      if(!ch.B&&i<=ci+hiB){const nx=this.chunks.get(i+1);if(i+1>ci+hiA||(nx&&nx.A)||i<=ci){this.job={c:i,ch,gen:this._genB(ch),phase:'B',ms:0};return true;}}
    }
    return false;
  }
  _finish(){
    const j=this.job,ch=j.ch;this.job=null;
    if(j.phase==='A'){ch.A=true;this.chunks.set(ch.c,ch);}else ch.B=true;
    this._build(ch);this.dirty=true;this.stats.genChunks++;this.stats.genMs+=j.ms;
  }
  // Gera em fatias de `ms` milissegundos. `hiA/hiB`: alcance (chunks à frente) permitido nesta chamada.
  _gen(ms,ci,hiA=AHEAD,hiB=TREE_AHEAD){
    const end=performance.now()+ms;
    while(performance.now()<end||ms===Infinity){
      if(!this.job&&!this._nextJob(ci,hiA,hiB))return true;
      const t0=performance.now(),r=this.job.gen.next();const d=performance.now()-t0;this.job.ms+=d;if(d>this.stats.maxStepMs)this.stats.maxStepMs=d;
      if(r.done)this._finish();
    }
    return false;
  }
  // Para carga síncrona (testes/ferramentas): gera tudo até hiA/hiB chunks à frente do jogador.
  flush(hiA=AHEAD,hiB=TREE_AHEAD){const ci=Math.floor(this.P.s/CHUNK_LEN);this._cleanup(ci);while(!this._gen(Infinity,ci,hiA,hiB));this.dirty=true;}
  _cleanup(ci){
    for(const [c,ch] of this.chunks)if(c<ci-BEHIND||c>ci+AHEAD+1){this._drop(ch);this.chunks.delete(c);this.dirty=true;}
    if(this.job&&(this.job.c<ci-BEHIND||this.job.c>ci+AHEAD+1)){this._drop(this.job.ch);this.job=null;}
  }
  // ---------------------------------------------------------------- por frame
  update(dt,cam,ms=2.5){
    if(!this.lib||!this.track||!this.P)return;
    const ci=Math.floor(this.P.s/CHUNK_LEN);this._cleanup(ci);this._gen(ms,ci);
    this.rt-=dt;if(this.dirty||this.rt<=0){this._refresh(cam);this.rt=REFRESH;this.dirty=false;}
  }
  _frustum(cam){   // 6 planos (Gribb–Hartmann) de projectionMatrix × matrixWorldInverse; false se as matrizes não prestam
    const p=cam&&cam.projectionMatrix&&cam.projectionMatrix.elements,v=cam&&cam.matrixWorldInverse&&cam.matrixWorldInverse.elements;if(!p||!v)return false;
    const M=this._M,pl=this._pl;for(let r=0;r<4;r++)for(let c=0;c<4;c++){let s=0;for(let k=0;k<4;k++)s+=p[k*4+r]*v[c*4+k];M[c*4+r]=s;}
    const R=(r,c)=>M[c*4+r];let i=0;
    for(const [r,sg] of[[0,1],[0,-1],[1,1],[1,-1],[2,1],[2,-1]]){
      const a=R(3,0)+sg*R(r,0),b=R(3,1)+sg*R(r,1),c=R(3,2)+sg*R(r,2),d=R(3,3)+sg*R(r,3),l=Math.hypot(a,b,c)||1;pl[i++]=a/l;pl[i++]=b/l;pl[i++]=c/l;pl[i++]=d/l;
      if(!isFinite(a+b+c+d))return false;}
    return true;
  }
  _refresh(cam){   // junta nos buffers de instância SÓ os chunks visíveis (frustum + perto do jogador); árvores distantes afinadas
    const P=this.P,ok=this._frustum(cam),pl=this._pl;let nb=0,nt=0,tb=0,tt=0;
    for(const p of this.pools.values())p.n=0;if(this.plinth)this.plinth.n=0;
    for(const ch of this.chunks.values()){
      if(!ch.groups.length)continue;if(ch.dirty)this._build(ch);
      const dx=ch.cx-P.x,dz=ch.cz-P.z;let vis=Math.hypot(dx,dz)<ch.cr+260;   // sempre inclui o que está em volta do carro (curvas rápidas da câmera)
      if(!vis&&ok){vis=true;for(let i=0;i<24;i+=4)if(pl[i]*ch.cx+pl[i+1]*ch.cy+pl[i+2]*ch.cz+pl[i+3]<-ch.cr){vis=false;break;}}else if(!ok)vis=true;
      const d=Math.max(0,(ch.c+.5)*CHUNK_LEN-P.s),tf=1-.7*smoothstep(750,1800,d);
      for(const gr of ch.groups){
        const pool=gr.pi<0?this.plinth:this.pools.get(gr.pi);if(!pool)continue;
        if(gr.tree)tt+=gr.n;else if(gr.pi>=0)tb+=gr.n;
        if(!vis)continue;
        let n=gr.thin?Math.ceil(gr.n*tf):gr.n;n=Math.min(n,pool.cap-pool.n);if(n<=0)continue;
        pool.mesh.instanceMatrix.array.set(n===gr.n?gr.mats:gr.mats.subarray(0,n*16),pool.n*16);pool.n+=n;
        if(gr.tree)nt+=n;else if(gr.pi>=0)nb+=n;}
    }
    for(const p of[...this.pools.values(),this.plinth]){if(!p)continue;p.mesh.count=p.n;p.mesh.visible=p.n>0;p.mesh.instanceMatrix.needsUpdate=true;}
    const S=this.stats;S.chunks=this.chunks.size;S.drawnB=nb;S.drawnT=nt;S.bld=tb;S.trees=tt;
  }
  // ---------------------------------------------------------------- colisão carro × prédios (caixa por prédio; carro = 3 círculos; árvores NÃO colidem)
  collide(P){
    if(!this.bgrid.size)return null;
    const cx=Math.floor(P.x/GRID),cz=Math.floor(P.z/GRID),fx=Math.sin(P.psi),fz=-Math.cos(P.psi),rx=Math.cos(P.psi),rz=Math.sin(P.psi);let hit=null;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=this.bgrid.get(key(cx+a,cz+b));if(!arr)continue;
      for(const B of arr){if(B.state>=ST.RUINED)continue;
        const R=Math.hypot(B.hx,B.hz)+CAR_R+4;if(Math.abs(B.x-P.x)>R||Math.abs(B.z-P.z)>R)continue;
        for(const off of CAR_OFFS){
          const px=P.x+fx*off,pz=P.z+fz*off;toLocal(B,px,pz,_q);
          const qx=_q.x,qz=_q.z,ex=Math.abs(qx)-B.hx,ez=Math.abs(qz)-B.hz;let nlx,nlz,pen;   // normal em coordenadas do modelo
          if(ex>0||ez>0){const d=Math.hypot(Math.max(ex,0),Math.max(ez,0));if(d>=CAR_R)continue;
            const cxl=clamp(qx,-B.hx,B.hx),czl=clamp(qz,-B.hz,B.hz),dx=qx-cxl,dz=qz-czl;nlx=dx/(d||1);nlz=dz/(d||1);pen=CAR_R-d;}
          else{if(ex>ez){nlx=qx>0?1:-1;nlz=0;pen=CAR_R-ex;}else{nlx=0;nlz=qz>0?1:-1;pen=CAR_R-ez;}}   // centro do círculo dentro da caixa: sai pelo lado mais raso
          const nx=nlx*B.c+nlz*B.s,nz=-nlx*B.s+nlz*B.c;   // normal no mundo (Ry(yaw))
          P.x+=nx*pen;P.z+=nz*pen;
          const vn=P.vx*nx+P.vz*nz;if(vn<0){P.vx-=1.15*vn*nx;P.vz-=1.15*vn*nz;}
          const lat=(B.x-P.x)*rx+(B.z-P.z)*rz;P.yawRate+=-(lat>=0?1:-1)*clamp(-vn/30,0,.5)*(off>0?1:off<0?-.4:0);
          if(!hit)hit={x:B.x,z:B.z,speed:Math.max(0,-vn),building:B};else hit.speed=Math.max(hit.speed,-vn);
        }}}
    if(hit){P.mesh.position.x=P.x;P.mesh.position.z=P.z;P.speed=Math.max(0,P.vx*fx+P.vz*fz);this.stats.collisions++;if(this.onHit&&hit.speed>=HIT_SPEED)this.onHit(hit);}
    return hit;
  }
  // ---------------------------------------------------------------- ganchos da futura destruição (nada visual por enquanto)
  buildingsNear(x,z,r,out=[]){out.length=0;this._cells(this.bgrid,x,z,r,(i,j)=>{const a=this.bgrid.get(key(i,j));if(a)for(const b of a)if(!out.includes(b)&&obbDist(b,x,z,0)<=r)out.push(b);});return out;}
  onMeteorImpact(e){   // meteoro caiu: marca os prédios dentro do raio de explosão (e.R); `onBuildingHit(rec,e)` é o ponto de extensão (queimar/destruir)
    if(!this.bgrid.size)return;const hits=this.buildingsNear(e.x,e.z,(e.R||10)*1.1);
    for(const b of hits){b.hits++;this.stats.hits++;if(this.onBuildingHit)this.onBuildingHit(b,e);}
  }
  setState(rec,state){   // troca o estado e, se o modelo tiver variante para ele (`variants[state]` = id de outro modelo do GLB), refaz as instâncias do chunk
    rec.state=state;const v=rec.m.variants&&rec.m.variants[state];rec.vm=v&&this.lib.byId[v]||null;
    const ch=this.chunks.get(rec.ch);if(ch){ch.dirty=true;this.dirty=true;}
  }
}
