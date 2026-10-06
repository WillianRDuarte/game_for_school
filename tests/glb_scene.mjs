// Lê um .glb de verdade (JSON + BIN) e monta uma "cena" com as classes do three-stub: Group por nó, Mesh por primitiva, geometria com os vértices reais.
// Serve para testar js/vehicles.js em Node exatamente com os números do arquivo (o GLTFLoader do three só existe no navegador).
import fs from 'node:fs';
import * as THREE from 'three';
const CT={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array};const NC={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
export function loadGlbScene(path){
  const d=fs.readFileSync(path);let o=12,js,bin;
  while(o<d.length){const cl=d.readUInt32LE(o),ct=d.readUInt32LE(o+4);const ch=d.subarray(o+8,o+8+cl);if(ct===0x4E4F534A)js=JSON.parse(ch.toString());else if(ct===0x004E4942)bin=ch;o+=8+cl;}
  const acc=i=>{const a=js.accessors[i],bv=js.bufferViews[a.bufferView],T=CT[a.componentType],n=NC[a.type],off=(bv.byteOffset||0)+(a.byteOffset||0);
    const ab=new ArrayBuffer(a.count*n*T.BYTES_PER_ELEMENT);new Uint8Array(ab).set(bin.subarray(off,off+a.count*n*T.BYTES_PER_ELEMENT));return{array:new T(ab),count:a.count,itemSize:n};};
  const mats=js.materials.map(m=>{const pb=m.pbrMetallicRoughness||{},bc=pb.baseColorFactor||[1,1,1,1];const mat=new THREE.MeshLambertMaterial({color:0});mat.name=m.name;mat.color=new THREE.Color(0);mat.color.r=bc[0];mat.color.g=bc[1];mat.color.b=bc[2];
    mat.map=pb.baseColorTexture?{tex:true}:null;mat.emissive=new THREE.Color(m.emissiveFactor?0xffffff:0);mat.transparent=m.alphaMode==='BLEND';mat.metalness=pb.metallicFactor??1;return mat;});
  const geos=js.meshes.map(me=>me.primitives.map(pr=>{const g=new THREE.BufferGeometry();g.setAttribute('position',acc(pr.attributes.POSITION));if(pr.attributes.TEXCOORD_0)g.setAttribute('uv',acc(pr.attributes.TEXCOORD_0));g.index=acc(pr.indices);return{g,mat:mats[pr.material]};}));
  const scene=new THREE.Group();
  for(const n of js.scenes[js.scene||0].nodes){const nd=js.nodes[n],grp=new THREE.Group();grp.name=nd.name;
    for(const {g,mat} of geos[nd.mesh]){const m=new THREE.Mesh(g,mat);m.isMesh=true;grp.children.push(m);}scene.children.push(grp);}
  return{scene,json:js};
}
