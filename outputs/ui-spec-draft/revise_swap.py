from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from copy import deepcopy
from PIL import Image, ImageDraw, ImageFont
import math,json
R=Path(__file__).resolve().parents[2]; O=R/'outputs/ui-spec-draft/swap';O.mkdir(exist_ok=True)
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';ns={'w':W}
def text(p):return ''.join(p.xpath('.//w:t/text()',namespaces=ns))
def run(src,dst,edits,version,extra=False):
 with ZipFile(R/'docs'/src) as z:files={n:z.read(n) for n in z.namelist()}
 root=E.fromstring(files['word/document.xml']);ps=root.xpath('//w:body//w:p',namespaces=ns);audit=[]
 for i,new in edits.items():
  p=ps[i];audit.append([i,text(p),new]);ts=p.xpath('.//w:t',namespaces=ns);ts[0].text=new
  for t in ts[1:]:t.text=''
 if extra:
  # Insert a separate, reviewable specification page before I02, preserving original table formatting.
  body=root.find('w:body',ns);anchor=ps[186];pos=body.index(anchor)
  heading=deepcopy(ps[148]);heading.xpath('.//w:t',namespaces=ns)[0].text='I01 인벤토리 유물 위치 교환'
  for t in heading.xpath('.//w:t',namespaces=ns)[1:]:t.text=''
  pp=heading.find('w:pPr',ns)
  if pp is None:pp=E.SubElement(heading,'{'+W+'}pPr')
  E.SubElement(pp,'{'+W+'}pageBreakBefore')
  table=deepcopy(ps[150].getparent().getparent().getparent())
  assert E.QName(table).localname=='tbl'
  rows=table.findall('w:tr',ns); template=deepcopy(rows[1])
  for row in rows[1:]:table.remove(row)
  entries=[
   ('정의','인벤토리 내 위치 교환','인벤토리 안의 보유 유물 두 개를 드래그로 맞바꾼다. 빈 슬롯이 없어도 가능하며 보유 수량과 파우치 배치는 변하지 않는다.'),
   ('시작','유물 A를 잡고 드래그한다.','A의 유물 ID와 출발 슬롯을 기억한다. A는 손가락을 따라 이동한다. 드래그 중에는 I02 상세를 열지 않는다.'),
   ('대상 표시','손가락이 다른 유물 B의 슬롯 위에 들어간다.','지금 놓으면 교환될 B 하나만 강조한다. I02-01의 기존 선택 유물 강조 표시를 그대로 재사용한다. 다른 유물들을 동시에 강조하지 않는다.'),
   ('대상 갱신','손가락을 다른 슬롯 또는 영역 밖으로 옮긴다.','이전 후보 강조를 즉시 해제한다. 새 유물 위라면 새 후보 하나만 강조한다. 자기 출발 슬롯·영역 밖에는 교환 후보가 없다. 후보 강조로 상세 패널을 열지 않는다.'),
   ('교환','B가 강조된 상태에서 손을 뗀다.','A는 B의 슬롯에 정착하고 B는 A의 출발 슬롯으로 이동한다. 다른 유물 위치는 그대로다. 완료 후 후보 강조를 해제한다. 확인창 없이 두 위치를 함께 갱신한다.'),
   ('취소','출발 슬롯 또는 유효하지 않은 위치에서 손을 뗀다.','교환하지 않고 A를 원위치로 돌린다. B와 다른 유물은 움직이지 않는다. 후보 강조를 해제하며 별도 사유 안내는 없다.'),
   ('데이터','위치와 후보 상태를 연결한다.','원본은 인벤토리 슬롯별 relicId 매핑. 드래그 유물·출발 슬롯·손가락 아래 교환 후보는 UI 상태이며 필드명은 미정이다. 드롭 전에는 매핑을 바꾸지 않고 성공 시 두 슬롯만 함께 저장한다.'),
   ('검토','만석과 연속 후보 변경을 확인한다.','빈 칸 없이 A↔B 교환 가능. B→C로 손가락을 옮기면 C만 강조. 저장 실패 시 두 위치 모두 복원한다. 보유 유물 삭제·획득·중복 생성과 파우치 효과 변경은 발생하지 않는다.')]
  for values in entries:
   row=deepcopy(template)
   for cell,value in zip(row.findall('w:tc',ns),values):
    ts=cell.xpath('.//w:t',namespaces=ns);ts[0].text=value
    for t in ts[1:]:t.text=''
   table.append(row)
  body.insert(pos,heading);body.insert(pos+1,table)
  files['word/media/image1.png']=(O/'bag-flow.png').read_bytes()
 for t in root.xpath('//w:t',namespaces=ns):
  if t.text:t.text=t.text.replace(version[0],version[1])
 files['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
 for name in list(files):
  if (name.startswith('word/header') or name.startswith('word/footer')) and name.endswith('.xml'):files[name]=files[name].replace(version[0].encode(),version[1].encode()).replace(b'2026 09 27',b'2026 09 29')
 with ZipFile(R/'docs'/dst,'w',ZIP_DEFLATED) as z:
  for n,b in files.items():z.writestr(n,b)
 (O/(dst+'.audit.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')

# Standard flowchart symbols, routed in two columns. The drawing is a DOCX asset only.
im=Image.new('RGB',(1500,1520),'white');d=ImageDraw.Draw(im);font=ImageFont.truetype('C:/Windows/Fonts/malgun.ttf',26)
def box(x,y,w,h,s,k='process'):
 b=(x,y,x+w,y+h);c='#EDF3F6';edge='#415666'
 if k=='terminal':d.rounded_rectangle(b,h//2,fill=c,outline=edge,width=3)
 elif k=='decision':d.polygon([(x+w/2,y),(x+w,y+h/2),(x+w/2,y+h),(x,y+h/2)],fill='#FFF4DC',outline=edge,width=3)
 elif k=='io':d.polygon([(x+25,y),(x+w,y),(x+w-25,y+h),(x,y+h)],fill='#E9F3EC',outline=edge,width=3)
 else:d.rectangle(b,fill=c,outline=edge,width=3)
 d.multiline_text((x+w/2,y+h/2),s,font=font,fill='#14232D',anchor='mm',align='center',spacing=5)
def arrow(pts,label='',at=None):
 d.line(pts,fill='#415666',width=3);x,y=pts[-1];px,py=pts[-2];a=math.atan2(y-py,x-px)
 d.polygon([(x,y),(x-13*math.cos(a-.5),y-13*math.sin(a-.5)),(x-13*math.cos(a+.5),y-13*math.sin(a+.5))],fill='#415666')
 if label:d.text(at or pts[0],label,font=font,fill='#14232D')
box(70,10,650,80,'I01 가방 진입','terminal')
box(70,125,650,135,'새 유물 배치 입력?','decision');arrow([(395,90),(395,125)])
box(920,125,510,120,'I04 빈 인벤토리 또는\n빈 파우치 선택','io');arrow([(720,193),(920,193)],'예',(785,153))
box(920,310,510,100,'획득 유물 배치 저장');arrow([(1175,245),(1175,310)])
box(920,470,510,80,'I01 또는 I03 복귀','terminal');arrow([(1175,410),(1175,470)])
box(70,310,650,90,'보유 유물을 드래그','io');arrow([(395,260),(395,310)],'아니요',(415,270))
box(70,445,650,105,'손가락 아래 대상 하나만 강조\n유물 교환 후보는 선택 강조 재사용','io');arrow([(395,400),(395,445)])
box(70,595,650,75,'손을 뗀다','io');arrow([(395,550),(395,595)])
box(70,710,650,160,'인벤토리 안에서\n다른 유물 위인가?','decision');arrow([(395,670),(395,710)])
box(920,745,510,90,'두 유물의 위치를 교환');arrow([(720,790),(920,790)],'예',(800,750))
box(920,890,510,100,'두 슬롯 갱신 · 후보 강조 해제','io');arrow([(1175,835),(1175,890)])
box(920,1040,510,80,'I01 편집 유지','terminal');arrow([(1175,990),(1175,1040)])
box(70,925,650,160,'배치 가능한 빈 슬롯인가?','decision');arrow([(395,870),(395,925)],'아니요',(415,887))
box(70,1145,650,80,'빈 슬롯으로 이동 저장');arrow([(395,1085),(395,1145)],'예',(415,1100))
box(70,1275,650,85,'목록 갱신 · 후보 강조 해제','io');arrow([(395,1225),(395,1275)])
box(70,1405,650,80,'I01 또는 I03 편집 유지','terminal');arrow([(395,1360),(395,1405)])
box(920,1210,510,110,'원위치 복귀 · 기존 배치 유지\n후보 강조 해제 · 안내 없음');arrow([(720,1005),(815,1005),(815,1265),(920,1265)],'아니요',(738,1020))
box(920,1405,510,80,'기존 편집 상태 유지','terminal');arrow([(1175,1320),(1175,1405)])
im.save(O/'bag-flow.png')

run('VESTIGIA_가방_UI_명세서_초안_v0.4_검수본.docx','VESTIGIA_가방_UI_명세서_초안_v0.5.docx',{
2:'초안 v0.5   2026년 9월 29일   대상 기획·개발·아트',
56:'인벤토리의 보유 유물끼리는 빈 칸 없이 드래그로 위치를 교환한다. 손가락 아래 교환 대상 하나만 기존 선택 강조로 표시한다. 유물 제거 방법·비용과 한도 도달 시 보상 선택 제한은 협의 중이다. 새 유물로 기존 유물을 대체하는 규칙은 확정하지 않는다.',
101:'보유·배치 변경 후 목록을 갱신한다. 왼쪽 슬롯별 유물 매핑은 UI 배치 데이터이며 필드명은 미정. 인벤토리 교환은 두 슬롯의 매핑만 바꾸며 ownedRelicIds와 파우치 relicPlacement는 유지한다. 파우치 유물을 왼쪽에 중복 표시하지 않는다.',
124:'기본: 유물 아이콘과 등급. 선택: 대상 강조. 드래그 중: 손가락을 따르는 카드. 인벤토리 교환 후보는 손가락 아래 유물 하나만 기존 선택 강조를 재사용한다.',
125:'짧은 선택은 I02. 인벤토리 내부 드래그는 I01 위치 교환, 파우치로 드래그는 I03. 드래그 중 상세 열기를 중복 실행하지 않는다.',
133:'빈 슬롯: +. 배치 완료: 유물 아이콘. 손가락 아래 유효 드롭 대상 하나만 강조. 불가 드롭: 안내 없이 원위치 복귀.',
134:'유효 드롭만 저장. 인벤토리 내부 유물 교환은 I01 위치 교환 규칙을 따른다. 찬 파우치 슬롯의 교환과 해제 입력은 미정.',
149:'획득 대기가 없을 때의 기본 화면이다. 상세는 I02, 인벤토리 내 유물 위치 교환은 I01, 파우치 편집은 I03, 새 유물의 최초 배치는 I04로 구분한다.',
159:'01',160:'유물을 다른 인벤토리 유물 또는 빈 슬롯으로 드래그한다.',161:'인벤토리 내 다른 유물 위에 놓으면 두 위치를 교환한다. 빈 인벤토리 슬롯에는 이동하고, 빈 파우치 슬롯에는 I03 규칙으로 배치한다. 손가락 아래 대상 하나만 강조한다. 상세는 다음 위치 교환 절 참조.',
184:'닫기·뒤로가기·다음 단계 진입 UI와 저장 시점은 미정이다. 왼쪽 8칸과 총 보유 한도 8개를 기준으로 한다. 만석이어도 내부 위치 교환은 가능하다. 유물 제거 방식과 한도 도달 시 보상 처리, 추가 페이지·스크롤 정책은 별도 협의한다.',
196:'기존 선택 유물 강조 표시로 대상을 구분한다. 같은 표시를 I01의 드래그 교환 후보에도 재사용한다. 상세 열람 대상과 드래그 후보는 별개 UI 상태다.',
356:'이미 찬 파우치 슬롯에 드롭한다.',
357:'파우치의 교환·거절 정책은 미정이다. 확정된 인벤토리 내부 교환과 구분한다. 배치 불가로 판정하면 안내 없이 원위치로 복귀한다.',
373:'드래그 카드와 손가락 아래 유효 슬롯 하나만 강조한다. 손가락이 벗어나면 이전 후보 강조를 해제한다. 다른 허용 슬롯을 한꺼번에 강조하지 않는다.',
433:'한 번의 획득을 두 슬롯에 중복 저장하지 않는다. 실패 시 획득 대기를 유지한다. 빈 슬롯 유무와 별개로 총 보유 한도 도달 시의 보상 선택·획득 처리는 협의 중이다.',
457:'총 보유 한도에 도달했거나 새 유물의 배치 공간이 없다.',
458:'상점 제거·인벤토리 버리기·제거 비용·보상 선택 제한은 협의 중이다. 보유 유물 위치 교환은 제거 또는 한도 해소가 아니다.',
475:'직접 파우치 배치 연출, 한도 도달 시 보상·획득 처리와 연속 보상·이탈 정책은 협의 중이다. 기존 유물 교환은 새 유물과의 대체 획득으로 적용하지 않는다.',
498:'드래그 카드와 손가락 아래 드롭 대상 하나를 구별한다. 인벤토리 교환 대상은 기존 선택 유물 강조를 재사용한다. 후보 변경 시 이전 강조를 해제한다.',
502:'인벤토리 만석에서도 두 보유 유물을 교환할 수 있다. 손가락 아래 교환 대상 하나만 강조하며 대상 변경·영역 이탈·드롭 후 이전 후보 강조가 남지 않는다. 보유 수량과 파우치 배치는 유지한다. 새 유물은 빈 인벤토리 또는 파우치에 직접 배치하되 한도 도달 처리는 별도 협의한다. 중복 저장·생성 없이 처리하고 전투 중 편집은 차단한다.',
504:'유물 제거 장소·비용, 한도 도달 시 보상 선택·획득 처리, 찬 파우치 슬롯 교환, 해제 입력, 저장·닫기·다음 단계, 전투 중 열람, 획득 대기 이탈과 스크롤 정책을 결정해야 한다. 인벤토리 내부 위치 교환과 단일 후보 강조는 확정 규칙이다.'
},('v0.4','v0.5'),True)
run('VESTIGIA_전투_UI_명세서_초안_v0.8.docx','VESTIGIA_전투_UI_명세서_초안_v0.9.docx',{
238:'현재 손가락 아래의 교환 가능한 아군 슬롯 하나만 강조한다. 손가락이 다른 슬롯으로 옮겨가면 이전 강조를 해제한다. 출발 슬롯·적군 슬롯·슬롯 밖에는 후보 강조가 없다. 유효 드롭은 수평 교환, 무효 드롭은 원위치 복귀. 종료 시 강조 해제.',
426:'아군은 수평 드래그 교환 가능. 현재 손가락 아래 교환 가능한 아군 슬롯 하나만 후보로 강조한다.',
517:'카드 들기·놓기음. 현재 손가락 아래 교환 대상 아군 슬롯 하나만 강조. 다른 슬롯·영역으로 이동하면 이전 후보 강조 해제.'
},('v0.8','v0.9'))


