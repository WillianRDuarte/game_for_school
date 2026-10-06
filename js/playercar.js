// CARRO DO JOGADOR — modelo GLB (Mustang low poly) no lugar das duas caixas procedurais de player.js.
//  · Arquivo: assets/models/player_mustang.glb (cópia de mustang_low_poly.glb). O GLB NÃO tem imagem de textura: só cores por material (chassi verde-escuro, vidro, rodas, aros, faróis, lanternas).
//  · Medidas do arquivo (já com as matrizes dos nós): x −1,05…1,03 · y −0,65…0,62 · z −2,20…2,23. Faróis em z=−2,03 e lanternas em z=+2,15 → a FRENTE já é −z (a do jogo): sem giro.
//  · Escala: o mesmo comprimento da caixa original (4,2 m locais; o Group do jogador ainda aplica ×1,3) → mesma pegada (≈2,0 × 4,2 locais). Colisões (CAR_R/CAR_OFFS) e física não dependem da malha.
//  · Altura: as rodas ficam a REST m locais abaixo do pivô (a caixa original flutuava ~0,6 m; aqui o pneu toca a pista). Só visual; a posição física (player.y) não muda.
//  · Materiais: três.js sem mapa de ambiente deixaria o chassi metálico quase preto → viram MeshLambert com a mesma cor (como a caixa). Chassi e vidro reutilizam os materiais body/cab
//    que já estavam na caixa (perks.js guarda referência a eles para o efeito "fantasma").
//  · Sem rede/loader (ou falha de carga): `loadPlayerCar` devolve null e o jogo segue com a caixa original.
import * as THREE from 'three';
export const PLAYER_GLB_URL='assets/models/player_mustang.glb';
const MIN_Y=-.65,LEN=4.43,TARGET_LEN=4.2,REST=-.4;   // medidas do GLB (y mínimo, comprimento) · comprimento da caixa original · altura do pneu em relação ao pivô
export const CAR_SCALE=TARGET_LEN/LEN;
function collect(n,out){if(n.isMesh||(n.geometry&&n.material))out.push(n);for(const c of n.children||[])collect(c,out);return out;}
// Monta o Group do carro a partir da cena do GLB. `bodyMat`/`glassMat`: materiais já existentes do jogador (recebem a cor do chassi/vidro do GLB).
export function buildPlayerCar(scene,bodyMat,glassMat,{THREE:T=THREE}={}){
  const meshes=collect(scene,[]);if(!meshes.length)return null;
  const cache=new Map(),tint=(dst,src)=>{if(dst.color&&src.color){dst.color.r=src.color.r;dst.color.g=src.color.g;dst.color.b=src.color.b;}};
  for(const m of meshes){
    const src=m.material,key=src;let mat=cache.get(key);
    if(!mat){
      if(src.name==='Chasis'&&bodyMat){mat=bodyMat;tint(mat,src);}
      else if(src.name==='Crystal'&&glassMat){mat=glassMat;tint(mat,src);}
      else{mat=new T.MeshLambertMaterial({color:0xffffff});tint(mat,src);if(src.emissive&&src.emissive.r+src.emissive.g+src.emissive.b>0){mat.emissive=src.emissive.clone?src.emissive.clone():src.emissive;}}
      mat.side=T.DoubleSide;mat.name=src.name;cache.set(key,mat);
    }
    m.material=mat;m.frustumCulled=true;
  }
  const car=new T.Group(),inner=new T.Group();inner.scale.setScalar(CAR_SCALE);inner.position.set(0,REST-MIN_Y*CAR_SCALE,0);
  inner.add(scene);car.add(inner);car.userData.isMustang=true;return car;
}
export async function loadPlayerCar(url=PLAYER_GLB_URL){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(url);return gltf.scene;
  }catch(e){console.warn('[playercar] GLB não carregado; usando a caixa original:',e&&e.message||e);return null;}
}
