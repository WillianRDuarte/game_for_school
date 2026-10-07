#!/usr/bin/env python3
"""Gera assets/models/scenery_lite.glb (18 prédios + 6 árvores) a partir dos GLBs ORIGINAIS em assets/models/originals/ (que não são alterados).
Só usa numpy + Pillow.  Uso:  python3 tools/build_scenery.py            (ou  --preview /tmp/dir  para gravar prévias PNG)

Por que existe (os originais são pesados demais para o navegador):
  · low_poly_accommodations_buildings.glb: 10 prédios (4 mil–19 mil triângulos cada, ~93 mil no total) + 10 colliders translúcidos;
  · low_poly_business_buildings_pack.glb: 8 construções comerciais (a "Pizza" são 4 peças: prédio, mesas, luminária, placa), até 18 mil triângulos, + colliders;
  · low_poly_trees.glb: UMA malha com 6 árvores soldadas (tronco e copas separados) + textura 1024×1024.
O que faz:
  · separa cada construção/árvore em um nó próprio (nome = id usado em js/scenery_models.js);
  · descarta os colliders (a colisão do jogo é uma caixa simples calculada no código) e a "placa de chão" plana sob alguns prédios;
  · simplifica os prédios por CLUSTERING COM QUÁDRICAS (cada célula da grade vira 1 vértice na posição que melhor preserva os planos das paredes → quinas e
    paredes continuam retas, sem rachaduras) mantendo UMA cor de paleta por triângulo; ~2 mil triângulos nos maiores;
  · recentra (x/z no centro, base em y=0) e grava SEM normais (o carregador calcula normais "flat" → visual low-poly facetado; arquivo pequeno);
  · textura das árvores: 1024² JPEG → 512² com as bordas pretas do atlas "dilatadas" (evita escurecer as copas nos mipmaps).
NÃO corrige escala nem orientação: isso fica em js/scenery_models.js, por modelo.
"""
import json,struct,sys,os,io
import numpy as np
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.dirname(HERE);sys.path.insert(0,HERE)
from build_vehicles import load,meshes
SRC=os.path.join(ROOT,'assets','models','originals');OUT=os.path.join(ROOT,'assets','models','scenery_lite.glb')
PAL=16   # as paletas dos prédios são grades 16×16 de amostras de cor (16 px cada)

# ----------------------------------------------------------------------------------------------- orçamento de triângulos por modelo (alvo; o clustering chega perto)
# id: (arquivo, [nomes de malha], triângulos-alvo)
ACC='low_poly_accommodations_buildings.glb';BIZ='low_poly_business_buildings_pack.glb';TRE='low_poly_trees.glb'
BUILDINGS=[
    ('bld_hotel_a',ACC,['PublicBuilding_1_Pack3_0'],2600),
    ('bld_hotel_b',ACC,['PublicBuilding_2_Pack3_0'],2600),
    ('bld_house_a',ACC,['PublicBuilding_3_Pack3_0'],1500),
    ('bld_house_b',ACC,['PublicBuilding_4_Pack3_0'],1400),
    ('bld_house_c',ACC,['PublicBuilding_5_Pack3_0'],1400),
    ('bld_house_d',ACC,['PublicBuilding_6_Pack3_0'],1400),
    ('bld_house_e',ACC,['PublicBuilding_7_Pack3_0'],1500),
    ('bld_apt_a',ACC,['PublicBuilding_8_Pack3_0'],1800),
    ('bld_apt_b',ACC,['PublicBuilding_9_Pack3_0'],2200),
    ('bld_apt_c',ACC,['PublicBuilding_10_Pack3_0'],2200),
    ('bld_restaurant',BIZ,['RestaurantBuilding_Texture_buildings1_0'],1500),
    ('bld_shop',BIZ,['ShopBuilding_Texture_buildings1_0'],1200),
    ('bld_pizza',BIZ,['PizzaBuilding_Texture_buildings1_0','PizzaTables_Texture_buildings1_0','PizzaLight_Texture_buildings1_0','PizzaBoard_Texture_buildings1_0'],1600),
    ('bld_burger',BIZ,['BurgerBuilding_Texture_buildings1_0'],1800),
    ('bld_cafe',BIZ,['CafeBuilding_Texture_buildings1_0'],1900),
    ('bld_mall',BIZ,['ShoppingCenterBuilding_Texture_buildings1_0'],2400),
    ('bld_cinema',BIZ,['Cinema_Texture_buildings1_0'],1700),
]
PLATE_Y=.06   # triângulos planos com todos os vértices abaixo disto = placa de chão do modelo original

def _src(files):
    d={}
    for f in files:
        js,bn=load(os.path.join(SRC,f));d[f]=(js,bn,{m['name']:m for m in meshes(js,bn)})
    return d

def remove_plates(m):
    P,I=m['P'],m['I'];A,B,C=P[I[:,0]],P[I[:,1]],P[I[:,2]];n=np.cross(B-A,C-A);n/=np.maximum(np.linalg.norm(n,axis=1,keepdims=True),1e-12)
    plate=(P[I][:,:,1].max(axis=1)<PLATE_Y)&(np.abs(n[:,1])>.95)
    return dict(m,I=I[~plate]),int(plate.sum())

def swatch_of(UV,I):
    """índice (0..PAL²-1) da amostra de paleta de cada triângulo (UV médio)"""
    uv=(UV[I[:,0]]+UV[I[:,1]]+UV[I[:,2]])/3;u=np.clip(np.floor(uv[:,0]*PAL).astype(int),0,PAL-1);v=np.clip(np.floor(uv[:,1]*PAL).astype(int),0,PAL-1)
    return v*PAL+u

def qem_cluster(P,I,sw,cell,origin,lam=.04):
    """Clustering por grade com posição de menor erro quádrico. P (n,3) vértices, I (t,3), sw (t,) amostra de cor por triângulo.
    Devolve (pos,idx_tri_cell,sw) com triângulos já deduplicados/sem degenerados; os vértices finais são (célula, amostra de cor)."""
    T=P[I];ci=np.floor((T-origin)/cell).astype(np.int64)                # (t,3,3) célula de cada canto
    key=ci.reshape(-1,3);uk,inv=np.unique(key,axis=0,return_inverse=True);inv=inv.reshape(-1,3);C=len(uk)
    A,B,Cc=T[:,0],T[:,1],T[:,2];nn=np.cross(B-A,Cc-A);ar=np.linalg.norm(nn,axis=1);n=nn/np.maximum(ar[:,None],1e-12);ar=ar*.5
    Q=np.zeros((C,3,3));b=np.zeros((C,3));cen=np.zeros((C,3));cnt=np.zeros(C);nnT=n[:,:,None]*n[:,None,:]
    d=(n*A).sum(1)   # plano: n·x = d
    for j in range(3):
        np.add.at(Q,inv[:,j],(ar/3)[:,None,None]*nnT);np.add.at(b,inv[:,j],(ar/3)[:,None]*n*d[:,None]);np.add.at(cen,inv[:,j],T[:,j]);np.add.at(cnt,inv[:,j],1)
    cen/=np.maximum(cnt,1)[:,None]
    tr=np.trace(Q,axis1=1,axis2=2)/3;reg=np.maximum(tr*lam,1e-9)
    M=Q+reg[:,None,None]*np.eye(3);rhs=b+reg[:,None]*cen;x=np.linalg.solve(M,rhs[:,:,None])[:,:,0]
    lo=(uk*cell+origin)-.5*cell;hi=lo+2*cell;x=np.clip(x,lo,hi)         # não foge para longe da célula
    F=inv;ok=(F[:,0]!=F[:,1])&(F[:,1]!=F[:,2])&(F[:,0]!=F[:,2]);F=F[ok];s=sw[ok]
    k3=np.sort(F,axis=1);kk=np.c_[k3,s];_,first=np.unique(kk,axis=0,return_index=True);F=F[first];s=s[first]   # triângulos idênticos (mesmas 3 células e cor), qualquer orientação
    return x,F,s

def build_vertices(x,F,s):
    """vértice final = (célula, amostra); UV = centro da amostra de paleta"""
    key=np.c_[F.reshape(-1),np.repeat(s,3)];uk,inv=np.unique(key,axis=0,return_inverse=True);inv=inv.reshape(-1)
    pos=x[uk[:,0]];sv=uk[:,1];uv=np.c_[(sv%PAL+.5)/PAL,(sv//PAL+.5)/PAL]
    return pos,uv,inv.reshape(-1,3)

def decimate_model(ms,target):
    # funde as peças, remove placa de chão
    P=[];I=[];UV=[];off=0;plates=0
    for m in ms:
        mm,pl=remove_plates(m);plates+=pl;P.append(mm['P']);UV.append(mm['UV']);I.append(mm['I']+off);off+=len(mm['P'])
    P=np.concatenate(P);UV=np.concatenate(UV);I=np.concatenate(I)
    used=np.unique(I);remap=-np.ones(len(P),np.int64);remap[used]=np.arange(len(used));P=P[used];UV=UV[used];I=remap[I]
    sw=swatch_of(UV,I);mn,mx=P.min(0),P.max(0);ext=(mx-mn).max()
    if len(I)<=target*1.05:   # já está leve: só cor chapada por triângulo
        pos,uv,F=build_vertices(P,I,sw);return pos,uv,F,dict(tris_in=len(I),plates=plates,cell=0)
    lo,hi=ext/600,ext/6;best=None
    for it in range(26):   # bissecção do tamanho da célula até chegar ao alvo (triângulos decrescem com a célula crescente)
        c=(lo*hi)**.5;x,F,s=qem_cluster(P,I,sw,c,mn-1e-4);n=len(F)
        if best is None or abs(n-target)<abs(len(best[1])-target):best=(x,F,s,c)
        if n>target:lo=c
        else:hi=c
        if abs(n-target)<target*.03:break
    x,F,s,c=best;pos,uv,F2=build_vertices(x,F,s);return pos,uv,F2,dict(tris_in=len(I),plates=plates,cell=c)

# ----------------------------------------------------------------------------------------------- árvores
def split_trees(m):
    """Retorna lista de 6 árvores (ordenadas por x): cada uma = (P,UV,I) com tronco + copas. Componentes conexos → agrupa cada copa no tronco mais próximo (em x)."""
    P,I,UV=m['P'],m['I'],m['UV'];key=np.round(P/1e-2).astype(np.int64);_,inv=np.unique(key,axis=0,return_inverse=True);inv=inv.reshape(-1);par=np.arange(inv.max()+1)
    def find(a):
        while par[a]!=a:par[a]=par[par[a]];a=par[a]
        return a
    for t in I:
        ra=find(inv[t[0]])
        for q in (1,2):
            rb=find(inv[t[q]])
            if rb!=ra:par[rb]=ra
    lab=np.array([find(inv[t[0]]) for t in I]);u,lab=np.unique(lab,return_inverse=True);lab=lab.reshape(-1)
    comps=[]
    for k in range(len(u)):
        t=I[lab==k];v=P[np.unique(t)];comps.append(dict(t=t,mn=v.min(0),mx=v.max(0)))
    trunks=sorted([c for c in comps if c['mn'][1]<2],key=lambda c:(c['mn'][0]+c['mx'][0]))   # componentes que tocam o chão = troncos
    trees=[dict(parts=[c],cx=(c['mn'][0]+c['mx'][0])/2) for c in trunks]
    for c in comps:
        if c['mn'][1]<2:continue
        cx=(c['mn'][0]+c['mx'][0])/2;min(trees,key=lambda tr:abs(tr['cx']-cx))['parts'].append(c)
    out=[]
    for tr in trees:
        I2=np.concatenate([c['t'] for c in tr['parts']]);used=np.unique(I2);rm=-np.ones(len(P),np.int64);rm[used]=np.arange(len(used))
        P2=P[used];UV2=UV[used];I3=rm[I2]
        base=P2[P2[:,1]<4];cx,cz=(base[:,0].min()+base[:,0].max())/2,(base[:,2].min()+base[:,2].max())/2   # centro da base do tronco
        P2=P2-np.array([cx,P2[:,1].min(),cz]);out.append((P2,UV2,I3))
    return out
TREE_IDS=['tree_round_a','tree_cypress_a','tree_oak_a','tree_oak_b','tree_cypress_b','tree_round_b']   # ordem em x no arquivo original

def dilate_atlas(img,iters=10):
    """preenche os pixels pretos (fundo) com a cor do vizinho mais próximo: as bordas do atlas não escurecem as copas nos mipmaps."""
    a=np.array(img.convert('RGB')).astype(np.int32);filled=a.sum(2)>90
    for _ in range(iters):
        if filled.all():break
        acc=np.zeros_like(a);cnt=np.zeros(filled.shape,np.int32)
        for dy,dx in((1,0),(-1,0),(0,1),(0,-1)):
            f=np.roll(filled,(dy,dx),(0,1));v=np.roll(a,(dy,dx),(0,1));acc+=v*f[...,None];cnt+=f
        new=(~filled)&(cnt>0);a[new]=acc[new]//cnt[new][:,None];filled=filled|new
    return Image.fromarray(a.astype(np.uint8))

# ----------------------------------------------------------------------------------------------- escrita do GLB
def write_glb(models,textures,out):
    """models: lista de (id, pos(n,3), uv(n,2), F(t,3), mat_idx); textures: lista de (nome, bytes, mime)"""
    blob=bytearray();bvs=[];accs=[];meshes_=[];nodes=[]
    def bv(data,target=None):
        while len(blob)%4:blob.append(0)
        bvs.append(dict(buffer=0,byteOffset=len(blob),byteLength=len(data),**({'target':target} if target else {})));blob.extend(data);return len(bvs)-1
    def ac(arr,ct,typ,target,mm=False):
        a=np.ascontiguousarray(arr);d=dict(bufferView=bv(a.tobytes(),target),componentType=ct,count=len(a),type=typ)
        if mm:d['min']=a.min(0).astype(float).tolist();d['max']=a.max(0).astype(float).tolist()
        accs.append(d);return len(accs)-1
    images=[];texs=[];mats=[]
    for name,data,mime in textures:
        images.append(dict(bufferView=bv(data),mimeType=mime,name=name));texs.append(dict(sampler=0 if name.startswith('pal') else 1,source=len(images)-1))   # paletas: NEAREST (cor exata da amostra) · atlas das árvores: LINEAR+mipmap
        mats.append(dict(name=name,doubleSided=True,pbrMetallicRoughness=dict(baseColorTexture=dict(index=len(texs)-1),metallicFactor=0.0,roughnessFactor=1.0)))
    for id_,pos,uv,F,mi in models:
        ix=F.reshape(-1).astype(np.uint16 if len(pos)<65535 else np.uint32)
        pr=dict(attributes={'POSITION':ac(pos.astype('f4'),5126,'VEC3',34962,True),'TEXCOORD_0':ac(uv.astype('f4'),5126,'VEC2',34962)},indices=ac(ix,5123 if ix.dtype==np.uint16 else 5125,'SCALAR',34963),material=mi,mode=4)
        meshes_.append(dict(name=id_,primitives=[pr]));nodes.append(dict(name=id_,mesh=len(meshes_)-1))
    while len(blob)%4:blob.append(0)
    js=dict(asset=dict(version='2.0',generator='meteor-run tools/build_scenery.py',extras=dict(note='derivado de low_poly_accommodations_buildings.glb e low_poly_business_buildings_pack.glb (assetfactory, Sketchfab Standard) e low_poly_trees.glb (RoboHoloclone12, CC-BY-NC-SA-4.0); originais não alterados')),
            scene=0,scenes=[dict(nodes=list(range(len(nodes))))],nodes=nodes,meshes=meshes_,materials=mats,accessors=accs,bufferViews=bvs,buffers=[dict(byteLength=len(blob))],
            images=images,textures=texs,samplers=[dict(magFilter=9728,minFilter=9728,wrapS=33071,wrapT=33071),dict(magFilter=9729,minFilter=9987,wrapS=33071,wrapT=33071)])
    j=json.dumps(js,separators=(',',':')).encode();j+=b' '*((4-len(j)%4)%4)
    with open(out,'wb') as f:
        f.write(struct.pack('<4sII',b'glTF',2,12+8+len(j)+8+len(blob)));f.write(struct.pack('<II',len(j),0x4E4F534A));f.write(j);f.write(struct.pack('<II',len(blob),0x004E4942));f.write(bytes(blob))

def png_of(js,bn):
    im=js['images'][0];v=js['bufferViews'][im['bufferView']];o=v.get('byteOffset',0);return bytes(bn[o:o+v['byteLength']])

def build(verbose=True):
    S=_src([ACC,BIZ,TRE]);models=[];stats=[]
    tex=[('pal_acc',png_of(S[ACC][0],S[ACC][1]),'image/png'),('pal_biz',png_of(S[BIZ][0],S[BIZ][1]),'image/png')]
    for id_,f,names,target in BUILDINGS:
        ms=[S[f][2][n] for n in names];pos,uv,F,st=decimate_model(ms,target)
        pos=pos-np.array([(pos[:,0].min()+pos[:,0].max())/2,pos[:,1].min(),(pos[:,2].min()+pos[:,2].max())/2])   # centro em x/z, base em y=0
        models.append((id_,pos,uv,F,0 if f==ACC else 1));stats.append((id_,st['tris_in'],len(F),len(pos),st['plates'],np.ptp(pos,axis=0)))
    # árvores: textura do atlas reduzida (dilatada) + malhas originais (já leves)
    tj,tb=S[TRE][0],S[TRE][1];im=Image.open(io.BytesIO(png_of(tj,tb))).convert('RGB');im=dilate_atlas(im).resize((512,512),Image.LANCZOS)
    buf=io.BytesIO();im.save(buf,'JPEG',quality=88);tex.append(('tex_trees',buf.getvalue(),'image/jpeg'))
    trees=split_trees(S[TRE][2]['Object001_Object001_mtl_0'])
    assert len(trees)==6,len(trees)
    for id_,(P,UV,I) in zip(TREE_IDS,trees):
        key=np.round(np.c_[P*1000,UV*10000]).astype(np.int64);uk,first,inv=np.unique(key,axis=0,return_index=True,return_inverse=True);inv=inv.reshape(-1)   # solda vértices iguais
        F=inv[I];F=F[(F[:,0]!=F[:,1])&(F[:,1]!=F[:,2])&(F[:,0]!=F[:,2])];models.append((id_,P[first],UV[first],F,2));stats.append((id_,len(I),len(F),len(first),0,np.ptp(P[first],axis=0)))
    write_glb(models,tex,OUT)
    if verbose:
        print('escrito',OUT,os.path.getsize(OUT)//1024,'KB')
        for id_,a,b,v,pl,sz in stats:print(f'  {id_:16s} tris {a:6d} → {b:5d}  verts {v:5d}  placa-chão {pl:4d}  tamanho(x,y,z)={np.round(sz,2)}')
    return models

if __name__=='__main__':
    build()
