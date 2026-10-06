// BIBLIOTECA DE MODELOS DO CENÁRIO — carrega assets/models/scenery_lite.glb UMA ÚNICA vez (17 prédios + 6 árvores) e entrega, por modelo, uma geometria e um
// material COMPARTILHADOS por todas as instâncias (o scenery.js só cria matrizes de InstancedMesh; nenhum GLB/textura é recarregado ou clonado por prédio).
//  · O GLB é gerado por tools/build_scenery.py a partir dos originais (assets/models/originals/, não alterados):
//      low_poly_accommodations_buildings.glb → 10 acomodações (2 hotéis, 3 prédios de apartamentos, 5 casas) — frente do modelo em +x
//      low_poly_business_buildings_pack.glb  → 7 comércios (restaurante, loja, pizzaria, hamburgueria, café, cinema, shopping) — frente em +z
//      low_poly_trees.glb                    → 6 árvores (2 redondas, 2 ciprestes, 2 carvalhos ramificados)
//    Os 17 prédios e as 6 árvores estão TODOS na tabela abaixo → todos entram no sorteio. Para acrescentar um modelo: gere-o no GLB (BUILDINGS/TREE_IDS no
//    tools/build_scenery.py) e acrescente UMA linha aqui.
//  · Escala, orientação da frente e classe de cada modelo ficam AQUI (em código). O GLB tem cada modelo recentrado (x/z no centro, base em y=0).
//  · Normais: o GLB não traz normais; aqui a geometria vira "não indexada" e ganha normais por face (visual low-poly facetado) UMA vez por modelo.
//  · Sem rede/loader (ou falha de carga): `loadSceneryLibrary` devolve null e o jogo usa `fallbackSceneryLibrary` (caixas e cones) — o cenário continua existindo.
import * as THREE from 'three';

export const GLB_URL='assets/models/scenery_lite.glb';
const FRONT_X=-Math.PI/2;   // giro (rad, em torno de Y) que leva a frente do modelo (+x) a +z — o scenery.js vira o +z para a estrada

// Classes de prédio: relevo máximo tolerado sob a pegada (m), distância mínima ao BORDO do asfalto (m) e folga mínima entre prédios (m).
// Casas pequenas aceitam mais terreno irregular e ficam mais perto; grandes exigem chão quase plano e mais recuo.
export const CLASSES={
  house:{range:6,clear:13,gap:5},
  shop: {range:5.2,clear:14,gap:6},
  mid:  {range:4.6,clear:17,gap:7},
  tall: {range:4.6,clear:19,gap:8},
  big:  {range:3.6,clear:23,gap:9},
};
export const CLS_ORDER=['house','shop','mid','tall','big'];

// scale: metros do jogo por unidade do modelo (pacote de acomodações: 1 u ≈ 2,6 m reais → ×3,6 ≈ 1,4× o real; comércios: 1 u ≈ 1,6 m → ×2,4 ≈ 1,5×; o
//        mundo é "grande" — pista de 64–96 m e carro a 75 m/s — então o cenário é levemente exagerado para ter presença, mas um hotel NÃO vira arranha-céu: ~36 m).
// sj: faixa da variação aleatória de escala (limites seguros, por modelo) · fy: giro que leva a frente a +z · w: peso de sorteio dentro da classe
export const BUILDINGS=[
  {id:'bld_hotel_a',cls:'tall', scale:3.6,fy:FRONT_X,sj:[.94,1.06],w:1},     // hotel de 8 andares, toldos listrados
  {id:'bld_hotel_b',cls:'tall', scale:3.6,fy:FRONT_X,sj:[.94,1.06],w:1},     // hotel com letreiro HOTEL e varandas
  {id:'bld_apt_a',  cls:'mid',  scale:3.6,fy:FRONT_X,sj:[.92,1.1], w:1},     // apartamentos azul-turquesa
  {id:'bld_apt_b',  cls:'mid',  scale:3.6,fy:FRONT_X,sj:[.92,1.1], w:1},     // apartamentos bege/azul
  {id:'bld_apt_c',  cls:'mid',  scale:3.6,fy:FRONT_X,sj:[.92,1.08],w:1},     // apartamentos salmão
  {id:'bld_house_a',cls:'house',scale:3.6,fy:FRONT_X,sj:[.88,1.14],w:1},     // casa de telhado laranja com cerca
  {id:'bld_house_b',cls:'house',scale:3.6,fy:FRONT_X,sj:[.88,1.14],w:1},     // sobrado laranja
  {id:'bld_house_c',cls:'house',scale:3.6,fy:FRONT_X,sj:[.88,1.14],w:1},     // casa térrea vermelha
  {id:'bld_house_d',cls:'house',scale:3.6,fy:FRONT_X,sj:[.88,1.14],w:1},     // sobrado rosa
  {id:'bld_house_e',cls:'house',scale:3.6,fy:FRONT_X,sj:[.88,1.14],w:1},     // casa com garagem
  {id:'bld_shop',      cls:'shop',scale:2.4,fy:0,sj:[.9,1.14],w:1},          // loja com toldo
  {id:'bld_restaurant',cls:'shop',scale:2.4,fy:0,sj:[.9,1.14],w:1},          // restaurante com mesas
  {id:'bld_pizza',     cls:'shop',scale:2.4,fy:0,sj:[.9,1.14],w:1},          // pizzaria (prédio + mesas + luminária + placa)
  {id:'bld_burger',    cls:'shop',scale:2.4,fy:0,sj:[.9,1.12],w:1},          // hamburgueria
  {id:'bld_cafe',      cls:'shop',scale:2.4,fy:0,sj:[.9,1.12],w:1},          // café de esquina
  {id:'bld_cinema',cls:'big',scale:2.4,fy:0,sj:[.95,1.06],w:1},              // cinema
  {id:'bld_mall',  cls:'big',scale:2.4,fy:0,sj:[.92,1.04],w:1},              // shopping (longo: ~43 m)
];
// zw: peso do tipo de árvore por região [CAMPO, RURAL, SUBÚRBIO, URBANO] · sj: variação de escala (sorteada com viés para as menores)
export const TREES=[
  {id:'tree_round_a',  scale:.105,sj:[.62,1.5],zw:[1,1,1,1]},
  {id:'tree_cypress_a',scale:.092,sj:[.6,1.45],zw:[.8,.6,1.3,1.7]},
  {id:'tree_oak_a',    scale:.1,  sj:[.62,1.5],zw:[1.3,1.5,.8,.35]},
  {id:'tree_oak_b',    scale:.125,sj:[.62,1.5],zw:[1.3,1.3,1,.5]},
  {id:'tree_cypress_b',scale:.092,sj:[.6,1.45],zw:[.8,.7,1.3,1.7]},
  {id:'tree_round_b',  scale:.105,sj:[.62,1.5],zw:[1,1,1,1]},
];

function collect(n,out){if(n.isMesh||(n.geometry&&n.material))out.push(n);for(const c of n.children||[])collect(c,out);return out;}
function bounds(g){   // caixa do modelo (unidades do GLB) lida direto dos vértices
  const a=g.attributes.position.array,n=g.attributes.position.count||a.length/3,mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];
  for(let i=0;i<n;i++)for(let k=0;k<3;k++){const v=a[i*3+k];if(v<mn[k])mn[k]=v;if(v>mx[k])mx[k]=v;}
  return{mn,mx};
}
function flat(g){   // normais por face (uma vez por modelo); sem toNonIndexed (ex.: stub de teste) mantém a geometria como está
  if(!g.toNonIndexed)return g;const f=g.toNonIndexed();f.computeVertexNormals();return f;
}
// Monta a biblioteca a partir da cena já carregada (separado do loader para poder testar em Node).
export function buildSceneryLibrary(scene,{THREE:T=THREE}={}){
  const lib={models:[],buildings:[],trees:[],byCls:{},byId:{},mats:new Map(),stats:{models:0,materials:0}};
  const matFor=src=>{   // UM material por material de origem (paleta dos acomodações · paleta comercial · atlas das árvores): Lambert barato, textura compartilhada
    let m=lib.mats.get(src);if(!m){m=new T.MeshLambertMaterial({map:src.map||null,side:T.DoubleSide});lib.mats.set(src,m);lib.stats.materials++;}return m;};
  const add=(cfg,kind)=>{
    const node=(scene.children||[]).find(n=>n.name===cfg.id);if(!node)return;const ms=collect(node,[]);if(!ms.length)return;
    const src=ms[0],{mn,mx}=bounds(src.geometry);
    const fwdX=Math.abs(Math.sin(cfg.fy||0))>.5;                       // frente do modelo em ±x → a largura da fachada é o eixo z
    const dx=mx[0]-mn[0],dy=mx[1]-mn[1],dz=mx[2]-mn[2];
    const m={...cfg,kind,idx:lib.models.length,geometry:flat(src.geometry),material:matFor(src.material),
      off:kind==='bld'?[-(mn[0]+mx[0])/2,-mn[1],-(mn[2]+mx[2])/2]:[0,-mn[1],0],   // prédios: recentra (≈ 0, o GLB já vem recentrado); árvores: o pivô é a BASE DO TRONCO (a copa é assimétrica)
      dx,dy,dz,                                                          // caixa em unidades do modelo
      fw:fwdX?dz:dx,fd:fwdX?dx:dz};                                      // largura da fachada · profundidade (unidades do modelo)
    if(kind==='bld'){m.cl=CLASSES[cfg.cls];lib.buildings.push(m);(lib.byCls[cfg.cls]||(lib.byCls[cfg.cls]=[])).push(m);}
    else{m.crown=Math.max(dx,dz)/2;m.height=dy;lib.trees.push(m);}
    lib.models.push(m);lib.byId[cfg.id]=m;
  };
  for(const c of BUILDINGS)add(c,'bld');for(const c of TREES)add(c,'tree');
  lib.stats.models=lib.models.length;lib.recent={};lib.treeRecent=[];
  // sorteio de prédio por classe, com memória: evita repetir o mesmo modelo logo em seguida (todos os modelos da classe aparecem)
  lib.pickBuilding=(cls,rng)=>{
    const list=lib.byCls[cls];if(!list||!list.length)return null;const rec=lib.recent[cls]||(lib.recent[cls]=[]),one=list.length<2;
    const ws=list.map(m=>m.w*(rec.includes(m.idx)?(rec[rec.length-1]===m.idx?(one?.5:.08):(one?.8:.3)):1));
    let t=0;for(const w of ws)t+=w;let v=rng()*t,pick=list[list.length-1];for(let i=0;i<list.length;i++){v-=ws[i];if(v<=0){pick=list[i];break;}}
    rec.push(pick.idx);if(rec.length>2)rec.shift();return pick;};
  // sorteio de árvore: pesos por região (zw) × memória das duas últimas
  lib.pickTree=(zw,rng)=>{
    const list=lib.trees;if(!list.length)return null;const rec=lib.treeRecent;
    const ws=list.map((m,i)=>(zw?zw[i]:1)*(rec.includes(m.idx)?(rec[rec.length-1]===m.idx?.35:.7):1));
    let t=0;for(const w of ws)t+=w;let v=rng()*t,pick=list[list.length-1];for(let i=0;i<list.length;i++){v-=ws[i];if(v<=0){pick=list[i];break;}}
    rec.push(pick.idx);if(rec.length>2)rec.shift();return pick;};
  return lib;
}
// Carrega o GLB uma vez. Resolve null (sem erro) se o loader/arquivo não estiver disponível.
export async function loadSceneryLibrary(url=GLB_URL){
  try{
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const gltf=await new GLTFLoader().loadAsync(url);
    return buildSceneryLibrary(gltf.scene);
  }catch(e){console.warn('[scenery] GLB não carregado; usando caixas e cones:',e&&e.message||e);return null;}
}
// Biblioteca de emergência (sem GLB): caixas coloridas e cones, nas mesmas classes — o cenário procedural continua funcionando.
export function fallbackSceneryLibrary({THREE:T=THREE}={}){
  const mk=(id,cls,w,h,d,color)=>{const g=new T.BoxGeometry(w,h,d);if(g.translate)g.translate(0,h/2,0);return{id,cls,kind:'bld',scale:1,fy:0,sj:[.9,1.15],w:1,geometry:g,material:new T.MeshLambertMaterial({color}),off:[0,0,0],dx:w,dy:h,dz:d,fw:w,fd:d,cl:CLASSES[cls]};};
  const tr=(id,color,h)=>{const g=new T.ConeGeometry(2.4,h,7);if(g.translate)g.translate(0,h/2+1.2,0);return{id,kind:'tree',scale:1,sj:[.7,1.4],zw:[1,1,1,1],geometry:g,material:new T.MeshLambertMaterial({color}),off:[0,0,0],dx:4.8,dy:h,dz:4.8,crown:2.4,height:h};};
  const lib={models:[],buildings:[],trees:[],byCls:{},byId:{},mats:new Map(),stats:{models:0,materials:0},recent:{},treeRecent:[],fallback:true};
  for(const m of[mk('fb_house','house',12,9,12,0xc98b5a),mk('fb_shop','shop',14,7,10,0xd8b24a),mk('fb_mid','mid',16,22,14,0x8aa0b0),mk('fb_tall','tall',20,34,18,0x7a8fa8),mk('fb_big','big',36,12,20,0xb06a5a)]){m.idx=lib.models.length;lib.models.push(m);lib.buildings.push(m);(lib.byCls[m.cls]||(lib.byCls[m.cls]=[])).push(m);lib.byId[m.id]=m;}
  for(const m of[tr('fb_tree_a',0x2f7a2a,12),tr('fb_tree_b',0x3f8f3a,16)]){m.idx=lib.models.length;lib.models.push(m);lib.trees.push(m);lib.byId[m.id]=m;}
  lib.stats.models=lib.models.length;
  lib.pickBuilding=(cls,rng)=>{const l=lib.byCls[cls];return l?l[Math.floor(rng()*l.length)%l.length]:null;};
  lib.pickTree=(zw,rng)=>lib.trees[Math.floor(rng()*lib.trees.length)%lib.trees.length];
  return lib;
}
