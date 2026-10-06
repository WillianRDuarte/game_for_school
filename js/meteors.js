// Sistema de METEOROS: spawn procedural no céu, trajetória visível, aviso de impacto no chão, explosão (partículas),
// cratera permanente (decal) e METEORO CAÍDO: a rocha fica no local do impacto (InstancedMesh) como obstáculo sólido
// (colisão círculo×carro). Tudo é guardado por células espaciais de 256 m (o "chunk" dos meteoros): célula longe → visuais
// liberados; muito longe → dados descartados. Pools/instancing: nada é criado depois que o limite é atingido.
import * as THREE from 'three';
import {surface} from './terrain.js';
import {mulberry32,clamp,lerp,smoothstep} from './utils.js';

export const MAX_METEORS=140;     // meteoros simultâneos no céu (teto absoluto do pool)
const SPAWN_GAP=[.17,.036];       // intervalo médio entre spawns (s) em dificuldade 0 → 1   (antes .44 → .096)
const SIM=[36,110];               // máx. de meteoros simultâneos em dificuldade 0 → 1      (antes 20 → 60; sempre < MAX_METEORS: sobra vaga p/ o meteoro de punição)
const FALL=[2.6,1.7];             // tempo médio de queda (s) em dificuldade 0 → 1          (antes 4.6 → 3.0)
const MAX_DECALS=300;             // crateras (e meteoros caídos) visíveis ao mesmo tempo
const ROCK_CAP=480;               // capacidade de cada InstancedMesh de rocha (3 formas)
const MAX_RECORDS=4000;           // meteoros caídos guardados (dados) no total; acima disso descarta os mais distantes
const HEAT_CAP=64,HEAT_T=9;       // brilho/fumaça persistentes só nos meteoros mais recentes; esfriam em HEAT_T s
// ---- ZONA LETAL: a >DANGER_DIST m da BORDA da pista mais próxima, um meteoro de punição mata o jogador na hora
export const DANGER_DIST=200,WARN_DIST=130;   // limite letal / início do aviso na tela (m)
const LETHAL_HOLD=.25,LETHAL_T=1.45,LETHAL_SLACK=10;   // s fora da zona antes do disparo · tempo de queda · histerese (m) p/ cancelar se o jogador volta
const FAR_DROP=1600;              // meteoro em queda cujo ponto de impacto ficou a >1,6 km do jogador é desativado (sem impacto)
const CELL=256,LOAD_R=900,DROP_R=3000;    // célula; raio em que os visuais são "carregados"; raio em que os dados são descartados
const GS=1.12;                    // escala da rocha caída em relação à rocha em queda
export const CAR_R=1.5,CAR_OFFS=[1.7,0,-1.7];    // carro ≈ 3 círculos de raio 1,5 m ao longo do eixo
export const blastR=R=>R*.62+1.6;        // raio de explosão que fere o carro (NÃO é o tamanho do indicador)
export const markR=R=>.9+R*.1;           // raio VISUAL do indicador de impacto no chão (m): pequeno disco vermelho (≈1,3–3,7 m); antes ≈ blastR·1,1·1,3 (6–30 m)
const SEG=32,U_DECAL=[0,.3,.6,.8,.92,1.05,1.3],U_MARK=[0,.5,.8,.9,1,1.1];

// ---------------------------------------------------------------- texturas / materiais compartilhados
function glowTexture(){const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),r=g.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,255,255,1)');r.addColorStop(.25,'rgba(255,200,120,.8)');r.addColorStop(.6,'rgba(255,90,20,.25)');r.addColorStop(1,'rgba(255,60,0,0)');
  g.fillStyle=r;g.fillRect(0,0,64,64);const t=new THREE.CanvasTexture(c);return t;}

// ---------------------------------------------------------------- partículas (um buffer fixo por sistema)
const VS='attribute float aSize;attribute vec4 aColor;varying vec4 vC;uniform float uScale;void main(){vC=aColor;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=min(256.0,aSize*uScale/max(1.0,-mv.z));gl_Position=projectionMatrix*mv;}';
const FS='varying vec4 vC;void main(){float d=length(gl_PointCoord-.5)*2.0;float a=1.0-smoothstep(0.0,1.0,d);gl_FragColor=vec4(vC.rgb,vC.a*a*a);}';
class Particles{
  constructor(n,additive){
    this.n=n;this.cur=0;this.alive=0;
    this.pos=new Float32Array(n*3);this.col=new Float32Array(n*4);this.size=new Float32Array(n);
    this.vel=new Float32Array(n*3);this.age=new Float32Array(n).fill(1e9);this.life=new Float32Array(n).fill(1);
    this.p=new Float32Array(n*4);   // size0, grow, gravity, drag
    this.c0=new Float32Array(n*4);this.c1=new Float32Array(n*4);
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(this.pos,3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor',new THREE.BufferAttribute(this.col,4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize',new THREE.BufferAttribute(this.size,1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms={uScale:{value:600}};
    this.points=new THREE.Points(g,new THREE.ShaderMaterial({uniforms:this.uniforms,vertexShader:VS,fragmentShader:FS,transparent:true,depthWrite:false,
      blending:additive?THREE.AdditiveBlending:THREE.NormalBlending}));
    this.points.frustumCulled=false;this.g=g;
  }
  emit(x,y,z,vx,vy,vz,life,size,grow,grav,drag,c0,c1){
    const i=this.cur;this.cur=(this.cur+1)%this.n;                        // anel: sobrescreve a partícula mais antiga (nunca cresce)
    this.pos[i*3]=x;this.pos[i*3+1]=y;this.pos[i*3+2]=z;this.vel[i*3]=vx;this.vel[i*3+1]=vy;this.vel[i*3+2]=vz;
    this.age[i]=0;this.life[i]=life;this.p[i*4]=size;this.p[i*4+1]=grow;this.p[i*4+2]=grav;this.p[i*4+3]=drag;
    for(let k=0;k<4;k++){this.c0[i*4+k]=c0[k];this.c1[i*4+k]=c1[k];}
  }
  update(dt){
    let alive=0;
    for(let i=0;i<this.n;i++){
      if(this.age[i]>=this.life[i]){if(this.size[i]!==0){this.size[i]=0;this.col[i*4+3]=0;}continue;}
      alive++;const a=this.age[i]+=dt,t=a/this.life[i];
      if(t>=1){this.size[i]=0;this.col[i*4+3]=0;continue;}
      const k=i*3,dr=Math.exp(-this.p[i*4+3]*dt);
      this.vel[k]*=dr;this.vel[k+1]=this.vel[k+1]*dr-this.p[i*4+2]*dt;this.vel[k+2]*=dr;
      this.pos[k]+=this.vel[k]*dt;this.pos[k+1]+=this.vel[k+1]*dt;this.pos[k+2]+=this.vel[k+2]*dt;
      this.size[i]=this.p[i*4]*(1+this.p[i*4+1]*t);
      for(let c=0;c<4;c++)this.col[i*4+c]=this.c0[i*4+c]+(this.c1[i*4+c]-this.c0[i*4+c])*t;
    }
    this.alive=alive;const A=this.g.attributes;A.position.needsUpdate=A.aColor.needsUpdate=A.aSize.needsUpdate=true;
  }
  clear(){this.age.fill(1e9);this.size.fill(0);this.col.fill(0);this.alive=0;}
}

// ---------------------------------------------------------------- geometria radial (cratera e marcador): centro + anéis de SEG vértices
function radialGeo(rings,withNormal){
  const n=1+(rings-1)*SEG,g=new THREE.BufferGeometry(),idx=[];
  g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color',new THREE.BufferAttribute(new Float32Array(n*4),4).setUsage(THREE.DynamicDrawUsage));
  const V=(r,s)=>r===0?0:1+(r-1)*SEG+(s%SEG);
  for(let s=0;s<SEG;s++)idx.push(0,V(1,s+1),V(1,s));                              // leque central (voltado para +y)
  for(let r=1;r<rings-1;r++)for(let s=0;s<SEG;s++){const a=V(r,s),b=V(r,s+1),c=V(r+1,s),d=V(r+1,s+1);idx.push(a,b,c,b,d,c);}
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx),1));
  return g;
}
const rim=(u)=>Math.exp(-(((u-.95)/.13)**2));

export class MeteorSystem{
  constructor(scene,seed=(Math.random()*1e9)|0){
    this.scene=scene;this.rng=mulberry32(seed);this.onImpact=null;this.track=null;this.player=null;
    this.stats={spawned:0,impacts:0,hits:0,decals:0,alive:0,rocks:0,rockHits:0,records:0,lethal:0,smashed:0};this.onRockHit=null;this.shieldRam=null;this.onSmash=null;this.npcAim=null;this.perkAim=null;   // npcAim(T,k): gancho opcional do tráfego NPC (ponto de impacto sobre um carro) — null = comportamento original
    this.time=0;this.nextSpawn=0;this.warnings=[];this.craterCells=new Map();this.cellTick=0;this.pending=[];
    this.nActive=0;this.lethalM=null;this.zone={edge:0,out:false,t:0,tick:0,limit:DANGER_DIST,warn:WARN_DIST};   // contador de ativos (sem filter por frame) · meteoro de punição · estado da zona
    // materiais (um de cada; compartilhados)
    this.glowTex=glowTexture();
    this.rockMat=new THREE.MeshLambertMaterial({color:0x6b5646,emissive:0xff5a1a,emissiveIntensity:.85,flatShading:true});
    this.glowMat=new THREE.SpriteMaterial({map:this.glowTex,blending:THREE.AdditiveBlending,transparent:true,depthWrite:false,fog:false});
    this.trailMat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
    this.markMat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
    this.colMat=new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide,fog:false});
    this.decalMat=new THREE.MeshLambertMaterial({vertexColors:true,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-6,polygonOffsetUnits:-6});
    // geometrias compartilhadas: 3 formas de rocha, cone de rastro, coluna de luz
    this.rockGeos=[0,1,2].map(i=>this._rockGeo(i));
    this.trailGeo=new THREE.ConeGeometry(1,1,10,1,true);this.trailGeo.translate(0,.5,0);
    { const p=this.trailGeo.attributes.position,c=new Float32Array(p.count*4);for(let i=0;i<p.count;i++){const y=clamp(p.array[i*3+1],0,1),a=(1-y)*(1-y)*.9;c.set([1,.55+.35*(1-y),.2+.3*(1-y),a],i*4);}
      this.trailGeo.setAttribute('color',new THREE.BufferAttribute(c,4)); }
    this.colGeo=new THREE.CylinderGeometry(1,1,1,10,1,true);this.colGeo.translate(0,.5,0);
    { const p=this.colGeo.attributes.position,c=new Float32Array(p.count*4);for(let i=0;i<p.count;i++){const y=clamp(p.array[i*3+1],0,1);c.set([1,.35,.1,.55*(1-y)],i*4);}
      this.colGeo.setAttribute('color',new THREE.BufferAttribute(c,4)); }
    // pools
    this.meteors=[];this.markers=[];this.decals=[];this.flashes=[];
    this.fire=new Particles(2400,true);this.smoke=new Particles(4800,false);
    this.scene.add(this.fire.points,this.smoke.points);
    for(let i=0;i<8;i++){const s=new THREE.Sprite(this.glowMat.clone());s.visible=false;s.userData.t=0;this.scene.add(s);this.flashes.push(s);}
    // meteoros caídos: material compartilhado + 3 InstancedMesh (uma por forma). Cada instância = 1 rocha no chão.
    this.groundMat=new THREE.MeshLambertMaterial({color:0x6e5a4a,emissive:0x3a1405,emissiveIntensity:.55,flatShading:true});
    this.rockMeshes=this.rockGeos.map(g=>{const mesh=new THREE.InstancedMesh(g,this.groundMat,ROCK_CAP);mesh.frustumCulled=false;mesh.count=0;
      mesh.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(ROCK_CAP*3).fill(1),3);this.scene.add(mesh);return{mesh,used:new Uint8Array(ROCK_CAP),n:0};});
    this.heat=[];for(let i=0;i<HEAT_CAP;i++){const s=new THREE.Sprite(this.glowMat.clone());s.visible=false;this.scene.add(s);this.heat.push({s,c:null,sm:0,fr:0});}
  }
  bind(track,player){this.track=track;this.player=player;}
  // ---- rocha low-poly com forma irregular (3 variações)
  _rockGeo(v){
    const g=new THREE.IcosahedronGeometry(1,1),p=g.attributes.position;
    for(let i=0;i<p.count;i++){const x=p.array[i*3],y=p.array[i*3+1],z=p.array[i*3+2],h=Math.sin(x*12.9+y*78.2+z*37.7+v*19.3)*43758.5453,f=.72+.5*(h-Math.floor(h));
      p.array[i*3]=x*f;p.array[i*3+1]=y*f;p.array[i*3+2]=z*f;}
    g.computeVertexNormals();return g;
  }
  _randn(){return Math.sqrt(-2*Math.log(1-this.rng()))*Math.cos(6.2831853*this.rng());}
  // ---- dificuldade (0..1) cresce com a distância percorrida
  difficulty(){return smoothstep(0,10000,this.player.s);}
  // ---- pools
  _meteor(){
    let m=this.meteors.find(m=>!m.active);if(m)return m;
    if(this.meteors.length>=MAX_METEORS)return null;
    const root=new THREE.Group(),rock=new THREE.Mesh(this.rockGeos[0],this.rockMat),glow=new THREE.Sprite(this.glowMat),trail=new THREE.Mesh(this.trailGeo,this.trailMat);
    glow.renderOrder=3;trail.renderOrder=2;root.add(rock,glow,trail);root.visible=false;this.scene.add(root);
    m={active:false,root,rock,glow,trail,marker:null};this.meteors.push(m);return m;
  }
  _marker(){
    let k=this.markers.find(k=>!k.used);if(k)return k;
    const mesh=new THREE.Mesh(radialGeo(U_MARK.length),this.markMat),col=new THREE.Mesh(this.colGeo,this.colMat),group=new THREE.Group();
    mesh.renderOrder=4;col.renderOrder=4;col.visible=false;group.add(mesh,col);group.visible=false;this.scene.add(group);   // (coluna de luz alta desligada: o indicador é só o disco no chão)
    k={used:false,group,mesh,col};this.markers.push(k);return k;
  }
  // ---- escolha do ponto de impacto: atrás (perseguição), laterais, frente, ao redor do carro, "campo aberto" distante, "no caminho"
  //      e "mirados" que aumentam com a dificuldade. Parte é relativa à ESTRADA (cai na pista/acostamento mesmo com o jogador fora dela).
  _pickImpact(T,k){
    const P=this.player,tr=this.track,rng=this.rng,psi=P.psi,fx=Math.sin(psi),fz=-Math.cos(psi),rx=Math.cos(psi),rz=Math.sin(psi),v=Math.max(P.speed,18);
    const wFront=lerp(.16,.2,k),wSide=.24,wNear=.1,wFar=.08,wLane=lerp(.06,.1,k),r=rng();
    let cat=r<wFront?'front':r<wFront+wSide?'side':r<wFront+wSide+wNear?'near':r<wFront+wSide+wNear+wFar?'far':r<wFront+wSide+wNear+wFar+wLane?'lane':'behind';
    const aimed=this.aimedCount()<2&&P.s>400&&rng()<k*.4;
    let x,z,along,lat;const A=v*T;                                                   // A = quanto o carro ainda anda até o impacto
    if(aimed){along=A;lat=this._randn()*lerp(30,14,k);cat='aimed';}
    else if(cat==='behind'){along=A-(50+rng()*(180+k*140));lat=this._randn()*60*(1+k);}
    else if(cat==='side'){along=A-60+rng()*120;lat=(rng()<.5?-1:1)*(30+rng()*170);}
    else if(cat==='near'){const a=rng()*6.2832,rad=40+rng()*110;along=A*.5+Math.cos(a)*rad;lat=Math.sin(a)*rad;}
    else if(cat==='lane'){along=A+v*(1.2+rng()*1.6);lat=this._randn()*12;}                  // no caminho do carro, com 1,2–2,8 s de folga depois de pousar
    else if(cat==='far'){along=A+150+rng()*450;lat=(rng()<.5?-1:1)*(60+rng()*350);}
    else{along=A*(.75+rng()*.9)+40;lat=this._randn()*55;}
    if(!aimed&&Math.abs(along)<20&&Math.abs(lat)<25)lat=(lat<0?-1:1)*(25+rng()*20);   // nunca em cima do carro
    const roadBased=!aimed&&cat!=='side'&&cat!=='near'&&cat!=='lane'&&rng()<.45;
    if(roadBased){
      const q=tr.sampleAt(Math.max(tr.minKept*4+8,P.s+along));
      if(rng()<.5)lat=(rng()*2-1)*q.w*.92;                                           // metade desses cai sobre o asfalto
      x=q.x+Math.cos(q.h)*lat;z=q.z+Math.sin(q.h)*lat;
    }else if(cat==='lane'&&(this._ln=tr.nearest(P.x,P.z))&&this._ln.d<this._ln.w+8){   // acompanha a CURVA da pista (faixa em que o carro está)
      const q=tr.sampleAt(Math.max(tr.minKept*4+8,P.s+along)),lt=this._ln.o+lat;x=q.x+Math.cos(q.h)*lt;z=q.z+Math.sin(q.h)*lt;
    }else{x=P.x+fx*along+rx*lat;z=P.z+fz*along+rz*lat;}
    return {x,z,cat:roadBased?cat+'+road':cat};
  }
  // ---- a rocha caída bloquearia a estrada? Une os "corredores" ocupados (rochas + meteoros em queda) numa janela de 48 m
  //      e exige uma faixa livre de >=4 m (para o centro do carro) dentro da largura da pista.
  _blocks(x,z,rr){
    const tr=this.track,n0=tr.nearest(x,z);if(!n0||n0.d>n0.w+rr)return false;
    const w=n0.w,GAP=1.9,iv=[[n0.o-rr-GAP,n0.o+rr+GAP]],sh=Math.sin(n0.h),ch=-Math.cos(n0.h),W2=(2*w+60)*(2*w+60);   // (n0 é um objeto compartilhado: ler tudo antes de chamar nearest() de novo)
    // janela de ±48 m AO LONGO da pista, em toda a largura (antes: raio de 48 m, que ignorava rochas do lado oposto de uma pista de 64–96 m → corredor podia fechar)
    // no/nd/nw = deslocamento lateral, distância e meia-largura da pista no ponto de impacto, guardados UMA vez na criação (rochas não se movem) → sem tr.nearest() por rocha
    const add=(px,pz,r,no,nd,nw)=>{const dx=px-x,dz=pz-z;if(dx*dx+dz*dz>W2||Math.abs(dx*sh+dz*ch)>48||nd>nw+r+3)return;iv.push([no-r-GAP,no+r+GAP]);};
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=this.craterCells.get((cx+a)+':'+(cz+b));if(arr)for(const c of arr)if(c.solid)add(c.x,c.z,c.rr,c.no,c.nd,c.nw);}
    for(const m of this.meteors)if(m.active&&!m.lethal)add(m.ix,m.iz,m.radius*GS*.95,m.no,m.nd,m.nw);
    iv.sort((p,q)=>p[0]-q[0]);let cur=-w,best=0;
    for(const [a,b] of iv){if(a>cur)best=Math.max(best,a-cur);if(b>cur)cur=b;}
    best=Math.max(best,w-cur);return best<4;
  }
  aimedCount(){let n=0;for(const m of this.meteors)if(m.active&&m.aimed)n++;return n;}
  _size(k){
    const u=this.rng(),pS=lerp(.6,.25,k),pM=lerp(.34,.4,k);let cls,radius;
    if(u<pS){cls=0;radius=1+this.rng()*.8;}else if(u<pS+pM){cls=1;radius=2.2+this.rng()*1.4;}else{cls=2;radius=4+this.rng()*2.5;}
    return {cls,radius,R:radius*(3.4+this.rng()*.9)};                              // raio da cratera ≈ 3,4–4,3× o raio do meteoro (≈4–28 m)
  }
  // ---- spawn
  spawn(){
    const m=this._meteor(),mk=m&&this._marker();if(!m||!mk)return false;
    const k=this.difficulty(),rng=this.rng,sz=this._size(k),T=lerp(FALL[0],FALL[1],k)*(.85+.3*rng());     // tempo de queda ≈1,5–3 s (antes 2,6–5,3 s): ~1,8× mais rápido
    let pt=null;if(this.npcAim){const c=this.npcAim(T,k);if(c&&!this._blocks(c.x,c.z,sz.radius*GS*.95))pt={x:c.x,z:c.z,cat:c.cat};}   // (às vezes mira num NPC; mesma checagem de "nunca fecha a estrada")
    if(!pt&&this.perkAim){const c=this.perkAim(T,k);if(c&&!this._blocks(c.x,c.z,sz.radius*GS*.95))pt={x:c.x,z:c.z,cat:c.cat};}   // (perk de risco: impacto perto do perk; mesma checagem "nunca fecha a estrada")
    for(let tries=0;tries<4&&!pt;tries++){const c=this._pickImpact(T,k);if(!this._blocks(c.x,c.z,sz.radius*GS*.95))pt=c;}   // nunca fecha a estrada
    if(!pt)return false;
    const g=surface(this.track,pt.x,pt.z,this._g||(this._g={})),iy=g.h;
    const H=360+rng()*260,theta=(8+rng()*30)*Math.PI/180,az=this.player.psi+(rng()-.5)*1.7;   // vem do céu, de trás para a frente (± 49° da direção do carro)
    this._launch(m,mk,pt.x,iy,pt.z,sz,T,H,theta,az,pt.cat,false);return true;
  }
  // ---- arma um meteoro do pool: nasce a H m de altura e desce em linha reta (visível) até (ix,iy,iz) em T s
  _launch(m,mk,ix,iy,iz,sz,T,H,theta,az,cat,lethal){
    const rng=this.rng,vy=H/T,vh=vy*Math.tan(theta),vx=Math.sin(az)*vh,vz=-Math.cos(az)*vh;
    Object.assign(m,{active:true,t:0,T,ix,iy,iz,sx:ix-vx*T,sy:iy+H,sz:iz-vz*T,vx,vy:-vy,vz,radius:sz.radius,R:sz.R,cls:sz.cls,cat,aimed:cat==='aimed',lethal,reshape:0,trailT:0,spin:[rng()*2-1,rng()*2-1,rng()*2-1]});
    this.nActive++;{const nn=this.track.nearest(ix,iz);m.no=nn?nn.o:0;m.nd=nn?nn.d:1e9;m.nw=nn?nn.w:0;}   // posição relativa à pista (para _blocks)
    m.rock.geometry=this.rockGeos[(rng()*3)|0];m.rock.scale.set(sz.radius,sz.radius*.85,sz.radius*1.1);
    m.glow.scale.set(sz.radius*9+6,sz.radius*9+6,1);
    const sp=Math.hypot(vx,vy,vz),dx=vx/sp,dy=-vy/sp,dz=vz/sp;                      // direção do voo; o rastro aponta para trás
    m.trail.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(-dx,-dy,-dz).normalize());
    m.trail.scale.set(sz.radius*1.5,(34+sz.radius*20)*clamp(sp/160,1,2.2),sz.radius*1.5);   // mais rápido → rastro mais longo
    m.root.position.set(m.sx,m.sy,m.sz);m.root.visible=true;
    // marcador de impacto conformado ao terreno
    this._shapeMarker(mk,ix,iz,markR(sz.R));mk.used=true;mk.group.visible=true;m.marker=mk;
    this.stats.spawned++;
  }
  // ---- METEORO DE PUNIÇÃO: disparado quando o jogador está >DANGER_DIST m da pista. Grande, vem do céu NA FRENTE do carro (fica visível na câmera),
  //      cai rápido (LETHAL_T s) e acompanha o carro (mira no ponto onde ele estará no impacto). Ignora limite de simultâneos e _blocks().
  _spawnLethal(){
    const m=this._meteor(),mk=m&&this._marker();if(!m||!mk)return false;
    const P=this.player,rng=this.rng,T=LETHAL_T,ix=P.x+P.vx*T,iz=P.z+P.vz*T,iy=surface(this.track,ix,iz,this._g||(this._g={})).h;
    const radius=6+rng()*.5,sz={cls:2,radius,R:radius*4.2},H=330,theta=58*Math.PI/180,az=P.psi+Math.PI+(rng()-.5)*.5;   // voa na direção do carro (de frente)
    this._launch(m,mk,ix,iy,iz,sz,T,H,theta,az,'lethal',true);this.lethalM=m;return true;
  }
  _shapeMarker(mk,cx,cz,R){
    const tr=this.track,gg=mk.mesh.geometry,P=gg.attributes.position.array,C=gg.attributes.color.array,g=this._g2||(this._g2={});
    const base=surface(tr,cx,cz,g).h;let n=0;
    const alpha=[.85,.85,.85,.85,.8,0],lift=1.1;   // disco cheio com borda suave (antes: anel com centro vazio)
    const put=(u,s,seg)=>{const a=seg/SEG*Math.PI*2,x=Math.cos(a)*u*R,z=Math.sin(a)*u*R;P[n*3]=x;P[n*3+1]=surface(tr,cx+x,cz+z,g).h-base+lift;P[n*3+2]=z;const A=alpha[U_MARK.indexOf(u)];C.set([1,.08,.05,A],n*4);n++;};
    put(0,0,0);for(let r=1;r<U_MARK.length;r++)for(let s=0;s<SEG;s++)put(U_MARK[r],s,s);
    gg.attributes.position.needsUpdate=gg.attributes.color.needsUpdate=true;gg.computeBoundingSphere();
    mk.group.position.set(cx,base,cz);mk.baseR=R;mk.col.scale.set(R*.035+.25,55,R*.035+.25);mk.mesh.scale.set(1,1,1);
  }
  // ---- impacto
  _impact(m){
    const R=m.R,P=this.player;let lethal=false;
    if(m.lethal){                                                          // checagem FINAL e exata: o jogador ainda está fora da zona segura?
      lethal=this._exactEdge()>DANGER_DIST-LETHAL_SLACK;
      if(lethal){m.ix=P.x;m.iz=P.z;m.iy=surface(this.track,P.x,P.z,this._g||(this._g={})).h;}   // pousa exatamente em cima do carro
    }
    const ix=m.ix,iy=m.iy,iz=m.iz;
    const dist=Math.hypot(P.x-ix,P.z-iz),hit=lethal||dist<blastR(R);
    this._explode(ix,iy,iz,R,m.cls);const c=this._addCrater(ix,iz,R,m);this._ignite(c);
    this.stats.impacts++;if(hit)this.stats.hits++;if(lethal)this.stats.lethal++;
    if(this.onImpact)this.onImpact({x:ix,y:iy,z:iz,R,dist,hit,cls:m.cls,lethal});
    this._release(m);
  }
  _release(m){if(m.active)this.nActive--;if(this.lethalM===m)this.lethalM=null;m.lethal=false;m.active=false;m.root.visible=false;if(m.marker){m.marker.used=false;m.marker.group.visible=false;m.marker=null;}}
  _explode(x,y,z,R,cls){
    const rng=this.rng,F=this.fire,S=this.smoke,sc=Math.sqrt(R/10),P=this.player,d=P?Math.hypot(x-P.x,z-P.z):0;
    const q=(d<450?1:d<1000?.55:.25)*(this.nActive>60?.4:this.nActive>30?.6:1);   // longe do jogador / com muitos meteoros: menos partículas (buffers fixos)
    // clarão
    const fl=this.flashes.find(f=>!f.visible)||this.flashes[0];fl.visible=true;fl.userData.t=0;fl.userData.R=R;fl.position.set(x,y+R*.4,z);fl.scale.set(R*6,R*6,1);fl.material.opacity=1;
    const nF=Math.max(6,Math.round((26+R*1.8)*q));
    for(let i=0;i<nF;i++){const a=rng()*6.283,e=rng()*1.2,sp=(8+rng()*26)*sc,cx=Math.cos(a)*Math.cos(e),cz=Math.sin(a)*Math.cos(e);
      F.emit(x,y+.5,z,cx*sp,Math.sin(e)*sp*1.4+6,cz*sp,.5+rng()*.9,R*(.22+rng()*.3),1.6,-4,1.4,[1,.95,.65,1],[.9,.22,.04,0]);}
    for(let i=0,nE=Math.max(2,Math.round(8*q));i<nE;i++){const a=rng()*6.283;F.emit(x+Math.cos(a)*R*.5*rng(),y+.8,z+Math.sin(a)*R*.5*rng(),0,2+rng()*2,0,3+rng()*2.5,1.2+rng()*R*.05,0,-.3,.3,[1,.55,.15,.9],[.6,.1,.02,0]);}   // brasas
    const nS=Math.max(6,Math.round((16+R*1.1)*q));
    for(let i=0;i<nS;i++){const a=rng()*6.283,sp=(3+rng()*8)*sc;S.emit(x+Math.cos(a)*R*.3,y+1,z+Math.sin(a)*R*.3,Math.cos(a)*sp,4+rng()*10*sc,Math.sin(a)*sp,3+rng()*3.5,R*(.45+rng()*.5),2.4,-1.2,.7,[.24,.22,.21,.6],[.42,.42,.42,0]);}
    for(let i=0,nR=Math.max(6,Math.round(18*q));i<nR;i++){const a=i/nR*6.283+rng()*.2,sp=(14+rng()*14)*sc;S.emit(x+Math.cos(a)*R*.4,y+1,z+Math.sin(a)*R*.4,Math.cos(a)*sp,1+rng()*2,Math.sin(a)*sp,1.4+rng()*1.2,R*.38,2,0,1.6,[.5,.42,.32,.5],[.55,.5,.42,0]);}   // anel de poeira
    const nD=Math.max(5,Math.round((14+R*.8)*q));
    for(let i=0;i<nD;i++){const a=rng()*6.283,sp=(14+rng()*36)*sc;S.emit(x,y+1,z,Math.cos(a)*sp,(12+rng()*30)*sc,Math.sin(a)*sp,1.2+rng()*1.4,.8+rng()*1.1,-.3,22,.2,[.12,.09,.08,1],[.1,.08,.07,0]);}   // detritos
  }
  // ---- crateras: dados por célula de 256 m; o decal só existe enquanto a célula está carregada
  _cellKey(x,z){return Math.floor(x/CELL)+':'+Math.floor(z/CELL);}
  _addCrater(x,z,R,m){   // registro do meteoro caído: cratera (decal) + rocha (instância) + colisor. Retorna o registro.
    const rs=this.rng,radius=(m?m.radius:R/3.8)*GS,cls=m?m.cls:(R<8?0:R<15?1:2);
    const c={x,z,R,seed:(rs()*1e9)|0,decal:null,wanted:false,cls,radius,rr:radius*.95,solid:true,shape:(rs()*3)|0,yaw:rs()*6.2832,tx:(rs()-.5)*.25,tz:(rs()-.5)*.25,
      tint:.8+rs()*.4,slot:-1,ry:0,heat:null,age:HEAT_T,no:0,nd:1e9,nw:0},key=this._cellKey(x,z);
    {const nn=this.track&&this.track.nearest(x,z);if(nn){c.no=nn.o;c.nd=nn.d;c.nw=nn.w;}}
    let arr=this.craterCells.get(key);if(!arr)this.craterCells.set(key,arr=[]);arr.push(c);
    this._activate(c,true);return c;
  }
  _activate(c,front){                                                   // só enfileira: no máximo 1 cratera é modelada por frame
    if(c.decal||c.wanted)return;c.wanted=true;if(front)this.pending.unshift(c);else this.pending.push(c);
  }
  _pump(){for(let n=0;this.pending.length&&n<96;n++){const c=this.pending.shift();if(!c.wanted||c.decal)continue;if(this._place(c))break;}}
  _place(c){
    c.wanted=false;
    let d=this.decals.find(d=>!d.crater);
    if(!d){
      if(this.decals.length<MAX_DECALS){d={mesh:new THREE.Mesh(radialGeo(U_DECAL.length),this.decalMat),crater:null};d.mesh.renderOrder=1;this.scene.add(d.mesh);this.decals.push(d);}
      else{                                                                // todos em uso: recicla o mais distante
        const px=this.player.x,pz=this.player.z;let far=null,fd=-1;for(const q of this.decals){const ex=q.crater.x-px,ez=q.crater.z-pz,dd=ex*ex+ez*ez;if(dd>fd){fd=dd;far=q;}}
        if(fd<(c.x-px)*(c.x-px)+(c.z-pz)*(c.z-pz))return false;this._unplace(far.crater);d=far;}
    }
    d.crater=c;c.decal=d;this._shapeDecal(d,c);d.mesh.visible=true;this._placeRock(c);return true;
  }
  _unplace(c){if(c.decal){c.decal.mesh.visible=false;c.decal.crater=null;c.decal=null;}this._removeRock(c);}
  _deactivate(c){c.wanted=false;this._unplace(c);if(c.heat){c.heat.c=null;c.heat.s.visible=false;c.heat=null;}}
  // ---- rocha caída sobre a superfície real (mesma função do carro): apoiada perto do ponto mais baixo da pegada
  _placeRock(c){
    if(c.solid===false)return;                                            // rocha destruída pelo escudo não volta quando a célula é recarregada
    const tr=this.track,g=this._g4||(this._g4={}),rr=c.rr*.85;let lo=1e9,hi=-1e9,sum=0;
    const hs=[[0,0],[rr,0],[-rr,0],[0,rr],[0,-rr]];
    for(const [dx,dz] of hs){const h=surface(tr,c.x+dx,c.z+dz,g).h;if(h<lo)lo=h;if(h>hi)hi=h;sum+=h;}
    const r=c.radius,avg=sum/5,y=Math.min(lo+.5*r,Math.max(avg+.3*r,lo+.2*r));c.ry=y;
    const rm=this.rockMeshes[c.shape];let slot=-1;for(let i=0;i<ROCK_CAP;i++)if(!rm.used[i]){slot=i;break;}
    if(slot<0)return;
    rm.used[slot]=1;if(slot+1>rm.mesh.count)rm.mesh.count=slot+1;rm.n++;c.slot=slot;
    this._writeRock(rm,slot,c.x,y,c.z,c.yaw,c.tx,c.tz,r,r*.85,r*1.1,c.tint);
  }
  _writeRock(rm,i,x,y,z,yaw,tx,tz,sx,sy,sz,tint){
    const e=rm.mesh.instanceMatrix.array,o=i*16,cy=Math.cos(yaw),sy_=Math.sin(yaw),cx=Math.cos(tx),sx_=Math.sin(tx),cz=Math.cos(tz),sz_=Math.sin(tz);
    const r00=cy*cz+sy_*sx_*sz_,r01=-cy*sz_+sy_*sx_*cz,r02=sy_*cx,r10=cx*sz_,r11=cx*cz,r12=-sx_,r20=-sy_*cz+cy*sx_*sz_,r21=sy_*sz_+cy*sx_*cz,r22=cy*cx;
    e[o]=r00*sx;e[o+1]=r10*sx;e[o+2]=r20*sx;e[o+3]=0;e[o+4]=r01*sy;e[o+5]=r11*sy;e[o+6]=r21*sy;e[o+7]=0;e[o+8]=r02*sz;e[o+9]=r12*sz;e[o+10]=r22*sz;e[o+11]=0;
    e[o+12]=x;e[o+13]=y;e[o+14]=z;e[o+15]=1;
    if(tint){const ci=rm.mesh.instanceColor.array;ci[i*3]=tint*1.05;ci[i*3+1]=tint;ci[i*3+2]=tint*.95;rm.mesh.instanceColor.needsUpdate=true;}
    rm.mesh.instanceMatrix.needsUpdate=true;
  }
  _removeRock(c){
    if(c.slot<0)return;const rm=this.rockMeshes[c.shape],i=c.slot,e=rm.mesh.instanceMatrix.array;
    for(let k=0;k<16;k++)e[i*16+k]=0;rm.used[i]=0;rm.n--;c.slot=-1;
    while(rm.mesh.count>0&&!rm.used[rm.mesh.count-1])rm.mesh.count--;rm.mesh.instanceMatrix.needsUpdate=true;
  }
  // ---- brilho/fumaça persistentes: só nos meteoros mais recentes (pool de HEAT_CAP sprites); esfriam em HEAT_T s
  _ignite(c){
    let h=this.heat.find(h=>!h.c);
    if(!h){h=this.heat[0];for(const q of this.heat)if(q.c.age>h.c.age)h=q;if(h.c)h.c.heat=null;}
    h.c=c;c.heat=h;c.age=0;h.sm=0;h.fr=0;
  }
  _updateHeat(dt){
    for(const h of this.heat){const c=h.c;if(!c)continue;c.age+=dt;
      if(c.age>=HEAT_T){h.s.visible=false;h.c=null;c.heat=null;continue;}
      if(c.slot<0){h.s.visible=false;continue;}
      const k=1-c.age/HEAT_T,fl=.85+.15*Math.sin(this.time*17+c.seed),r=c.radius;
      h.s.visible=true;h.s.position.set(c.x,c.ry+r*.7,c.z);const sc=r*(4.5+3*k);h.s.scale.set(sc,sc,1);h.s.material.opacity=.85*k*k*fl;
      h.sm-=dt;if(h.sm<=0){h.sm=.18+(1-k)*.5;this.smoke.emit(c.x+(this.rng()-.5)*r,c.ry+r*.9,c.z+(this.rng()-.5)*r,(this.rng()-.5)*1.5,3+this.rng()*2,(this.rng()-.5)*1.5,2.2+this.rng(),r*(.7+.4*this.rng()),2.2,-.4,.5,[.3,.28,.26,.38*k+.08],[.45,.45,.45,0]);}
      h.fr-=dt;if(h.fr<=0&&k>.35){h.fr=.12+this.rng()*.2;this.fire.emit(c.x+(this.rng()-.5)*r*1.2,c.ry+r*.8,c.z+(this.rng()-.5)*r*1.2,(this.rng()-.5)*2,3+this.rng()*3,(this.rng()-.5)*2,.5+this.rng()*.5,r*.35,.8,-1,.8,[1,.7,.3,.9],[.9,.25,.05,0]);}
    }
  }
  // ---- COLISÃO carro × meteoros caídos (círculos). Empurra o carro para fora, corta a velocidade contra a rocha e avisa o jogo.
  collide(P){
    if(!this.craterCells.size)return null;
    const cx=Math.floor(P.x/CELL),cz=Math.floor(P.z/CELL),fx=Math.sin(P.psi),fz=-Math.cos(P.psi),rx=Math.cos(P.psi),rz=Math.sin(P.psi);let hit=null;
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=this.craterCells.get((cx+a)+':'+(cz+b));if(!arr)continue;
      for(const c of arr){if(!c.solid||Math.abs(c.x-P.x)>c.rr+6||Math.abs(c.z-P.z)>c.rr+6)continue;
        for(const off of CAR_OFFS){
          if(!c.solid)break;                                      // (destruída pelo escudo neste mesmo contato)
          const dx=P.x+fx*off-c.x,dz=P.z+fz*off-c.z;let d=Math.hypot(dx,dz);const min=c.rr+CAR_R;if(d>=min)continue;
          if(P.phase>0&&c.cls<=1){P.phaseHold=true;continue;}   // perk FASE: atravessa rochas pequenas/médias (grandes continuam sólidas)
          if(this.shieldRam&&this.shieldRam(c)){this.smash(c);break;}   // perk ESCUDO: a rocha é DESTRUÍDA, o carro não é empurrado nem leva dano (a cratera continua)
          let nx,nz;if(d<1e-4){nx=-fx;nz=-fz;d=0;}else{nx=dx/d;nz=dz/d;}
          const pen=min-d;P.x+=nx*pen;P.z+=nz*pen;
          const vn=P.vx*nx+P.vz*nz;if(vn<0){P.vx-=1.15*vn*nx;P.vz-=1.15*vn*nz;}
          const lat=(c.x-P.x)*rx+(c.z-P.z)*rz;P.yawRate+=-(lat>=0?1:-1)*clamp(-vn/30,0,.5)*(off>0?1:off<0?-.4:0);   // bater de quina gira o carro
          if(!hit)hit={x:c.x,z:c.z,cls:c.cls,speed:Math.max(0,-vn),rock:c};else hit.speed=Math.max(hit.speed,-vn);
        }}}
    if(hit){P.mesh.position.x=P.x;P.mesh.position.z=P.z;P.speed=Math.max(0,P.vx*fx+P.vz*fz);this.stats.rockHits++;if(this.onRockHit)this.onRockHit(hit);}
    return hit;
  }
  // Há rocha caída SÓLIDA a menos de r m de (x,z)? (tráfego NPC: desvio e colisão; mesma estrutura de células da colisão do jogador)
  rockNear(x,z,r){const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++){const arr=this.craterCells.get((cx+a)+':'+(cz+b));if(!arr)continue;
      for(const c of arr){if(!c.solid)continue;const m=c.rr+r,dx=c.x-x;if(dx>m||dx<-m)continue;const dz=c.z-z;if(dx*dx+dz*dz<m*m)return c;}}
    return null;}
  // Rocha destruída pelo ESCUDO: some o objeto sólido (instância + colisor + brilho); a CRATERA (decal) e o registro do meteoro continuam como estavam.
  smash(c){
    if(!c.solid)return false;c.solid=false;c.broken=true;const y=c.ry||0,r=c.radius;this._removeRock(c);this.stats.smashed++;
    const S=this.smoke,F=this.fire,rng=this.rng;
    for(let i=0;i<10;i++){const a=rng()*6.283,sp=5+rng()*12;S.emit(c.x,y+r*.6,c.z,Math.cos(a)*sp,3+rng()*8,Math.sin(a)*sp,.9+rng()*.8,.5+rng()*.7,-.2,16,.3,[.2,.15,.12,1],[.15,.12,.1,0]);}   // fragmentos
    for(let i=0;i<4;i++){const a=rng()*6.283;S.emit(c.x+Math.cos(a)*r*.4,y+r*.5,c.z+Math.sin(a)*r*.4,Math.cos(a)*2,2+rng()*2,Math.sin(a)*2,1.4,r*1.1,2,-.6,.6,[.5,.45,.38,.55],[.5,.5,.5,0]);}   // poeira
    F.emit(c.x,y+r*.6,c.z,0,2,0,.35,r*2.4,1.8,0,1,[1,.9,.6,.9],[1,.4,.1,0]);                                                                   // clarão do estouro
    if(this.onSmash)this.onSmash(c.x,y+r*.6,c.z,r);return true;}
  _shapeDecal(d,c){
    const tr=this.track,gg=d.mesh.geometry,P=gg.attributes.position.array,C=gg.attributes.color.array,g=this._g3||(this._g3={}),R=c.R,rs=mulberry32(c.seed);
    const ph=[rs()*6.28,rs()*6.28,rs()*6.28],am=[.1,.06,.04],base=surface(tr,c.x,c.z,g).h,depth=R*.035,rimH=R*.03,lift=depth+.2+R*.004;
    let n=0;
    const put=(ui,s)=>{
      const u=U_DECAL[ui],a=s/SEG*Math.PI*2,wob=1+am[0]*Math.sin(2*a+ph[0])+am[1]*Math.sin(3*a+ph[1])+am[2]*Math.sin(5*a+ph[2]),x=Math.cos(a)*u*R*wob,z=Math.sin(a)*u*R*wob;
      const bowl=-depth*(1-smoothstep(0,.85,u)),h=surface(tr,c.x+x,c.z+z,g).h-base+lift+bowl+(u<1.3?rimH*rim(u):0)*(u>.5?1:0)*(1+.25*Math.sin(7*a+ph[0]));
      P[n*3]=x;P[n*3+1]=h;P[n*3+2]=z;
      const t=[[.03,.027,.025,.97],[.04,.035,.03,.96],[.07,.055,.045,.95],[.12,.09,.07,.93],[.28,.22,.16,.9],[.2,.16,.12,.7],[.05,.045,.04,0]][ui],j=.85+.3*rs();
      C[n*4]=t[0]*j;C[n*4+1]=t[1]*j;C[n*4+2]=t[2]*j;C[n*4+3]=t[3];n++;};
    put(0,0);for(let ui=1;ui<U_DECAL.length;ui++)for(let s=0;s<SEG;s++)put(ui,s);
    gg.attributes.position.needsUpdate=gg.attributes.color.needsUpdate=true;gg.computeVertexNormals();gg.computeBoundingSphere();
    d.mesh.position.set(c.x,base,c.z);
  }
  _updateCells(){
    const P=this.player;let total=0;const far=[];
    for(const [key,arr] of this.craterCells){
      const [cx,cz]=key.split(':').map(Number),d=Math.hypot((cx+.5)*CELL-P.x,(cz+.5)*CELL-P.z);
      if(d>DROP_R){for(const c of arr)this._deactivate(c);this.craterCells.delete(key);continue;}   // chunk descarregado: dados, rochas e decals saem
      if(d>LOAD_R){for(const c of arr)this._deactivate(c);}                                        // fora do raio: some, mas os dados ficam
      else for(const c of arr)this._activate(c);                                                   // voltou: reaparece (uma única vez)
      total+=arr.length;far.push([d,key]);
    }
    if(total>MAX_RECORDS){far.sort((a,b)=>b[0]-a[0]);                                              // teto global: descarta as células mais distantes
      for(const [,key] of far){if(total<=MAX_RECORDS*.9)break;const arr=this.craterCells.get(key);for(const c of arr)this._deactivate(c);total-=arr.length;this.craterCells.delete(key);}}
    this.stats.records=total;
  }
  // ---- ZONA LETAL ---------------------------------------------------------------------------------------------------------
  // Distância EXATA à borda da pista mais próxima (rede inteira do índice espacial). Custo ≈ 0 perto da pista: o Player já calcula, todo frame,
  // a distância à amostra mais próxima numa janela local (roadD − roadW); isso é um LIMITE SUPERIOR da distância real (é a distância a uma
  // amostra que existe). Se esse limite ≤ WARN_DIST o jogador está seguramente perto → nenhuma busca. Só longe da pista roda a busca exata
  // (5×5 células), no máximo 10×/s. A pista à frente é garantida por ensureZ (a estrada nunca volta: z só diminui).
  _exactEdge(){const P=this.player;this.track.ensureZ(P.z-320);return this.track.edgeDist(P.x,P.z);}
  _zoneUpdate(dt){
    const P=this.player,Z=this.zone;
    if(!this.track||P.roadD===undefined||this.time<1){Z.edge=0;Z.out=false;Z.t=0;return;}
    const cheap=P.roadD-P.roadW;
    if(cheap<=WARN_DIST){Z.edge=cheap>0?cheap:0;Z.out=false;Z.t=0;Z.tick=0;return;}
    Z.tick-=dt;if(Z.tick<=0){Z.tick=.1;Z.edge=this._exactEdge();}
    if(Z.edge>DANGER_DIST){Z.out=true;Z.t+=dt;if(Z.t>=LETHAL_HOLD&&!this.lethalM)this._spawnLethal();}
    else{Z.out=false;Z.t=0;}
  }
  // meteoro de punição em voo: acompanha o carro (extrapolação linear até o instante do impacto, suavizada) e cancela se o jogador voltou à zona segura
  _steerLethal(m,dt){
    const P=this.player,Z=this.zone,left=Math.max(0,m.T-m.t);
    if(Z.edge<DANGER_DIST-LETHAL_SLACK){m.lethal=false;this.lethalM=null;return;}     // voltou para dentro (com histerese): vira um meteoro comum
    const a=1-Math.exp(-dt*9),tx=P.x+P.vx*left,tz=P.z+P.vz*left;
    m.ix+=(tx-m.ix)*a;m.iz+=(tz-m.iz)*a;m.iy+=((P.y-.6)-m.iy)*a;
    m.vx=(m.ix-m.sx)/m.T;m.vy=(m.iy-m.sy)/m.T;m.vz=(m.iz-m.sz)/m.T;                  // a posição continua S + v·t (sem salto)
    m.reshape-=dt;const mk=m.marker;
    if(m.reshape<=0){m.reshape=.15;this._shapeMarker(mk,m.ix,m.iz,markR(m.R));}   // refaz o marcador sobre o terreno ~7×/s
    else{mk.group.position.x=m.ix;mk.group.position.z=m.iz;}
  }
  // ---- loop
  setView(camera,heightPx){const s=heightPx/(2*Math.tan(camera.fov*Math.PI/360));this.fire.uniforms.uScale.value=s;this.smoke.uniforms.uScale.value=s;}
  update(dt,{spawn=true}={}){
    if(!this.player)return;this.time+=dt;const k=this.difficulty();
    if(spawn)this._zoneUpdate(dt);                                                   // >200 m da pista → dispara o meteoro de punição
    // agenda de spawn (≈2,5× a anterior): intervalo médio 0,17 s → 0,036 s; simultâneos 36 → 110 (pool até MAX_METEORS=140); sem meteoros nos primeiros 2,5 s / 80 m
    if(spawn&&this.time>2.5&&this.player.s>80&&this.time>=this.nextSpawn){
      const maxSim=Math.round(lerp(SIM[0],SIM[1],k));
      if(this.nActive<maxSim&&this.spawn())this.nextSpawn=this.time+lerp(SPAWN_GAP[0],SPAWN_GAP[1],k)*(.6+.8*this.rng());else this.nextSpawn=this.time+.05;
    }
    this.warnings.length=0;const PX=this.player.x,PZ=this.player.z;
    for(const m of this.meteors){if(!m.active)continue;
      if(m.lethal)this._steerLethal(m,dt);
      else if(Math.abs(m.ix-PX)>FAR_DROP||Math.abs(m.iz-PZ)>FAR_DROP){this._release(m);continue;}   // ficou muito longe (ex.: carro voltou à pista com R): desativa sem impacto
      m.t+=dt;if(m.t>=m.T){this._impact(m);continue;}
      const t=m.t,x=m.sx+m.vx*t,y=m.sy+m.vy*t,z=m.sz+m.vz*t;m.root.position.set(x,y,z);
      m.root.scale.setScalar(Math.min(1,.08+t/.4));                                  // surge crescendo no céu (sem pop; mais rápido, pois a queda ficou mais curta)
      m.rock.rotation.x+=m.spin[0]*dt*3;m.rock.rotation.y+=m.spin[1]*dt*3;m.rock.rotation.z+=m.spin[2]*dt*3;
      m.glow.material.rotation=0;
      const mk=m.marker,left=m.T-t,u=1-left/m.T;mk.group.visible=Math.hypot(m.ix-this.player.x,m.iz-this.player.z)<1400;        // o anel "fecha" até o instante do impacto
      mk.col.scale.y=55;this.warnings.push({x:m.ix,y:m.iy,z:m.iz,left,T:m.T,R:m.R});
      m.trailT-=dt;if(m.trailT<=0){m.trailT=.035;const sp=Math.hypot(m.vx,m.vy,m.vz),bx=-m.vx/sp,by=-m.vy/sp,bz=-m.vz/sp,rr=m.radius,jr=()=>(this.rng()-.5)*rr;
        this.fire.emit(x+jr(),y+jr(),z+jr(),bx*14,by*14,bz*14,.4,rr*2.6,1.5,0,1,[1,.8,.4,.9],[1,.3,.05,0]);
        this.smoke.emit(x+jr(),y+jr(),z+jr(),bx*6,by*6,bz*6,1.8,rr*3.2,2.5,0,.6,[.5,.45,.4,.32],[.45,.45,.45,0]);}
    }
    this.markMat.opacity=.7+.3*Math.sin(this.time*12);
    for(const f of this.flashes){if(!f.visible)continue;f.userData.t+=dt;const a=1-f.userData.t/.45;if(a<=0){f.visible=false;continue;}f.material.opacity=a;const s=f.userData.R*(6+4*(1-a));f.scale.set(s,s,1);}
    this._updateHeat(dt);this.fire.update(dt);this.smoke.update(dt);this._pump();
    this.cellTick-=dt;if(this.cellTick<=0){this.cellTick=.5;this._updateCells();}
    this.stats.alive=this.nActive;this.stats.decals=this.decals.filter(d=>d.crater).length;this.stats.rocks=this.rockMeshes.reduce((a,r)=>a+r.n,0);
  }
  reset(){
    for(const m of this.meteors)this._release(m);
    for(const arr of this.craterCells.values())for(const c of arr)this._deactivate(c);
    for(const h of this.heat){h.c=null;h.s.visible=false;}
    this.craterCells.clear();this.pending.length=0;this.fire.clear();this.smoke.clear();this.warnings.length=0;this.time=0;this.nextSpawn=0;
    this.nActive=0;this.lethalM=null;Object.assign(this.zone,{edge:0,out:false,t:0,tick:0});
    for(const f of this.flashes)f.visible=false;this.stats.spawned=this.stats.impacts=this.stats.hits=this.stats.rockHits=this.stats.rocks=this.stats.records=this.stats.lethal=this.stats.smashed=0;
  }
}
