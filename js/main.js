import {Game} from './game.js';
import {loadVehicleLibrary} from './vehicles.js';
import {loadPlayerCar} from './playercar.js';
import {initTouchControls} from './touch.js';
const game=new Game(document.getElementById('c'));
game.traffic.modelsPending=true;   // o tráfego só começa a nascer quando os modelos GLB chegaram (ou falharam / passaram de 10 s → carros-caixa originais)
initTouchControls(game.input);   // botões na tela só em celular/tablet (escrevem no mesmo Input do teclado)
game.start();
loadPlayerCar().then(scene=>game.player.setCar(scene));   // carro do jogador (Mustang GLB); sem GLB/loader continua a caixa original
Promise.race([loadVehicleLibrary(),new Promise(r=>setTimeout(()=>r(null),10000))]).then(lib=>game.traffic.setLibrary(lib));
