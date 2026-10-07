// LAVA: uma frente de lava que persegue o jogador ao longo da pista e o mata ao alcançá-lo.
//
// LÓGICA: a frente é só um número — `front` = distância percorrida na pista (mesma unidade de player.s, em metros).
//   · começa START_GAP m atrás do carro (distância inicial segura) e anda a uma velocidade que cresce com a corrida;
//   · se o jogador ficar para trás e o intervalo passar de FAR, a lava acelera (elástico) → sempre é uma ameaça real;
//   · o intervalo nunca passa de MAX_GAP; a velocidade nunca passa de VMAX (< velocidade de cruzeiro do carro → dá para fugir);
//   · player.s <= front → onBurn() (Game over imediato).
// VISUAL (poucos objetos; nada de milhares de meshes):
//   · SUPERFÍCIE: 1 malha por chunk de 192 m (mesmo CHUNK_LEN/CHUNK_N do world.js, em pool), 15×25 vértices que seguem o terreno.
//     A frente é revelada por um `discard` no shader (uFront) — a malha é estática, só um uniform muda por frame.
//   · PAREDE da frente (face vertical + rampa, 1 malha reconstruída por frame) + AURA de calor (faixa aditiva).
//   · 340 partículas (fogo, brasas, fumaça) em 2 THREE.Points com pool fixo.
//   · 1 PointLight laranja na frente (ilumina pista/terreno próximos).
import * as THREE from 'three';
import {STEP} from './road.js';
import {CHUNK_N,CHUNK_LEN} from './world.js';
import {surface} from './terrain.js';
import {clamp,lerp,smoothstep,mulberry32} from './utils.js';

// ---- AJUSTES (metros, segundos). Mexa só aqui para balancear.
export const LAVA={
  START_GAP:120,   // distância inicial segura jogador↔lava
  BASE:15,         // velocidade da lava no começo (m/s ≈ 54 km/h). O carro "solto" (sem acelerar) estabiliza em ~10 m/s → a lava ganha; acelerando (30–75 m/s) o jogador se afasta
  GROW:11,         // acréscimo de velocidade até GROW_DIST (a ameaça acompanha a progressão da corrida)
  GROW_DIST:8000,  // distância (m) em que o acréscimo chega ao máximo
  FAR:260,         // acima desse intervalo a lava "corre atrás" (elástico)…
  CATCH:.25,       // …com +CATCH m/s por metro de excesso
  VMAX:46,         // teto da velocidade da lava (m/s) — abaixo da velocidade máxima do carro (75)
  MAX_GAP:440,     // a lava nunca fica mais longe que isto
  KILL_MARGIN:1,   // contato = frente da lava a 1 m do progresso do carro
};
// ÁREA DA LAVA (a única coisa que esta etapa muda): antes ±150 m ao redor da pista e 520 m atrás da frente (uma "placa" de ~300 m de largura);
// agora ±OUT_W m laterais (malha 3D real que segue o terreno) e BACK_VIS m atrás da frente, inclusive antes do início da pista.
const LEG_W=150,OUT_W=720,LIFT=1.1,WALL_H=7,WALL_BACK=30,BACK_VIS=1150,AHEAD_VIS=260,MIN_CHUNK=-5;
const LEG=[-150,-110,-80,-56,-38,-24,-12,0,12,24,38,56,80,110,150];                 // colunas originais (mantidas idênticas)
const OUTER=Array.from({length:21},(_,i)=>Math.round(LEG_W+(i+1)*(OUT_W-LEG_W)/21));        // colunas novas: uma a cada ~27 m até ±OUT_W (o terreno distante é mais grosso que isso)
const COLS=[...OUTER.map(v=>-v).reverse(),...LEG,...OUTER],NC=COLS.length,NR=25,ROWSTEP=CHUNK_N/(NR-1);   // 25 linhas de 8 m por chunk
const CL=COLS.indexOf(-LEG_W),LEGN=LEG.length-1;     // faixa de colunas originais: partículas continuam só ao redor da pista (mesma densidade de antes)
const PF=90,PE=140,PS=110,PN=PF+PE+PS;   // partículas: fogo / brasas / fumaça
const LIGHT_I=6500;
const FOG_C=[.737,.843,.933];
const toS=c=>c<=.0031308?c*12.92:1.055*Math.pow(c,1/2.4)-.055,srgbOf=c=>[toS(c.r),toS(c.g),toS(c.b)];   // THREE.Color guarda linear; o shader da lava escreve direto no vídeo (sRGB) → converte p/ a névoa casar com a cena

// ---------------------------------------------------------------- GLSL
const NOISE=`
float h21(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbm2(vec2 p){return .62*vn(p)+.38*vn(p*2.07+vec2(11.3,7.9));}
float fbm4(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.7);a*=.5;}return s;}
`;
const LAVA_COLOR=`
vec3 lavaColor(vec2 wp,float t,float f){
  vec2 p=wp*.04;
  vec2 q=vec2(fbm2(p+vec2(0.,t*.045)),fbm2(p+vec2(5.2,1.3)-t*.035));
  float n=fbm4(p*1.5+q*1.7+vec2(t*.03,-t*.05));
  float ridge=clamp(1.-abs(n-.5)*3.4,0.,1.);
  float crack=smoothstep(.5,.95,ridge);
  float pulse=.86+.14*sin(t*1.7+n*9.);
  vec3 crust=vec3(.07,.02,.012)*(.5+n);
  vec3 magma=mix(vec3(.8,.09,.01),vec3(1.,.5,.07),crack)*pulse;
  vec3 col=mix(crust,magma,smoothstep(.3,.6,ridge));
  col=mix(col,vec3(1.,.86,.42),smoothstep(.86,1.,ridge)*.85);
  col+=vec3(.5,.18,.02)*(vn(wp*.35+t*vec2(.4,-.3))-.5)*crack;
  col+=vec3(.7,.25,.03)*(1.-smoothstep(0.,36.,f))*.55;
  col=mix(col,vec3(1.,.82,.4),1.-smoothstep(0.,3.,f));
  return col*1.2;
}
`;
// versão barata (4 amostras de ruído em vez de 9) só para pixels MUITO distantes da câmera (área nova, grande): mesma paleta/estrutura, menos detalhe fino
const LAVA_LITE=`
vec3 lavaLite(vec2 wp,float t,float f){
  vec2 p=wp*.04;
  vec2 q=vec2(vn(p+vec2(0.,t*.045)),vn(p+vec2(5.2,1.3)-t*.035));
  float n=fbm2(p*1.5+q*1.7+vec2(t*.03,-t*.05));
  float ridge=clamp(1.-abs(n-.5)*3.4,0.,1.);
  float crack=smoothstep(.5,.95,ridge);
  float pulse=.86+.14*sin(t*1.7+n*9.);
  vec3 crust=vec3(.07,.02,.012)*(.5+n);
  vec3 magma=mix(vec3(.8,.09,.01),vec3(1.,.5,.07),crack)*pulse;
  vec3 col=mix(crust,magma,smoothstep(.3,.6,ridge));
  col=mix(col,vec3(1.,.86,.42),smoothstep(.86,1.,ridge)*.85);
  col+=vec3(.7,.25,.03)*(1.-smoothstep(0.,36.,f))*.55;
  col=mix(col,vec3(1.,.82,.4),1.-smoothstep(0.,3.,f));
  return col*1.2;
}
`;
const HEAD=`uniform float uTime;uniform float uFront;uniform vec3 uFogColor;uniform float uFogNear;uniform float uFogFar;`;
const FOG=`float ff=smoothstep(uFogNear,uFogFar,vD);col=mix(col,uFogColor,ff);`;
const WAVE=`
  const float M=1256.637;vec2 q=mod(w.xz,M);
  w.y+=.22*sin(q.x*.205+uTime*1.3)*sin(q.y*.165-uTime*1.1)+.12*sin(q.x*.465-q.y*.385+uTime*2.1);`;

const SURF_VS=`${HEAD}
attribute float aS;varying vec3 vW;varying float vS;varying float vD;
void main(){
  vec4 w=modelMatrix*vec4(position,1.);${WAVE}
  vW=w.xyz;vS=aS;vec4 mv=viewMatrix*w;vD=-mv.z;gl_Position=projectionMatrix*mv;
}`;
const SURF_FS=`${HEAD}${NOISE}${LAVA_COLOR}${LAVA_LITE}
varying vec3 vW;varying float vS;varying float vD;
void main(){
  float f=uFront-vS;if(f<0.)discard;
  float kl=smoothstep(450.,800.,vD);   // LOD por distância: perto = lava completa (igual a antes); longe = versão barata; entre as duas, mistura (sem costura visível)
  vec3 col=kl>=1.?lavaLite(vW.xz,uTime,f):kl<=0.?lavaColor(vW.xz,uTime,f):mix(lavaColor(vW.xz,uTime,f),lavaLite(vW.xz,uTime,f),kl);${FOG}
  gl_FragColor=vec4(col,1.);
}`;
// parede: aP = (lateral m, perfil 0..4, distância atrás da frente)
const WALL_VS=`${HEAD}
attribute vec3 aP;varying vec3 vW;varying vec3 vP;varying float vD;
void main(){
  vec4 w=modelMatrix*vec4(position,1.);
  vW=w.xyz;vP=aP;vec4 mv=viewMatrix*w;vD=-mv.z;gl_Position=projectionMatrix*mv;
}`;
const WALL_FS=`${HEAD}${NOISE}${LAVA_COLOR}
varying vec3 vW;varying vec3 vP;varying float vD;
void main(){
  float face=1.-smoothstep(.85,1.05,vP.y);
  vec3 col=lavaColor(vW.xz,uTime,vP.z);
  if(face>0.){
    vec3 cf=lavaColor(vec2(vP.x,vW.y*.35-uTime*1.8),uTime,vP.z);
    cf*=mix(1.,1.35,1.-clamp(vP.y,0.,1.));
    cf+=vec3(1.,.5,.1)*smoothstep(.75,1.,vP.y)*.7;
    col=mix(col,cf,face);
  }
  ${FOG}
  gl_FragColor=vec4(col,1.);
}`;
const AURA_VS=`${HEAD}
attribute vec2 aP;varying vec2 vA;
void main(){vA=aP;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`;
const AURA_FS=`${HEAD}${NOISE}
varying vec2 vA;
void main(){
  float fl=.6*vn(vec2(vA.x*.09,uTime*1.6))+.4*vn(vec2(vA.x*.31+7.,uTime*3.1+vA.y*2.));
  float a=pow(1.-vA.y,2.)*fl*.8;
  gl_FragColor=vec4(mix(vec3(1.,.5,.1),vec3(1.,.22,.03),vA.y),a);
}`;
const PART_VS=`attribute float aSize;attribute vec4 aCol;uniform float uScale;varying vec4 vC;
void main(){vec4 mv=viewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(aSize*uScale/max(1.,-mv.z),1.,260.);vC=aCol;}`;
const PART_FS=`varying vec4 vC;
void main(){float r=length(gl_PointCoord-.5)*2.;float a=1.-smoothstep(0.,1.,r);a*=a;if(a<.01)discard;gl_FragColor=vec4(vC.rgb,vC.a*a);}`;
export const SHADERS={SURF_VS,SURF_FS,WALL_VS,WALL_FS,AURA_VS,AURA_FS,PART_VS,PART_FS};

// ---------------------------------------------------------------- sistema
export class LavaSystem{
  constructor(scene){
    this.scene=scene;this.track=null;this.P=null;this.onBurn=null;
    this.front=-1e9;this.gap=1e9;this.speed=0;this.t=0;this.live=true;
    this.active=new Map();this.gpool=[];this.mpool=[];this.job=null;this._sf={};this._ex={x:0,y:0,z:0,h:0,w:40,curv:0};this._fa={x:0,y:0,z:0,h:0,w:40,curv:0};
    const fog=scene.fog,fc=fog&&fog.color?srgbOf(fog.color):FOG_C;
    this.U={uTime:{value:0},uFront:{value:-1e9},uFogColor:{value:new THREE.Vector3(fc[0],fc[1],fc[2])},uFogNear:{value:fog&&fog.near||450},uFogFar:{value:fog&&fog.far||5600}};
    const mk=(vs,fs,o)=>new THREE.ShaderMaterial(Object.assign({uniforms:Object.assign({},this.U),vertexShader:vs,fragmentShader:fs,side:THREE.DoubleSide},o));
    // superfície do chunk: polygonOffset puxa a lava para cima do terreno de LOD grosso (nunca "afunda")
    this.matSurf=mk(SURF_VS,SURF_FS,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
    this.matWall=mk(WALL_VS,WALL_FS,{polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-3});
    this.matAura=mk(AURA_VS,AURA_FS,{transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});
    // índices compartilhados
    const idx=(rows,cols)=>{const a=[];for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){const i=r*cols+c,j=i+1,k=i+cols,l=k+1;a.push(i,k,j,j,k,l);}return new THREE.BufferAttribute(new Uint16Array(a),1);};
    this.idxS=idx(NR,NC);
    // parede: NC colunas × 5 linhas de perfil (vértice = coluna*5+perfil)
    {const a=[];for(let c=0;c<NC-1;c++)for(let p=0;p<4;p++){const i=c*5+p,j=i+1,k=i+5,l=k+1;a.push(i,k,j,j,k,l);}
     const dyn=(n,s)=>new THREE.BufferAttribute(new Float32Array(n*s),s).setUsage(THREE.DynamicDrawUsage);
     const g=new THREE.BufferGeometry();g.setAttribute('position',dyn(NC*5,3));g.setAttribute('aP',dyn(NC*5,3));g.setIndex(new THREE.BufferAttribute(new Uint16Array(a),1));
     this.wallG=g;this.wall=new THREE.Mesh(g,this.matWall);this.wall.frustumCulled=false;scene.add(this.wall);
     const b=[];for(let c=0;c<NC-1;c++){const i=c*2,j=i+1,k=i+2,l=k+1;b.push(i,k,j,j,k,l);}
     const h=new THREE.BufferGeometry();h.setAttribute('position',dyn(NC*2,3));h.setAttribute('aP',dyn(NC*2,2));h.setIndex(new THREE.BufferAttribute(new Uint16Array(b),1));
     this.auraG=h;this.aura=new THREE.Mesh(h,this.matAura);this.aura.frustumCulled=false;scene.add(this.aura);}
    this._wc=false;this._wf=0;this._cF=new Float32Array(NC);this._cB=new Float32Array(NC);this.topX=new Float32Array(NC);this.topY=new Float32Array(NC);this.topZ=new Float32Array(NC);this.fx=0;this.fz=-1;
    // partículas (pool fixo): [0,PF) fogo · [PF,PF+PE) brasas  → aditivo;  [PF+PE,PN) fumaça → mistura normal
    const pg=(n)=>{const g=new THREE.BufferGeometry(),dyn=(m,s)=>new THREE.BufferAttribute(new Float32Array(m*s),s).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position',dyn(n,3));g.setAttribute('aSize',dyn(n,1));g.setAttribute('aCol',dyn(n,4));return g;};
    const pm=(add)=>new THREE.ShaderMaterial({uniforms:{uScale:{value:600}},vertexShader:PART_VS,fragmentShader:PART_FS,transparent:true,depthWrite:false,blending:add?THREE.AdditiveBlending:THREE.NormalBlending});
    this.gA=pg(PF+PE);this.gS=pg(PS);this.mA=pm(true);this.mS=pm(false);
    this.ptsA=new THREE.Points(this.gA,this.mA);this.ptsS=new THREE.Points(this.gS,this.mS);this.ptsA.frustumCulled=this.ptsS.frustumCulled=false;this.ptsS.renderOrder=1;
    scene.add(this.ptsA,this.ptsS);
    const F=()=>new Float32Array(PN);this.X=F();this.Y=F();this.Z=F();this.VX=F();this.VY=F();this.VZ=F();this.AGE=F();this.LIFE=F();this.S0=F();this.S1=F();this.A0=F();
    this.rng=mulberry32(4242);
    // luz da lava (sempre na cena: mudar a quantidade de luzes recompilaria todos os materiais; só a intensidade varia)
    this.light=new THREE.PointLight(0xff5a1c,0,230,2);scene.add(this.light);
    // HUD: aviso de proximidade (elementos em index.html; ausentes = sem HUD)
    this.hud=document.getElementById('lavahud');this.glow=document.getElementById('lavaglow');this._ht='';this._go=-1;
  }
  // ---- ciclo de vida
  bind(track,player){
    this.track=track;this.P=player;this.t=0;this.live=true;
    this.front=player.s-LAVA.START_GAP;this.gap=LAVA.START_GAP;this.speed=0;
    const {lo,hi}=this._range();for(let c=lo;c<=hi;c++){this._startJob(c);this._stepJob(Infinity);}   // chunks iniciais prontos já (poucos; só no início)
    this._initParticles();this._visual(0);
  }
  reset(){   // reinício: a pista antiga foi descartada → devolve tudo aos pools
    for(const ch of this.active.values()){this.scene.remove(ch.mesh);this.mpool.push(ch.mesh);this.gpool.push(ch.g);}this.active.clear();
    if(this.job){this.gpool.push(this.job.g);this.job=null;}
    this._wc=false;this.track=null;this.front=-1e9;this.gap=1e9;this._ht='';this._go=-1;this._hudSet('',0);this.light.intensity=0;
  }
  // ---- helpers de pista (antes do início da pista, prolonga a reta inicial)
  _frame(i){const T=this.track;if(i>=0)return T.get(i);
    const a=T.get(0),d=i*STEP,o=this._ex;o.x=a.x+Math.sin(a.h)*d;o.z=a.z-Math.cos(a.h)*d;o.y=a.y+a.slope*d;o.h=a.h;o.w=a.w;o.curv=0;return o;}
  _at(s,o){const f=s/STEP,i=Math.floor(f),t=f-i,a=this._frame(i),ax=a.x,az=a.z,ah=a.h,aw=a.w,ac=a.curv,b=this._frame(i+1);
    o.x=ax+(b.x-ax)*t;o.z=az+(b.z-az)*t;o.h=ah+(b.h-ah)*t;o.w=aw+(b.w-aw)*t;o.curv=ac+(b.curv-ac)*t;return o;}
  _col(k,w,curv){   // deslocamento lateral da coluna k; na parte interna de curvas fechadas encolhe (a malha não se dobra sobre si mesma)
    const o=COLS[k],inner=o>0?curv:-curv;if(inner<=1e-5)return o;
    const lim=Math.max(.8/inner,w+8),m=Math.abs(o),sg=o<0?-1:1,c150=LEG_W*clamp(lim/LEG_W,.05,1);
    if(m<=LEG_W)return o*clamp(lim/LEG_W,.05,1);          // região original: exatamente como antes
    return sg*Math.max(c150,Math.min(m,lim));}            // região nova: espalha até o limite da curva (nunca cruza a si mesma)
  _range(){const fr=this.front;return{lo:Math.max(MIN_CHUNK,Math.floor((fr-BACK_VIS)/CHUNK_LEN)),hi:Math.floor((fr+AHEAD_VIS)/CHUNK_LEN)};}
  // ---- chunks de superfície (fatias de tempo)
  _makeGeo(){const g=new THREE.BufferGeometry(),dyn=(n,s)=>new THREE.BufferAttribute(new Float32Array(n*s),s).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position',dyn(NR*NC,3));g.setAttribute('aS',dyn(NR*NC,1));g.setIndex(this.idxS);return g;}
  _startJob(c){
    const T=this.track,g=this.gpool.pop()||this._makeGeo(),a=this._frame(c*CHUNK_N);
    const job={c,g,r:0,ox:a.x,oz:a.z};T.ensureZ(this._frame(c*CHUNK_N+CHUNK_N).z-1150);   // a pista precisa existir além do alcance dos filtros do terreno → altura definitiva (igual ao world.js)
    this.job=job;
  }
  _stepJob(end){
    const j=this.job,T=this.track,P=j.g.attributes.position.array,S=j.g.attributes.aS.array,sf=this._sf;
    while(j.r<NR){
      const i=j.c*CHUNK_N+j.r*ROWSTEP,a=this._frame(i),rx=Math.cos(a.h),rz=Math.sin(a.h),ax=a.x,az=a.z,w=a.w,cv=a.curv;
      for(let k=0;k<NC;k++){const o=this._col(k,w,cv),wx=ax+rx*o,wz=az+rz*o,v=j.r*NC+k,m=Math.abs(COLS[k]);let y=surface(T,wx,wz,sf).h+LIFT;
        if(m>LEG_W)y+=(m-LEG_W)/(OUT_W-LEG_W)*.8;   // colunas novas: folga pequena que cresce com a distância (células mais largas → o terreno não fura a lava)
        P[v*3]=wx-j.ox;P[v*3+1]=y;P[v*3+2]=wz-j.oz;S[v]=i*STEP;}
      j.r++;if(performance.now()>=end)break;}
    if(j.r<NR)return false;
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9,z0=1e9,z1=-1e9;
    for(let v=0;v<NR*NC;v++){const x=P[v*3],y=P[v*3+1],z=P[v*3+2];if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;if(z<z0)z0=z;if(z>z1)z1=z;}
    const g=j.g;g.attributes.position.needsUpdate=g.attributes.aS.needsUpdate=true;
    g.boundingSphere=new THREE.Sphere(new THREE.Vector3((x0+x1)/2,(y0+y1)/2,(z0+z1)/2),Math.hypot(x1-x0,y1-y0+2,z1-z0)/2+2);
    const mesh=this.mpool.pop()||new THREE.Mesh(g,this.matSurf);mesh.geometry=g;mesh.position.set(j.ox,0,j.oz);this.scene.add(mesh);
    this.active.set(j.c,{mesh,g,c:j.c});this.job=null;return true;
  }
  _chunks(ms){
    const {lo,hi}=this._range();
    for(const [c,ch] of this.active)if(c<lo||c>hi){this.scene.remove(ch.mesh);this.active.delete(c);this.mpool.push(ch.mesh);this.gpool.push(ch.g);}
    if(this.job&&(this.job.c<lo||this.job.c>hi)){this.gpool.push(this.job.g);this.job=null;}
    if(!this.job){   // próximo chunk que falta, do mais próximo da frente para fora
      const c0=Math.floor(this.front/CHUNK_LEN);let best=null,bd=1e9;
      for(let c=lo;c<=hi;c++)if(!this.active.has(c)){const d=Math.abs(c-c0-.3);if(d<bd){bd=d;best=c;}}
      if(best!==null)this._startJob(best);}
    if(this.job)this._stepJob(performance.now()+ms);
  }
  // ---- parede + aura (reconstruídas todo frame: 15 colunas × 2 amostras de terreno)
  _wall(){
    const T=this.track,fa=this._at(this.front,this._fa),h=fa.h,rx=Math.cos(h),rz=Math.sin(h),fx=Math.sin(h),fz=-Math.cos(h),ox=fa.x,oz=fa.z,w=fa.w,cv=fa.curv,sf=this._sf;
    this.fx=fx;this.fz=fz;this._wf=(this._wf+1)|0;
    const W=this.wallG.attributes.position.array,Pp=this.wallG.attributes.aP.array,A=this.auraG.attributes.position.array,Ap=this.auraG.attributes.aP.array;
    for(let k=0;k<NC;k++){
      const o=this._col(k,w,cv),px=ox+rx*o,pz=oz+rz*o,bx=px-fx*WALL_BACK,bz=pz-fz*WALL_BACK;
      let gF,gB;   // colunas centrais (originais): amostradas todo frame, como antes · colunas novas (largas): 1 em cada 4 frames em rodízio (a frente anda <1 m/frame; custo do terreno cai ~3/4)
      if(Math.abs(COLS[k])<=LEG_W||!this._wc||((k+this._wf)&3)===0){gF=surface(T,px,pz,sf).h+LIFT;gB=surface(T,bx,bz,sf).h+LIFT;this._cF[k]=gF;this._cB[k]=gB;}else{gF=this._cF[k];gB=this._cB[k];}
      const base=[[0,gF-1.2,0],[0,gF+WALL_H,0],[6,lerp(gF,gB,.2)+WALL_H*.92,6],[16,lerp(gF,gB,.53)+WALL_H*.38,16],[WALL_BACK,gB+.35,WALL_BACK]];
      for(let p=0;p<5;p++){const v=(k*5+p)*3,b=base[p][0];
        W[v]=px-fx*b-ox;W[v+1]=base[p][1];W[v+2]=pz-fz*b-oz;Pp[v]=o;Pp[v+1]=p;Pp[v+2]=b;}
      this.topX[k]=px;this.topY[k]=gF+WALL_H;this.topZ[k]=pz;
      const a=k*6,u=k*2;A[a]=px-ox;A[a+1]=gF+WALL_H*.9;A[a+2]=pz-oz;A[a+3]=px-ox;A[a+4]=gF+WALL_H*3.6;A[a+5]=pz-oz;Ap[u*2]=o;Ap[u*2+1]=0;Ap[u*2+2]=o;Ap[u*2+3]=1;
    }
    this._wc=true;this.wall.position.set(ox,0,oz);this.aura.position.set(ox,0,oz);
    this.wallG.attributes.position.needsUpdate=this.wallG.attributes.aP.needsUpdate=true;this.auraG.attributes.position.needsUpdate=this.auraG.attributes.aP.needsUpdate=true;
  }
  // ---- partículas
  _initParticles(){for(let i=0;i<PN;i++){this._spawn(i);const a=this.rng()*this.LIFE[i];this.AGE[i]=a;}this._wall();for(let i=0;i<PN;i++){this._spawn(i);const a=this.rng()*this.LIFE[i];this.AGE[i]=a;this.X[i]+=this.VX[i]*a;this.Y[i]+=this.VY[i]*a;this.Z[i]+=this.VZ[i]*a;}}
  _spawn(i){
    const r=this.rng,k=i<PF?0:i<PF+PE?1:2,u=clamp(.5+(r()+r()+r()-1.5)*.55,0,.999),c=CL+Math.floor(u*LEGN),t=u*LEGN-Math.floor(u*LEGN),b=r()*(k===2?18:24);
    const x=lerp(this.topX[c],this.topX[c+1],t),z=lerp(this.topZ[c],this.topZ[c+1],t),y=lerp(this.topY[c],this.topY[c+1],t),fx=this.fx,fz=this.fz;
    this.X[i]=x-fx*b;this.Z[i]=z-fz*b;this.Y[i]=y-WALL_H*.6*(b/24)+(k===1?r()*2:0);this.AGE[i]=0;
    const sx=(r()-.5)*2,sz=(r()-.5)*2;
    if(k===0){this.VY[i]=3+r()*6;const f=1+r()*3;this.VX[i]=fx*f+sx;this.VZ[i]=fz*f+sz;this.LIFE[i]=1.1+r()*1.4;this.S0[i]=6+r()*6;this.S1[i]=14+r()*10;this.A0[i]=.4;}
    else if(k===1){this.VY[i]=7+r()*12;const f=4+r()*10;this.VX[i]=fx*f+sx*3;this.VZ[i]=fz*f+sz*3;this.LIFE[i]=1.6+r()*2.2;this.S0[i]=this.S1[i]=.5+r()*.8;this.A0[i]=1;}
    else{this.VY[i]=4+r()*5;const f=2+r()*5;this.VX[i]=fx*f+sx;this.VZ[i]=fz*f+sz;this.LIFE[i]=3.2+r()*3;this.S0[i]=10+r()*8;this.S1[i]=34+r()*22;this.A0[i]=.42;}
  }
  _particles(dt){
    const pa=this.gA.attributes,ps=this.gS.attributes;
    for(let i=0;i<PN;i++){
      if((this.AGE[i]+=dt)>=this.LIFE[i])this._spawn(i);
      const age=this.AGE[i],k=age/this.LIFE[i];
      this.X[i]+=this.VX[i]*dt;this.Y[i]+=this.VY[i]*dt;this.Z[i]+=this.VZ[i]*dt;
      let r,g,b,a;const s=lerp(this.S0[i],this.S1[i],k);
      if(i<PF){r=lerp(1,.75,k);g=lerp(.62,.1,k);b=lerp(.16,.02,k);a=this.A0[i]*smoothstep(0,.15,k)*Math.pow(1-k,1.2);}
      else if(i<PF+PE){r=1;g=lerp(.8,.35,k);b=lerp(.35,.05,k);a=this.A0[i]*(1-k)*(.65+.35*Math.sin(age*30+i));this.VY[i]*=1-.4*dt;}
      else{const m=smoothstep(0,.3,k);r=lerp(.5,.15,m);g=lerp(.2,.12,m);b=lerp(.07,.11,m);a=this.A0[i]*smoothstep(0,.2,k)*Math.pow(1-k,1.5);}
      const A=i<PF+PE?pa:ps,j=i<PF+PE?i:i-PF-PE;
      A.position.array[j*3]=this.X[i];A.position.array[j*3+1]=this.Y[i];A.position.array[j*3+2]=this.Z[i];A.aSize.array[j]=s;
      const c=A.aCol.array;c[j*4]=r;c[j*4+1]=g;c[j*4+2]=b;c[j*4+3]=a;
    }
    pa.position.needsUpdate=pa.aSize.needsUpdate=pa.aCol.needsUpdate=true;ps.position.needsUpdate=ps.aSize.needsUpdate=ps.aCol.needsUpdate=true;
  }
  // ---- luz + HUD
  _light(){
    const L=this.light,t=this.t,flick=.9+.1*Math.sin(t*9.1)*Math.sin(t*5.3+1);
    L.position.set(this.topX[NC>>1]+this.fx*10,this.topY[NC>>1]+3,this.topZ[NC>>1]+this.fz*10);
    L.intensity=this.gap<420?LIGHT_I*flick:0;
  }
  _hudSet(txt,glow){
    if(this.hud&&txt!==this._ht){this._ht=txt;this.hud.textContent=txt;if(txt)this.hud.classList.add('on');else this.hud.classList.remove('on');}
    if(this.hud){if(glow>.0&&this.gap<60)this.hud.classList.add('hot');else this.hud.classList.remove('hot');}
    const q=Math.round(glow*20)/20;if(this.glow&&q!==this._go){this._go=q;this.glow.style.opacity=String(q);}
  }
  _visual(dt){
    this.U.uFront.value=this.front;this.U.uTime.value=this.t;
    for(const m of [this.matSurf,this.matWall,this.matAura]){m.uniforms.uFront.value=this.front;m.uniforms.uTime.value=this.t;}
    this._chunks(1.2);this._wall();this._particles(dt);this._light();
    const g=this.gap;this._hudSet(this.live&&g<150?'🔥 LAVA '+Math.max(0,Math.round(g))+' m':'',this.live?clamp((150-g)/120,0,1)*.9:0);
  }
  // ---- por frame
  update(dt,{live=true}={}){
    if(!this.track)return;
    this.t+=dt;this.live=live;const P=this.P;
    let v=LAVA.BASE+LAVA.GROW*smoothstep(0,LAVA.GROW_DIST,Math.max(0,P.s)),gap=P.s-this.front;
    if(gap>LAVA.FAR)v+=(gap-LAVA.FAR)*LAVA.CATCH;           // jogador longe demais → a lava corre atrás
    v=Math.min(v,LAVA.VMAX);this.speed=v;this.front+=v*dt;
    if(live&&P.s-this.front>LAVA.MAX_GAP)this.front=P.s-LAVA.MAX_GAP;
    this.gap=gap=P.s-this.front;
    this._visual(dt);
    if(live&&gap<=LAVA.KILL_MARGIN&&this.onBurn)this.onBurn();   // alcançado: Game over imediato
  }
  setView(camera,heightPx){const s=heightPx/(2*Math.tan(camera.fov*Math.PI/360));this.mA.uniforms.uScale.value=s;this.mS.uniforms.uScale.value=s;
    const fog=this.scene.fog;if(fog&&fog.color){const c=srgbOf(fog.color);this.U.uFogColor.value.set(c[0],c[1],c[2]);}}
}
