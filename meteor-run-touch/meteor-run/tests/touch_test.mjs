// Controles de toque × lógica do jogo (Node, sem DOM real): input.touch → Input.poll → Player.update  ≡  teclado; turbo (onTurbo) ≡ SHIFT; teclado intacto; sem efeito no PC.
// (Os botões em si, multitouch, layout e preventDefault são testados em Chromium real: tests/touch_browser_test.py)
// Uso: node --import ./tests/register.mjs tests/touch_test.mjs
import {Game} from '../js/game.js';
import {Input} from '../js/input.js';
import {Player} from '../js/player.js';
const ok=(c,m)=>{console.log((c?'  OK   ':'  FALHA ')+m);if(!c)process.exitCode=1;};
const dt=1/60,g=new Game({}),I=g.input;
console.log('1) Input: estado touch neutro = jogo original');
ok(JSON.stringify(I.touch)==='{"throttle":0,"brake":0,"left":0,"right":0}','input.touch começa zerado');
I.poll();ok(I.throttle===0&&I.brake===0&&I.steer===0,'sem teclas e sem toque: throttle/brake/steer = 0');
for(const [keys,exp,nm] of [[['KeyW'],[1,0,0],'W'],[['ArrowUp','ArrowLeft'],[1,0,-1],'↑ ←'],[['KeyS','KeyD'],[0,1,1],'S D'],[['KeyA','KeyD'],[0,0,0],'A+D se anulam'],[['KeyW','KeyS'],[1,1,0],'W+S']]){
  I.keys.clear();keys.forEach(k=>I.keys.add(k));I.poll();ok(I.throttle===exp[0]&&I.brake===exp[1]&&I.steer===exp[2],`teclado ${nm} → [${exp}] (idêntico ao original)`);}
I.keys.clear();
const T=I.touch;
for(const [t,exp,nm] of [[{throttle:1},[1,0,0],'ACELERAR'],[{throttle:1,left:1},[1,0,-1],'ACELERAR+ESQUERDA'],[{throttle:1,right:1},[1,0,1],'ACELERAR+DIREITA'],[{brake:1},[0,1,0],'FREIO/RÉ'],[{left:1,right:1},[0,0,0],'ESQ+DIR']]){
  Object.assign(T,{throttle:0,brake:0,left:0,right:0},t);I.poll();ok(I.throttle===exp[0]&&I.brake===exp[1]&&I.steer===exp[2],`toque ${nm} → [${exp}]`);}
Object.assign(T,{throttle:0,brake:0,left:0,right:0});I.poll();ok(I.throttle===0&&I.brake===0&&I.steer===0,'soltar tudo → 0');
I.keys.add('KeyD');T.right=1;I.poll();ok(I.steer===1,'tecla D + botão DIREITA: steer continua 1 (limitado)');I.keys.clear();T.right=0;
I.keys.add('KeyW');T.left=1;I.poll();ok(I.throttle===1&&I.steer===-1,'tecla W + botão ESQUERDA combinam');I.keys.clear();T.left=0;

console.log('2) Player recebe os MESMOS comandos: física idêntica via teclado e via toque');
const run=(setup)=>{const In=new Input(),P=new Player(g.track),out=[];for(let i=0;i<60*20;i++){const t=i/60;setup(In,t);In.poll();P.update(dt,In);if(i%30===0)out.push([P.x,P.y,P.z,P.psi,P.speed,P.pitch,P.roll].map(v=>+v.toFixed(9)).join(','));}return out;};
const phase=t=>({gas:1,brake:t>8&&t<10?1:0,l:t>3&&t<6?1:0,r:t>12&&t<15?1:0});
const kb=run((In,t)=>{const p=phase(t);In.keys.clear();if(p.gas)In.keys.add('KeyW');if(p.brake)In.keys.add('KeyS');if(p.l)In.keys.add('KeyA');if(p.r)In.keys.add('KeyD');});
const tc=run((In,t)=>{const p=phase(t);Object.assign(In.touch,{throttle:p.gas,brake:p.brake,left:p.l,right:p.r});});
ok(kb.length===tc.length&&kb.every((r,i)=>r===tc[i]),`20 s de corrida (acelera, vira à esq./dir., freia): teclado e toque dão trajetória IDÊNTICA em ${kb.length} amostras`);
const last=kb[kb.length-1].split(',').map(Number);ok(last[4]>5,`(a corrida é real: ${last[4].toFixed(1)} m/s no fim)`);
const only=run((In,t)=>{In.touch.throttle=1;In.touch.left=t>2?1:0;});ok(only[only.length-1]!==kb[kb.length-1],'toque realmente altera o carro (controle sem comando dá outro resultado)');

console.log('3) Turbo: botão chama input.onTurbo() — o mesmo gancho do SHIFT');
const K=g.perks;g.restart();g.state='running';
ok(typeof I.onTurbo==='function','Game liga input.onTurbo (o botão TURBO só precisa chamá-lo)');
K.turbo.q=60;K.turbo.on=false;globalThis.__key('ShiftLeft');const viaKey=K.turbo.on;
K.turbo.on=false;K.turbo.ti=0;K.turbo.q=60;I.onTurbo();ok(viaKey===true&&K.turbo.on===true,'onTurbo() ativa o turbo carregado exatamente como a tecla SHIFT');
K.turbo.on=false;K.turbo.q=0;K.turbo.empty=0;I.onTurbo();ok(K.turbo.on===false,'sem carga: nada ativa (mesma regra do sistema existente)');
g.state='paused';K.turbo.q=60;K.turbo.on=false;I.onTurbo();ok(K.turbo.on===false,'pausado: turbo não ativa (mesma guarda do SHIFT)');g.state='running';

console.log('4) o jogo roda com comandos de toque (Game.update)');
g.restart();g.state='running';g.meteors.nextSpawn=1e9;g.traffic.update=()=>{};I.poll=Input.prototype.poll.bind(I);
Object.assign(T,{throttle:1,left:0,right:1});let s0=g.player.speed,psi0=g.player.psi;for(let i=0;i<120;i++)g.update(dt);
ok(g.player.speed>s0&&g.player.psi!==psi0,`acelerar+direita no Game real: velocidade ${s0.toFixed(1)} → ${g.player.speed.toFixed(1)} m/s, rumo mudou`);
Object.assign(T,{throttle:0,right:0,brake:1});const v1=g.player.speed;for(let i=0;i<60;i++)g.update(dt);ok(g.player.speed<v1,`freio/ré: ${v1.toFixed(1)} → ${g.player.speed.toFixed(1)} m/s`);
Object.assign(T,{throttle:0,brake:0,left:0,right:0});
