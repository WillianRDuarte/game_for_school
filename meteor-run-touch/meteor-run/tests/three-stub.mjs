// Stub do three.js para rodar a lógica do jogo em Node (sem GPU). Geometria/atributos são reais (arrays); matrizes de câmera são calculadas de verdade.
export class Matrix4{constructor(){this.elements=new Float64Array(16);this.elements[0]=this.elements[5]=this.elements[10]=this.elements[15]=1;}}
export class Vector3{constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;}set(x,y,z){this.x=x;this.y=y;this.z=z;return this;}copy(v){return this.set(v.x,v.y,v.z);}clone(){return new Vector3(this.x,this.y,this.z);}
  length(){return Math.hypot(this.x,this.y,this.z);}normalize(){const l=this.length()||1;this.x/=l;this.y/=l;this.z/=l;return this;}
  applyMatrix4(m){const e=m.elements,x=this.x,y=this.y,z=this.z,w=1/(e[3]*x+e[7]*y+e[11]*z+e[15]);this.x=(e[0]*x+e[4]*y+e[8]*z+e[12])*w;this.y=(e[1]*x+e[5]*y+e[9]*z+e[13])*w;this.z=(e[2]*x+e[6]*y+e[10]*z+e[14])*w;return this;}}
export class Quaternion{setFromUnitVectors(a,b){this.a=a.clone();this.b=b.clone();return this;}}
export class Sphere{constructor(c,r){this.center=c;this.radius=r;}}
export class Color{constructor(h=0){this.r=this.g=this.b=0;this.h=h;}multiplyScalar(k){this.r*=k;this.g*=k;this.b*=k;this.dark=(this.dark||1)*k;return this;}getHex(){return this.h;}setHex(h){this.h=h;return this;}lerpColors(a,b,t){this.r=a.r+(b.r-a.r)*t;this.g=a.g+(b.g-a.g)*t;this.b=a.b+(b.b-a.b)*t;return this;}}
export class BufferAttribute{constructor(a,s){this.array=a;this.itemSize=s;this.count=a.length/s;}setUsage(){return this;}set needsUpdate(v){}getY(i){return this.array[i*this.itemSize+1];}}
export class BufferGeometry{constructor(){this.attributes={};this.index=null;}setAttribute(n,a){this.attributes[n]=a;}setIndex(i){this.index=i;}computeBoundingSphere(){}translate(){return this;}dispose(){this.disposed=true;}
  computeVertexNormals(){const p=this.attributes.position.array,ix=this.index?this.index.array:Array.from({length:p.length/3},(_,i)=>i),n=new Float32Array(p.length);
    for(let t=0;t<ix.length;t+=3){const a=ix[t]*3,b=ix[t+1]*3,c=ix[t+2]*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;for(const k of[a,b,c]){n[k]+=nx;n[k+1]+=ny;n[k+2]+=nz;}}
    for(let i=0;i<n.length;i+=3){const l=Math.hypot(n[i],n[i+1],n[i+2])||1;n[i]/=l;n[i+1]/=l;n[i+2]/=l;}this.attributes.normal=new BufferAttribute(n,3);}}
const geo=(n)=>class extends BufferGeometry{constructor(){super();const a=new Float32Array(n*3);for(let i=0;i<a.length;i++)a[i]=Math.sin(i*12.9)*.5;this.attributes.position=new BufferAttribute(a,3);}};
export const OctahedronGeometry=geo(24),TorusGeometry=geo(60),IcosahedronGeometry=geo(80),ConeGeometry=geo(40),CylinderGeometry=geo(40),BoxGeometry=geo(24);
export class SphereGeometry extends BufferGeometry{constructor(){super();const a=new Float32Array(33*17*3);for(let i=0;i<a.length;i+=3)a[i+1]=Math.sin(i)*6000;this.attributes.position=new BufferAttribute(a,3);}}
class Mat{constructor(o={}){Object.assign(this,o);if(o.emissive!==undefined)this.emissive=new Color(o.emissive);if(typeof o.color==='number')this.color=new Color(o.color);}clone(){return new this.constructor({...this});}dispose(){this.disposed=true;}}
export class MeshLambertMaterial extends Mat{}export class MeshBasicMaterial extends Mat{}export class ShaderMaterial extends Mat{}export class SpriteMaterial extends Mat{}
export class CanvasTexture{dispose(){}}export class Fog{constructor(){}}
export const RepeatWrapping=1,SRGBColorSpace='srgb',DynamicDrawUsage=1,AdditiveBlending=2,NormalBlending=1,DoubleSide=2,BackSide=1;
export class Object3D{constructor(){this.position=new Vector3();this.rotation={x:0,y:0,z:0,set(x,y,z){this.x=x;this.y=y;this.z=z;},order:''};this.scale=new Vector3(1,1,1);this.scale.setScalar=function(v){this.x=this.y=this.z=v;};
  this.quaternion=new Quaternion();this.children=[];this.visible=true;this.userData={};}add(...o){this.children.push(...o);}remove(...o){for(const x of o){const i=this.children.indexOf(x);if(i>=0)this.children.splice(i,1);}}}
export class Group extends Object3D{}
export class Mesh extends Object3D{constructor(g,m){super();this.geometry=g;this.material=m;}}
export class InstancedBufferAttribute extends BufferAttribute{}
export class InstancedMesh extends Mesh{constructor(g,m,n){super(g,m);this.count=n;this.instanceMatrix=new BufferAttribute(new Float32Array(n*16),16);}}
export class Points extends Mesh{}export class Sprite extends Mesh{constructor(m){super(null,m);}}
export class HemisphereLight extends Object3D{}export class DirectionalLight extends Object3D{}
export class Scene{constructor(){this.children=new Set();}add(...o){for(const x of o)this.children.add(x);}remove(o){this.children.delete(o);}}
export class PerspectiveCamera extends Object3D{
  constructor(fov,asp,n,f){super();Object.assign(this,{fov,aspect:asp,near:n,far:f});this.matrixWorldInverse=new Matrix4();this.projectionMatrix=new Matrix4();this.updateProjectionMatrix();}
  updateProjectionMatrix(){const f=1/Math.tan(this.fov*Math.PI/360),e=this.projectionMatrix.elements,n=this.near,fa=this.far;e.fill(0);e[0]=f/this.aspect;e[5]=f;e[10]=(fa+n)/(n-fa);e[11]=-1;e[14]=2*fa*n/(n-fa);}
  lookAt(t){const p=this.position,z=new Vector3(p.x-t.x,p.y-t.y,p.z-t.z).normalize();let x=new Vector3(z.z,0,-z.x);if(x.length()<1e-6)x=new Vector3(1,0,0);x.normalize();
    const y=new Vector3(z.y*x.z-z.z*x.y,z.z*x.x-z.x*x.z,z.x*x.y-z.y*x.x),e=this.matrixWorldInverse.elements,d=(a)=>-(a.x*p.x+a.y*p.y+a.z*p.z);
    e[0]=x.x;e[4]=x.y;e[8]=x.z;e[12]=d(x);e[1]=y.x;e[5]=y.y;e[9]=y.z;e[13]=d(y);e[2]=z.x;e[6]=z.y;e[10]=z.z;e[14]=d(z);e[3]=e[7]=e[11]=0;e[15]=1;}
  updateMatrixWorld(){}}
export class WebGLRenderer{constructor(){this.info={render:{calls:0}};}setPixelRatio(){}setSize(){}render(){}}
