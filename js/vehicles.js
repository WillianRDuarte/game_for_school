// BIBLIOTECA DE VEÍCULOS DOS NPCs — carrega o GLB uma ÚNICA vez e entrega instâncias baratas (geometria e materiais compartilhados).
//  · Arquivo: assets/models/npc_vehicles_lite.glb, gerado por tools/build_vehicles.py a partir dos GLBs originais (que não são alterados):
//    low_poly_suvs.glb (8 SUVs) · low-poly_truck_car_drifter.glb (1 caminhão "Drifter") · 39_low_poly_vehicle_free.glb (coletânea: 39 veículos).
//    Total: 48 modelos, TODOS na lista de NPCs. Para acrescentar mais: gere-os no mesmo arquivo e adicione UMA linha em VEHICLES.
//  · Escala, orientação e perfil de cada modelo ficam AQUI (em código): o GLB tem cada veículo recentrado (centro em x/z, rodas em y=0), mas a frente
//    aponta para um eixo diferente em cada arquivo (SUVs e coletânea: +z; caminhão Drifter: +x). No jogo a frente do carro é −z, então `yaw` gira cada
//    modelo para −z (conferido visualmente, veículo a veículo: tools/preview_vehicles.py).
//  · Escala: `scale` fixo (SUVs, Drifter) OU automática pela classe: s = √((comprimento-alvo/comprimento)·(largura-alvo/largura)) — mantém proporção coerente
//    entre modelos de tamanhos originais bem diferentes (a coletânea vem em unidades de ~metros, mas com carros de 3,5 a 8,7 m).
//  · Sem rede/loader (ou falha de carga): `loadVehicleLibrary` devolve null e o TrafficSystem continua com os carros-caixa originais.
import * as THREE from 'three';
import {CAR_SIZE_MUL} from './utils.js';

export const GLB_URL='assets/models/npc_vehicles_lite.glb';
const R=Math.PI;
// perfil por classe: alvo de comprimento/largura (m), massa, multiplicador de velocidade e agilidade (pequenos modificadores; a IA é a mesma)
export const CLASSES={
  car:  {tl:4.9,tw:2.45,mass:1,   vMul:1,   agil:1},
  sport:{tl:4.9,tw:2.5, mass:1.05,vMul:1.1, agil:1.15},
  suv:  {tl:5.2,tw:2.7, mass:1.2, vMul:.98, agil:.95},
  van:  {tl:5.0,tw:2.6, mass:1.4, vMul:.94, agil:.9},
  truck:{tl:6.4,tw:2.9, mass:1.9, vMul:.86, agil:.8},
  big:  {tl:8.2,tw:3.0, mass:2.4, vMul:.8,  agil:.7},
  limo: {tl:7.0,tw:2.5, mass:1.5, vMul:.92, agil:.85},
  dmg:  {tl:5.2,tw:2.7, mass:1,   vMul:1,   agil:.9},
};
const v=(id,cls,o={})=>({id,cls,yaw:R,w:1,...o});
// yaw = giro (rad) que leva a frente do modelo a −z: π para frente em +z (SUVs e coletânea), π/2 para frente em +x (Drifter)
export const VEHICLES=[
  // ---- low_poly_suvs.glb (escala fixa .372)
  v('suv_0','suv',{scale:.372}),v('suv_4','suv',{scale:.372}),v('suv_6','suv',{scale:.372}),v('suv_7','suv',{scale:.372}),
  v('suv_2','sport',{scale:.372}),                                                                   // SUV verde "tunado" (entrada de ar no capô)
  v('suv_1','dmg',{scale:.372}),v('suv_3','dmg',{scale:.372}),v('suv_5','dmg',{scale:.372}),         // SUVs de capô/porta-malas aberto, amassado
  // ---- low-poly_truck_car_drifter.glb
  v('truck_drifter','truck',{scale:.0112,yaw:R/2}),
  // ---- 39_low_poly_vehicle_free.glb (coletânea) — todos os 39
  v('col_green_car','car'),v('col_orange_car','car'),v('col_car','car'),v('col_pink_car','car'),v('col_taxi','car'),v('col_police','car'),v('col_police_001','car'),v('col_polic_car','car'),
  v('col_sedan_brown','car'),v('col_green_sedan','car'),v('col_blue_sedan','car'),v('col_d_green_sedan','car'),v('col_pink_sedan','car'),v('col_sedan_krch','car'),
  v('col_d_green_hatchback','car'),v('col_orange_hatchback','car'),
  v('col_coupe','sport'),v('col_cabrio','sport'),v('col_green_cabrio','sport'),v('col_blue_coupe','sport'),v('col_green_coupe','sport'),
  v('col_pickup','suv'),v('col_red_truck','suv'),
  v('col_van','van'),v('col_van_001','van'),v('col_red_van','van'),v('col_white_van','van'),v('col_blue_minivan','van'),v('col_space_wagon','van'),v('col_van2','van'),v('col_ambulance','van'),v('col_ambulance2','van'),
  v('col_truck','truck'),v('col_cube_012','truck'),                                                 // caminhão-baú e caminhão de bombeiros
  v('col_yellow_big_truck','big'),v('col_yellow_big_truck2','big'),v('col_yellow_truck','big'),
  v('col_limusin','limo'),v('col_black_lemusine','limo'),
];
// classes sorteadas por tipo de motorista do tráfego (índices de TYPES em traffic.js: 0 lento · 1 normal · 2 rápido · 3 danificado)
export const BY_TYPE=[
  [['truck',.2],['big',.14],['van',.2],['suv',.14],['car',.2],['limo',.07],['dmg',.05]],
  [['car',.42],['suv',.14],['van',.14],['sport',.1],['truck',.07],['limo',.05],['big',.04],['dmg',.04]],
  [['sport',.38],['car',.34],['suv',.1],['van',.08],['limo',.07],['dmg',.03]],
  [['dmg',.42],['car',.3],['van',.14],['suv',.08],['truck',.06]],
];
const GROUND=-.3;   // o pivô do carro do tráfego fica .3 m acima da pista (a caixa original "flutuava" nisso): a roda toca a pista
function collect(n,out){if(n.isMesh||(n.geometry&&n.material))out.push(n);for(const c of n.children||[])collect(c,out);return out;}
function bounds(meshes){   // caixa do modelo (unidades do GLB) lida direto dos vértices
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(const m of meshes){const p=m.geometry.attributes.position,a=p.array,n=p.count||a.length/3;
    for(let i=0;i<n;i++)for(let k=0;k<3;k++){const q=a[i*3+k];if(q<mn[k])mn[k]=q;if(q>mx[k])mx[k]=q;}}
  return{mn,mx};
}
// Monta a biblioteca a partir da cena já carregada (separado do loader para poder testar em Node).
export function buildLibrary(scene,{THREE:T=THREE}={}){
  const lib={models:[],byCls:{},byId:{},pool:new Map(),_char:new Map(),uses:[],stats:{instances:0,live:0,models:0,missing:[]},recent:[]};
  for(const cfg of VEHICLES){
    const node=(scene.children||[]).find(n=>n.name===cfg.id),K=CLASSES[cfg.cls];
    const ms=node?collect(node,[]):[];if(!ms.length){lib.stats.missing.push(cfg.id);continue;}
    const {mn,mx}=bounds(ms),yaw=cfg.yaw,fwdIsX=Math.abs(Math.sin(yaw))>.5;
    const len0=fwdIsX?mx[0]-mn[0]:mx[2]-mn[2],wid0=fwdIsX?mx[2]-mn[2]:mx[0]-mn[0],hei0=mx[1]-mn[1];
    const s=cfg.scale||Math.min(1.35,Math.max(.85,Math.sqrt((K.tl/len0)*(K.tw/wid0))));   // escala fixa ou automática pela classe (limitada a .85–1,35: nenhum modelo muito esticado)
    const len=len0*s,wid=wid0*s,hei=hei0*s;
    const m={...cfg,...K,scale:s,idx:lib.models.length,meshes:ms,len,wid,hei,hl:len/2*.97,hw:wid/2*.86,hh:hei,mats:ms.map(x=>x.material),cx:-(mn[0]+mx[0])/2,cy:-mn[1],cz:-(mn[2]+mx[2])/2};   // (cx,cy,cz: recentra o modelo — em unidades do modelo — antes da escala/giro)
    lib.models.push(m);lib.byId[cfg.id]=m;(lib.byCls[cfg.cls]||(lib.byCls[cfg.cls]=[])).push(m);lib.pool.set(m.idx,[]);lib.uses.push(0);
  }
  lib.stats.models=lib.models.length;
  // instância = Group com 1 Mesh por primitiva, SEM clonar geometria nem material
  lib.make=(m)=>{
    const free=lib.pool.get(m.idx);if(free.length)return free.pop();
    const g=new T.Group(),inner=new T.Group();inner.scale.setScalar(m.scale);inner.rotation.y=m.yaw;inner.position.set(0,GROUND/CAR_SIZE_MUL,0);   // escala, giro p/ a frente −z e rodas na pista
    const wrap=new T.Group();wrap.position.set(m.cx,m.cy,m.cz);
    for(const src of m.meshes){const mesh=new T.Mesh(src.geometry,src.material);mesh.userData.m0=src.material;wrap.add(mesh);}
    inner.add(wrap);g.add(inner);g.userData={mid:m.idx,meshes:wrap.children};lib.stats.instances++;lib.stats.live++;return g;
  };
  lib.give=(inst)=>{const f=lib.pool.get(inst.userData.mid);if(f.length<1)f.push(inst);else lib.stats.live--;};   // cache de no máx. 1 instância livre por modelo (geometria/material são compartilhados: descartar não vaza GPU)
  // material "carbonizado" compartilhado (um por material original): destroços
  lib.char=(mat)=>{let c=lib._char.get(mat);if(!c){c=mat.clone?mat.clone():mat;if(c.color&&c.color.multiplyScalar)c.color.multiplyScalar(.16);if(c.emissive&&c.emissive.setHex)c.emissive.setHex(0);if('metalness' in c)c.metalness=0;lib._char.set(mat,c);}return c;};
  // Sorteio: classe pelo tipo de motorista; dentro da classe, prefere os modelos MENOS usados até agora (a coleção inteira circula ao longo da corrida)
  // e penaliza repetir os últimos sorteados (nunca uma fila de carros iguais).
  lib.pick=(type,rng)=>{
    const groups=(BY_TYPE[type]||BY_TYPE[1]).filter(([c])=>lib.byCls[c]);if(!groups.length)return null;
    let tot=0;for(const [,w] of groups)tot+=w;let u=rng()*tot,cls=groups[groups.length-1][0];for(const [c,w] of groups){u-=w;if(u<=0){cls=c;break;}}
    const list=lib.byCls[cls],one=list.length<2,last=lib.recent[lib.recent.length-1];
    const ws=list.map(m=>{let w=m.w/(1+.5*lib.uses[m.idx]);if(lib.recent.includes(m.idx))w*=last===m.idx?(one?.45:.02):(one?.8:.2);return w;});   // (categoria de 1 só modelo: penalidade leve)
    let t2=0;for(const w of ws)t2+=w;let q=rng()*t2,pick=list[list.length-1];for(let i=0;i<list.length;i++){q-=ws[i];if(q<=0){pick=list[i];break;}}
    lib.uses[pick.idx]++;lib.recent.push(pick.idx);if(lib.recent.length>5)lib.recent.shift();return pick;
  };
  return lib;
}
// Carrega o GLB uma vez. Resolve null (sem erro) se o loader/arquivo não estiver disponível: o jogo segue com os carros-caixa.
export async function loadVehicleLibrary(url=GLB_URL){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(url);
    for(const n of gltf.scene.children)collect(n,[]).forEach(m=>{m.frustumCulled=true;});
    const lib=buildLibrary(gltf.scene);
    if(lib.stats.missing.length)console.warn('[vehicles] modelos não encontrados no GLB:',lib.stats.missing.join(', '));
    return lib.models.length?lib:null;
  }catch(e){console.warn('[vehicles] GLB não carregado; usando carros-caixa:',e&&e.message||e);return null;}
}
