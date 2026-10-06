// Mede quantidade de meteoros por dificuldade (spawns/min, impactos/min, simultâneos, impactos a <300 m do carro, rochas no chão) e FPS lógico.
// Uso: node --import ./tests/register.mjs tests/rate_test.mjs
import {Game} from '../js/game.js';
const g=new Game({}),dt=1/60,M=g.meteors;g.input.poll=()=>{};
const follow=()=>{const P=g.player,T=g.track,p=T.sampleAt(P.s+25),want=Math.atan2(p.x-P.x,-(p.z-P.z));let e=Math.atan2(Math.sin(want-P.psi),Math.cos(want-P.psi));g.input.throttle=1;g.input.brake=0;g.input.steer=Math.max(-1,Math.min(1,e*3));};
const SEC=+process.env.SEC||120,out={};
for(const k of[0,.5,1]){g.restart();M.difficulty=()=>k;let peak=0,near=0,imp0=0,tm=[];
 const o=M._impact.bind(M);M._impact=function(m){if(Math.hypot(m.ix-g.player.x,m.iz-g.player.z)<300)near++;o(m);};
 for(let i=0;i<SEC*60;i++){g.invuln=9;g.lives=3;follow();const t=performance.now();g.update(dt);tm.push(performance.now()-t);peak=Math.max(peak,M.stats.alive);}
 M._impact=o;tm.sort((a,b)=>a-b);const min=SEC/60;
 out[k]={spawn:+(M.stats.spawned/min).toFixed(1),impact:+(M.stats.impacts/min).toFixed(1),near:+(near/min).toFixed(1),peak,rocks:M.stats.rocks,rec:M.stats.records,p99:+tm[tm.length*.99|0].toFixed(2)};}
console.log(JSON.stringify(out));
