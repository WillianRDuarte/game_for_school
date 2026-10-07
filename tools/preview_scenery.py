#!/usr/bin/env python3
"""Prévia por rasterização (numpy+PIL, sem GPU) de assets/models/scenery_lite.glb: cada modelo de 2 ângulos, com a textura real (cor amostrada pelo UV).
Uso: python3 tools/preview_scenery.py saida.png [id ...]"""
import sys,os,io,numpy as np
from PIL import Image,ImageDraw
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
from build_vehicles import load,acc
OUT=os.path.join(os.path.dirname(HERE),'assets','models','scenery_lite.glb')
def glb_models(path=OUT):
    js,bn=load(path);texs=[]
    for im in js['images']:
        v=js['bufferViews'][im['bufferView']];o=v.get('byteOffset',0);texs.append(np.array(Image.open(io.BytesIO(bytes(bn[o:o+v['byteLength']]))).convert('RGB')))
    out=[]
    for nd in js['nodes']:
        pr=js['meshes'][nd['mesh']]['primitives'][0];mat=js['materials'][pr['material']];ti=js['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
        out.append((nd['name'],acc(js,bn,pr['attributes']['POSITION']).astype(float),acc(js,bn,pr['indices']).reshape(-1,3).astype(int),acc(js,bn,pr['attributes']['TEXCOORD_0']).astype(float),texs[ti]))
    return out
def render(P,I,UV,tex,yaw,pitch,W=330,H=300,ext=None):
    c=np.array([0,P[:,1].max()/2,0]);ext=ext or np.ptp(P,axis=0).max()
    cy,sy=np.cos(yaw),np.sin(yaw);cp,sp=np.cos(pitch),np.sin(pitch);Ry=np.array([[cy,0,sy],[0,1,0],[-sy,0,cy]]);Rx=np.array([[1,0,0],[0,cp,-sp],[0,sp,cp]]);R=Rx@Ry
    Q=(P-c)@R.T;A,B,C=Q[I[:,0]],Q[I[:,1]],Q[I[:,2]];n=np.cross(B-A,C-A);n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-9)
    lam=np.clip(np.abs(n@np.array([-.3,.6,.75])),0,1)*.55+.45
    ph,pw=tex.shape[:2];uv=(UV[I[:,0]]+UV[I[:,1]]+UV[I[:,2]])/3;col=tex[np.clip((uv[:,1]*ph).astype(int),0,ph-1),np.clip((uv[:,0]*pw).astype(int),0,pw-1)].astype(float)/255*lam[:,None]
    d=(A[:,2]+B[:,2]+C[:,2])/3;o=np.argsort(d);im=Image.new('RGB',(W,H),(150,185,225));dr=ImageDraw.Draw(im);s=min(W,H)*.8/ext
    for k in o:dr.polygon([(W/2+p[0]*s,H*.62-p[1]*s) for p in (A[k],B[k],C[k])],fill=tuple(int(x*255) for x in np.clip(col[k],0,1)))
    return im
if __name__=='__main__':
    ms=[m for m in glb_models() if len(sys.argv)<3 or m[0] in sys.argv[2:]];cols=4;W,H=330,300;rows=(len(ms)+cols-1)//cols;sh=Image.new('RGB',(W*cols,H*rows))
    for i,(name,P,I,UV,tex) in enumerate(ms):
        im=render(P,I,UV,tex,np.radians(35+(i%2)*180),np.radians(20));sh.paste(im,((i%cols)*W,(i//cols)*H));ImageDraw.Draw(sh).text(((i%cols)*W+6,(i//cols)*H+4),f'{name} {len(I)} tris',fill=(0,0,0))
    sh.save(sys.argv[1] if len(sys.argv)>1 else '/tmp/scenery_sheet.png');print('ok')
