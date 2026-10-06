// Estado geral e loop principal.
import * as THREE from 'three';
import {Track,STEP} from './road.js';
import {World} from './world.js';
import {Player} from './player.js';
import {CameraRig} from './camera.js';
import {Input} from './input.js';
import {UI} from './ui.js';
import {MeteorSystem} from './meteors.js';
import {TrafficSystem} from './traffic.js';
import {PerkSystem} from './perks.js';
import {SceneryManager} from './scenery.js';
const HORIZON=0xbcd7ee,ZENITH=0x4f8fd8;
export const MAX_LIVES=3,INVULN=2.2;   // vidas; segundos de invulnerabilidade após levar dano
export class Game{
  constructor(canvas){
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(HORIZON);this.scene.fog=new THREE.Fog(HORIZON,450,5600);   // neblina atmosférica: montanhas distantes esmaecem
    this.camera=new THREE.PerspectiveCamera(65,1,1,7000);
    this._sky();
    this.scene.add(new THREE.HemisphereLight(0xcfe6ff,0x4a5a3a,1.6));
    const sun=new THREE.DirectionalLight(0xfff2d6,2);sun.position.set(-1,2,.6);this.scene.add(sun);
    this.track=new Track(7);this.world=new World(this.scene,this.track);
    this.player=new Player(this.track);this.scene.add(this.player.mesh);
    this.rig=new CameraRig(this.camera,this.player);this.input=new Input();this.ui=new UI();
    this.meteors=new MeteorSystem(this.scene);this.meteors.onImpact=e=>this._onImpact(e);this.meteors.onRockHit=e=>this._onRockHit(e);this.meteors.bind(this.track,this.player);
    this.traffic=new TrafficSystem(this.scene);this.traffic.onPlayerHit=e=>this._onTrafficHit(e);this.traffic.bind(this.track,this.player,this.meteors);   // carros NPC (módulo próprio)
    this.meteors.npcAim=(T,k)=>this.traffic.aim(T,k);
    this.perks=new PerkSystem(this.scene,{lives:()=>this.lives,heal:()=>this._heal()});this.perks.bind(this.track,this.player,this.meteors,this.traffic);   // perks/power-ups (módulo próprio)
    this.meteors.perkAim=(T,k)=>this.perks.aim(T,k);
    this.scenery=new SceneryManager(this.scene);this.scenery.bind(this.track,this.player);this.scenery.onHit=e=>this._damage('Batida com um prédio');   // cenário: prédios/árvores ao longo da pista (módulo próprio; chunks do world.js)
    // ESCUDO: o primeiro contato com um obstáculo destrutível (rocha caída, carro NPC, destroço) consome o escudo e destrói o obstáculo, sem dano (a zona letal usa _kill e não passa por aqui)
    const ram=()=>this.state==='running'&&this.perks.ram(),crush=(x,y,z,r)=>this.perks.crush(x,y,z,0xffb060,10);
    this.meteors.shieldRam=ram;this.meteors.onSmash=crush;this.traffic.shieldRam=ram;this.traffic.onSmash=crush;
    this.best=0;try{this.best=+localStorage.getItem('meteorRunBest')||0;}catch(e){}
    this.input.onReset=()=>{if(this.state==='over')this.restart();else this.player.respawn(this.player.s);};
    this.input.onPause=()=>{if(this.state==='running')this.state='paused';else if(this.state==='paused')this.state='running';};   // pausa não "ressuscita" no game over
    this.input.onTurbo=()=>{if(this.state==='running')this.perks.activateTurbo();};   // SHIFT: ativa o turbo carregado (coletar NÃO ativa)
    addEventListener('keydown',e=>{if(this.state==='over'&&(e.code==='Enter'||e.code==='Space'))this.restart();});
    this.ui.restartBtn.addEventListener('click',()=>this.restart());
    this.lives=MAX_LIVES;this.invuln=0;this.state='running';this.ui.setLives(this.lives,MAX_LIVES);
    addEventListener('resize',()=>this.resize());this.resize();
    this.world.preload(this.player.x,this.player.z,this.player.s); // terreno sólido ao redor; o resto é carregado em fatias
  }
  // ---- vidas / game over / reinício
  _onImpact(e){this.scenery.onMeteorImpact(e);this.traffic.onMeteorImpact(e);this.perks.onMeteorImpact(e);if(e.lethal)this._kill();else if(e.hit)this._damage();}   // meteoro de punição (>200 m da pista) = morte; explosão comum perto do carro = 1 vida
  _onRockHit(e){this._damage();}
  _onTrafficHit(e){this._damage('Batida com outro carro');}                 // NPC (ou destroço) bateu forte no carro: mesmo sistema de vidas/invulnerabilidade                                    // carro bateu num meteoro que já está no chão
  _damage(cause){
    if(this.state!=='running'||this.invuln>0)return;               // 1 impacto = no máximo 1 vida; depois, invulnerável por INVULN s
    if(this.perks.absorb(cause))return;                            // perk ESCUDO: absorve este dano (a zona letal usa _kill e NÃO passa por aqui)
    this.perks.onDamage();this.lives--;this.invuln=INVULN;this.ui.setLives(this.lives,MAX_LIVES);this.ui.flash();
    if(this.lives<=0)this._gameOver(cause);
  }
  _heal(){if(this.state!=='running'||this.lives>=MAX_LIVES)return false;this.lives++;this.ui.setLives(this.lives,MAX_LIVES);return true;}   // perk REPARO: +1 vida no MESMO sistema de vidas (nunca passa de MAX_LIVES)
  _kill(){   // morte instantânea (meteoro de punição fora da zona segura): ignora vidas restantes e invulnerabilidade
    if(this.state!=='running')return;
    this.lives=0;this.invuln=0;this.ui.setLives(0,MAX_LIVES);this.ui.flash();this._gameOver('Atingido por um meteoro fora da pista');
  }
  _gameOver(cause){
    this.state='over';this.player.mesh.visible=true;const d=Math.floor(this.player.s);
    if(d>this.best){this.best=d;try{localStorage.setItem('meteorRunBest',String(d));}catch(e){}}
    this.ui.showOver(d,this.best,cause,Math.round(this.perks.score));
  }
  restart(){   // novo mundo do zero (a estrada anterior já foi descartada atrás do carro); o carro e a câmera são reaproveitados
    this.world.dispose();this.track=new Track(7);this.world=new World(this.scene,this.track);
    this.player.track=this.track;this.player.idx=10;this.player.respawn(this.player.idx*STEP);this.player.mesh.visible=true;
    this.rig.init=false;this.meteors.reset();this.meteors.bind(this.track,this.player);this.scenery.reset();this.scenery.bind(this.track,this.player);this.traffic.reset();this.traffic.bind(this.track,this.player,this.meteors);this.perks.reset();this.perks.bind(this.track,this.player,this.meteors,this.traffic);
    this.lives=MAX_LIVES;this.invuln=0;this.state='running';this.ui.setLives(this.lives,MAX_LIVES);this.ui.hideOver();
    this.world.preload(this.player.x,this.player.z,this.player.s);
  }
  _sky(){ // cúpula de céu (só céu/horizonte muito distante — todo o chão é geometria real)
    const g=new THREE.SphereGeometry(6300,32,16),n=g.attributes.position.count,col=new Float32Array(n*3),a=new THREE.Color(HORIZON),b=new THREE.Color(ZENITH),c=new THREE.Color();
    for(let i=0;i<n;i++){const t=Math.pow(Math.max(0,g.attributes.position.getY(i)/6300),.55);c.lerpColors(a,b,t);col.set([c.r,c.g,c.b],i*3);}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    this.sky=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));this.sky.renderOrder=-1;this.sky.frustumCulled=false;this.scene.add(this.sky);
  }
  resize(){this.renderer.setSize(innerWidth,innerHeight,false);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  update(dt){
    if(this.state==='running'){
      this.input.poll();this.player.update(dt,this.input);this.world.update(this.player.x,this.player.z,this.player.s,this.world.loading>8?9:5);
      this.meteors.update(dt);this.meteors.collide(this.player);   // meteoros no chão são obstáculos sólidos
      this.scenery.collide(this.player);   // prédios: caixa simples (árvores não colidem)
      this.traffic.update(dt);   // NPCs: IA, desvio de meteoros, colisão com o carro (usa os avisos de impacto que o sistema de meteoros já publica)
      this.perks.update(dt);   // perks: spawn por chunk, coleta, efeitos (Player), combo, HUD
      if(this.invuln>0){this.invuln-=dt;this.player.mesh.visible=this.invuln<=0||Math.floor(this.invuln*12)%2===0;}   // pisca enquanto invulnerável
    }else if(this.state==='over'){this.meteors.update(dt,{spawn:false});this.traffic.update(dt,{live:false});}   // game over: o jogo para, mas explosões em andamento terminam
    this.rig.update(dt);this.sky.position.copy(this.camera.position);this.camera.updateMatrixWorld();
    this.meteors.setView(this.camera,innerHeight*Math.min(devicePixelRatio,2));
    if(this.state!=='paused')this.scenery.update(dt,this.camera,this.world.loading>8?1.2:2.5);   // gera/remove prédios e árvores por chunk (fatias de tempo) e monta as instâncias visíveis
    this.ui.update(dt,this.player,this.world,this.renderer,this.meteors,this.scenery);this.ui.setDanger(this.state==='running'?this.meteors.zone:null,this.meteors.lethalM);
    this.ui.warnings(this.state==='running'?this.meteors.warnings:[],this.camera,innerWidth,innerHeight,this.player.x,this.player.z);
  }
  start(){let last=performance.now();const loop=now=>{
      const dt=Math.min((now-last)/1000,.05);last=now;this.update(dt);
      this.renderer.render(this.scene,this.camera);requestAnimationFrame(loop);};
    requestAnimationFrame(loop);}
}
