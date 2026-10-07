// ATMOSFERA VULCÂNICA / APOCALÍPTICA — só visual (nenhuma física, mapa, colisão ou HUD é tocado).
//   · CÉU: cúpula com shader (gradiente preto-avermelhado → laranja no horizonte, brasa de vulcões distantes, brilho na direção da lava).
//   · NUVENS: massas de fumaça vulcânica feitas de "puffs" billboard (UM InstancedBufferGeometry = 1 draw call).
//     Cada puff é uma posição 3D real no mundo (paralaxe, passa por cima da pista, some por trás); 3 camadas de profundidade
//     (horizonte / meio / perto, esta última bem em cima da pista), ordenadas de trás para frente a cada ~0,35 s.
//     Iluminadas por baixo pelo brilho da lava e tingidas pelo horizonte → pesadas, escuras, ameaçadoras.
//   · CINZAS e BRASAS: 2 THREE.Points cuja posição é calculada INTEIRA no vertex shader (custo de CPU ≈ 0), em volta da câmera.
//   · LUZES: hemisfério frio-escuro + luz direcional quente baixa vinda da lava (forte contraste, sem sombra em tempo real).
//   · gradeMaterial(): "color grading" barato (onBeforeCompile) para terreno/estrada/prédios/árvores: dessatura, escurece, esquenta.
//   · Qualidade em 3 níveis (0 baixo · 1 médio/celular · 2 alto/PC) com queda automática se o FPS ficar baixo.
import * as THREE from 'three';
import {fbm,mulberry32,clamp,smoothstep} from './utils.js';

// ------------------------------------------------------------------ AJUSTES (mexa só aqui para mudar o "clima")
export const LOOK={
  FOG:0x4a1a0c,FOG_NEAR:90,FOG_FAR:4200,        // névoa/cinza quente (o horizonte do céu usa a MESMA cor → sem emenda)
  HORIZON:0xff5a1e,MID:0x5a1408,ZENITH:0x06020a,   // céu: brasa no horizonte · vermelho-escuro · quase preto no zênite
  HEMI_SKY:0x3a2038,HEMI_GROUND:0x8a3410,HEMI_I:1.15,   // luz ambiente: sombras arroxeadas frias; "rebatida" laranja vinda do chão incandescente
  SUN:0xff7a2e,SUN_I:2.7,                         // luz direcional quente e baixa (a lava, atrás do jogador)
  GRADE:{sat:.62,bright:.82,tint:[1.10,.90,.76]}, // color grading do cenário
  WIND:[7,3],                                   // vento das nuvens/cinzas (m/s em x,z)
};
const hex=h=>[(h>>16&255)/255,(h>>8&255)/255,(h&255)/255];   // cor sRGB "como será exibida" (os shaders próprios escrevem direto no vídeo)

// ------------------------------------------------------------------ shaders do céu
export const SKY_VS=`varying vec3 vDir;
void main(){vDir=position;gl_Position=projectionMatrix*viewMatrix*modelMatrix*vec4(position,1.);}`;
export const SKY_FS=`precision highp float;
uniform vec3 uHor,uMid,uZen,uFog;uniform vec2 uLava;uniform float uLavaK,uTime;
varying vec3 vDir;
void main(){
  vec3 d=normalize(vDir);float h=d.y;
  float up=max(h,0.);
  vec3 col=mix(uMid,uZen,pow(up,.45));                         // vermelho-escuro → quase preto
  float az=atan(d.x,d.z);
  // brasa ao longo do horizonte, com "manchas" mais fortes (vulcões distantes em erupção)
  float vol=.55+.45*sin(az*3.+1.3)*sin(az*6.+.4)+.25*sin(az*11.+2.1);   // só frequências inteiras → sem emenda em ±π
  float band=exp(-up*5.5);                                       // faixa fina e quente rente ao horizonte
  float wide=exp(-up*1.9);
  col+=uHor*(band*(.55+.5*vol)+wide*.18);
  col+=vec3(1.,.28,.06)*.10*wide*(.5+.5*sin(az*2.+uTime*.05));  // calor se mexendo devagar
  // brilho na direção da lava (o jogador foge dela)
  float lv=max(dot(normalize(d.xz+1e-5),uLava),0.);
  col+=vec3(1.,.38,.08)*pow(lv,5.)*band*uLavaK*1.3;
  // abaixo do horizonte: mesma cor da névoa (some atrás do terreno)
  col=mix(col,uFog,smoothstep(.0,-.06,h));
  // cor exata da névoa no horizonte (sem emenda terreno↔céu)
  col=mix(col,uFog,exp(-abs(h)*130.)*.45);
  gl_FragColor=vec4(col,1.);
}`;

// ------------------------------------------------------------------ shaders das nuvens (puffs billboard instanciados)
//  aC = (x,y,z) relativo à câmera · aD = (tamanho, rotação, sombra 0..1, alfa 0..1)
export const CLOUD_VS=`precision highp float;
attribute vec3 aC;attribute vec4 aD;
uniform vec3 uLava;uniform float uK;
varying vec2 vUv;varying vec4 vP;
void main(){
  vUv=position.xy+.5;
  float cr=cos(aD.y),sr=sin(aD.y);vec2 q=position.xy*aD.x;q=vec2(q.x*cr-q.y*sr,q.x*sr+q.y*cr);
  vec3 right=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),up=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
  vec3 w=cameraPosition+aC+right*q.x+up*q.y;
  float dist=length(aC);float dh=length(aC.xz)+1.;
  float elev=aC.y/dh;                                            // tangente da elevação: perto do horizonte → tinge de brasa
  float hz=(1.-smoothstep(.02,.32,elev))*.55+smoothstep(2200.,5600.,dist)*.35;
  vec2 dl=(cameraPosition.xz+aC.xz)-uLava.xz;
  float glow=uK*(.30+.70/(1.+dot(dl,dl)/(1800.*1800.)));         // base: brilho geral dos campos de lava; mais forte perto da frente
  vP=vec4(aD.z,clamp(hz,0.,1.),glow,aD.w*smoothstep(70.,260.,dist));
  gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);
}`;
export const CLOUD_FS=`precision highp float;
uniform sampler2D uTex;uniform vec3 uHor;
varying vec2 vUv;varying vec4 vP;
void main(){
  vec4 t=texture2D(uTex,vUv);
  float a=t.a*vP.w;if(a<.012)discard;
  float lum=t.r;
  // corpo: quase preto embaixo/denso, cinza-fuligem nos topos
  vec3 col=mix(vec3(.022,.017,.02),vec3(.19,.145,.14),lum*vP.x);
  // iluminação por baixo: brilho da lava refletido na base de cada puff (mais forte nos puffs baixos da massa)
  float under=pow(1.-vUv.y,1.8)*(1.-vP.x*.55);
  col+=vec3(1.,.34,.07)*under*vP.z*(.30+.70*lum);
  // contorno quente (luz do horizonte/lava "vazando" pela borda da fumaça) → silhueta definida, pesada
  float edge=smoothstep(.02,.22,t.a)*(1.-smoothstep(.25,.62,t.a));
  col+=vec3(1.,.36,.08)*edge*(.03+.22*vP.y+.16*vP.z)*(.35+.65*lum);
  // perspectiva atmosférica: nuvens baixas/distantes tendem à cor do horizonte
  col=mix(col,uHor*(.38+.5*lum),vP.y*.55);
  gl_FragColor=vec4(col,a);
}`;

// ------------------------------------------------------------------ shaders de brasas e cinzas (posição inteira no vertex shader)
//  aS = (u,v,w ∈[0,1), fase)
const PART_COMMON=`attribute vec4 aS;uniform vec3 uCam,uBox,uDrift;uniform float uTime,uScale,uSize;varying float vA;varying float vK;
void main(){
  vec3 p=aS.xyz*uBox+uDrift;
  p.x+=sin(uTime*.7+aS.w*40.)*2.5;p.z+=cos(uTime*.55+aS.w*31.)*2.5;
  vec3 r=mod(p-uCam+.5*uBox,uBox)-.5*uBox;
  vec3 w=uCam+r;
  vec4 mv=viewMatrix*vec4(w,1.);
  float e=max(abs(r.x)/uBox.x,max(abs(r.y)/uBox.y,abs(r.z)/uBox.z))*2.;
  vA=(1.-smoothstep(.65,1.,e))*smoothstep(1.5,6.,-mv.z);      // some nas bordas da caixa e bem rente à câmera
  vK=fract(aS.w*7.31);
  gl_Position=projectionMatrix*mv;
  gl_PointSize=clamp(uSize*(.6+vK)*uScale/max(1.,-mv.z),1.,34.);
}`;
export const EMBER_VS=PART_COMMON;
export const EMBER_FS=`precision highp float;uniform float uTime;varying float vA;varying float vK;
void main(){
  float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
  float core=1.-smoothstep(0.,.45,r),halo=pow(1.-r,2.2);
  float fl=.65+.35*sin(uTime*(6.+vK*9.)+vK*60.);
  vec3 c=mix(vec3(1.,.30,.04),vec3(1.,.82,.45),core);
  gl_FragColor=vec4(c*(.5+core),vA*fl*(halo*.9+core));
}`;
export const ASH_VS=PART_COMMON;
export const ASH_FS=`precision highp float;varying float vA;varying float vK;
void main(){
  float r=length(gl_PointCoord-.5)*2.;if(r>1.)discard;
  float a=(1.-smoothstep(.2,1.,r));
  vec3 c=mix(vec3(.10,.08,.08),vec3(.34,.20,.15),vK);          // fuligem cinza, às vezes avermelhada pela lava
  gl_FragColor=vec4(c,vA*a*.55);
}`;

// ------------------------------------------------------------------ textura do puff (gerada por código, sem arquivo/canvas) — R = luminosidade, A = densidade
export function puffTextureData(N=96,seed=11){
  const d=new Uint8Array(N*N*4),r=mulberry32(seed),ox=r()*50,oz=r()*50;
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const u=(i+.5)/N*2-1,v=(j+.5)/N*2-1,rad=Math.hypot(u,v);
    const n=fbm(u*2.6+ox,v*2.6+oz,4),n2=fbm(u*5.5+oz,v*5.5+ox,3);
    let dens=1-smoothstep(.22,.98,rad+(n-.5)*.6);              // bordas esfarrapadas, miolo cheio
    dens=clamp(dens*(.85+.45*n2)*1.45,0,1);
    const lum=clamp(.5+.55*(v*.5+(n-.5)*1.3)+.25*(n2-.5),0,1);   // topo mais claro + grumos
    const o=(j*N+i)*4;d[o]=d[o+1]=d[o+2]=Math.round(lum*255);d[o+3]=Math.round(Math.pow(dens,1.15)*255);
  }
  return d;
}

// ------------------------------------------------------------------ distribuição das massas de nuvem (puro: testável sem WebGL)
//  camadas: 'far' = anel no horizonte (acompanha a câmera) · 'mid'/'near' = anéis de mundo que "dão a volta" ao redor do jogador
export const LAYERS={
  far:{R:0,dist:[3400,5300],alt:[120,620],W:[1500,2400],H:[380,700],puff:[900,1700],n:[8,11],count:[12,16]},
  mid:{R:4300,dist:[0,4300],alt:[320,980],W:[520,950],H:[230,420],puff:[480,950],n:[7,10],count:[20,28]},
  near:{R:1900,dist:[0,1900],alt:[330,640],W:[380,700],H:[190,330],puff:[420,860],n:[6,8],count:[10,14]},
};
const TIER_MASS=[.5,.75,1];   // fração das massas por nível de qualidade
export function makeClouds(seed=2024,mobile=false){
  const rng=mulberry32(seed),R=(a,b)=>a+(b-a)*rng(),masses=[],puffs=[];
  for(const [name,L] of Object.entries(LAYERS)){
    const total=mobile?L.count[0]:L.count[1];
    for(let m=0;m<total;m++){
      const ang=rng()*Math.PI*2,rr=L.R?(.12+.88*Math.sqrt(rng()))*L.R:R(L.dist[0],L.dist[1]);
      const mass={layer:name,R:L.R,ang,dist:rr,cx:L.R?Math.cos(ang)*rr:0,cz:L.R?Math.sin(ang)*rr:0,alt:R(L.alt[0],L.alt[1]),
        tier:m<total*TIER_MASS[0]?0:m<total*TIER_MASS[1]?1:2,first:puffs.length,n:0,dark:.55+rng()*.45};
      const n=Math.round(R(L.n[0],L.n[1])),W=R(L.W[0],L.W[1]),H=R(L.H[0],L.H[1]),ps=R(L.puff[0],L.puff[1]);
      for(let k=0;k<n;k++){
        const a=rng()*Math.PI*2,rad=Math.pow(rng(),.7)*W*.5,ox=Math.cos(a)*rad,oz=Math.sin(a)*rad*.6;
        let oy=(rng()-.35)*H*(1.15-rad/W);if(oy<-H*.18)oy=-H*.18+rng()*H*.05;             // base achatada (como cúmulo-nimbo)
        const shade=clamp((oy+H*.2)/(H*1.2)+.18*rng(),0,1)*mass.dark;
        const size=ps*(.55+.75*rng())*(1.15-rad/W*.45);
        puffs.push({m:masses.length,ox,oy,oz,size,roll:rng()*Math.PI*2,shade,a:.78+.2*rng()});mass.n++;
      }
      masses.push(mass);
    }
  }
  return{masses,puffs};
}
// posição de um puff relativa à câmera (m); out=[x,y,z,fade]. cam=(x,y,z); t=tempo (s) para a deriva do vento
export function puffRel(mass,p,camX,camY,camZ,t,out){
  const wx=LOOK.WIND[0]*t,wz=LOOK.WIND[1]*t;let rx,rz,fade=1;
  if(mass.R){   // anel de mundo: cada massa é repetida a cada 2R → sempre há nuvens em volta, e elas passam por cima da pista com paralaxe real
    const P=2*mass.R;rx=((mass.cx+wx-camX+mass.R)%P+P)%P-mass.R;rz=((mass.cz+wz-camZ+mass.R)%P+P)%P-mass.R;
    fade=1-smoothstep(.78*mass.R,.97*mass.R,Math.max(Math.abs(rx),Math.abs(rz)));
  }else{        // anel do horizonte: acompanha a câmera (distância "infinita"), gira bem devagar com o vento
    const a=mass.ang+t*.0009;rx=Math.cos(a)*mass.dist;rz=Math.sin(a)*mass.dist;
  }
  out[0]=rx+p.ox;out[1]=mass.alt+p.oy;out[2]=rz+p.oz;out[3]=fade;return out;
}

// ------------------------------------------------------------------ color grading barato por material (terreno, estrada, prédios, árvores)
export function gradeMaterial(mat,{sat=LOOK.GRADE.sat,bright=LOOK.GRADE.bright,tint=LOOK.GRADE.tint}={}){
  if(!mat||mat._volc)return mat;mat._volc=true;
  const f=n=>(+n).toFixed(3);
  mat.onBeforeCompile=sh=>{
    sh.fragmentShader=sh.fragmentShader
      .replace('#include <common>',`#include <common>
vec3 volcGrade(vec3 c){float l=dot(c,vec3(.299,.587,.114));c=mix(vec3(l),c,${f(sat)});return c*${f(bright)}*vec3(${f(tint[0])},${f(tint[1])},${f(tint[2])});}`)
      .replace('#include <color_fragment>','#include <color_fragment>\n  diffuseColor.rgb=volcGrade(diffuseColor.rgb);');
  };
  mat.customProgramCacheKey=()=>'volc'+sat+bright+tint.join();
  return mat;
}

// ------------------------------------------------------------------ sistema
export class Atmosphere{
  constructor(scene,{mobile=false,tier=null}={}){
    this.scene=scene;this.mobile=mobile;this.tier=tier==null?(mobile?1:2):tier;this.t=0;this.baseY=null;
    this.lavaAz=[0,1];this.lavaK=.0;this.lavaPos=[0,0,0];this.heading=0;
    const H=hex(LOOK.HORIZON),Mi=hex(LOOK.MID),Z=hex(LOOK.ZENITH),F=hex(LOOK.FOG);
    // ---- fog + luzes
    scene.fog=new THREE.Fog(LOOK.FOG,LOOK.FOG_NEAR,LOOK.FOG_FAR);scene.background=new THREE.Color(LOOK.FOG);
    this.hemi=new THREE.HemisphereLight(LOOK.HEMI_SKY,LOOK.HEMI_GROUND,LOOK.HEMI_I);scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(LOOK.SUN,LOOK.SUN_I);this.sun.position.set(-.6,.4,.7);scene.add(this.sun);
    // ---- céu
    const sg=new THREE.SphereGeometry(6300,32,20);
    this.skyU={uHor:{value:new THREE.Vector3(...H)},uMid:{value:new THREE.Vector3(...Mi)},uZen:{value:new THREE.Vector3(...Z)},uFog:{value:new THREE.Vector3(...F)},
      uLava:{value:new THREE.Vector2(0,1)},uLavaK:{value:0},uTime:{value:0}};
    this.sky=new THREE.Mesh(sg,new THREE.ShaderMaterial({uniforms:this.skyU,vertexShader:SKY_VS,fragmentShader:SKY_FS,side:THREE.BackSide,depthWrite:false,fog:false}));
    this.sky.renderOrder=-2;this.sky.frustumCulled=false;scene.add(this.sky);
    // ---- nuvens
    const C=makeClouds(2024,mobile);this.C=C;this.rel=[0,0,0,0];
    this.cap=C.puffs.length;this._cloudGeo(this.cap);
    const tex=new THREE.DataTexture(puffTextureData(96),96,96,THREE.RGBAFormat);tex.minFilter=THREE.LinearFilter;tex.magFilter=THREE.LinearFilter;tex.generateMipmaps=false;tex.needsUpdate=true;this.tex=tex;
    this.cloudU={uTex:{value:tex},uLava:{value:new THREE.Vector3(1e9,0,1e9)},uK:{value:.8},uHor:{value:new THREE.Vector3(...H)}};
    this.clouds=new THREE.Mesh(this.cg,new THREE.ShaderMaterial({uniforms:this.cloudU,vertexShader:CLOUD_VS,fragmentShader:CLOUD_FS,transparent:true,depthWrite:false,fog:false,side:THREE.DoubleSide}));
    this.clouds.renderOrder=-1;this.clouds.frustumCulled=false;scene.add(this.clouds);
    this.order=[];this.sortT=0;this._buildActive();
    // ---- brasas + cinzas
    const mkP=(n,seed)=>{const r=mulberry32(seed),a=new Float32Array(n*4);for(let i=0;i<n*4;i++)a[i]=r();const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(new Float32Array(n*3),3));g.setAttribute('aS',new THREE.BufferAttribute(a,4));return g;};
    this.pU=(box,size)=>({uCam:{value:new THREE.Vector3()},uBox:{value:new THREE.Vector3(...box)},uDrift:{value:new THREE.Vector3()},uTime:{value:0},uScale:{value:600},uSize:{value:size}});
    this.emU=this.pU([130,56,130],.55);this.ashU=this.pU([170,70,170],.9);this.emRise=1.9;this.ashRise=-.55;
    this.NE=mobile?150:240;this.NA=mobile?110:190;
    this.embers=new THREE.Points(mkP(this.NE,5),new THREE.ShaderMaterial({uniforms:this.emU,vertexShader:EMBER_VS,fragmentShader:EMBER_FS,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));
    this.ash=new THREE.Points(mkP(this.NA,9),new THREE.ShaderMaterial({uniforms:this.ashU,vertexShader:ASH_VS,fragmentShader:ASH_FS,transparent:true,depthWrite:false,fog:false}));
    for(const p of[this.embers,this.ash]){p.frustumCulled=false;p.renderOrder=3;scene.add(p);}
    this.setTier(this.tier);
    // ---- queda automática de qualidade
    this._acc=0;this._n=0;this._low=0;this.onTier=null;
  }
  _cloudGeo(cap){
    const g=new THREE.InstancedBufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(new Float32Array([-.5,-.5,0,.5,-.5,0,.5,.5,0,-.5,.5,0]),3));g.setIndex(new THREE.BufferAttribute(new Uint16Array([0,1,2,0,2,3]),1));
    this.aC=new THREE.InstancedBufferAttribute(new Float32Array(cap*3),3).setUsage(THREE.DynamicDrawUsage);this.aD=new THREE.InstancedBufferAttribute(new Float32Array(cap*4),4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aC',this.aC);g.setAttribute('aD',this.aD);g.instanceCount=0;this.cg=g;
  }
  _buildActive(){this.active=[];const C=this.C;for(let i=0;i<C.puffs.length;i++)if(C.masses[C.puffs[i].m].tier<=this.tier)this.active.push(i);this.order=this.active.slice();this.cg.instanceCount=this.active.length;this.sortT=0;}
  setTier(t){
    this.tier=clamp(t|0,0,2);this._buildActive();
    const k=[.55,.8,1][this.tier];this.embers.geometry.setDrawRange(0,Math.round(this.NE*k));this.ash.geometry.setDrawRange(0,Math.round(this.NA*k));
  }
  // luz direcional: vinda de ATRÁS do jogador (lado da lava), baixa, levemente lateral — ilumina de laranja as faces voltadas para a lava (as que a câmera enxerga)
  _lights(dt,psi){
    const k=1-Math.exp(-dt*1.5),d=Math.atan2(Math.sin(psi-this.heading),Math.cos(psi-this.heading));this.heading+=d*k;
    const h=this.heading,fx=Math.sin(h),fz=-Math.cos(h),rx=Math.cos(h),rz=Math.sin(h);
    this.sun.position.set(-fx*.85+rx*-.45,.42,-fz*.85+rz*-.45);
  }
  // cam: THREE.Camera · player: {psi,y} · lavaFront: [x,y,z]|null · gap: distância (m) jogador↔lava
  update(dt,cam,player,lavaFront,gap){
    this.t+=dt;const t=this.t,p=cam.position;
    if(this.baseY==null)this.baseY=p.y;this.baseY+=(p.y-this.baseY)*(1-Math.exp(-dt*.6));   // teto de nuvens acompanha o relevo bem devagar
    this.sky.position.copy(p);
    // lava: direção e intensidade do brilho no céu / nas bases das nuvens
    if(lavaFront){this.lavaPos=lavaFront;const dx=lavaFront[0]-p.x,dz=lavaFront[2]-p.z,l=Math.hypot(dx,dz)||1;this.lavaAz=[dx/l,dz/l];this.lavaK+=(clamp(1.15-gap/900,.35,1.15)-this.lavaK)*Math.min(1,dt*2);}
    this.skyU.uLava.value.set(this.lavaAz[0],this.lavaAz[1]);this.skyU.uLavaK.value=this.lavaK;this.skyU.uTime.value=t;
    this.cloudU.uLava.value.set(this.lavaPos[0],this.lavaPos[1],this.lavaPos[2]);this.cloudU.uK.value=.55+this.lavaK*.55;
    this._lights(dt,player.psi||0);
    // nuvens: posições relativas à câmera (y relativo ao teto suavizado)
    const C=this.C,rel=this.rel,aC=this.aC.array,aD=this.aD.array,ord=this.order,camY=p.y-this.baseY;
    this.sortT-=dt;
    if(this.sortT<=0){   // ordena de trás para frente (mistura alfa correta) — a cada ~0,35 s
      this.sortT=.35;const dist=this._dist||(this._dist=new Float32Array(C.puffs.length));
      for(const i of this.active){const q=C.puffs[i];puffRel(C.masses[q.m],q,p.x,p.y,p.z,t,rel);dist[i]=rel[0]*rel[0]+rel[2]*rel[2]+(rel[1]-camY)*(rel[1]-camY);}
      ord.sort((a,b)=>dist[b]-dist[a]);
    }
    for(let n=0;n<ord.length;n++){
      const q=C.puffs[ord[n]],m=C.masses[q.m];puffRel(m,q,p.x,p.y,p.z,t,rel);
      aC[n*3]=rel[0];aC[n*3+1]=rel[1]-camY;aC[n*3+2]=rel[2];
      aD[n*4]=q.size;aD[n*4+1]=q.roll;aD[n*4+2]=q.shade;aD[n*4+3]=q.a*rel[3];
    }
    this.aC.needsUpdate=this.aD.needsUpdate=true;
    // brasas/cinzas: deriva periódica (nunca cresce sem limite → sem perda de precisão)
    const wx=LOOK.WIND[0]*3.2,wz=LOOK.WIND[1]*3.2;
    for(const [U,box,rise] of[[this.emU,[130,56,130],this.emRise],[this.ashU,[170,70,170],this.ashRise]]){
      U.uCam.value.set(p.x,p.y+8,p.z);U.uTime.value=t%900;
      U.uDrift.value.set((wx*t)%box[0],(rise*t)%box[1],(wz*t)%box[2]);
    }
    // aviso de qualidade: média de ~2 s; 2 janelas ruins seguidas → desce um nível
    this._acc+=dt;this._n++;
    if(this._acc>2){const ms=this._acc/this._n*1000;this._acc=0;this._n=0;
      if(ms>29&&this.tier>0){if(++this._low>=2){this._low=0;this.setTier(this.tier-1);if(this.onTier)this.onTier(this.tier);}}else this._low=0;}
  }
  setView(camera,heightPx){const s=heightPx/(2*Math.tan(camera.fov*Math.PI/360));this.emU.uScale.value=s;this.ashU.uScale.value=s;}
}
