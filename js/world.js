// Gerencia o mundo:
//  - ESTRADA: chunks ao longo da pista (buffers fixos reutilizados via pool).
//  - TERRENO: quadtree de tiles alinhados ao mundo (LOD por distância ao jogador), independente do traçado da pista.
//    Tiles são amostrados em fatias de tempo (sem travar o frame), reciclados por pool, e só saem de cena depois que
//    os tiles que os substituem estão prontos (nunca aparece buraco). Frustum culling: automático (bounding sphere).
import * as THREE from 'three';
import {STEP,fillRoad,TEX_A} from './road.js';
import {gradeMaterial} from './atmosphere.js';
import {TILE_N,MIN_TILE,LEVELS,ROOT,TILE_VERTS,TileSampler,buildTileIndex} from './terrain.js';
export const CHUNK_N=48, CHUNK_LEN=CHUNK_N*STEP;
const SPLIT=1.0;          // um tile é subdividido enquanto o jogador estiver a < SPLIT×tamanho dele
const MAXD=6000;          // alcance do terreno (m)

function roadIndex(rows){const a=[];
  for(let r=0;r<rows;r++)for(let q=0;q<3;q++){const i=r*4+q,j=i+1,k=i+4,l=k+1;a.push(i,j,k,j,l,k);}
  return new THREE.BufferAttribute(new Uint32Array(a),1);}

// Textura do asfalto: 512 px de largura. Acostamento (40 px = 4 m), 6 faixas no miolo, faixa dupla amarela, pontilhadas brancas.
// Comprimento: 512 px = 16 m (traço de 6 m).
function roadTexture(){
  const c=document.createElement('canvas');c.width=c.height=512;const g=c.getContext('2d');
  g.fillStyle='#37383d';g.fillRect(0,0,512,512);
  g.fillStyle='#45464a';g.fillRect(0,0,40,512);g.fillRect(472,0,40,512);                        // acostamento mais claro
  for(let i=0;i<2600;i++){g.fillStyle=`rgba(${Math.random()<.5?'255,255,255':'0,0,0'},${Math.random()*.06})`;g.fillRect(Math.random()*512,Math.random()*512,1+Math.random()*3,1+Math.random()*3);}
  const inner=432,lane=inner/6;
  g.fillStyle='rgba(0,0,0,.10)';for(let l=0;l<6;l++){const cx=40+lane*(l+.5);g.fillRect(cx-lane*.32,0,lane*.12,512);g.fillRect(cx+lane*.2,0,lane*.12,512);}   // trilhas de pneu
  g.fillStyle='#e9e9e9';g.fillRect(33,0,7,512);g.fillRect(472,0,7,512);                         // linhas de borda
  g.fillStyle='#f0c02a';g.fillRect(249,0,3,512);g.fillRect(260,0,3,512);                        // faixa dupla
  g.fillStyle='#e9e9e9';for(const f of[1,2,4,5])g.fillRect(40+lane*f-1.5,0,3,192);             // divisórias tracejadas
  const t=new THREE.CanvasTexture(c);t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}

export class World{
  constructor(scene,track,{ahead=20,behind=2}={}){
    Object.assign(this,{scene,track,ahead,behind});
    this.active=new Map();this.pool=[];                                   // chunks de estrada
    this.roadMat=gradeMaterial(new THREE.MeshLambertMaterial({map:roadTexture(),polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),{sat:.75,bright:.9,tint:[1.08,.92,.82]});   // asfalto: só um grading mais quente/escuro (visual)
    this.rIdx=roadIndex(CHUNK_N);
    this.terrMats=[];for(let l=0;l<LEVELS;l++)this.terrMats.push(gradeMaterial(new THREE.MeshLambertMaterial({vertexColors:true,polygonOffset:l>0,polygonOffsetFactor:l,polygonOffsetUnits:l}),{sat:.5,bright:.78,tint:[1.14,.88,.72]}));   // LOD grosso "recua" onde sobrepõe o fino
    this.tIdx=new THREE.BufferAttribute(buildTileIndex(),1);
    this.tiles=new Map();this.tilePool=[];this.sampler=new TileSampler();this.job=null;
    this.want=[];this.wantMap=new Map();this.qx=1e9;this.qz=1e9;this.stats={built:0,ms:0};
  }
  // ---------------- estrada
  _makeRoad(){
    const dyn=(n,s)=>new THREE.BufferAttribute(new Float32Array(n),s).setUsage(THREE.DynamicDrawUsage),rv=4*(CHUNK_N+1),rg=new THREE.BufferGeometry();
    rg.setAttribute('position',dyn(rv*3,3));rg.setAttribute('uv',dyn(rv*2,2));rg.setIndex(this.rIdx);
    const mesh=new THREE.Mesh(rg,this.roadMat);return{mesh,rg};
  }
  _buildRoad(ch,c){
    const rg=ch.rg,rp=rg.attributes.position,ru=rg.attributes.uv;
    fillRoad(this.track,c*CHUNK_N,CHUNK_N,rp.array,ru.array);
    rp.needsUpdate=ru.needsUpdate=true;rg.computeBoundingSphere();rg.computeVertexNormals();
  }
  _updateRoad(s,budget){
    const ci=Math.floor(s/CHUNK_LEN),lo=ci-this.behind,hi=ci+this.ahead;
    for(const [c,ch] of this.active)if(c<lo||c>hi){this.scene.remove(ch.mesh);this.active.delete(c);this.pool.push(ch);}
    const order=[];for(let c=ci;c<=hi;c++)order.push(c);for(let c=ci-1;c>=lo;c--)order.push(c);
    for(const c of order){if(budget<=0)break;if(c<0||this.active.has(c))continue;
      const ch=this.pool.pop()||this._makeRoad();this._buildRoad(ch,c);this.scene.add(ch.mesh);this.active.set(c,ch);budget--;}
  }
  // ---------------- terreno
  _makeTile(){
    const dyn=n=>new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage),g=new THREE.BufferGeometry();
    g.setAttribute('position',dyn(TILE_VERTS));g.setAttribute('normal',dyn(TILE_VERTS));g.setAttribute('color',dyn(TILE_VERTS));g.setIndex(this.tIdx);
    return{mesh:new THREE.Mesh(g,this.terrMats[0]),g,key:null,x0:0,z0:0,size:0};
  }
  _collect(px,pz){
    const out=[],rs=ROOT,ix0=Math.floor((px-MAXD)/rs),ix1=Math.floor((px+MAXD)/rs),iz0=Math.floor((pz-MAXD)/rs),iz1=Math.floor((pz+MAXD)/rs);
    for(let ix=ix0;ix<=ix1;ix++)for(let iz=iz0;iz<=iz1;iz++)this._visit(ix*rs,iz*rs,rs,LEVELS-1,px,pz,out);
    out.sort((a,b)=>a.d-b.d);return out;
  }
  _visit(x0,z0,size,level,px,pz,out){
    const dx=Math.max(x0-px,0,px-(x0+size)),dz=Math.max(z0-pz,0,pz-(z0+size)),d=Math.hypot(dx,dz);
    if(d>MAXD)return;
    if(level>0&&d<size*SPLIT){const h=size/2;this._visit(x0,z0,h,level-1,px,pz,out);this._visit(x0+h,z0,h,level-1,px,pz,out);this._visit(x0,z0+h,h,level-1,px,pz,out);this._visit(x0+h,z0+h,h,level-1,px,pz,out);return;}
    out.push({level,x0,z0,size,d,key:level+':'+(x0/size)+':'+(z0/size)});
  }
  _retarget(px,pz){
    this.want=this._collect(px,pz);this.wantMap=new Map(this.want.map(t=>[t.key,t]));this.qx=px;this.qz=pz;this._cleanup();
  }
  _cleanup(){   // remove tile que não é mais desejado SOMENTE se tudo que o substitui já está pronto
    const ov=(a,b)=>a.x0<b.x0+b.size&&b.x0<a.x0+a.size&&a.z0<b.z0+b.size&&b.z0<a.z0+a.size;
    for(const [k,t] of this.tiles){
      if(this.wantMap.has(k))continue;
      let covered=true;for(const w of this.want)if(ov(t,w)&&!this.tiles.has(w.key)){covered=false;break;}
      if(covered){this.scene.remove(t.mesh);this.tiles.delete(k);this.tilePool.push(t);}}
  }
  _startJob(w){
    this.track.ensureZ(w.z0-1150);                                       // a pista precisa existir além do alcance dos filtros (≈950 m) → altura definitiva
    this.sampler.begin(w.x0,w.z0,w.level);this.job=w;
  }
  _finishJob(){
    const w=this.job,t=this.tilePool.pop()||this._makeTile(),g=t.g,P=g.attributes;
    const r=this.sampler.finish(P.position.array,P.normal.array,P.color.array);
    P.position.needsUpdate=P.normal.needsUpdate=P.color.needsUpdate=true;
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3(w.size/2,(r.hmin+r.hmax)/2,w.size/2),Math.hypot(w.size*.7072,(r.hmax-r.hmin)/2+1));
    t.key=w.key;t.x0=w.x0;t.z0=w.z0;t.size=w.size;t.mesh.material=this.terrMats[w.level];t.mesh.position.set(w.x0,0,w.z0);
    this.scene.add(t.mesh);this.tiles.set(w.key,t);this.job=null;this.stats.built++;this._cleanup();
  }
  _work(ms){
    const end=performance.now()+ms;
    while(performance.now()<end){
      if(this.job&&!this.wantMap.has(this.job.key))this.job=null;        // o jogador foi para outro lado: descarta
      if(!this.job){const w=this.want.find(t=>!this.tiles.has(t.key));if(!w)return true;this._startJob(w);}
      if(this.sampler.step(this.track,end))this._finishJob();
    }
    return false;
  }
  // ---------------- API
  preload(px,pz,s,radius=550){     // bloqueia até haver terreno sólido ao redor do jogador; o resto vem em fatias
    this._updateRoad(s,1e9);this._retarget(px,pz);
    while(true){const w=this.want.find(t=>t.d<=radius&&!this.tiles.has(t.key));if(!w)break;this._startJob(w);while(!this.sampler.step(this.track,Infinity));this._finishJob();}
  }
  update(px,pz,s,ms=6){
    const t0=performance.now();
    this._updateRoad(s,2);
    if(Math.hypot(px-this.qx,pz-this.qz)>10)this._retarget(px,pz);
    this._work(ms);
    this.track.prune(Math.max(0,Math.floor(s/STEP)-700));
    this.stats.ms=performance.now()-t0;
  }
  dispose(){   // usado no reinício do jogo: remove da cena e libera tudo que o mundo criou
    const gs=[];for(const ch of this.active.values()){this.scene.remove(ch.mesh);gs.push(ch.rg);}for(const ch of this.pool)gs.push(ch.rg);
    for(const t of this.tiles.values()){this.scene.remove(t.mesh);gs.push(t.g);}for(const t of this.tilePool)gs.push(t.g);
    for(const g of gs)g.dispose();this.active.clear();this.tiles.clear();this.pool.length=0;this.tilePool.length=0;this.job=null;
    this.roadMat.map.dispose();this.roadMat.dispose();for(const m of this.terrMats)m.dispose();
  }
  get loading(){return this.want.filter(t=>!this.tiles.has(t.key)).length;}
}
