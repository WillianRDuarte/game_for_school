import {register} from 'node:module';
register('./hooks.mjs',import.meta.url);
// --- stubs de DOM/navegador (só para testes em Node)
const mkEl=()=>{const el={textContent:'',style:{},children:[],_l:{},classList:{_s:new Set(),add(c){this._s.add(c);},remove(c){this._s.delete(c);},contains(c){return this._s.has(c);}},
  appendChild(c){this.children.push(c);},addEventListener(t,f){(this._l[t]=this._l[t]||[]).push(f);},click(){(this._l.click||[]).forEach(f=>f({}));},
  getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}),width:0,height:0};return el;};
const els={};
globalThis.document={getElementById:id=>els[id]||(els[id]=mkEl()),createElement:()=>mkEl()};
const L={};globalThis.addEventListener=(t,f)=>{(L[t]=L[t]||[]).push(f);};globalThis.__key=(code)=>(L.keydown||[]).forEach(f=>f({code}));
globalThis.innerWidth=1280;globalThis.innerHeight=720;globalThis.devicePixelRatio=1;
globalThis.localStorage={_d:{},getItem(k){return this._d[k]??null;},setItem(k,v){this._d[k]=v;}};
globalThis.__els=els;
