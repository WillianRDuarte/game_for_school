// Estrada procedural. A linha central é INTEGRADA a partir de três "planejadores" independentes:
//   horizontal (curvatura), vertical (greide/inclinação) e largura.
// Como cada um só entrega valores contínuos (curvatura → 0 nas pontas de cada manobra; inclinação interpolada
// com smoothstep entre o fim de um trecho e o próximo), o rumo, a altitude e a largura nunca têm degraus.
// Como os planejadores têm comprimentos independentes, as combinações (curva + subida, S descendo, curva fechada
// no topo…) surgem naturalmente e nunca se repetem de forma previsível. Regiões ("temas") mudam o caráter do trecho.
import {mulberry32,smoothstep,lerp,clamp} from './utils.js';
export const STEP=4;                        // metros entre amostras
export const WMAX=48;                       // meia-largura máxima (m). Pista total: 64–96 m
export const SHOULDER=4;                    // acostamento pavimentado em cada lado (m, dentro da meia-largura)
export const Y_MIN=-90,Y_MAX=520;           // faixa de altitude da estrada
const Y_MID=150,Y_HALF=300;
const P=Math.PI,DEG=P/180,CELL=170,RC=300,HMAX=1.35;   // HMAX: rumo sempre a <77° da direção -z (estrada nunca volta sobre si mesma)
const key=(a,b)=>(a+32768)*65536+(b+32768);

// ---------- formas de curvatura (t∈[0,1]); normalizadas para pico = 1; valem 0 nas pontas
const norm=f=>{let m=0;for(let i=0;i<=400;i++)m=Math.max(m,Math.abs(f(i/400)));return t=>f(t)/m;};
const area=f=>{let s=0;for(let i=0;i<400;i++)s+=Math.abs(f((i+.5)/400));return s/400;};
const sin2=norm(t=>Math.sin(P*t)**2);                                   // reta → abre → ápice → fecha → reta
const skewf=p=>norm(t=>Math.sin(P*Math.pow(t,p))**2);                   // ápice deslocado (entra suave e fecha / fecha logo e abre devagar)
const sBend=norm(t=>Math.sin(2*P*t)*Math.sqrt(Math.sin(P*t)));          // S: um lado, depois o outro
const esses=norm(t=>Math.sin(4*P*t)*Math.sqrt(Math.sin(P*t)));          // S duplo
const dbl=norm(t=>Math.sin(2*P*t)**2);                                  // duas curvas seguidas do mesmo lado
// R = raio no ápice (m); D = mudança de rumo por lóbulo (graus); comprimento = D·R·lóbulos / área
export const MAN={
  STRAIGHT:{len:[220,1100]},
  GENTLE:{f:sin2,R:[700,1300],D:[12,30],lobes:1,net:1},
  SWEEP:{f:sin2,R:[450,800],D:[40,85],lobes:1,net:1},                   // curva muito longa
  MEDIUM:{f:sin2,R:[230,400],D:[35,75],lobes:1,net:1},
  TIGHT:{f:sin2,R:[130,190],D:[70,115],lobes:1,net:1},
  HAIRPIN:{f:sin2,R:[95,130],D:[125,165],lobes:1,net:1},
  EASE_IN:{f:skewf(1.7),R:[140,230],D:[50,100],lobes:1,net:1},          // começa suave e fecha no fim
  EASE_OUT:{f:skewf(.6),R:[140,230],D:[50,100],lobes:1,net:1},          // fecha logo e abre devagar
  S_BEND:{f:sBend,R:[260,460],D:[18,40],lobes:2,net:0},
  CHICANE:{f:sBend,R:[120,180],D:[25,45],lobes:2,net:0},
  ESSES:{f:esses,R:[200,330],D:[15,32],lobes:4,net:0},
  DOUBLE:{f:dbl,R:[190,340],D:[25,50],lobes:2,net:2},
};
// exP / exN = maior desvio de rumo acumulado para cada lado ÷ D (ESSES tem lóbulos desiguais; DOUBLE soma 2 lóbulos)
// → mantém |rumo| ≤ HMAX durante a manobra inteira, nos dois sentidos.
for(const m of Object.values(MAN))if(m.f){m.area=area(m.f);let c=0,mx=0,mn=0;for(let i=0;i<800;i++){c+=m.f((i+.5)/800)/800;mx=Math.max(mx,c);mn=Math.min(mn,c);}
  const u=m.area/m.lobes;m.exP=Math.max(1e-6,mx/u);m.exN=Math.max(1e-6,-mn/u);}

// ---------- regiões: cada uma muda o peso das manobras, o relevo vertical e a largura
export const THEMES=[
  {name:'PLANÍCIE',mt:.10,w:[40,48],h:{STRAIGHT:5,GENTLE:4,SWEEP:2.5,MEDIUM:1,S_BEND:1,DOUBLE:.6,EASE_IN:.5,EASE_OUT:.5,TIGHT:.15},
    v:{g:[0,.05],len:[500,1200],flat:.35,run:60}},
  {name:'COLINAS',mt:.40,w:[36,46],h:{STRAIGHT:2,GENTLE:2.5,SWEEP:2,MEDIUM:3,S_BEND:2,DOUBLE:1.5,EASE_IN:1.4,EASE_OUT:1.4,TIGHT:1,CHICANE:.5,ESSES:.6},
    v:{g:[.05,.12],len:[350,850],flat:.12,run:140}},
  {name:'MONTANHA',mt:.90,w:[32,42],h:{STRAIGHT:.6,GENTLE:1,SWEEP:1.6,MEDIUM:2.5,S_BEND:2,DOUBLE:1.4,EASE_IN:2,EASE_OUT:2,TIGHT:2.6,HAIRPIN:1.4,CHICANE:1,ESSES:1},
    v:{g:[.11,.24],len:[280,760],flat:.04,run:320}},
  {name:'VALE',mt:.55,w:[38,48],h:{STRAIGHT:2,GENTLE:3,SWEEP:4,MEDIUM:2,S_BEND:1.5,DOUBLE:1,EASE_IN:1,EASE_OUT:1,TIGHT:.4},
    v:{g:[.04,.10],len:[700,1500],flat:.10,run:200}},
  {name:'SERRA',mt:1,w:[32,40],h:{STRAIGHT:.3,MEDIUM:1.5,S_BEND:1,TIGHT:3,HAIRPIN:3,CHICANE:1.5,EASE_IN:2,EASE_OUT:2,ESSES:1.2},
    v:{g:[.12,.22],len:[450,950],flat:.02,run:380}},
  {name:'SINUOSA',mt:.60,w:[34,44],h:{S_BEND:3,ESSES:2.5,CHICANE:2,DOUBLE:2.5,MEDIUM:2.5,TIGHT:1.4,EASE_IN:1.4,EASE_OUT:1.4,GENTLE:.8,STRAIGHT:.5},
    v:{g:[.06,.15],len:[300,700],flat:.08,run:200}},
];
const THEME_W=[2.2,2,2,1.5,1.5,1.4];

export class Track{
  constructor(seed=7){
    this.rng=mulberry32(seed);this.samples=new Map();this.count=0;this.minKept=0;
    this.x=0;this.y=0;this.z=0;this.h=0;this.w=40;this.g=0;this.first=true;
    this.th=0;this.region={end:260};this.hs=null;this.hk=0;this.vs=null;this.vk=0;this.ws=null;this.wk=0;
    this.lastH='';this.dir=0;this.runY=0;this.log=null;
    this.grid=new Map();this.coarse=new Map();this._nr={y:0,yi:0,d:0,w:0,o:0};
  }
  _weighted(tbl,last){
    const e=Object.entries(tbl),ws=e.map(([k,v])=>v*(k===last?.15:1));
    let r=this.rng()*ws.reduce((a,b)=>a+b,0);for(let i=0;i<e.length;i++){r-=ws[i];if(r<=0)return e[i][0];}return e[e.length-1][0];}
  _pickRegion(){
    const w=THEME_W.map((v,i)=>i===this.th?0:v);let r=this.rng()*w.reduce((a,b)=>a+b,0),n=0;
    for(let i=0;i<w.length;i++){r-=w[i];if(r<=0){n=i;break;}n=i;}
    this.th=n;this.region={end:this.count+Math.round(450+this.rng()*450)};   // 1,8–3,6 km
  }
  _pickH(){
    const T=THEMES[this.th],rng=this.rng;this.hk=0;
    if(this.first){this.hs={n:75,f:null,sgn:1,kap:0,name:'STRAIGHT'};return;}
    for(let tries=0;tries<10;tries++){
      const name=this._weighted(T.h,this.lastH),M=MAN[name];
      if(name==='STRAIGHT'){
        const L=lerp(M.len[0],M.len[1],rng())*(T.mt<.3?1.2:T.mt>.8?.5:1);
        this.hs={n:Math.round(L/STEP),f:null,sgn:1,kap:0,name};this.lastH=name;return;}
      const R=Math.max(lerp(M.R[0],M.R[1],rng()),WMAX+48),D0=lerp(M.D[0],M.D[1],rng())*DEG,h0=this.h;
      const dm=s=>s>0?Math.min((HMAX-h0)/M.exP,(HMAX+h0)/M.exN):Math.min((HMAX-h0)/M.exN,(HMAX+h0)/M.exP);   // maior D permitido para o lado s
      const cand=[];for(const s of[-1,1])if(dm(s)>=.55*D0)cand.push([s,1+2*Math.max(0,-s*this.h)/HMAX]);   // prefere voltar ao centro
      let s;if(!cand.length)s=dm(1)>dm(-1)?1:-1;else{let r=rng()*cand.reduce((a,c)=>a+c[1],0);s=cand[cand.length-1][0];for(const c of cand){r-=c[1];if(r<=0){s=c[0];break;}}}
      const D=Math.min(D0,dm(s));
      if(name==='HAIRPIN'&&D<100*DEG)continue;            // não cabe um grampo agora: sorteia outra manobra
      if(D<.5*D0)continue;
      const L=Math.min(1800,D*R*M.lobes/M.area);
      this.hs={n:Math.max(8,Math.round(L/STEP)),f:M.f,sgn:s,kap:1/R,name,D,R};this.lastH=name;return;}
    this.hs={n:80,f:null,sgn:1,kap:0,name:'STRAIGHT'};this.lastH='STRAIGHT';
  }
  _pickV(){
    const T=THEMES[this.th],V=T.v,rng=this.rng,y=this.y;this.vk=0;
    if(this.first){this.vs={n:75,g0:0,g1:0};return;}
    let dir;
    if(y>Y_MAX-70)dir=-1;else if(y<Y_MIN+50)dir=1;
    else{
      const run=(y-this.runY)*this.dir;
      if(this.dir!==0&&run>V.run)dir=-this.dir;                                   // já subiu/desceu demais: inverte (topo / vale)
      else{const pUp=clamp(.5-(y-Y_MID)/(2*Y_HALF)*.6,.15,.85);dir=rng()<pUp?1:-1;if(this.dir&&rng()<.35)dir=this.dir;}
    }
    const flat=rng()<V.flat,len=lerp(V.len[0],V.len[1],rng());let mag=lerp(V.g[0],V.g[1],Math.pow(rng(),.85));
    if(!flat){const est=.5*(this.g+dir*mag)*len;                                  // ganho estimado (inclui a inércia do greide atual)
      if(est>0&&y+est>Y_MAX-20)dir=-1;else if(est<0&&y+est<Y_MIN+20)dir=1;}          // não estoura a faixa de altitude
    const g1=flat?(rng()-.5)*.02:dir*mag;
    if(!flat&&dir!==this.dir){this.dir=dir;this.runY=y;}
    this.vs={n:Math.max(8,Math.round(len/STEP)),g0:this.g,g1};
  }
  _pickW(){const T=THEMES[this.th],rng=this.rng;this.wk=0;this.ws={n:Math.round(lerp(200,520,rng())),w0:this.w,w1:lerp(T.w[0],T.w[1],rng())};}
  _next(){
    if(this.count>=this.region.end)this._pickRegion();
    if(!this.hs||this.hk>=this.hs.n)this._pickH();
    if(!this.vs||this.vk>=this.vs.n)this._pickV();
    if(!this.ws||this.wk>=this.ws.n)this._pickW();
    this.first=false;
    const H=this.hs,V=this.vs,W=this.ws,i=this.count;
    const curv=H.f?H.sgn*H.f((this.hk+.5)/H.n)*H.kap:0;
    const g=lerp(V.g0,V.g1,smoothstep(0,1,(this.vk+.5)/V.n));
    const w=lerp(W.w0,W.w1,smoothstep(0,1,(this.wk+.5)/W.n));
    const s={x:this.x,y:this.y,z:this.z,h:this.h,w,curv,slope:g,m:THEMES[this.th].mt,th:this.th};this.samples.set(i,s);
    const gk=key(Math.floor(s.x/CELL),Math.floor(s.z/CELL));let a=this.grid.get(gk);if(!a)this.grid.set(gk,a=[]);a.push(i);
    const ck=key(Math.floor(s.x/RC),Math.floor(s.z/RC));let c=this.coarse.get(ck);if(!c)this.coarse.set(ck,c={sy:0,sm:0,n:0});c.sy+=s.y;c.sm+=s.m;c.n++;
    const hm=this.h+curv*STEP*.5;                                   // integração no ponto médio do passo
    this.x+=Math.sin(hm)*STEP;this.z-=Math.cos(hm)*STEP;this.h+=curv*STEP;this.y+=g*STEP;this.w=w;this.g=g;
    this.hk++;this.vk++;this.wk++;this.count++;
  }
  // Gera a pista até ela passar de z (o rumo nunca passa de 77°, então z decresce sempre → o terreno já gerado até aqui é definitivo).
  ensureZ(z){let g=200000;while(g-->0&&this.z>z)this._next();}
  get(i){i=Math.max(i,this.minKept);while(this.count<=i)this._next();return this.samples.get(i);}
  sampleAt(s){const f=s/STEP,i=Math.floor(f),t=f-i,a=this.get(i),b=this.get(i+1),L=(p,q)=>p+(q-p)*t;
    return{x:L(a.x,b.x),y:L(a.y,b.y),z:L(a.z,b.z),h:L(a.h,b.h),w:L(a.w,b.w),slope:L(a.slope,b.slope),curv:L(a.curv,b.curv),th:a.th};}
  prune(min){while(this.minKept<min){const s=this.samples.get(this.minKept);
    if(s){const a=this.grid.get(key(Math.floor(s.x/CELL),Math.floor(s.z/CELL)));if(a&&a[0]===this.minKept)a.shift();this.samples.delete(this.minKept);}this.minKept++;}}
  // Ponto da linha central mais próximo de (x,z). null se nenhum a <170 m.
  nearest(x,z){
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);let best=1e18,bs=null,sw=0,sy=0;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const a=this.grid.get(key(cx+dx,cz+dz));if(!a)continue;
      for(let j=0;j<a.length;j++){const s=this.samples.get(a[j]),ex=x-s.x,ez=z-s.z,d2=ex*ex+ez*ez;if(d2<best){best=d2;bs=s;}
        const q=1/(d2+100);sw+=q*q;sy+=q*q*s.y;}}   // IDW: altitude média ponderada (sem degraus onde a pista passa perto de si mesma)
    if(!bs)return null;
    const fx=Math.sin(bs.h),fz=-Math.cos(bs.h),ex=x-bs.x,ez=z-bs.z,al=Math.max(-STEP,Math.min(STEP,ex*fx+ez*fz)),o=this._nr;
    o.d=Math.sqrt(Math.max(0,best-al*al));o.y=bs.y+bs.slope*al;o.yi=sy/sw;o.w=bs.w;o.h=bs.h;o.o=ex*Math.cos(bs.h)+ez*Math.sin(bs.h);return o;}
  // Distância (m) da BORDA do asfalto mais próximo = min(distância à linha central − meia-largura) sobre TODAS as amostras da rede
  // de estradas guardadas no índice espacial. Varre 5×5 células de 170 m (cobre ≥340 m em volta), então é exata até ~340 m;
  // devolve 1e9 se não há estrada nesse raio. Independe do trecho "local" do carro → sem falso positivo em curva/grampo/chunk.
  edgeDist(x,z){
    const cx=Math.floor(x/CELL),cz=Math.floor(z/CELL);let best=1e9;
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++){const a=this.grid.get(key(cx+dx,cz+dz));if(!a)continue;
      for(let j=0;j<a.length;j++){const s=this.samples.get(a[j]);if(!s)continue;const ex=x-s.x,ez=z-s.z,e=Math.sqrt(ex*ex+ez*ez)-s.w;if(e<best)best=e;}}
    return best<0?0:best;}
  // Campo regional suave derivado da estrada (raio ~950 m): altitude média, "montanhosidade" e influência.
  //   out.y/out.m = média ponderada · out.k = quanto o terreno segue a altitude da pista (0..1) · out.a = proximidade (0..1)
  regional(x,z,out){
    const cx=Math.floor(x/RC),cz=Math.floor(z/RC);let sw=0,sy=0,sm=0;
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++){const c=this.coarse.get(key(cx+dx,cz+dz));if(!c)continue;
      const q=1-Math.hypot((cx+dx+.5)*RC-x,(cz+dz+.5)*RC-z)/(RC*3.2);if(q<=0)continue;
      const w=q*q*Math.min(1,c.n/14);sw+=w;sy+=w*c.sy/c.n;sm+=w*c.sm/c.n;}
    out.k=smoothstep(0,1,Math.min(1,sw/1.4));out.a=smoothstep(.12,2.4,sw);
    out.y=sw>0?sy/sw:0;out.m=sw>0?sm/sw:.3;return out;}
}

// Vértices do asfalto de um chunk: 4 colunas (borda, faixa do acostamento, faixa central, borda) x (N+1) linhas.
// u ∈ {0, A, 1-A, 1}: o acostamento tem largura FIXA (4 m) e o miolo estica com a largura da pista.
export const TEX_A=40/512;
const US=[0,TEX_A,1-TEX_A,1];
export function fillRoad(track,c0,N,pos,uv){
  for(let r=0;r<=N;r++){const sp=track.get(c0+r),rx=Math.cos(sp.h),rz=Math.sin(sp.h),w=sp.w;
    for(let c=0;c<4;c++){const o=c===0?-w:c===1?-w+SHOULDER:c===2?w-SHOULDER:w,i=r*4+c;
      pos[i*3]=sp.x+rx*o;pos[i*3+1]=sp.y+.05;pos[i*3+2]=sp.z+rz*o;uv[i*2]=US[c];uv[i*2+1]=(c0+r)*STEP/16;}}
}
