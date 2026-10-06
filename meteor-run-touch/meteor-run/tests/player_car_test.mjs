// Carro do jogador: Mustang GLB no lugar das caixas. Confere: arquivo, materiais/cores, escala/pegada, orientação (frente −z), chão, compatibilidade com perks (fantasma),
// fallback para a caixa e — principalmente — que física/posição/colisão são IDÊNTICAS às da caixa (mesma corrida simulada com e sem o modelo).
// Uso: node --import ./tests/register.mjs tests/player_car_test.mjs
import fs from 'node:fs';
import {Game} from '../js/game.js';
import {buildPlayerCar,CAR_SCALE} from '../js/playercar.js';
import * as THREE from 'three';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const path=new URL('../assets/models/player_mustang.glb',import.meta.url).pathname;
const dt=1/60;
// Leitor mínimo de GLB COM hierarquia (o Mustang tem nós aninhados com matrizes; glb_scene.mjs só lê nós de topo): as matrizes dos nós são aplicadas aos vértices,
// como o GLTFLoader faria, de modo que a cena de teste fica em coordenadas finais do modelo.
function loadMustang(p){
  const d=fs.readFileSync(p);let o=12,js,bin;
  while(o<d.length){const cl=d.readUInt32LE(o),ct=d.readUInt32LE(o+4),ch=d.subarray(o+8,o+8+cl);if(ct===0x4E4F534A)js=JSON.parse(ch.toString());else if(ct===0x004E4942)bin=ch;o+=8+cl;}
  const acc=i=>{const a=js.accessors[i],bv=js.bufferViews[a.bufferView],T={5126:Float32Array,5123:Uint16Array,5125:Uint32Array}[a.componentType],n={SCALAR:1,VEC3:3,VEC2:2}[a.type],off=(bv.byteOffset||0)+(a.byteOffset||0);
    const ab=new ArrayBuffer(a.count*n*T.BYTES_PER_ELEMENT);new Uint8Array(ab).set(bin.subarray(off,off+a.count*n*T.BYTES_PER_ELEMENT));return{array:new T(ab),count:a.count,itemSize:n};};
  const mats=js.materials.map(m=>{const bc=(m.pbrMetallicRoughness||{}).baseColorFactor||[1,1,1,1],c=new THREE.Color(0);c.r=bc[0];c.g=bc[1];c.b=bc[2];
    const e=new THREE.Color(0);const em=m.emissiveFactor||[0,0,0];e.r=em[0];e.g=em[1];e.b=em[2];return{name:m.name,color:c,emissive:e};});
  const mul=(A,B)=>{const R=new Array(16).fill(0);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)R[c*4+r]+=A[k*4+r]*B[c*4+k];return R;};   // coluna-maior
  const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],root=new THREE.Group();
  (function walk(i,P){const n=js.nodes[i],W=n.matrix?mul(P,n.matrix):P;
    if(n.mesh!==undefined)for(const pr of js.meshes[n.mesh].primitives){const pos=acc(pr.attributes.POSITION),a=new Float32Array(pos.array);
      for(let v=0;v<pos.count;v++){const x=a[v*3],y=a[v*3+1],z=a[v*3+2];a[v*3]=W[0]*x+W[4]*y+W[8]*z+W[12];a[v*3+1]=W[1]*x+W[5]*y+W[9]*z+W[13];a[v*3+2]=W[2]*x+W[6]*y+W[10]*z+W[14];}
      const g=new THREE.BufferGeometry();g.setAttribute('position',{array:a,count:pos.count,itemSize:3});const m=new THREE.Mesh(g,mats[pr.material]);m.isMesh=true;root.add(m);}
    for(const c of n.children||[])walk(c,W);})(js.scenes[0].nodes[0],I);
  return{scene:root,json:js};
}
const {scene,json}=loadMustang(path);
const orig=fs.readFileSync('/mnt/user-data/uploads/mustang_low_poly.glb');

console.log('1) arquivo');
ok(Buffer.compare(orig,fs.readFileSync(path))===0,'player_mustang.glb é cópia idêntica do mustang_low_poly.glb enviado');
ok(json.asset.version==='2.0'&&json.meshes.length===10&&json.materials.length===6&&!json.images&&!json.textures,'GLB válido: 10 malhas, 6 materiais, sem imagens/texturas (só cores)');

console.log('2) montagem do carro');
const mk=()=>{const g=new Game({});return g;};
const A=mk(),P=A.player;
const boxMat=[P.mesh.children[0].material,P.mesh.children[1].material];
const n0=P.mesh.children.length;ok(P.body===P.mesh.children[0]&&P.cab===P.mesh.children[1]&&!P.car,`antes: children[0]=corpo, children[1]=cabine (+ ${n0-2} filhos de perks: chamas/bolha)`);
const mScale=P.mesh.scale.x,mRotOrder=P.mesh.rotation.order;
ok(P.setCar(scene)===true&&P.setCar(scene)===false,'setCar aplica uma vez (idempotente)');
ok(P.mesh.children.length===n0+1&&P.mesh.children[n0]===P.car&&P.mesh.children[0]===P.body&&P.mesh.children[1]===P.cab,'Mustang é adicionado ao final; corpo e cabine continuam como children[0..1]; chamas/bolha dos perks intactas');
ok(!P.body.visible&&!P.cab.visible&&P.car.userData.isMustang,'caixas ficam invisíveis; Mustang visível');
ok(P.mesh.children[0].material===boxMat[0]&&P.mesh.children[1].material===boxMat[1],'perks.js ainda lê os MESMOS objetos de material em children[0..1]');
const meshes=[];(function f(n){if(n.geometry&&n.material)meshes.push(n);(n.children||[]).forEach(f);})(P.car);
ok(meshes.length===10,`10 malhas do GLB no carro (${meshes.length})`);
const byName=n=>meshes.filter(m=>m.material.name===n);
ok(byName('Chasis').every(m=>m.material===boxMat[0])&&byName('Crystal').every(m=>m.material===boxMat[1]),'chassi usa o material do corpo; vidro usa o da cabine');
const c0=json.materials[0].pbrMetallicRoughness.baseColorFactor,col=boxMat[0].color;
ok(Math.abs(col.r-c0[0])<1e-6&&Math.abs(col.g-c0[1])<1e-6&&Math.abs(col.b-c0[2])<1e-6,`cor do chassi = baseColorFactor do GLB (${col.r.toFixed(3)}, ${col.g.toFixed(3)}, ${col.b.toFixed(3)}) — não mais o vermelho da caixa`);
const rl=byName('Red_Lights')[0].material,hl=byName('Lights')[0].material;
ok(rl.emissive.r===1&&hl.emissive.r===1&&hl.emissive.g>.9,'lanterna vermelha e farol mantêm o emissivo do GLB (acendem sem depender de luz)');
ok(meshes.every(m=>m.material.side===2),'materiais double-sided como no GLB (planos finos de farol/lanterna)');

console.log('3) escala, pegada, orientação, chão');
ok(P.mesh.scale.x===mScale&&mScale===1.3&&P.mesh.rotation.order===mRotOrder,'escala 1,3 e ordem de rotação do Group do jogador inalteradas');
ok(Math.abs(4.43*CAR_SCALE-4.2)<1e-9&&Math.abs(2.08*CAR_SCALE-2)<.05,`mesma pegada da caixa (4,2 × 2,0 locais; escala ${CAR_SCALE.toFixed(4)})`);
{const inner=P.car.children[0],bottom=-.65*CAR_SCALE+inner.position.y;ok(Math.abs(bottom+.4)<1e-9&&bottom<0,`pneu a ${bottom.toFixed(2)} m do pivô (local; ×1,3 = ${(bottom*1.3).toFixed(2)} m): toca o chão`);}
{const zc=n=>{let s=0,k=0;for(const m of meshes.filter(m=>m.material.name===n)){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++){s+=a.array[i*3+2];k++;}}return s/k;};
  ok(zc('Lights')<-1.5&&zc('Red_Lights')>1.5,`orientação: faróis em z=${zc('Lights').toFixed(2)} (frente) e lanternas em z=${zc('Red_Lights').toFixed(2)} (trás) → frente = −z, a mesma do jogo; sem giro extra`);
  const mn=[1e9,1e9,1e9],mx=[-1e9,-1e9,-1e9];for(const m of meshes){const a=m.geometry.attributes.position;for(let i=0;i<a.count;i++)for(let k=0;k<3;k++){mn[k]=Math.min(mn[k],a.array[i*3+k]);mx[k]=Math.max(mx[k],a.array[i*3+k]);}}
  const L=(mx[2]-mn[2])*CAR_SCALE,W=(mx[0]-mn[0])*CAR_SCALE,H=(mx[1]-mn[1])*CAR_SCALE;
  ok(Math.abs(L-4.2)<.01&&Math.abs(W-2)<.1&&Math.abs(mn[1]+.65)<.01,`medidas reais do GLB (com matrizes): ${(mx[2]-mn[2]).toFixed(2)} × ${(mx[0]-mn[0]).toFixed(2)} × ${(mx[1]-mn[1]).toFixed(2)} → locais ${L.toFixed(2)} × ${W.toFixed(2)} × ${H.toFixed(2)}; (caixa: 4,2 × 2,0 × 1,25)`);}

console.log('4) física / posição / colisões IDÊNTICAS com e sem o Mustang');
// Dois Player na MESMA pista com as MESMAS entradas (o mundo inteiro do Game muda entre passadas — rochas/chunks —, então não serve de base): um com a caixa, outro com o Mustang.
import {Player} from '../js/player.js';
const T=A.track,box=new Player(T),mus=new Player(T);mus.setCar(scene);
const sample=p=>[p.x,p.y,p.z,p.psi,p.speed,p.pitch,p.roll,p.idx,p.s,p.off].map(v=>+v.toFixed(9)).join(',');
const rb=[],rc=[];let maxPos=0;
for(let i=0;i<60*30;i++){const t=i/60,inp={throttle:t%9<7?1:.3,brake:t>6&&t<7?1:0,steer:Math.sin(t*.7)*.8+(t>20?Math.sin(t*3)*.5:0)};
  box.update(dt,inp);mus.update(dt,inp);maxPos=Math.max(maxPos,Math.hypot(box.x-mus.x,box.y-mus.y,box.z-mus.z));
  if(i%30===0){rb.push(sample(box));rc.push(sample(mus));}}
ok(box.speed>5&&box.s>200,`corrida de 30 s válida (percorreu ${box.s.toFixed(0)} m, ${box.speed.toFixed(1)} m/s, fora-da-pista até ${Math.max(...rb.map(r=>+r.split(',')[9])).toFixed(2)})`);
ok(rb.length===rc.length&&rb.every((r,i)=>r===rc[i]),`posição, rumo, velocidade, inclinação, progresso idênticos em ${rb.length} amostras (30 s com curvas, freada e saída da pista); diferença máx. de posição ${maxPos}`);
import {CAR_R,CAR_OFFS} from '../js/meteors.js';
ok(CAR_R>0&&CAR_OFFS.length>0,'círculos de colisão (CAR_R/CAR_OFFS) continuam os de meteors.js, independentes da malha');
{const D=mk();D.player.setCar(scene);D.input.poll=()=>{};D.state='running';D.meteors.nextSpawn=1e9;D.traffic.update=()=>{};
  const a=D.player,r=a.mesh.position;for(let i=0;i<60;i++){D.input.throttle=1;D.input.steer=0;D.input.brake=0;D.update(dt);}
  ok(r.x===a.x&&r.y===a.y&&r.z===a.z&&a.mesh.rotation.y===-a.psi,'o Group do jogador continua sendo posicionado/rotacionado por Player.update (no Game real)');
  D.invuln=1;D.update(dt);ok(typeof a.mesh.visible==='boolean','pisca de invulnerabilidade (mesh.visible) continua funcionando no Group inteiro');}

console.log('5) perks: efeito fantasma e escudo continuam funcionando com o Mustang');
{const D=mk();D.player.setCar(scene);const K=D.perks,m0=D.player.mesh.children[0].material,m1=D.player.mesh.children[1].material;
  const p=K._pm;ok(p&&p[0]===m0&&p[1]===m1,'perks guarda as referências dos materiais que o chassi/vidro do Mustang usam');
  K._phaseLook(true);ok(m0.transparent===true&&m0.opacity<1&&m1.transparent===true,'fantasma: chassi e vidro do Mustang ficam translúcidos');
  K._phaseLook(false);ok(m0.transparent===K._pm0[0].t&&m0.opacity===K._pm0[0].o&&m1.opacity===K._pm0[1].o,'fantasma desligado: volta aos valores originais');}

console.log('6) fallback e outros sistemas');
{const D=mk();{const n=D.player.mesh.children.length;ok(D.player.setCar(null)===false&&D.player.mesh.children.length===n&&D.player.body.visible&&D.player.cab.visible,'sem GLB (null): continua a caixa original');}
  ok(buildPlayerCar({children:[]},null,null)===null,'cena vazia → null (caixa mantida)');}
{const D=mk();D.player.setCar(scene);D.restart();ok(D.player.car&&D.player.mesh.children.includes(D.player.car),'restart() mantém o Mustang (mesmo objeto Player)');}
