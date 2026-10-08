// METEOR DIRECTOR — ritmo procedural da chuva de meteoros. NÃO cria meteoros: só decide QUANDO, QUANTOS e ONDE (via MeteorSystem.spawn).
// Fases:  CALMO → PERIGO → TEMPESTADE → RECUPERAÇÃO → CALMO …  (a ordem varia; TEMPESTADE é sempre seguida de RECUPERAÇÃO obrigatória)
//  · cada fase tem um PERFIL (cadência, simultâneos no céu, meteoros que AMEAÇAM o jogador, espaçamento, pesos das categorias de impacto, tamanhos);
//  · um meteoro "ameaça" quando cai perto de onde o carro estará no impacto ou sobre o asfalto logo à frente; só uma cota deles pode existir ao mesmo tempo
//    (com intervalo mínimo entre eles); o resto vira "cenário": cai longe/atrás/nas laterais e mantém a sensação de caos sem punir;
//  · impactos não podem cair colados uns nos outros (nem em tempo + espaço, para os que ameaçam);
//  · depois de levar dano há uma carência curta sem novas ameaças;
//  · a dificuldade (distância percorrida, k = 0..1) NÃO aumenta o número bruto de meteoros: aumenta a frequência/duração de PERIGO e TEMPESTADE, a pontaria,
//    o tamanho (cratera/obstáculo), a parcela "no caminho" e a chance de mirar em NPCs. CALMO e RECUPERAÇÃO continuam existindo em qualquer distância.
import {mulberry32,lerp,clamp,smoothstep} from './utils.js';
export const PHASE={CALM:'calm',DANGER:'danger',STORM:'storm',RECOVERY:'recovery'};
const NAMES={calm:'CALMO',danger:'PERIGO',storm:'TEMPESTADE',recovery:'RECUPERAÇÃO'};
const BANDS={calm:'🟢',danger:'🟡',storm:'🔴',recovery:'🔵'};
// ordem dos pesos: front, side, near, far, lane, behind  (front/near/lane tendem a ser ameaças; side/far/behind tendem a ser cenário)
const W={calm:[.07,.30,.03,.27,.02,.31],danger:[.20,.18,.12,.12,.16,.22],storm:[.20,.20,.12,.12,.16,.20],recovery:[.02,.34,0,.32,0,.32]};
const THREAT_NEAR=42,THREAT_AHEAD=150;   // m: ameaça = impacto a <42 m do carro (agora ou onde estará) · ou sobre o asfalto até 150 m à frente
const REC_FREE=.55;                      // fração inicial da RECUPERAÇÃO sem NENHUMA ameaça
export class MeteorDirector{
  constructor(M,{blastR}={}){this.M=M;this.blastR=blastR||(R=>R*.62+1.6);this.enabled=true;this.seed=0x5eed;this.cur={};this.prev={};this.reset();}
  reset(seed){
    this.rng=mulberry32((seed!==undefined?seed:this.seed)|0);this.phase=PHASE.CALM;this.t=0;this.dur=20;this.lastEnd=0;this.grace=0;this.lastThreat=-99;
    this.recent=[];this.log=[{ph:PHASE.CALM,at:0,dur:this.dur}];this.stats={phases:{calm:1,danger:0,storm:0,recovery:0},rejected:0,threats:0,scenery:0,maxThreat:0};
    this._profile(this.cur,PHASE.CALM,0);Object.assign(this.prev,this.cur);this.ramp=1;this.gapT=0;
  }
  get name(){return NAMES[this.phase];}
  get band(){return BANDS[this.phase];}
  // ---------------------------------------------------------------- perfis (k = dificuldade 0..1)
  _profile(o,ph,k){
    const s=smoothstep(0,1,k);o.phase=ph;o.w=W[ph];o.noBig=false;o.aimMax=0;o.aimP=0;o.aimLat=1;o.npcTries=1;o.sep=1;o.sep0=8;o.thrSep=36;o.thrDt=.8;
    if(ph===PHASE.CALM){
      o.gap=lerp(1.15,.9,s);o.maxSim=lerp(8,11,s);o.maxThreat=1;o.tGap=lerp(6,4.5,s);o.noBig=true;o.pS=lerp(.78,.66,s);o.pM=lerp(.2,.3,s);o.npcTries=1;o.sep=1.1;o.sep0=10;
    }else if(ph===PHASE.DANGER){
      o.gap=lerp(.5,.36,s);o.maxSim=lerp(22,30,s);o.maxThreat=s>.5?4:3;o.tGap=lerp(1.5,.8,s);o.pS=lerp(.5,.3,s);o.pM=lerp(.38,.4,s);   // restante = grandes (10 % → 30 %)
      o.aimP=lerp(.12,.3,s);o.aimMax=1+(s>.5?1:0);o.aimLat=lerp(1.15,.8,s);o.npcTries=lerp(2,4,s)|0;o.sep=1;o.sep0=7;
    }else if(ph===PHASE.STORM){
      o.gap=lerp(.15,.11,s);o.maxSim=lerp(44,56,s);o.maxThreat=s>.5?6:5;o.tGap=lerp(.55,.35,s);o.pS=.46;o.pM=.34;   // 20 % grandes: caos visual, mas só 1 grande ameaça por vez
      o.aimP=lerp(.1,.22,s);o.aimMax=2;o.aimLat=lerp(1.1,.85,s);o.npcTries=lerp(4,8,s)|0;o.sep=.55;o.sep0=5;o.thrSep=26;o.thrDt=.45;
    }else{                                                           // RECUPERAÇÃO
      o.gap=1.0;o.maxSim=10;o.maxThreat=0;o.tGap=5.5;o.noBig=true;o.pS=.8;o.pM=.2;o.npcTries=1;o.sep=1.2;o.sep0=10;
    }
    return o;
  }
  _dur(ph,k){const r=this.rng(),s=smoothstep(0,1,k);
    switch(ph){
      case PHASE.CALM:return lerp(lerp(16,10,s),lerp(26,15,s),r);        // calmaria encurta com a distância, mas nunca some
      case PHASE.DANGER:return lerp(lerp(11,12,s),lerp(18,22,s),r);
      case PHASE.STORM:return lerp(lerp(6,8,s),lerp(8.5,11,s),r);       // período curto
      default:return lerp(7,10,r);}}                                     // RECUPERAÇÃO obrigatória: 7–10 s
  _stormAllowed(k){const P=this.M.player;return P&&P.s>450&&this.M.time>25;}   // sem tempestade no começo da corrida
  _next(k){
    const r=this.rng(),s=smoothstep(0,1,k);let n;
    switch(this.phase){
      case PHASE.CALM:n=PHASE.DANGER;break;
      case PHASE.DANGER:n=(this._stormAllowed(k)&&r<lerp(.3,.62,s))?PHASE.STORM:PHASE.CALM;break;   // PERIGO → (TEMPESTADE | CALMO)
      case PHASE.STORM:n=PHASE.RECOVERY;break;                                                        // obrigatório
      default:n=(k>.25&&r<.22*s+.08)?PHASE.DANGER:PHASE.CALM;}                                        // RECUPERAÇÃO → CALMO (quase sempre)
    return n;
  }
  _enter(ph,k){
    Object.assign(this.prev,this.cur);this.phase=ph;this.t=0;this.dur=this._dur(ph,k);this.stats.phases[ph]++;
    this.ramp=(ph===PHASE.DANGER||ph===PHASE.STORM)?2.5:0;            // subida gradual (2,5 s) ao entrar em fases mais intensas; a descida é imediata
    this.log.push({ph,at:this.M.time,dur:this.dur});if(this.log.length>400)this.log.shift();
  }
  // ---------------------------------------------------------------- avanço (chamado todo frame pelo MeteorSystem)
  update(dt,k){
    this.t+=dt;if(this.grace>0)this.grace-=dt;
    if(this.t>=this.dur)this._enter(this._next(k),k);
    this._profile(this.cur,this.phase,k);const c=this.cur,p=this.prev;
    if(this.ramp>0&&this.t<this.ramp){const b=this.t/this.ramp;c.gap=lerp(p.gap,c.gap,b);c.maxSim=lerp(p.maxSim,c.maxSim,b);c.maxThreat=Math.round(lerp(p.maxThreat,c.maxThreat,b));c.tGap=lerp(p.tGap,c.tGap,b);}
    if(this.phase===PHASE.RECOVERY){const u=this.t/this.dur;if(u<REC_FREE)c.maxThreat=0;else c.maxThreat=1;}   // 1ª parte da recuperação: zero ameaças; depois no máx. 1
    if(this.grace>0)c.maxThreat=0;                                                                              // carência após levar dano
    c.maxSim=Math.round(c.maxSim);
    const r=this.recent;while(r.length&&this.M.time-r[0].t>1.2)r.shift();
  }
  // intervalo até o próximo spawn (jitter ±40 %)
  nextGap(){return this.cur.gap*(.6+.8*this.rng());}
  // ---------------------------------------------------------------- avaliação de um ponto de impacto candidato
  // devolve -1 = rejeitado · 0 = cenário · 1 = ameaça.  (x,z) impacto; R raio da cratera; cls 0..2; T tempo de queda.
  evaluate(x,z,R,cls,T){
    const M=this.M,P=M.player,pl=this.cur,tr=M.track;
    const ppx=P.x+P.vx*T,ppz=P.z+P.vz*T,fx=Math.sin(P.psi),fz=-Math.cos(P.psi);
    const dN=Math.hypot(x-P.x,z-P.z),dP=Math.hypot(x-ppx,z-ppz),dmin=Math.min(dN,dP);
    let onRoadAhead=false;const nn=tr.nearest(x,z);
    if(nn&&nn.d<nn.w+R*.3){const fwd=(x-P.x)*fx+(z-P.z)*fz;onRoadAhead=fwd>-8&&fwd<THREAT_AHEAD+P.speed*T*.6;}
    const threat=dmin<THREAT_NEAR+R*.4||onRoadAhead;
    // ---- espaçamento: nenhum impacto colado em outro (meteoros ainda no ar + impactos dos últimos 1,2 s)
    const sepMin=(a,b)=>(a+b)*.5*pl.sep+pl.sep0;
    for(const m of M.meteors){if(!m.active||m.lethal)continue;const d=Math.hypot(x-m.ix,z-m.iz);
      if(d<sepMin(R,m.R)){this.stats.rejected++;return -1;}
      if(threat&&m.threat&&(d<pl.thrSep||(d<75&&Math.abs((T)-(m.T-m.t))<pl.thrDt))){this.stats.rejected++;return -1;}}
    for(const q of this.recent){if(Math.hypot(x-q.x,z-q.z)<sepMin(R,q.R)){this.stats.rejected++;return -1;}}
    if(!threat)return 0;
    // ---- fim de fase intensa: nenhuma ameaça que pousaria depois do fim da TEMPESTADE/PERIGO (a recuperação/calmaria começa de verdade; só o cenário continua caindo)
    if((this.phase===PHASE.STORM||this.phase===PHASE.DANGER)&&this.t+T>this.dur){this.stats.rejected++;return -1;}
    // ---- cota de ameaças simultâneas
    let nT=0,nBig=0;for(const m of M.meteors)if(m.active&&m.threat&&!m.lethal){nT++;if(m.cls===2)nBig++;}
    if(nT>=pl.maxThreat||M.time-this.lastThreat<pl.tGap||(cls===2&&(pl.noBig||nBig>=1))){this.stats.rejected++;return -1;}
    return 1;
  }
  commit(m,code){m.threat=code===1;if(code===1){this.lastThreat=this.M.time;this.stats.threats++;let n=0;for(const q of this.M.meteors)if(q.active&&q.threat&&!q.lethal)n++;if(n>this.stats.maxThreat)this.stats.maxThreat=n;}else this.stats.scenery++;}
  noteImpact(x,z,R){this.recent.push({x,z,R,t:this.M.time});if(this.recent.length>12)this.recent.shift();}
  noteHit(sec=3){this.grace=Math.max(this.grace,sec);}               // jogador levou dano → sem novas ameaças por alguns segundos
}
