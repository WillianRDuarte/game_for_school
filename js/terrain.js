// Função de altura do mundo: ground(x,z) é a ÚNICA fonte de verdade — a malha visual e a física do carro usam a mesma.
//
//   altura = mistura entre
//     (a) "far":  altitude regional da estrada (suavizada) + relevo (montanhas em cristas, colinas, vales, ruído fino)
//     (b) "corredor": o leito da estrada + acostamento plano + talude que sobe/desce suavemente até o relevo
//   O relevo é atenuado perto da estrada (a estrada foi "construída dentro" do ambiente) e cresce com a distância,
//   então montanhas de verdade aparecem nos flancos e no horizonte. Toda a dependência da estrada é por campos SUAVES
//   (nunca por "o segmento mais próximo" sozinho), então não há degraus quando a pista passa perto de si mesma.
import {smoothstep,lerp,clamp,gnoise2,gfbm,ridged} from './utils.js';

export const TILE_N=32;                    // quadrados por lado de cada tile
export const MIN_TILE=128;                 // tile mais fino (células de 4 m); cada nível dobra
export const LEVELS=6;                     // 128, 256, 512, 1024, 2048, 4096 m
export const ROOT=MIN_TILE<<(LEVELS-1);
export const PAD=[0,10,20,40,60,60];       // nos LODs grossos o "corredor plano" é alargado p/ um triângulo largo nunca enterrar a pista

const _R={y:0,m:.3,k:0,a:0};
export function ground(track,x,z,out,pad=0){
  const nr=track.nearest(x,z),R=track.regional(x,z,_R);
  const B=120+140*gnoise2(x/6000+3.1,z/6000-1.7);              // altitude "de fundo" do mundo (longe de qualquer estrada)
  const reg=lerp(B,R.y,R.k);                                   // perto da pista segue a altitude dela; longe, o fundo
  // ---- "caráter" do terreno: campos de baixíssima frequência, contínuos e independentes entre si.
  //      Cada região do mundo combina tipos diferentes de relevo (nunca o mesmo padrão se repetindo).
  const zn=gnoise2(x/2600+7.7,z/2600+2.3);
  const Zr=clamp(.5+.75*zn+(R.m-.5)*.8*R.k,0,1),Zs=Zr*Zr*(3-2*Zr);                  // 0 = planície, 1 = cordilheira
  const Rg=smoothstep(-.3,.5,gnoise2(x/1700+31,z/1700-17));                           // 0 = suave, 1 = acidentado
  const Sw=smoothstep(-.4,.4,gnoise2(x/1300-9,z/1300+4));                             // 0 = colinas pequenas, 1 = colinas grandes
  const F=smoothstep(.2,.65,gnoise2(x/1900+57,z/1900+3));                             // áreas planas
  const Bf=smoothstep(.25,.7,gnoise2(x/1250+88,z/1250-40));                           // bacias / depressões / vales largos
  const Hb=clamp((R.y-150)/250,-1,1)*R.k;                                             // estrada alta → terreno em volta sobe (colinas); baixa → vale
  // ---- escalas combinadas: grandes formações + ondulações médias + irregularidades; domínio deformado (sem alinhamento à grade)
  const wx=x+110*gnoise2(x/700+2.2,z/700),wz=z+110*gnoise2(x/700-5.1,z/700+9.3);
  const n3=gfbm(x/170+5,z/170-3,3),rd=ridged(wx/1000+11.7,wz/1000-4.2,4);
  const small=gfbm(wx/230,wz/230,3)*lerp(14,34,Rg),big=gfbm(wx/750,wz/750,3)*lerp(40,110,Sw)+gfbm(wx/1900,wz/1900,2)*45;
  const hills=lerp(small+big*.45,big+small*.5,Sw);
  const rel=((hills+Zs*(rd*250-40))*(1-.82*F*(1-Zs))-Bf*(1-.5*Zs)*80+Hb*(.35+.4*Zs)*75)*lerp(1,.4,R.a);   // relevo pleno só longe da pista
  const det=(gnoise2(x/30,z/30)+.25*gnoise2(x/11+3,z/11))*(.7+3.2*Rg)*(1+.5*Zs)*(1-.6*F);                 // pequenas irregularidades
  out.zs=Rg;out.r=clamp(n3*.5+.5,0,1);
  let far=reg+rel;
  if(!nr){                                                     // >170 m da pista: só relevo
    far+=det;
    out.h=far;out.d=-1;out.w=0;out.e=-1;out.roadY=reg;out.rel=rel;return out;}
  const eT=Math.max(0,nr.d-nr.w),e=Math.max(0,eT-pad);
  far+=det*smoothstep(3,30,e);   // acostamento limpo, rugosidade só mais longe
  const yr=lerp(nr.y,nr.yi,smoothstep(nr.w,nr.w+20,nr.d));    // leito (nr.y) sob a pista; média IDW fora dela
  const dl=far-yr,u=Math.max(0,e-3),lim=.7*u*u/(u+5);          // 3 m de acostamento plano; depois o talude cresce suavemente (limite de inclinação)
  const hc=yr-.1+(lim>1e-3?lim*Math.tanh(dl/lim):0);
  const eB=110-pad;                                            // termina antes dos 170 m de alcance do índice espacial → contínuo com o ramo "sem pista"
  out.h=lerp(far,hc,1-smoothstep(eB*.3,eB,e));
  if(pad>=40)out.h-=(pad>=60?3:1.2)*(1-smoothstep(0,pad+30,eT));  // LODs distantes (>1,3 km): leito levemente rebaixado → triângulo largo nunca cobre a pista
  out.d=nr.d;out.w=nr.w;out.e=eT;out.roadY=nr.y;out.rel=out.h-yr;out.o=nr.o;return out;
}
// Superfície dirigível: asfalto (plano lateralmente) ou terreno. Usada pelo carro e pela câmera.
export function surface(track,x,z,o){ground(track,x,z,o,0);o.onRoad=o.d>=0&&o.d<=o.w;if(o.onRoad)o.h=o.roadY+.05;return o;}

// ---------- cores por vértice: relva/alpino, rocha nas encostas, neve no alto, cascalho no acostamento
const GL=[.14,.32,.08],GD=[.30,.40,.14],ALP=[.30,.30,.20],RK1=[.36,.33,.30],RK2=[.25,.23,.21],SNOW=[.92,.94,.97],GRAV=[.47,.42,.35];
function paint(col,o,h,ny,e,r,rg){
  const slope=1-ny,rock=smoothstep(.10-.04*rg,.30-.08*rg,slope+(r-.5)*.06),veg=1-smoothstep(280,520,h+(r-.5)*80);
  const snow=smoothstep(430,540,h+(r-.5)*70)*(1-.85*smoothstep(.12,.32,slope)),sd=e>=0?1-smoothstep(3.5,11,e):0,shade=.88+.24*r;
  for(let i=0;i<3;i++){
    let v=lerp(ALP[i],lerp(GL[i],GD[i],Math.min(1,r*.8+rg*.45)),veg);
    v=lerp(v,lerp(RK1[i],RK2[i],r),rock);v=lerp(v,SNOW[i],snow);v=lerp(v,GRAV[i],sd*.9);col[o+i]=v*shade;}
}

// Índices (compartilhados por todos os tiles): grade (N+1)² + saia (skirt) em volta, que esconde frestas entre LODs diferentes.
export function buildTileIndex(){
  const N=TILE_N,W=N+1,a=[];
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){const p=j*W+i,q=p+1,r=p+W,s=r+1;a.push(p,r,q,q,r,s);}   // voltado para cima (+y)
  const V=W*W,top=[(p)=>p,(p)=>p*W+N,(p)=>N*W+(N-p),(p)=>(N-p)*W];                                     // norte, leste, sul, oeste
  for(let e=0;e<4;e++)for(let p=0;p<N;p++){const t0=top[e](p),t1=top[e](p+1),s0=V+e*W+p,s1=s0+1;a.push(t0,t1,s0,t1,s1,s0);}
  return new Uint32Array(a);
}
export const TILE_VERTS=(TILE_N+1)*(TILE_N+1)+4*(TILE_N+1);

// Amostra a altura de um tile em fatias (para não travar o frame) e depois monta posição/normal/cor.
const _g={};
export class TileSampler{
  constructor(){const G=TILE_N+3;this.G=G;this.a=new Float32Array(G*G*4);}
  begin(x0,z0,level){this.x0=x0;this.z0=z0;this.level=level;this.size=MIN_TILE<<level;this.cell=this.size/TILE_N;this.pad=PAD[level];this.row=0;}
  step(track,deadline){                                       // grade com 1 amostra extra em cada borda → normais idênticas entre tiles vizinhos
    const G=this.G,a=this.a,c=this.cell;
    while(this.row<G){
      const gz=this.z0+(this.row-1)*c;
      for(let k=0;k<G;k++){ground(track,this.x0+(k-1)*c,gz,_g,this.pad);const o=(this.row*G+k)*4;a[o]=_g.h;a[o+1]=_g.e;a[o+2]=_g.zs;a[o+3]=_g.r;}
      this.row++;if(performance.now()>deadline)break;}
    return this.row>=G;
  }
  finish(pos,nrm,col){
    const N=TILE_N,G=this.G,a=this.a,c=this.cell,W=N+1,V=W*W,sk=c*1.3+3;let hmin=1e9,hmax=-1e9;
    const H=(i,j)=>a[((j+1)*G+(i+1))*4];
    for(let j=0;j<=N;j++)for(let i=0;i<=N;i++){
      const o=((j+1)*G+(i+1))*4,h=a[o],vi=j*W+i,gx=(H(i-1,j)-H(i+1,j))/(2*c),gz=(H(i,j-1)-H(i,j+1))/(2*c),il=1/Math.sqrt(gx*gx+1+gz*gz);
      pos[vi*3]=i*c;pos[vi*3+1]=h;pos[vi*3+2]=j*c;nrm[vi*3]=gx*il;nrm[vi*3+1]=il;nrm[vi*3+2]=gz*il;
      paint(col,vi*3,h,il,a[o+1],a[o+3],a[o+2]);if(h<hmin)hmin=h;if(h>hmax)hmax=h;}
    const top=[p=>p,p=>p*W+N,p=>N*W+(N-p),p=>(N-p)*W];
    for(let e=0;e<4;e++)for(let p=0;p<=N;p++){const t=top[e](p),s=V+e*W+p;
      pos[s*3]=pos[t*3];pos[s*3+1]=pos[t*3+1]-sk;pos[s*3+2]=pos[t*3+2];
      nrm[s*3]=nrm[t*3];nrm[s*3+1]=nrm[t*3+1];nrm[s*3+2]=nrm[t*3+2];col[s*3]=col[t*3];col[s*3+1]=col[t*3+1];col[s*3+2]=col[t*3+2];}
    return{hmin:hmin-sk,hmax};
  }
}
