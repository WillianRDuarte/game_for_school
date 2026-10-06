// PERKS / POWER-UPS — módulo independente (nenhum sistema existente foi recriado).
//  · TURBO (item ⚡ NITRO): coletar só ENCHE a barra de carga (+25 %, teto 100 %); NÃO ativa. SHIFT (Input.onTurbo) ativa; a barra é consumida enquanto o turbo roda.
//  · ESCUDO (item 🛡️): fica ativo até bloquear 1 impacto. Obstáculo destrutível (rocha, NPC, destroço) que o atinge é DESTRUÍDO (ram()); meteoro direto/dano absorvido (absorb()). Zona letal (_kill) NÃO é bloqueada.
//  · 5 perks: ⚡ NITRO · 🛡️ ESCUDO · ❤️ REPARO · 👻 FASE · 🔥 OVERDRIVE. Objetos 3D reais no mundo (geometria/materiais compartilhados, pool por tipo).
//  · Chunks: quando um chunk de estrada (CHUNK_LEN do world.js) entra na faixa à frente, sorteia (semente por chunk) se nasce um perk e onde
//    (estrada / acostamento / terreno / "risco"). Perks ficam para trás → voltam ao pool. Frequência e variedade crescem com meteors.difficulty().
//  · Efeitos: ganchos neutros no Player (accMul, boostA, vMax, agile, phase, fovExtra). Dano: Game._damage consulta absorb() (escudo).
//    Vida: Game._heal() (o MESMO sistema de vidas). Fase: Player.phase lido por meteors.collide (rochas pequenas) e traffic (carros/destroços).
//  · Risco: perks "de risco" pedem meteoros próximos via meteors.perkAim (mesmo caminho do npcAim, com a checagem _blocks).
//  · Combo/pontos: passar raspando em meteoro/NPC/destroço, pegar perk (mais se arriscado), velocidade, sobreviver. Dano forte zera o combo.
import * as THREE from 'three';
import {surface} from './terrain.js';
import {CHUNK_LEN} from './world.js';
import {CAR_R,CAR_OFFS,blastR} from './meteors.js';
import {HARD_MAX} from './player.js';
import {mulberry32,clamp,lerp} from './utils.js';

export const PERKS={
  nitro:{icon:'⚡',name:'TURBO',col:0xffd21f,dur:0,max:100,charge:25},
  shield:{icon:'🛡️',name:'ESCUDO',col:0x3ec8ff,dur:0},
  repair:{icon:'❤️',name:'REPARO',col:0x3ff07a,dur:0},
  phase:{icon:'👻',name:'FASE',col:0xb08cff,dur:3},
  overdrive:{icon:'🔥',name:'OVERDRIVE',col:0xff5a1a,dur:5},
};
const TYPES=Object.keys(PERKS);
const CAP={nitro:6,shield:4,repair:3,phase:4,overdrive:2},MAX_ACTIVE=10;       // por tipo · simultâneos no mundo
const GATE={nitro:0,shield:300,repair:700,phase:900,overdrive:2500};            // distância mínima (m) para o perk aparecer
const COOL={nitro:130,shield:350,repair:800,phase:450,overdrive:2200};          // distância mínima (m) entre dois perks do mesmo tipo
const AHEAD_CH=4,PICK_R=3.6,BEHIND=120,AHEAD_MAX=1400,COMBO_T=6,MULT_MAX=5;
const FX_ORDER=['overdrive','phase'];   // linhas temporizadas do HUD (turbo e escudo têm elementos próprios)
export const TURBO_MAX=100,TURBO_DRAIN=12.5,TURBO_MIN=5,SHIELD_RAM_T=.35;   // carga máx. (%) · consumo (%/s: 100 % ≈ 8 s) · carga mínima p/ ligar · janela em que o escudo estourando ainda destrói contatos simultâneos (s)

export class PerkSystem{
  constructor(scene,host,seed=(Math.random()*1e9)|0){
    this.scene=scene;this.host=host;this.seed=seed;this.track=null;this.P=null;this.M=null;this.T=null;
    // geometrias e materiais COMPARTILHADOS
    const G=this.g={oct:new THREE.OctahedronGeometry(1,0),ico:new THREE.IcosahedronGeometry(1,1),box:new THREE.BoxGeometry(1,1,1),torus:new THREE.TorusGeometry(1,.09,6,20),
      cone:new THREE.ConeGeometry(1,1,10),beam:new THREE.CylinderGeometry(.5,.5,1,8,1,true),flame:new THREE.ConeGeometry(.35,1,8)};
    G.beam.translate(0,.5,0);G.flame.translate(0,.5,0);
    this.mat={};for(const t of TYPES){const c=PERKS[t].col;
      this.mat[t]={solid:new THREE.MeshBasicMaterial({color:c}),glass:new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.34,depthWrite:false}),
        add:new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false,fog:false,side:THREE.DoubleSide})};}
    this.pools={};for(const t of TYPES)this.pools[t]=[];
    // efeitos presos ao carro do jogador (criados uma vez; o mesmo Player é reaproveitado no reinício)
    this.flames=[-.55,.55].map(x=>{const m=new THREE.Mesh(G.flame,new THREE.MeshBasicMaterial({color:0x66ccff,transparent:true,opacity:.85,blending:THREE.AdditiveBlending,depthWrite:false}));
      m.rotation.set(Math.PI/2,0,0);m.position.set(x,.45,2.1);m.visible=false;return m;});
    this.bubble=new THREE.Mesh(G.ico,new THREE.MeshBasicMaterial({color:0x3ec8ff,transparent:true,opacity:.28,depthWrite:false}));this.bubble.scale.set(2.5,1.9,3.3);this.bubble.position.y=.8;this.bubble.visible=false;
    this._mkHud();this.stats={spawned:0,collected:0,blocked:0,risk:0,maxActive:0,nearMiss:0,rammed:0,turbos:0};this.reset();
  }
  bind(track,player,meteors,traffic){this.track=track;this.P=player;this.M=meteors;this.T=traffic;
    if(!this.attached||this.attached!==player){player.mesh.add(...this.flames,this.bubble);this.attached=player;this._pm=[player.mesh.children[0].material,player.mesh.children[1].material];
      this._pm0=this._pm.map(m=>({t:m.transparent,o:m.opacity,e:m.emissive?m.emissive.getHex?m.emissive.getHex():0:0}));}}
  reset(){
    for(const t of TYPES)for(const p of this.pools[t])this._release(p);
    this.fx={shield:0,phase:0,overdrive:0};this.turbo={q:0,on:false,ti:0,empty:0};this.ramT=0;this.t=0;this.nextC=null;this.lastS={};for(const t of TYPES)this.lastS[t]=-1e9;this.nAct=0;
    this.chain=0;this.cT=0;this.score=0;this.lastP=null;this.grace=0;this.pg=0;this.pgT=0;this.sh=0;this.fov=0;this.em=0;this.noHit=0;this.fast=0;this.hudT=0;this.toastT=0;this.px=this.pz=null;
    this.nm=new Float32Array(48).fill(99);this.nmV=new Float32Array(48);
    for(const k in this.stats)this.stats[k]=0;
    if(this.P){this._apply(0);this._phaseLook(false);this.flames.forEach(f=>f.visible=false);this.bubble.visible=false;}
    if(this.hud){this._hudRefresh(true);this.toastEl.classList.remove('on');this.pf.classList.remove('on');}
  }
  mult(){return Math.min(MULT_MAX,1+Math.floor(this.chain/2));}
  // ------------------------------------------------------------ construção visual
  _build(type){
    const G=this.g,M=this.mat[type],grp=new THREE.Group(),core=new THREE.Group(),P={type,grp,core,active:false,risk:false,riskN:0,riskT:0,ring:null,orb:null,x:0,y:0,z:0,s:0,ph:0};
    const add=(g,m,sx,sy,sz,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.scale.set(sx,sy,sz);o.position.set(x,y,z);core.add(o);return o;};
    if(type==='nitro'){add(G.oct,M.solid,.8,1.5,.8);P.ring=add(G.torus,M.add,1.5,1.5,1.5);P.ring.rotation.x=Math.PI/2;}                // cristal de energia + anel
    else if(type==='shield'){add(G.ico,M.glass,1.6,1.6,1.6);add(G.ico,M.solid,.6,.6,.6);}                                            // bolha de proteção
    else if(type==='repair'){add(G.box,M.solid,2,.6,.6);add(G.box,M.solid,.6,2,.6);P.ring=add(G.torus,M.add,1.6,1.6,1.6);}               // cruz de recuperação
    else if(type==='phase'){add(G.ico,M.glass,1.5,1.5,1.5);P.orb=new THREE.Group();for(const a of[0,Math.PI]){const o=new THREE.Mesh(G.ico,M.solid);o.scale.setScalar(.35);o.position.set(Math.cos(a)*1.9,0,Math.sin(a)*1.9);P.orb.add(o);}core.add(P.orb);}   // fantasma translúcido + satélites
    else{add(G.cone,M.solid,.9,2.4,.9,0,.5);add(G.cone,M.solid,.9,1.6,.9,0,-.6).rotation.x=Math.PI;P.ring=add(G.torus,M.add,1.9,1.9,1.9);P.ring.rotation.x=Math.PI/2;add(G.torus,M.add,2.4,2.4,2.4).rotation.set(.9,0,0);grp.scale.setScalar(1.35);}   // raro: espinhos + anéis
    const beam=new THREE.Mesh(G.beam,M.add);beam.scale.set(type==='overdrive'?1.6:1.1,16,type==='overdrive'?1.6:1.1);beam.position.y=-1.7;   // coluna de luz: visível de longe
    grp.add(core,beam);grp.visible=false;this.scene.add(grp);this.pools[type].push(P);return P;
  }
  _take(type){const a=this.pools[type];for(const p of a)if(!p.active)return p;return a.length<CAP[type]?this._build(type):null;}
  _release(p){if(p.active)this.nAct--;p.active=false;p.risk=false;p.grp.visible=false;}
  // ------------------------------------------------------------ spawn por chunk
  _pickType(r,sc,k,lives){
    const kk=clamp(k/.35,0,1),f=this.fx,w={nitro:lerp(1,.34,kk),shield:sc>=GATE.shield?.08+.2*kk:0,phase:sc>=GATE.phase?.16*kk:0,
      repair:sc>=GATE.repair&&lives<3?(.1+.1*(3-lives))*(.4+.6*kk):0,overdrive:sc>=GATE.overdrive?lerp(.02,.07,k):0};
    if(f.shield>0)w.shield*=.2;if(f.overdrive>0)w.overdrive*=.2;
    let tot=0;for(const t of TYPES){if(sc-this.lastS[t]<COOL[t]||this.pools[t].filter(p=>p.active).length>=CAP[t])w[t]=0;tot+=w[t];}
    if(tot<=0)return null;let u=r()*tot;for(const t of TYPES){u-=w[t];if(u<=0)return t;}return 'nitro';
  }
  _seed(ch){
    const r=mulberry32((this.seed+ch*104729)|0),k=this.M.difficulty(),sc=(ch+r())*CHUNK_LEN,lives=this.host.lives();
    if(sc<this.ps+200||sc<150||r()>lerp(.4,.62,k))return;
    const n=1+(k>.5&&r()<.25?1:0);   // alto: evento combinado (2 perks juntos)
    for(let i=0;i<n&&this.nAct<MAX_ACTIVE;i++){const s=sc+i*(25+r()*20),type=this._pickType(r,s,k,lives);if(!type)continue;
      const risk=s>400&&r()<lerp(.12,.42,k)*(type==='overdrive'?1.6:1)||i>0;if(this._spawn(r,s,type,k,risk))this.lastS[type]=s;}
  }
  _spawn(r,s,type,k,risk){
    const q=this.track.sampleAt(s),w=q.w,g=this._g||(this._g={}),side=r()<.5?-1:1;let o,terr=false;const m=r();
    if(type==='repair'&&risk||m>.86){o=side*(w+14+r()*36);terr=true;}          // terreno (repare em "área difícil de alcançar")
    else if(m>.62)o=side*(w-1+r()*7);                                               // acostamento / beira
    else o=(r()*2-1)*(w-8);                                                         // asfalto
    const x=q.x+Math.cos(q.h)*o,z=q.z+Math.sin(q.h)*o,y=surface(this.track,x,z,g).h;
    if(terr&&Math.abs(surface(this.track,x+5,z,g).h-y)+Math.abs(surface(this.track,x,z+5,g).h-y)>5)return false;   // encosta íngreme: inalcançável
    if(this.M.rockNear(x,z,3))return false;
    const p=this._take(type);if(!p)return false;
    Object.assign(p,{active:true,x,y,z,s,risk,riskN:risk?1+Math.floor(k*2+r()):0,riskT:0,ph:r()*6.28});this.nAct++;
    p.grp.position.set(x,y+1.9,z);p.grp.visible=true;this.stats.spawned++;this.stats.maxActive=Math.max(this.stats.maxActive,this.nAct);if(risk)this.stats.risk++;return true;
  }
  // meteoros de risco: um impacto a ~9–14 m de um perk "de risco" que o jogador está se aproximando (o marcador de impacto já avisa)
  aim(T,k){
    if(!this.P||!this.nAct)return null;const ps=this.ps;
    for(const t of TYPES)for(const p of this.pools[t]){if(!p.active||!p.risk||p.riskN<=0||this.t<p.riskT)continue;const d=p.s-ps;if(d<90||d>260)continue;
      p.riskN--;p.riskT=this.t+.5+Math.random()*.6;const a=Math.random()*6.283,rr=9+Math.random()*5;return{x:p.x+Math.cos(a)*rr,z:p.z+Math.sin(a)*rr,cat:'perk'};}
    return null;
  }
  _cull(){const ps=this.ps;for(const t of TYPES)for(const p of this.pools[t])if(p.active&&(p.s<ps-BEHIND||p.s>ps+AHEAD_MAX))this._release(p);}
  // ------------------------------------------------------------ combo / pontos
  _event(label,add,pts){this.chain+=add;this.cT=COMBO_T;const m=this.mult();this.score+=Math.round(pts*m);this._toast(`${label}  COMBO x${m}  +${Math.round(pts*m)}`);}
  onDamage(){if(this.chain>=2)this._toast('COMBO PERDIDO');this.chain=0;this.cT=0;this.noHit=0;}
  onMeteorImpact(e){   // meteoro que NÃO acertou o carro mas caiu muito perto
    if(!this.P||e.hit||e.lethal||this.P.speed<12)return;const gap=e.dist-blastR(e.R);
    if(gap<3){this.stats.nearMiss++;this._event('POR UM FIO!',2,100);}else if(gap<10){this.stats.nearMiss++;this._event('METEORO PERTO!',1,60);}
  }
  _nearMiss(){   // carros/destroços: compara os círculos do carro do jogador com os do NPC (mesma geometria da colisão); premia quem passa raspando SEM encostar
    const P=this.P,pool=this.T.pool,fx=Math.sin(P.psi),fz=-Math.cos(P.psi);
    for(let i=0;i<pool.length&&i<48;i++){const c=pool[i];
      if(!c.active||Math.abs(c.x-P.x)>16||Math.abs(c.z-P.z)>16){if(this.nm[i]<1.8&&this.nm[i]>0&&this.nmV[i]>14&&!(P.phase>0)){this.stats.nearMiss++;this.nm[i]<.7?this._event('POR UM FIO!',2,90):this._event('RASPANDO!',1,50);}this.nm[i]=99;continue;}
      const cs=Math.sin(c.psi),cc=-Math.cos(c.psi),a=c.L-c.W,m=CAR_R+c.W;let gap=99;
      for(const off of CAR_OFFS){const px=P.x+fx*off,pz=P.z+fz*off;for(let k=-1;k<=1;k++){const d=Math.hypot(px-(c.x+cs*a*k),pz-(c.z+cc*a*k))-m;if(d<gap)gap=d;}}
      if(gap<this.nm[i])this.nm[i]=gap;this.nmV[i]=Math.max(P.speed,0);}
  }
  // ------------------------------------------------------------ escudo
  _shieldPop(ram){   // consome o escudo: efeito de impacto na bolha + flash azul + partículas
    this.fx.shield=0;this.sh=1;this.stats.blocked++;this.pf.className='on s';this.pfT=.25;
    this._burst(this.P.x,this.P.y+1,this.P.z,PERKS.shield.col,22,14);if(ram)this.ramT=SHIELD_RAM_T;
  }
  absorb(){   // chamado por Game._damage: true = dano bloqueado (meteoro direto, batida sem obstáculo destrutível). O ESCUDO É CONSUMIDO.
    if(this.fx.shield>0){this._shieldPop(false);this.grace=.9;this._toast('🛡️ DANO BLOQUEADO!');return true;}
    return this.grace>0;
  }
  // Contato com um OBSTÁCULO DESTRUTÍVEL (rocha caída, carro NPC, destroço). true = o chamador deve DESTRUIR o obstáculo e NÃO causar dano/empurrão.
  // O 1º contato consome o escudo; por SHIELD_RAM_T s depois, contatos simultâneos do mesmo choque (vários círculos do carro / vários obstáculos) também são destruídos.
  ram(){
    if(this.fx.shield>0){this._shieldPop(true);this.grace=.9;this.stats.rammed++;this._toast('🛡️ OBSTÁCULO DESTRUÍDO!');return true;}
    if(this.ramT>0){this.stats.rammed++;return true;}
    return false;
  }
  // Efeito de destruição do obstáculo (poucas partículas dos pools de fogo/fumaça já existentes).
  crush(x,y,z,col=0xffb060,n=14){this._burst(x,y,z,col,n,9);const S=this.M.smoke;for(let i=0;i<5;i++){const a=Math.random()*6.283,v=2+Math.random()*5;S.emit(x,y,z,Math.cos(a)*v,2+Math.random()*4,Math.sin(a)*v,1.2,1.6,2,-1,.8,[.45,.4,.34,.6],[.5,.5,.5,0]);}}
  // ------------------------------------------------------------ turbo
  activateTurbo(){   // SHIFT: só liga com carga suficiente e se ainda não estiver ligado
    const T=this.turbo;if(!this.P||T.on)return false;
    if(T.q<TURBO_MIN){T.empty=.35;return false;}
    T.on=true;this.stats.turbos++;this._toast('🔥 TURBO!');return true;
  }
  // ------------------------------------------------------------ coleta / efeitos
  _burst(x,y,z,col,n,sp){const F=this.M.fire,c=new THREE.Color(col),a=[c.r,c.g,c.b,.95],b=[c.r,c.g,c.b,0];
    for(let i=0;i<n;i++){const an=i/n*6.283,v=sp*(.6+Math.random()*.6);F.emit(x,y,z,Math.cos(an)*v,2+Math.random()*4,Math.sin(an)*v,.6,1.4,1.4,-3,1.2,a,b);}}
  _collect(p){
    const type=p.type,D=PERKS[type],f=this.fx;let risky=p.risk;
    if(!risky)for(const w of this.M.warnings)if(w.left<2.5&&Math.hypot(w.x-p.x,w.z-p.z)<30){risky=true;break;}
    this._burst(p.x,p.y+1.6,p.z,D.col,16,10);this.stats.collected++;
    if(type==='nitro'){const T=this.turbo,full=T.q>=TURBO_MAX;T.q=Math.min(TURBO_MAX,T.q+D.charge);if(full)this._event('⚡ TURBO CHEIO',risky?2:1,risky?120:20);else this._event(risky?'⚡ TURBO · ARRISCADO!':`⚡ TURBO +${D.charge}%`,risky?2:1,risky?120:50);}   // só enche a barra (nunca passa de 100 %; cheio = sem erro); NÃO ativa
    else if(type==='shield')f.shield=1;   // ativo até bloquear 1 impacto (pegar outro enquanto ativo não empilha)
    else if(type==='phase')f.phase=D.dur;
    else if(type==='overdrive')f.overdrive=D.dur;
    if(type==='repair'){if(this.host.heal())this._event('❤️ +1 VIDA',risky?2:1,risky?120:60);else this._event('❤️ VIDA CHEIA',1,risky?100:40);}
    else if(type!=='nitro')this._event(risky?`${D.icon} ${D.name} · ARRISCADO!`:`${D.icon} ${D.name}`,risky?2:1,risky?120:50);
    this._release(p);
  }
  _apply(dt){   // converte efeitos ativos em parâmetros do Player (combinações: soma limitada; HARD_MAX nunca é excedido)
    const P=this.P,f=this.fx,T=this.turbo,o=f.overdrive>0;
    if(dt){const tgt=T.on?1:0;T.ti+=(tgt-T.ti)*(1-Math.exp(-dt*(tgt?6:2.2)));if(!T.on&&T.ti<.01)T.ti=0;}   // sobe em ~0,4 s; ao acabar volta devagar (~1,2 s): sem freada seca
    else if(!T.on)T.ti=0;
    const ti=T.ti;
    P.accMul=1+.25*ti+(o?.5:0);P.boostA=Math.min(30,12*ti+(o?18:0));P.vMax=Math.min(HARD_MAX,o?105:lerp(75,90,ti));P.agile=(o?1.18:1)+.06*ti;
    const ft=7*ti+(o?6:0);this.fov+=(ft-this.fov)*(dt?1-Math.exp(-dt*3):1);P.fovExtra=this.fov;
  }
  _phaseLook(on){const P=this.P;if(!this._pm)return;for(let i=0;i<2;i++){const m=this._pm[i];if(on){if(!m.transparent){m.transparent=true;m.needsUpdate=true;}m.opacity=.3+.15*Math.sin(this.t*18);if(m.emissive)m.emissive.setHex(0x7a4cff);}
    else{if(m.transparent!==this._pm0[i].t){m.transparent=this._pm0[i].t;m.needsUpdate=true;}m.opacity=this._pm0[i].o;if(m.emissive)m.emissive.setHex(this._pm0[i].e);}}}
  update(dt,{live=true}={}){
    const P=this.P,f=this.fx;if(!P||!this.track)return;dt=Math.min(dt,.05);this.t+=dt;this.ps=P.s;
    if(live){
      // chunks: perks novos entram quando o chunk entra na faixa à frente
      const ci=Math.floor(this.ps/CHUNK_LEN);if(this.nextC===null)this.nextC=ci;
      for(;this.nextC<=ci+AHEAD_CH;this.nextC++)this._seed(this.nextC);
      this.cullT=(this.cullT||0)-dt;if(this.cullT<=0){this.cullT=.25;this._cull();}
      // coleta (varredura do segmento percorrido neste frame: não "atravessa" perk em alta velocidade)
      const x0=this.px===null?P.x:this.px,z0=this.pz===null?P.z:this.pz,sx=P.x-x0,sz=P.z-z0,sl=sx*sx+sz*sz;
      for(const t of TYPES)for(const p of this.pools[t]){if(!p.active)continue;
        if(Math.abs(p.s-this.ps)>60&&Math.abs(p.x-P.x)>60)continue;
        let u=sl>1e-6?clamp(((p.x-x0)*sx+(p.z-z0)*sz)/sl,0,1):0;const d=Math.hypot(p.x-(x0+sx*u),p.z-(z0+sz*u));
        if(d<PICK_R+(t==='overdrive'?1:0)&&Math.abs(p.y-P.y)<5)this._collect(p);}
      this.px=P.x;this.pz=P.z;
      this._nearMiss();
      // combo: expira sem eventos; velocidade com nitro/overdrive e sobrevivência rendem pontos
      if(this.cT>0){this.cT-=dt;if(this.cT<=0)this.chain=0;}
      const ds=P.s-(this.lastP===null?P.s:this.lastP);this.lastP=P.s;if(ds>0&&ds<100)this.score+=ds*.5*this.mult();
      this.noHit+=dt;if(this.noHit>=25){this.noHit=0;this._event('SOBREVIVENTE',1,50);}
      if((this.turbo.on||f.overdrive>0)&&P.speed>65){this.fast+=dt;if(this.fast>=2.5){this.fast=0;this._event('VELOCIDADE',1,25);}}else this.fast=0;
    }
    // turbo: a barra é consumida continuamente (pela metade com overdrive ativo); em 0 o turbo desliga. Escudo não tem relógio: dura até bloquear.
    const o=f.overdrive>0,T=this.turbo;if(T.on){T.q=Math.max(0,T.q-TURBO_DRAIN*dt*(o?.5:1));if(T.q<=0){T.q=0;T.on=false;}}if(T.empty>0)T.empty-=dt;
    if(f.overdrive>0)f.overdrive=Math.max(0,f.overdrive-dt);if(this.ramT>0)this.ramT-=dt;
    if(f.phase>0){f.phase-=dt;if(f.phase<=0){f.phase=0;this.pg=.5;this.pgT=0;}}
    else if(this.pg>0){if(P.phaseHold&&this.pgT<4){this.pg=Math.max(this.pg,.25);this.pgT+=dt;}else this.pg-=dt;}   // fim da Fase: só volta a ser sólido quando não há mais nada sobreposto
    P.phase=(f.phase>0||this.pg>0)?1:0;P.phaseHold=false;if(this.grace>0)this.grace-=dt;
    this._apply(dt);this._visuals(dt);if(live)this._hud(dt);
  }
  _visuals(dt){
    const P=this.P,f=this.fx,n=this.turbo.ti>.08,o=f.overdrive>0,t=this.t;
    for(const k of TYPES)for(const p of this.pools[k]){if(!p.active)continue;const g=p.grp;g.position.y=p.y+1.9+Math.sin(t*2.2+p.ph)*.3;p.core.rotation.y+=dt*(k==='overdrive'?2.6:1.5);
      if(p.ring)p.ring.rotation.z+=dt*2;if(p.orb)p.orb.rotation.y+=dt*3;if(k==='phase'){const a=.7+.3*Math.sin(t*9+p.ph);p.core.scale.setScalar(a+.3);}
      else if(k==='repair'||k==='shield'){const a=1+.08*Math.sin(t*5+p.ph);p.core.scale.setScalar(a);}}
    for(const fl of this.flames){fl.visible=n||o;if(n||o){const L=(o?2.6:1.7)*(.8+.4*Math.random());fl.scale.set(1,L,1);fl.material.color.setHex(o?0xff7a1a:0x66ccff);}}
    if(n||o){this.em+=dt*(o?70:45);const fx=Math.sin(P.psi),fz=-Math.cos(P.psi),c0=o?[1,.6,.2,.9]:[.5,.8,1,.9],c1=o?[.9,.2,.05,0]:[.1,.3,1,0];
      while(this.em>=1){this.em--;this.M.fire.emit(P.x-fx*3,P.y+.8,P.z-fz*3,-fx*9+(Math.random()-.5)*3,(Math.random()-.5)*2,-fz*9+(Math.random()-.5)*3,.35,o?1.3:.9,1.3,0,1,c0,c1);}}
    this.bubble.visible=f.shield>0||this.sh>0;
    if(this.bubble.visible){this.bubble.material.opacity=.22+.1*Math.sin(t*6)+this.sh*.35;const s=1+this.sh*.35;this.bubble.scale.set(2.5*s,1.9*s,3.3*s);if(this.sh>0)this.sh=Math.max(0,this.sh-dt*3);}
    this._phaseLook(P.phase>0&&f.phase>0||this.pg>0);
  }
  // ------------------------------------------------------------ HUD (poucos elementos DOM, atualizados a ~12 Hz)
  _mkHud(){
    const $=id=>document.getElementById(id),mk=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!==undefined)e.textContent=txt;return e;};
    this.hud=$('perks');this.comboEl=$('combo');this.toastEl=$('toast');this.pf=$('pflash');this.pfT=0;
    this.rows={};for(const t of FX_ORDER){const r=mk('div','row'),ic=mk('b','',PERKS[t].icon),nm=mk('span','n',PERKS[t].name),bar=mk('i'),u=mk('u'),tm=mk('em','','');
      bar.appendChild(u);r.append?r.append(ic,nm,bar,tm):[ic,nm,bar,tm].forEach(x=>r.appendChild(x));r.style.display='none';r.className='row '+t;this.hud.appendChild(r);this.rows[t]={r,u,tm,on:false};}
    // barra de TURBO (sempre visível) + indicador do ESCUDO + linhas de velocidade (CSS leve)
    this.turboEl=$('turbo');this.shieldEl=$('shieldhud');this.fxEl=$('turbofx');
    this.tLbl=mk('span','tl','⚡ TURBO');this.tBar=mk('i');this.tU=mk('u');this.tBar.appendChild(this.tU);this.tPct=mk('em','','0%');this.tKey=mk('small','','SHIFT');
    [this.tLbl,this.tBar,this.tPct,this.tKey].forEach(x=>this.turboEl.appendChild(x));this._tq=-1;this._tc='';this._sc='';
    this.scE=mk('span','sc','');this.cbE=mk('span','cb','');this.cbBar=mk('i');this.cbU=mk('u');this.cbBar.appendChild(this.cbU);
    [this.scE,this.cbE,this.cbBar].forEach(x=>this.comboEl.appendChild(x));this._lastSc=-1;
  }
  _toast(t){this.toastEl.textContent=t;this.toastEl.classList.add('on');this.toastT=1.4;}
  _hudRefresh(force){const f=this.fx;for(const t of FX_ORDER){const R=this.rows[t],v=f[t],mx=PERKS[t].max||PERKS[t].dur,on=v>0;
      if(on!==R.on||force){R.on=on;R.r.style.display=on?'flex':'none';}
      if(on){R.u.style.width=Math.round(clamp(v/mx,0,1)*100)+'%';R.tm.textContent=v.toFixed(1)+'s';}}
    const T=this.turbo,q=Math.round(T.q),tc=T.on?'on':T.empty>0?'empty':q>=TURBO_MIN?(q>=TURBO_MAX?'ready full':'ready'):'';
    if(q!==this._tq||force){this._tq=q;this.tU.style.width=q+'%';this.tPct.textContent=q+'%';}
    if(tc!==this._tc||force){this._tc=tc;this.turboEl.className=tc;this.tKey.textContent=T.on?'ATIVO':T.empty>0?'SEM CARGA':'SHIFT';}
    const sh=f.shield>0?'on':'off';if(sh!==this._sc||force){this._sc=sh;this.shieldEl.className=sh;this.shieldEl.textContent=sh==='on'?'🛡️ ESCUDO ATIVO':'🛡️ ESCUDO OFF';}
    this.fxEl.style.opacity=(T.ti*.9).toFixed(2);
    const sc=Math.round(this.score),m=this.mult();
    if(sc!==this._lastSc||force){this._lastSc=sc;this.scE.textContent='⭐ '+sc;}
    this.cbE.textContent=this.chain>0?'COMBO x'+m:'';this.cbU.style.width=this.chain>0?Math.round(clamp(this.cT/COMBO_T,0,1)*100)+'%':'0%';
    this.comboEl.classList[this.chain>0?'add':'remove']('hot');}
  _hud(dt){
    this.hudT-=dt;if(this.hudT<=0){this.hudT=.08;this._hudRefresh(false);}
    if(this.toastT>0){this.toastT-=dt;if(this.toastT<=0)this.toastEl.classList.remove('on');}
    if(this.pfT>0){this.pfT-=dt;if(this.pfT<=0)this.pf.className='';}
  }
}
