#!/usr/bin/env python3
"""Gera assets/models/npc_vehicles_lite.glb a partir dos GLBs ORIGINAIS (assets/models/originals/, que NÃO são alterados).
Só usa numpy. Uso:  python3 tools/build_vehicles.py [--preview]

Fontes:
  · low_poly_suvs.glb               → 8 SUVs completos (~40 mil triângulos cada: pesado demais para tráfego no navegador)
  · low-poly_truck_car_drifter.glb  → 1 caminhão "Drifter"
  · 39_low_poly_vehicle_free.glb    → coletânea: 39 veículos (um nó de topo cada), só cores (sem texturas), já leves

O que faz:
  · separa os veículos (SUVs: agrupa as meshes por posição; coletânea: um nó de topo = um veículo);
  · SUVs: remove o que não aparece de fora (assoalho, motor, pedais, chassi) e simplifica os pneus; caminhão: remove a fumaça animada do escapamento;
  · aplica as transformações dos nós, recentra cada veículo (centro em x/z, rodas em y=0) e funde as meshes por material;
  · preserva materiais, textura-paleta embutida (SUVs), sampler e cores originais. NÃO corrige escala/orientação: isso é feito em js/vehicles.js, por modelo.
"""
import json,struct,sys,re,os
import numpy as np
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE)
SRC=os.path.join(ROOT,'assets','models','originals');OUT=os.path.join(ROOT,'assets','models','npc_vehicles_lite.glb')
CT={5126:'f4',5123:'u2',5125:'u4',5121:'u1',5122:'i2',5120:'i1'};NC={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(p):
    d=open(p,'rb').read();o=12;js=bn=None
    while o<len(d):
        cl,ct=struct.unpack('<II',d[o:o+8]);ch=d[o+8:o+8+cl]
        if ct==0x4E4F534A:js=json.loads(ch)
        elif ct==0x004E4942:bn=ch
        o+=8+cl
    return js,bn
def acc(js,bn,i):
    a=js['accessors'][i];bv=js['bufferViews'][a['bufferView']];dt=np.dtype(CT[a['componentType']]);n=NC[a['type']];off=bv.get('byteOffset',0)+a.get('byteOffset',0);st=bv.get('byteStride')
    if st and st!=dt.itemsize*n:return np.frombuffer(bn,dtype='u1',count=st*a['count'],offset=off).reshape(a['count'],st)[:,:dt.itemsize*n].copy().view(dt).reshape(a['count'],n)
    return np.frombuffer(bn,dtype=dt,count=a['count']*n,offset=off).reshape(a['count'],n)
def local(nd):
    if 'matrix' in nd:return np.array(nd['matrix'],float).reshape(4,4).T
    t=nd.get('translation',[0,0,0]);x,y,z,w=nd.get('rotation',[0,0,0,1]);s=nd.get('scale',[1,1,1]);T=np.eye(4)
    R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]);T[:3,:3]=R@np.diag(s);T[:3,3]=t;return T
def meshes_under(js,bn,start,M0):
    """geometria (já em coordenadas de mundo) de tudo que está sob o nó `start`; M0 = transformação acumulada dos ancestrais."""
    out=[]
    def walk(n,M):
        nd=js['nodes'][n];W=M@local(nd)
        if 'mesh' in nd:
            me=js['meshes'][nd['mesh']]
            for pr in me['primitives']:
                P=acc(js,bn,pr['attributes']['POSITION']).astype(float)
                UV=acc(js,bn,pr['attributes']['TEXCOORD_0']).astype(float) if 'TEXCOORD_0' in pr['attributes'] else np.zeros((len(P),2))
                I=acc(js,bn,pr['indices']).reshape(-1).astype(np.int64) if 'indices' in pr else np.arange(len(P))
                Wp=(np.c_[P,np.ones(len(P))]@W.T)[:,:3]
                out.append(dict(name=me.get('name') or nd.get('name'),node=nd.get('name'),mat=pr.get('material'),P=Wp,UV=UV,I=I.reshape(-1,3)))
        for c in nd.get('children',[]):walk(c,W)
    walk(start,M0);return out
def meshes(js,bn):
    out=[]
    for s in js['scenes']:
        for n in s['nodes']:out+=meshes_under(js,bn,n,np.eye(4))
    return out
def bbox(ms):return np.min([m['P'].min(0) for m in ms],axis=0),np.max([m['P'].max(0) for m in ms],axis=0)
def decimate(m,cell):
    """aglomeração de vértices (grade): chave = célula da posição + célula do UV (a paleta 8×8 dos SUVs não pode misturar cores)."""
    P,UV,I=m['P'],m['UV'],m['I'];k=np.floor(P/cell).astype(np.int64);u=np.floor(UV*8).astype(np.int64)
    key=np.c_[k,u];_,inv,cnt=np.unique(key,axis=0,return_inverse=True,return_counts=True);inv=inv.reshape(-1);n=inv.max()+1
    NP=np.zeros((n,3));np.add.at(NP,inv,P);NP/=cnt[:,None];NU=np.zeros((n,2));NU[inv]=UV
    F=inv[I];F=F[(F[:,0]!=F[:,1])&(F[:,1]!=F[:,2])&(F[:,0]!=F[:,2])]
    used=np.unique(F);remap=-np.ones(n,np.int64);remap[used]=np.arange(len(used))
    return dict(m,P=NP[used],UV=NU[used],I=remap[F])
def merge(ms):
    P=np.concatenate([m['P'] for m in ms]);UV=np.concatenate([m['UV'] for m in ms]);off=0;I=[]
    for m in ms:I.append(m['I']+off);off+=len(m['P'])
    return P,UV,np.concatenate(I)
# ---------------------------------------------------------------- fonte 0: SUVs
BASE=lambda n:re.sub(r'\.\d+$','',re.sub(r'_(Pallete|Glass|HeadLight|StopLight)_0$','',n))
SUV_KEEP={'Body','Door','hood','WindowBack','WindowFront','Trunk','Mirror','WindowDoor','WondowRight','Seats','Panel','Light','Bumper','NumPlate','Wheel'}   # (Wheel = volante + pneus)
def suv_vehicles(js,bn):
    ms=meshes(js,bn);boxes=[(m,m['P'].min(0),m['P'].max(0)) for m in ms];cl=[]
    for m,mn,mx in sorted(boxes,key=lambda t:-np.prod(t[2]-t[1])):
        c=(mn+mx)/2
        for k in cl:
            if k['mn'][0]-.5<=c[0]<=k['mx'][0]+.5 and k['mn'][2]-.5<=c[2]<=k['mx'][2]+.5:k['m'].append(m);k['mn']=np.minimum(k['mn'],mn);k['mx']=np.maximum(k['mx'],mx);break
        else:cl.append(dict(mn=mn.copy(),mx=mx.copy(),m=[m]))
    cl.sort(key=lambda k:k['mn'][0]);vs=[]
    for i,k in enumerate(cl):
        keep=[];tin=0
        for m in k['m']:
            b=BASE(m['name']);tire=b=='Wheel' and len(m['I'])>1500;tin+=len(m['I'])
            if b in SUV_KEEP:keep.append(decimate(m,.30) if tire else m)
        vs.append(dict(name=f'suv_{i}',ms=keep,tris_in=tin,src=0))
    return vs
# ---------------------------------------------------------------- fonte 1: caminhão Drifter
def truck_vehicle(js,bn):
    allm=meshes(js,bn);keep=[m for m in allm if not m['name'].startswith('Smoke')]   # Smoke.* = baforadas de fumaça animadas do escapamento (a animação do GLB não é usada)
    return [dict(name='truck_drifter',ms=keep,tris_in=sum(len(m['I']) for m in allm),src=1)]
# ---------------------------------------------------------------- fonte 2: coletânea (39 veículos, um nó de topo cada)
def collection_vehicles(js,bn):
    n=js['scenes'][0]['nodes'][0];M=local(js['nodes'][n])
    while len(js['nodes'][n].get('children',[]))==1:   # descasca os nós-embrulho do Sketchfab (Sketchfab_model → .fbx → RootNode)
        n=js['nodes'][n]['children'][0];M=M@local(js['nodes'][n])
    vs=[];seen={}
    for t in js['nodes'][n]['children']:
        nm=js['nodes'][t].get('name') or f'node{t}';ms=meshes_under(js,bn,t,M)
        if not ms:continue
        tin=sum(len(m['I']) for m in ms);keep=[]
        for m in ms:
            mn=(js['materials'][m['mat']]['name'] if m['mat'] is not None else '').lower()
            keep.append(decimate(m,.10) if (('wheel' in mn or 'tire' in mn) and len(m['I'])>300) else m)   # só as rodas mais pesadas são simplificadas
        vid='col_'+re.sub(r'[^a-z0-9]+','_',nm.lower()).strip('_');seen[vid]=seen.get(vid,0)+1
        if seen[vid]>1:vid+=f'_{seen[vid]}'
        vs.append(dict(name=vid,ms=keep,tris_in=tin,src=2))
    return vs
def recenter(v):
    mn,mx=bbox(v['ms']);c=np.array([(mn[0]+mx[0])/2,mn[1],(mn[2]+mx[2])/2])
    for m in v['ms']:m['P']=m['P']-c
    v['bbox']=(mn-c,mx-c)
def write(vehicles,srcs,out,prefix):
    mats=[];matmap={};imgs=[];tex=[];samp=[];blob=bytearray();bvs=[];accs=[];meshes_=[];nodes=[]
    def addbv(data,target=None):
        while len(blob)%4:blob.append(0)
        bvs.append(dict(buffer=0,byteOffset=len(blob),byteLength=len(data),**({'target':target} if target else {})));blob.extend(data);return len(bvs)-1
    def addacc(arr,ct,typ,target,minmax=False):
        a=np.ascontiguousarray(arr);bv=addbv(a.tobytes(),target);d=dict(bufferView=bv,componentType=ct,count=len(a),type=typ)
        if minmax:d['min']=a.min(0).astype(float).tolist();d['max']=a.max(0).astype(float).tolist()
        accs.append(d);return len(accs)-1
    def getmat(si,mi):
        key=(si,mi)
        if key in matmap:return matmap[key]
        js,bn=srcs[si];m=json.loads(json.dumps(js['materials'][mi])) if mi is not None else {'name':'default','pbrMetallicRoughness':{'metallicFactor':0}};pb=m.setdefault('pbrMetallicRoughness',{})
        if 'baseColorTexture' in pb:
            t=js['textures'][pb['baseColorTexture']['index']];tk=('tex',si,t['source'])
            if tk not in matmap:
                im=js['images'][t['source']];bv=js['bufferViews'][im['bufferView']];o=bv.get('byteOffset',0);png=bn[o:o+bv['byteLength']]
                imgs.append(dict(bufferView=addbv(png),mimeType=im['mimeType'],name='palette'));samp.append(js['samplers'][t['sampler']]);tex.append(dict(sampler=len(samp)-1,source=len(imgs)-1));matmap[tk]=len(tex)-1
            pb['baseColorTexture']={'index':matmap[tk]}
        pb['metallicFactor']=pb.get('metallicFactor',0.0)
        m['name']=f"{prefix[si]}_{m.get('name','m')}";mats.append(m);matmap[key]=len(mats)-1;return matmap[key]
    for v in vehicles:
        byMat={}
        for m in v['ms']:byMat.setdefault(m['mat'],[]).append(m)
        prims=[]
        for mi,lst in sorted(byMat.items(),key=lambda t:-1 if t[0] is None else t[0]):
            P,UV,I=merge(lst)
            # sem NORMAL no arquivo: o GLTFLoader liga flatShading (visual low-poly facetado) e dá para fundir vértices que só diferiam na normal (arquivo ~metade)
            key=np.round(np.c_[P*1000,UV*10000]).astype(np.int64);_,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.reshape(-1);P=P[first];UV=UV[first];I=inv[I]
            I=I[(I[:,0]!=I[:,1])&(I[:,1]!=I[:,2])&(I[:,0]!=I[:,2])];ix=I.reshape(-1).astype(np.uint16 if len(P)<65535 else np.uint32)
            at={'POSITION':addacc(P.astype('f4'),5126,'VEC3',34962,True)}
            if v['src']<2:at['TEXCOORD_0']=addacc(UV.astype('f4'),5126,'VEC2',34962)   # (a coletânea não tem UV: só cores)
            prims.append(dict(attributes=at,indices=addacc(ix,5123 if ix.dtype==np.uint16 else 5125,'SCALAR',34963),material=getmat(v['src'],mi),mode=4))
        meshes_.append(dict(name=v['name'],primitives=prims));nodes.append(dict(name=v['name'],mesh=len(meshes_)-1))
    while len(blob)%4:blob.append(0)
    js=dict(asset=dict(version='2.0',generator='meteor-run tools/build_vehicles.py',extras=dict(note='derivado de low_poly_suvs.glb (Vladek, CC-BY-4.0), low-poly_truck_car_drifter.glb (Ivan Norman, CC-BY-NC-4.0) e 39_low_poly_vehicle_free.glb (yelaman.arts, CC-BY-4.0); originais não alterados')),scene=0,scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes_,materials=mats,
            accessors=accs,bufferViews=bvs,buffers=[dict(byteLength=len(blob))])
    if imgs:js.update(images=imgs,textures=tex,samplers=samp)
    j=json.dumps(js,separators=(',',':')).encode();j+=b' '*((4-len(j)%4)%4)
    with open(out,'wb') as f:f.write(struct.pack('<4sII','glTF'.encode(),2,12+8+len(j)+8+len(blob)));f.write(struct.pack('<II',len(j),0x4E4F534A));f.write(j);f.write(struct.pack('<II',len(blob),0x004E4942));f.write(bytes(blob))
def main():
    P=lambda n:os.path.join(SRC,n)
    sj,sb=load(P('low_poly_suvs.glb'));tj,tb=load(P('low-poly_truck_car_drifter.glb'));cj,cb=load(P('39_low_poly_vehicle_free.glb'))
    allv=suv_vehicles(sj,sb)+truck_vehicle(tj,tb)+collection_vehicles(cj,cb)
    for v in allv:recenter(v)
    write(allv,[(sj,sb),(tj,tb),(cj,cb)],OUT,['suv','truck','col'])
    print('escrito',OUT,os.path.getsize(OUT)//1024,'KB;',len(allv),'veículos')
    for v in allv:
        mn,mx=v['bbox'];s=mx-mn;print(f"  {v['name']:24s} tris {v['tris_in']:6d} → {sum(len(m['I']) for m in v['ms']):6d}  tamanho(x,y,z)={np.round(s,2)}")
if __name__=='__main__':main()
