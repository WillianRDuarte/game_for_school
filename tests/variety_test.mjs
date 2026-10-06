// Mede a variedade do relevo lateral (150–600 m da borda) em janelas de 1 km ao longo de 40 km de percurso.
import {Track} from '../js/road.js';import {ground} from '../js/terrain.js';
const T=new Track(7);T.ensureZ(-60000);const g={};const S=i=>T.samples.get(i);
const rows=[];
for(let w=0;w<40;w++){const v=[];for(let i=w*250+50;i<w*250+300;i+=10){const s=S(i);for(const sd of[-1,1])for(let d=150;d<=600;d+=50){ground(T,s.x+Math.cos(s.h)*sd*(s.w+d),s.z+Math.sin(s.h)*sd*(s.w+d),g,0);v.push(g.h-s.y);}}
  const m=v.reduce((a,b)=>a+b,0)/v.length,sd=Math.sqrt(v.reduce((a,b)=>a+(b-m)**2,0)/v.length);rows.push([m,sd,Math.min(...v),Math.max(...v)]);}
console.log('km  média(m)  desvio(m)  mín   máx');rows.forEach((r,i)=>console.log(String(i).padStart(2),r.map(x=>x.toFixed(0).padStart(8)).join('')));
const sds=rows.map(r=>r[1]).sort((a,b)=>a-b);console.log('desvio: mínimo',sds[0].toFixed(0),'mediana',sds[20].toFixed(0),'máximo',sds[39].toFixed(0),'→ trechos planos a muito acidentados');
