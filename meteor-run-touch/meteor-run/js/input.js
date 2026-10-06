// Estado abstrato de entrada. Controles de celular só precisam escrever nestes campos.
export class Input{
  constructor(){this.throttle=0;this.brake=0;this.steer=0;this.keys=new Set();this.touch={throttle:0,brake:0,left:0,right:0};this.onPause=null;this.onReset=null;this.onTurbo=null;   // touch: escrito por js/touch.js (botões na tela) e combinado com o teclado em poll() · onTurbo: SHIFT (também chamado pelo botão TURBO)
   
    addEventListener('keydown',e=>{this.keys.add(e.code);if(e.code==='KeyP'&&this.onPause)this.onPause();if(e.code==='KeyR'&&this.onReset)this.onReset();
      if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&this.onTurbo)this.onTurbo();});
    addEventListener('keyup',e=>this.keys.delete(e.code));}
  poll(){const k=this.keys,h=(...c)=>c.some(x=>k.has(x))?1:0;
    const t=this.touch;this.throttle=h('KeyW','ArrowUp')||t.throttle;this.brake=h('KeyS','ArrowDown')||t.brake;this.steer=Math.max(-1,Math.min(1,h('KeyD','ArrowRight')+t.right-h('KeyA','ArrowLeft')-t.left));}
}
