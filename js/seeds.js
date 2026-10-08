// Sementes de uma partida. UMA semente mestra (nova a cada partida) gera sub-sementes independentes para cada sistema procedural.
import {mulberry32} from './utils.js';
export function randomSeed(avoid=-1){   // 30 bits, nunca igual à anterior
  let s;do{
    if(typeof crypto!=='undefined'&&crypto.getRandomValues){const a=new Uint32Array(1);crypto.getRandomValues(a);s=a[0]&0x3fffffff;}else s=(Math.random()*0x40000000)|0;
  }while(s===avoid||s===0);return s;}
export function deriveSeeds(master){
  const r=mulberry32(master^0x9e3779b9),n=()=>(r()*0x3fffffff)|0||1;
  return{master,track:n(),terrain:n(),scenery:n()%1000003+1,traffic:n(),perks:n(),meteors:n()};
}
// seed opcional na URL (?seed=123) só para reproduzir/depurar a PRIMEIRA partida; reinícios sempre sorteiam outra
export function urlSeed(){try{const v=typeof location!=='undefined'?new URLSearchParams(location.search).get('seed'):globalThis.__SEED;   // (globalThis.__SEED: só para testes headless)
    const n=v==null?NaN:parseInt(v,10);return Number.isFinite(n)&&n>0?n&0x3fffffff:null;}catch(e){return null;}}
