// Estado abstrato de entrada. stick/stickY = eixos analógicos (-1..1; Y positivo = para cima) do joystick virtual (js/touch.js); combinados com teclado e botões em poll().
export const STICK_GAS=.5,STICK_FULL=.6;   // joystick para cima = 50 % da força do botão ACELERAR; chega ao máximo com 60 % do curso (acima disso, nada muda) Controles de celular só precisam escrever nestes campos.
export class Input{
  constructor(){this.throttle=0;this.brake=0;this.steer=0;this.keys=new Set();this.touch={throttle:0,brake:0,left:0,right:0};this.stick=0;this.stickY=0;this.reverse=0;this.onPause=null;this.onReset=null;this.onTurbo=null;   // touch: escrito por js/touch.js (botões na tela) e combinado com o teclado em poll() · onTurbo: SHIFT (também chamado pelo botão TURBO)
   
    addEventListener('keydown',e=>{this.keys.add(e.code);if(e.code==='KeyP'&&this.onPause)this.onPause();if(e.code==='KeyR'&&this.onReset)this.onReset();
      if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&!e.repeat&&this.onTurbo)this.onTurbo();});
    addEventListener('keyup',e=>this.keys.delete(e.code));}
  poll(){const k=this.keys,h=(...c)=>c.some(x=>k.has(x))?1:0;
    const t=this.touch;const up=Math.max(0,this.stickY),dn=Math.max(0,-this.stickY);   // joystick: ↑ = acelerador a 50 % (STICK_GAS) · ↓ = freia e, parado, engata a RÉ (input.reverse)
    this.throttle=Math.max(h('KeyW','ArrowUp')||t.throttle,STICK_GAS*Math.min(1,up/STICK_FULL));this.brake=Math.max(h('KeyS','ArrowDown')||t.brake,Math.min(1,dn/STICK_FULL));this.reverse=Math.min(1,dn/STICK_FULL);   // reverse: SÓ o joystick ↓ (o Player engata a ré quando o carro já está parado)
       // max(): o botão ACELERAR (1,0) e o teclado continuam com a força normal
    this.steer=Math.max(-1,Math.min(1,h('KeyD','ArrowRight')+t.right-h('KeyA','ArrowLeft')-t.left+this.stick));}
}
