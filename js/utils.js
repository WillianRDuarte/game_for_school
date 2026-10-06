export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const lerp=(a,b,t)=>a+(b-a)*t;
export const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const hash=(x,z)=>{const s=Math.sin(x*127.1+z*311.7)*43758.5453;return s-Math.floor(s);};
export function noise2(x,z){const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi,u=xf*xf*(3-2*xf),v=zf*zf*(3-2*zf);
  return lerp(lerp(hash(xi,zi),hash(xi+1,zi),u),lerp(hash(xi,zi+1),hash(xi+1,zi+1),u),v);}
export function fbm(x,z,o=4){let a=1,f=1,s=0,n=0;for(let i=0;i<o;i++){s+=a*noise2(x*f,z*f);n+=a;a*=.5;f*=2;}return s/n;}
export function mulberry32(a){return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}

// Ruído de gradiente (Perlin 2D) -> ~[-1,1]. Sem os artefatos alinhados à grade do value-noise.
const GX=new Float32Array(256),GZ=new Float32Array(256);
for(let i=0;i<256;i++){const a=i/256*Math.PI*2;GX[i]=Math.cos(a);GZ[i]=Math.sin(a);}
const gi=(x,z)=>(hash(x,z)*256)|0;
export function gnoise2(x,z){
  const xi=Math.floor(x),zi=Math.floor(z),xf=x-xi,zf=z-zi;
  const u=xf*xf*xf*(xf*(xf*6-15)+10),v=zf*zf*zf*(zf*(zf*6-15)+10);
  const a=gi(xi,zi),b=gi(xi+1,zi),c=gi(xi,zi+1),d=gi(xi+1,zi+1);
  const n00=GX[a]*xf+GZ[a]*zf,n10=GX[b]*(xf-1)+GZ[b]*zf,n01=GX[c]*xf+GZ[c]*(zf-1),n11=GX[d]*(xf-1)+GZ[d]*(zf-1);
  const x0=n00+(n10-n00)*u,x1=n01+(n11-n01)*u;return (x0+(x1-x0)*v)*1.414;
}
// fBm de gradiente: cada oitava é girada/deslocada (quebra qualquer direção preferencial). -> ~[-1,1]
export function gfbm(x,z,o=4){let a=1,s=0,n=0;for(let i=0;i<o;i++){s+=a*gnoise2(x,z);n+=a;a*=.5;const nx=x*1.6-z*1.2+17.3,nz=x*1.2+z*1.6-9.1;x=nx;z=nz;}return s/n;}
// Ruído "ridged": cristas e picos de montanha. -> ~[0,1]
export function ridged(x,z,o=4){let a=1,s=0,n=0;for(let i=0;i<o;i++){const q=gnoise2(x,z),g=1.173-Math.sqrt(q*q+.03);s+=a*g*g;n+=a;a*=.42;const nx=x*1.6-z*1.2+5.7,nz=x*1.2+z*1.6+13.9;x=nx;z=nz;}return s/n;}   // crista suavizada (sem quina)
