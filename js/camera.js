// Câmera de perseguição em coordenadas de mundo: não assume que o carro está na pista; nunca entra no terreno.
import * as THREE from 'three';
import {lerp} from './utils.js';
import {surface} from './terrain.js';
const ZOOM=.64;   // câmera mais 20 % perto do carro (.8→.64): posição e alvo do olhar escalados em torno do carro → mesmo ângulo/enquadramento
export class CameraRig{
  constructor(cam,player){this.cam=cam;this.p=player;this.pos=new THREE.Vector3();this.look=new THREE.Vector3();this.lk=new THREE.Vector3();this.h=0;this.ly=0;this.init=false;this.g=({});}
  update(dt){
    const p=this.p,T=p.track;if(!this.init){this.h=p.psi;this.pos.set(p.x,p.y+5,p.z);this.ly=p.y;}
    const kh=this.init?1-Math.exp(-dt*4):1,kp=this.init?1-Math.exp(-dt*10):1,ky=this.init?1-Math.exp(-dt*6):1;
    this.h+=Math.atan2(Math.sin(p.psi-this.h),Math.cos(p.psi-this.h))*kh;      // segue a direção do carro com atraso suave
    const fx=Math.sin(this.h),fz=-Math.cos(this.h),dist=9+p.speed*.06,tx=p.x-fx*dist,tz=p.z-fz*dist;
    const gy=surface(T,tx,tz,this.g).h,ty=Math.max(p.y+4.3+p.speed*.008,gy+2.5);
    this.pos.x+=(tx-this.pos.x)*kp;this.pos.z+=(tz-this.pos.z)*kp;this.pos.y+=(ty-this.pos.y)*ky;
    const gf=surface(T,this.pos.x,this.pos.z,this.g).h+2.2;if(this.pos.y<gf)this.pos.y=gf;
    const lf=(this.h+p.psi)/2,ax=p.x+Math.sin(lf)*18,az=p.z-Math.cos(lf)*18,ay=surface(T,ax,az,this.g).h+1.5;
    this.ly+=(lerp(ay,p.y+1.5,.5)-this.ly)*(this.init?1-Math.exp(-dt*8):1);this.init=true;   // olha para a inclinação à frente
    this.look.set(ax,this.ly,az);
    const z=ZOOM,cx=p.x+(this.pos.x-p.x)*z,cz=p.z+(this.pos.z-p.z)*z;let cy=p.y+(this.pos.y-p.y)*z;const gz=surface(T,cx,cz,this.g).h+2.2;if(cy<gz)cy=gz;   // (o estado suavizado this.pos não muda; só a posição final da câmera)
    this.cam.position.set(cx,cy,cz);this.lk.set(p.x+(this.look.x-p.x)*z,p.y+(this.look.y-p.y)*z,p.z+(this.look.z-p.z)*z);this.cam.lookAt(this.lk);
    this.cam.fov=lerp(this.cam.fov,62+Math.min(p.speed/75,1)*22+(p.fovExtra||0),1-Math.exp(-dt*3));this.cam.updateProjectionMatrix();
  }
}
