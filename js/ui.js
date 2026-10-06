import * as THREE from 'three';
import {THEMES} from './road.js';
const NW=14;   // indicadores de impacto fora da tela (pool fixo)
export class UI{
  constructor(){const $=id=>document.getElementById(id);this.s=$('speed');this.d=$('dist');this.g=$('dbg');this.f=0;this.t=0;
    this.lv=$('lives');this.fl=$('flash');this.over=$('over');this.os=$('overScore');this.ob=$('overBest');this.restartBtn=$('restart');this.dg=$('danger');this._dgt='';
    const wr=$('warn');this.wr=[];for(let i=0;i<NW;i++){const e=document.createElement('i');wr.appendChild(e);this.wr.push(e);}
    this._v=new THREE.Vector3();this._flashT=0;}
  update(dt,player,world,renderer,meteors,scenery){
    this.f++;this.t+=dt;if(this.t>=.5){const fps=Math.round(this.f/this.t);this.f=this.t=0;
      this.g.textContent=`${fps} fps · estrada ${world.active.size} · terreno ${world.tiles.size}${world.loading?'(+'+world.loading+')':''} · draw calls ${renderer.info.render.calls} · alt ${player.y.toFixed(0)} m · ${THEMES[player.track.sampleAt(player.s).th].name}`+(scenery&&scenery.lib?` · cenário ${scenery.stats.drawnB}/${scenery.stats.bld} prédios ${scenery.stats.drawnT}/${scenery.stats.trees} árvores`:'')+(meteors?` · meteoros ${meteors.stats.alive} no céu · ${meteors.stats.rocks} no chão · crateras ${meteors.stats.decals}`:'');}
    this.s.textContent=Math.round(player.speed*3.6)+' km/h'+(player.off>.5?' · fora da pista':'');this.d.textContent=Math.round(player.s)+' m';
  }
  setLives(n,max){n=Math.max(0,Math.min(max,n|0));this.lv.textContent=('❤️ '.repeat(n)+'🖤 '.repeat(max-n)).trim();}
  flash(){this.fl.classList.add('on');clearTimeout(this._ft);this._ft=setTimeout(()=>this.fl.classList.remove('on'),60);}
  showOver(dist,best,cause,score){this.os.textContent='Distância: '+dist+' m'+(score?' · Pontos: '+score:'')+(cause?' · '+cause:'');this.ob.textContent='Recorde: '+best+' m';this.over.classList.add('show');}
  hideOver(){this.over.classList.remove('show');}
  // Aviso da zona letal (>200 m da pista): aparece a partir de Z.warn m; vira alerta vermelho quando o meteoro de punição foi disparado.
  setDanger(Z,lethal){
    let t='',hot=false;
    if(Z&&Z.edge>Z.warn){const left=Z.limit-Z.edge;if(Z.out||lethal){t='☄ ZONA LETAL — METEORO A CAMINHO';hot=true;}else t='⚠ Fora da rota · volte à pista ('+Math.max(1,Math.ceil(left))+' m)';}
    if(t===this._dgt)return;this._dgt=t;this.dg.textContent=t;
    if(t){this.dg.classList.add('on');if(hot)this.dg.classList.add('hot');else this.dg.classList.remove('hot');}else{this.dg.classList.remove('on');this.dg.classList.remove('hot');}
  }
  // Avisos de impacto que a câmera NÃO mostra (atrás, laterais, acima): um ponto na borda da tela apontando para o lugar do impacto.
  warnings(list,cam,W,H,px,pz){
    let n=0;const sorted=list.slice().sort((a,b)=>a.left-b.left);
    for(const w of sorted){if(n>=NW)break;
      if(Math.hypot(w.x-px,w.z-pz)>420)continue;                                  // só os que ameaçam o jogador
      const c=this._v.set(w.x,w.y+2,w.z).applyMatrix4(cam.matrixWorldInverse);let sx,sy,on=false;
      if(c.z<0){const p=c.applyMatrix4(cam.projectionMatrix);sx=p.x;sy=p.y;on=Math.abs(sx)<.92&&Math.abs(sy)<.88;}      // c.z<0: à frente da câmera
      else{const l=Math.hypot(c.x,c.y)||1;sx=c.x/l;sy=c.y/l;}                                                              // atrás: usa a direção
      if(on)continue;
      const k=Math.max(Math.abs(sx)/.92,Math.abs(sy)/.88)||1,e=this.wr[n++];sx/=k;sy/=k;
      e.style.display='block';e.style.left=((sx*.5+.5)*W)+'px';e.style.top=((.5-sy*.5)*H)+'px';
      const u=w.left<1.6?1.25+.25*Math.sin(w.left*30):1;e.style.transform=`scale(${u})`;}
    for(let i=n;i<NW;i++)this.wr[i].style.display='none';}
}
