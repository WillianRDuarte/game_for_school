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

console.log('2b) Joystick: input.stick (analógico) soma-se ao teclado e o Player recebe o mesmo steer');
ok(I.stick===0,'stick começa em 0');
for(const [st,exp] of [[.5,.5],[-.3,-.3],[1,1],[-1,-1],[0,0]]){I.stick=st;I.poll();ok(Math.abs(I.steer-exp)<1e-9,`stick ${st} → steer ${exp}`);}
I.stick=1;I.keys.add('KeyD');I.poll();ok(I.steer===1,'stick + tecla D: steer limitado a 1');I.keys.clear();I.stick=-.5;I.keys.add('KeyD');I.poll();ok(Math.abs(I.steer-.5)<1e-9,'stick −0,5 + tecla D = +0,5 (soma)');I.keys.clear();I.stick=0;
{const a=run((In,t)=>{In.touch.throttle=1;In.stick=t>3&&t<6?-1:0;}),b=run((In,t)=>{In.touch.throttle=1;In.touch.left=t>3&&t<6?1:0;});ok(a.every((r,i)=>r===b[i]),'stick = −1 dá a mesma trajetória que o antigo botão ◀ (20 s)');
 const c=run((In,t)=>{In.touch.throttle=1;In.stick=t>3?.4:0;}),d=run((In,t)=>{In.touch.throttle=1;In.stick=t>3?1:0;});ok(c[c.length-1]!==d[d.length-1],'stick parcial (0,4) vira menos que stick total');}
I.stick=0;
console.log('2c) Joystick eixo Y: ↑ = 50 % do acelerador · ↓ = freio/ré · botões inalterados');
{const P=(y,btn={})=>{I.keys.clear();Object.assign(I.touch,{throttle:0,brake:0,left:0,right:0},btn);I.stick=0;I.stickY=y;I.poll();return [I.throttle,I.brake];};
 let r=P(0);ok(r[0]===0&&r[1]===0,'Y=0 → sem aceleração/freio');
 r=P(1);ok(r[0]===.5&&r[1]===0,'joystick todo para cima → throttle 0,5 (50 % do botão), brake 0');
 r=P(.6);ok(r[0]===.5,'60 % do curso já dá os 50 % (máximo)');r=P(.3);ok(r[0]>0&&r[0]<.5,`curso parcial é proporcional (${r[0].toFixed(2)})`);
 r=P(-1);ok(r[0]===0&&r[1]===1,'joystick todo para baixo → brake 1 (mesmo comando do botão FREIO/RÉ)');
 r=P(1,{throttle:1});ok(r[0]===1,'botão ACELERAR + joystick ↑: força normal (1), não soma');
 r=P(0,{throttle:1});ok(r[0]===1,'botão ACELERAR sozinho continua em 1');
 r=P(1,{brake:1});ok(r[0]===.5&&r[1]===1,'botão FREIO + joystick ↑: como W+S');
 I.keys.add('KeyW');I.stickY=1;I.poll();ok(I.throttle===1,'tecla W continua em 1 com joystick');I.keys.clear();I.stickY=0;
 const sp=(y)=>{const In=new Input(),Pl=new Player(g.track);for(let i=0;i<60*12;i++){In.stickY=y;In.poll();Pl.update(dt,In);}return Pl.speed;};
 const v50=sp(1),v100=(()=>{const In=new Input(),Pl=new Player(g.track);for(let i=0;i<60*12;i++){In.touch.throttle=1;In.poll();Pl.update(dt,In);}return Pl.speed;})(),vb=(()=>{const In=new Input(),Pl=new Player(g.track);for(let i=0;i<60*8;i++){In.touch.throttle=1;In.poll();Pl.update(dt,In);}for(let i=0;i<60*3;i++){In.touch.throttle=0;In.stickY=-1;In.poll();Pl.update(dt,In);}return Pl.speed;})();
 ok(v50<v100,`joystick ↑ (${v50.toFixed(1)} m/s em 12 s) acelera menos que o botão (${v100.toFixed(1)} m/s)`);ok(v50>5,'joystick ↑ realmente acelera o carro');ok(vb<v100*.6,`joystick ↓ freia o carro (${vb.toFixed(1)} m/s após 3 s)`);}
I.stickY=0;I.keys.clear();Object.assign(I.touch,{throttle:0,brake:0,left:0,right:0});
console.log('2d) RÉ real pelo joystick ↓ (só ele engata a ré)');
{const fw=P=>P.vx*Math.sin(P.psi)+P.vz*-Math.cos(P.psi);
 const mk=()=>({In:new Input(),P:new Player(g.track)});
 const step=(o,n,f)=>{for(let i=0;i<n;i++){o.In.keys.clear();o.In.stick=0;o.In.stickY=0;Object.assign(o.In.touch,{throttle:0,brake:0,left:0,right:0});f(o.In,i/60);o.In.poll();o.P.update(dt,o.In);}};
 // 1) parado + ↓ → anda para trás
 let o=mk();step(o,60*6,In=>{In.touch.brake=1;});ok(Math.abs(fw(o.P))<.6,`parado com FREIO (botão) → fica parado (${fw(o.P).toFixed(2)} m/s), SEM ré`);
 o=mk();step(o,60*8,In=>{In.stickY=-1;});let v=fw(o.P);ok(v<-8&&v>=-13.001,`joystick ↓ a partir do repouso → anda de RÉ (${v.toFixed(1)} m/s para trás, máx. 13)`);
 ok(o.P.speed===0&&o.In.reverse===1,'o resto do jogo continua vendo speed ≥ 0 (speed=0 em ré)');
 const x0=o.P.x,z0=o.P.z;step(o,60*2,In=>{In.stickY=-1;});const back=(o.P.x-x0)*Math.sin(o.P.psi)+(o.P.z-z0)*-Math.cos(o.P.psi);ok(back<-10,`posição realmente recua (${back.toFixed(1)} m em 2 s)`);
 // 2) soltar → volta a andar para frente (movimento constante do jogo)
 step(o,60*3,In=>{In.stickY=0;});ok(fw(o.P)>0,`soltou o joystick → ré termina e o carro volta para frente (${fw(o.P).toFixed(1)} m/s)`);
 // 3) andando para frente + ↓ → freia primeiro, depois engata ré
 o=mk();step(o,60*6,In=>{In.touch.throttle=1;});const v0=fw(o.P);step(o,60*.5,In=>{In.stickY=-1;});const v1=fw(o.P);ok(v1<v0&&v1>0,`a 100 km/h+, ↓ primeiro FREIA (${v0.toFixed(1)} → ${v1.toFixed(1)} m/s), não vira ré de repente`);
 step(o,60*5,In=>{In.stickY=-1;});ok(fw(o.P)<-5,`mantendo ↓ depois de parar, engata a ré (${fw(o.P).toFixed(1)} m/s)`);
 // 4) direção em ré: esquerda/direita giram o carro, sentido invertido (como um carro de verdade)
 o=mk();step(o,60*4,In=>{In.stickY=-1;});const p0=o.P.psi;step(o,60*3,In=>{In.stickY=-1;In.stick=1;});const dR=o.P.psi-p0;
 o=mk();step(o,60*4,In=>{In.stickY=-1;});const q0=o.P.psi;step(o,60*3,In=>{In.stickY=-1;In.stick=-1;});const dL=o.P.psi-q0;
 ok(dR<-.05&&dL>.05,`direita/esquerda em ré giram o carro (Δψ ${dR.toFixed(2)} / ${dL.toFixed(2)} rad)`);
 // 5) outros comandos NÃO engatam ré: S/↓ do teclado e botão FREIO só freiam (como antes)
 o=mk();step(o,60*6,In=>{In.keys.add('KeyS');});ok(fw(o.P)>=-.01,'tecla S parado: sem ré (comportamento original)');
 o=mk();step(o,60*6,In=>{In.keys.add('KeyW');});step(o,60*10,In=>{In.keys.add('KeyS');});ok(fw(o.P)>=-.01,'tecla S depois de correr: freia e para, sem ré');
 // 6) ACELERAR (botão) enquanto em ré: sai da ré e acelera para frente
 o=mk();step(o,60*5,In=>{In.stickY=-1;});step(o,60*5,In=>{In.touch.throttle=1;});ok(fw(o.P)>5,`ACELERAR durante a ré → vai para frente (${fw(o.P).toFixed(1)} m/s)`);
 // 7) ré nunca ultrapassa o limite e o freio (botão) em ré para o carro, sem inverter
 o=mk();step(o,60*5,In=>{In.stickY=-1;});step(o,60*2,In=>{In.touch.brake=1;});ok(fw(o.P)>=-13.001&&fw(o.P)<=.3,`FREIO (botão) durante a ré freia o carro (${fw(o.P).toFixed(1)} m/s)`);}
I.stickY=0;I.stick=0;I.keys.clear();Object.assign(I.touch,{throttle:0,brake:0,left:0,right:0});
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
