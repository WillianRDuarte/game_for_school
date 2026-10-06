#!/usr/bin/env python3
"""Prévia por rasterização simples (numpy+PIL, sem GPU) de assets/models/npc_vehicles_lite.glb: desenha cada veículo de 2 ângulos
(3/4 pelo lado +z e 3/4 pelo lado −z) para conferir orientação, proporção e cores sem WebGL.
Uso: python3 tools/preview_vehicles.py saida_prefixo [id1 id2 ...]   (sem ids = todos; gera saida_prefixo_N.png com 12 veículos cada)
Se `--front` for passado, desenha a frente configurada em js/vehicles.js (yaw): a vista da esquerda é sempre a de FRENTE do jogo (−z)."""
import sys,os,io,re,json,numpy as np
from PIL import Image,ImageDraw
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__)))
from build_vehicles import load,acc,OUT,ROOT
def glb_vehicles(path=OUT):
    js,bn=load(path);pal=None
    if js.get('images'):
        bv=js['bufferViews'][js['images'][0]['bufferView']];o=bv.get('byteOffset',0);pal=np.array(Image.open(io.BytesIO(bn[o:o+bv['byteLength']])).convert('RGB'))
    out=[]
    for nd in js['nodes']:
        me=js['meshes'][nd['mesh']];prims=[]
        for pr in me['primitives']:
            m=js['materials'][pr['material']];pb=m.get('pbrMetallicRoughness',{});at=pr['attributes']
            prims.append(dict(P=acc(js,bn,at['POSITION']).astype(float),I=acc(js,bn,pr['indices']).reshape(-1,3).astype(int),UV=acc(js,bn,at['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in at else None,
              col=pb.get('baseColorFactor',[1,1,1,1]),tex='baseColorTexture' in pb,em=m.get('emissiveFactor'),blend=m.get('alphaMode')=='BLEND',mat=m['name']))
        out.append((nd['name'],prims))
    return out,pal
def render(prims,pal,yaw,pitch,W=220,H=170):
    allP=np.concatenate([p['P'] for p in prims]);c=(allP.min(0)+allP.max(0))/2;ext=np.ptp(allP,axis=0).max()
    cy,sy=np.cos(yaw),np.sin(yaw);cp,sp=np.cos(pitch),np.sin(pitch);Ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]]);Rx=np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]]);R=Rx@Ry;tris=[]
    for p in prims:
        P,I=p['P'],p['I'];Q=(P-c)@R.T;A,B,C=Q[I[:,0]],Q[I[:,1]],Q[I[:,2]];n=np.cross(B-A,C-A);n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-9)
        lam=np.clip(np.abs(n@np.array([-.3,.6,.75])),0,1)*.6+.4
        if p['tex']:
            uv=(p['UV'][I[:,0]]+p['UV'][I[:,1]]+p['UV'][I[:,2]])/3;col=pal[np.clip((uv[:,1]*8).astype(int)%8,0,7),np.clip((uv[:,0]*8).astype(int)%8,0,7)].astype(float)/255
        else:col=np.tile(np.array(p['col'][:3])**(1/2.2),(len(I),1))
        if p['em']:col=np.ones_like(col)
        al=.35 if p['blend'] else 1;d=(A[:,2]+B[:,2]+C[:,2])/3
        for k in range(len(I)):tris.append((d[k],A[k],B[k],C[k],col[k]*lam[k],al))
    tris.sort(key=lambda t:t[0]);im=Image.new('RGB',(W,H),(150,185,225));dr=ImageDraw.Draw(im,'RGBA');s=min(W,H)*.82/ext
    for d,A,B,C,col,al in tris:dr.polygon([(W/2+q[0]*s,H*.55-q[1]*s) for q in (A,B,C)],fill=tuple(int(x*255) for x in np.clip(col,0,1))+(int(255*al),))
    return im
def front_yaws():
    """yaw configurado por modelo em js/vehicles.js (para `--front`): lê as chamadas v('id','classe',{...yaw:...}) com regex, sem executar JS (padrão: π)."""
    src=open(os.path.join(ROOT,'js','vehicles.js'),encoding='utf-8').read();out={}
    for m in re.finditer(r"v\('([^']+)','[^']+'(?:,\{([^}]*)\})?\)",src):
        y=re.search(r'yaw:([^,}]+)',m.group(2) or '');out[m.group(1)]=eval(y.group(1).replace('R','np.pi'),{'np':np}) if y else np.pi
    return out
if __name__=='__main__':
    args=[a for a in sys.argv[1:] if not a.startswith('--')];pre=args[0] if args else '/tmp/prev';ids=args[1:];vs,pal=glb_vehicles()
    sel=[v for v in vs if not ids or v[0] in ids];fy=front_yaws() if '--front' in sys.argv else None;per=12
    for sh in range((len(sel)+per-1)//per):
        part=sel[sh*per:(sh+1)*per];sheet=Image.new('RGB',(220*6,170*((len(part)+2)//3)),(255,255,255));d=ImageDraw.Draw(sheet)
        for i,(name,prims) in enumerate(part):
            x0=(i%3)*440;y0=(i//3)*170
            if fy is None:views=[np.radians(35),np.radians(215)]            # +z de frente | −z de frente (arquivo cru, sem correção)
            else:                                                            # com a correção: a frente do jogo é −z; o modelo é girado pelo yaw configurado
                yw=fy.get(name,np.pi);views=[yw+np.pi+np.radians(35),yw+np.radians(35)]   # esquerda: FRENTE do jogo (−z) · direita: traseira
            for k,yw in enumerate(views):sheet.paste(render(prims,pal,yw,np.radians(18)),(x0+k*220,y0))
            d.text((x0+4,y0+3),name,fill=(0,0,0))
        sheet.save(f'{pre}_{sh}.png')
    print('ok',len(sel))
