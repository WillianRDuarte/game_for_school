// Veículo com física em coordenadas de MUNDO: sem limite lateral; a estrada só muda aderência/velocidade.
import * as THREE from 'three';
import {clamp,lerp,smoothstep,noise2} from './utils.js';
import {STEP} from './road.js';
import {surface} from './terrain.js';
import {CAR_SIZE_MUL} from './utils.js';
import {buildPlayerCar} from './playercar.js';
export const HARD_MAX=105;   // velocidade absoluta máxima (m/s) com qualquer combinação de perks
const HL=2.6,HW=1.3; // meia-distância entre eixos / meia-bitola (usados para as rodas)
export class Player{
  constructor(track){
    this.track=track;this.idx=10;this.accMul=1;this.boostA=0;this.vMax=75;this.agile=1;this.phase=0;this.phaseHold=false;this.fovExtra=0;   // ganchos dos perks (valores neutros = jogo original)
    this.gc={};this.gw=[{},{},{},{}];this.off=0;
    this.mesh=new THREE.Group();this.mesh.rotation.order='YXZ';
    const body=new THREE.Mesh(new THREE.BoxGeometry(2,.7,4.2),new THREE.MeshLambertMaterial({color:0xd8322b}));body.position.y=.35;
    const cab=new THREE.Mesh(new THREE.BoxGeometry(1.6,.6,1.9),new THREE.MeshLambertMaterial({color:0x222831}));cab.position.set(0,.95,.3);
    this.mesh.add(body,cab);this.body=body;this.cab=cab;this.mesh.scale.setScalar(1.3*CAR_SIZE_MUL);this.respawn(this.idx*STEP);
  }
  setCar(scene){ // troca a caixa pelo modelo GLB (cena carregada). Idempotente; null/falha = mantém a caixa. body/cab continuam como children[0..1] (perks.js lê seus materiais), só ficam invisíveis.
    if(!scene||this.car)return false;const car=buildPlayerCar(scene,this.body.material,this.cab.material);if(!car)return false;
    this.car=car;this.body.visible=this.cab.visible=false;this.mesh.add(car);return true;
  }
  respawn(s,speed=22){ // coloca o carro na pista, alinhado com ela
    const p=this.track.sampleAt(s);this.x=p.x;this.z=p.z;this.psi=p.h;this.vx=Math.sin(p.h)*speed;this.vz=-Math.cos(p.h)*speed;
    this.speed=speed;this.yawRate=0;this.pitch=0;this.roll=0;this.idx=Math.floor(s/STEP);this.s=s;this.y=null;this.update(0,{throttle:0,brake:0,steer:0});
  }
  _progress(){ // amostra da estrada mais próxima (busca local) -> progresso, distância e largura
    const T=this.track;T.get(this.idx+60);let bi=this.idx,bd=1e18;
    for(let i=Math.max(T.minKept,this.idx-40);i<=this.idx+40;i++){const s=T.get(i),ex=this.x-s.x,ez=this.z-s.z,d=ex*ex+ez*ez;if(d<bd){bd=d;bi=i;}}
    this.idx=bi;const s=T.get(bi);this.roadD=Math.sqrt(bd);this.roadW=s.w;
    this.s=bi*STEP+clamp((this.x-s.x)*Math.sin(s.h)-(this.z-s.z)*Math.cos(s.h),-STEP,STEP);return s;
  }
  update(dt,inp){
    const T=this.track;let fx=Math.sin(this.psi),fz=-Math.cos(this.psi),rx=Math.cos(this.psi),rz=Math.sin(this.psi);
    let vf=this.vx*fx+this.vz*fz,vl=this.vx*rx+this.vz*rz;
    const c=surface(T,this.x,this.z,this.gc),off=c.d<0?1:smoothstep(c.w,c.w+4,c.d);this.off=off;
    let a=inp.throttle*lerp(30,17,off)*this.accMul+this.boostA-inp.brake*55-.0035*vf*vf-off*.6*vf-9.8*Math.sin(this.pitch)*.7-Math.max(0,this.pitch-.55)*60*(vf>0?1:0);   // encosta muito íngreme freia o carro (não é intransponível, só muito lenta)
    if(!inp.brake&&vf<10)a=Math.max(a,14);                       // movimento constante para frente
    {let nv=vf+a*dt;if(nv>this.vMax)nv=vf>this.vMax?Math.max(this.vMax,Math.min(nv,vf-14*dt)):this.vMax;vf=clamp(nv,0,HARD_MAX);}   // teto vMax (75 normal); acima dele (fim de perk) a velocidade decai suave, nunca passa de HARD_MAX
    vl-=9.8*Math.sin(this.roll)*.6*dt*off;vl*=Math.exp(-lerp(9,3.2,off)*dt);    // menos aderência fora da pista
    const yawT=inp.steer*1.7*this.agile*clamp(vf/12,0,1)/(1+vf/45)*lerp(1,.8,off);
    this.yawRate+=(yawT-this.yawRate)*(1-Math.exp(-dt*7));this.psi+=this.yawRate*dt;
    fx=Math.sin(this.psi);fz=-Math.cos(this.psi);rx=Math.cos(this.psi);rz=Math.sin(this.psi);
    this.vx=fx*vf+rx*vl;this.vz=fz*vf+rz*vl;
    const rs=this._progress(),e=this.roadD-this.roadW;             // limite do mundo: empurrão suave só a >380 m da pista
    if(e>4000){const pu=Math.min(1,(e-4000)/200)*40*dt,dx=rs.x-this.x,dz=rs.z-this.z,dl=Math.hypot(dx,dz)||1;this.vx+=dx/dl*pu;this.vz+=dz/dl*pu;}
    this.x+=this.vx*dt;this.z+=this.vz*dt;this.speed=vf;
    const w=this.gw,S=(i,l,r)=>surface(T,this.x+fx*l+rx*r,this.z+fz*l+rz*r,w[i]);
    S(0,HL,-HW);S(1,HL,HW);S(2,-HL,-HW);S(3,-HL,HW);
    const avg=(w[0].h+w[1].h+w[2].h+w[3].h)/4,bump=(noise2(this.x*1.1,this.z*1.1)-.5)*.6*off*clamp(vf/15,0,1),yT=avg+.6+bump;
    const k=dt?1-Math.exp(-dt*22):1,kr=dt?1-Math.exp(-dt*12):1;
    this.y=this.y===null?yT:this.y+(yT-this.y)*k;
    this.pitch+=(Math.atan2((w[0].h+w[1].h-w[2].h-w[3].h)/2,2*HL)-this.pitch)*kr;   // suspensão: acompanha o terreno
    this.roll+=(Math.atan2((w[1].h+w[3].h-w[0].h-w[2].h)/2,2*HW)-this.roll)*kr;
    this.mesh.position.set(this.x,this.y,this.z);this.mesh.rotation.set(this.pitch,-this.psi,this.roll);
  }
}
