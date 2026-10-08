from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
from lxml import etree as E
import shutil,json
R=Path(__file__).resolve().parents[2];O=R/'outputs/ui-spec-draft/capacity';O.mkdir(exist_ok=True)
ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def edit(kind,ver,changes):
 src=R/f'docs/VESTIGIA_{kind}_UI_명세서_초안_v{ver}.docx';dst=src.with_name(src.name.replace(f'v{ver}.docx',f'v{ver}.0.docx'))
 shutil.copy2(src,O/src.name)
 with ZipFile(src) as z: data={n:z.read(n) for n in z.namelist()}
 root=E.fromstring(data['word/document.xml']);ps=root.xpath('//w:body//w:p',namespaces=ns);audit=[]
 for i,value in changes.items():
  ts=ps[i].xpath('.//w:t',namespaces=ns);audit.append([i,''.join(t.text or '' for t in ts),value]);ts[0].text=value
  for t in ts[1:]:t.text=''
 for t in root.xpath('//w:t',namespaces=ns):
  if t.text:t.text=t.text.replace('v'+ver,'v'+ver+'.0')
 data['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
 for n in data:
  if n.startswith('word/header') and n.endswith('.xml'):data[n]=data[n].replace(('v'+ver).encode(),('v'+ver+'.0').encode())
 with ZipFile(dst,'w',ZIP_DEFLATED) as z:
  for n,b in data.items():z.writestr(n,b)
 src.unlink() # Version spelling rename; the pre-edit source is preserved under outputs.
 (O/(kind+'-audit.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
edit('가방','0.5',{
56:'인벤토리 내부 위치 교환은 만석에도 가능하며 손가락 아래 대상 하나만 강조한다. 유물 제거는 상점에서 제공한다. 인벤토리 자체 버리기는 없고, 총 보유 한도 도달 시 B10의 전투 보상 유물 선택을 막는다.',
184:'닫기·뒤로가기·다음 단계 진입 UI와 저장 시점, 추가 페이지·스크롤 정책은 미정이다. 총 보유 한도는 8개이며 만석에도 내부 위치 교환은 가능하다. 제거는 기존 아웃게임 상점 화면에서 제공하고 가방에는 버리기 UI를 추가하지 않는다.',
461:'한 번의 획득을 두 슬롯에 중복 저장하지 않는다. 실패 시 획득 대기를 유지한다. 총 보유 수가 8개이면 빈 파우치가 있어도 B10에서 보상 유물을 선택할 수 없어 I04로 새 획득 대기를 전달하지 않는다.',
470:'B10에서 보유 한도 미만일 때 보상 유물을 선택한다.',
485:'총 보유 한도 8개에 도달한 상태다.',
486:'B10에서 보상 유물 선택을 막으며 I04 획득 배치로 진입하지 않는다. 유물은 상점에서 제거할 수 있다. 인벤토리 버리기는 제공하지 않으며 위치 교환으로 보유 수는 줄지 않는다.',
503:'직접 파우치 배치 연출과 연속 보상·이탈 정책은 협의 중이다. 상점 제거는 기존 아웃게임 와이어프레임을 따른다. 가방에 제거·버리기 화면을 추가하지 않는다.',
530:'만석에서도 인벤토리 내부 교환이 가능하며 손가락 아래 대상 하나만 강조한다. 교환 후 보유 수량과 파우치 배치는 유지한다. 총 보유 8개이면 B10 보상 유물 선택과 I04 진입을 막는다. 한도 미만이면 빈 인벤토리 또는 파우치에 직접 배치한다. 인벤토리 버리기는 없고 전투 중 편집은 차단한다.',
532:'찬 파우치 슬롯 교환, 해제 입력, 저장·닫기·다음 단계, 전투 중 열람, 획득 대기 이탈과 스크롤 정책은 추가 결정 대상이다. 상점 제거·인벤토리 버리기 불가·만석 시 전투 보상 유물 선택 불가는 확정 규칙이다.'
})
edit('전투','0.9',{
1433:'전투 종료 후 결과와 잔여 체력을 표시한다. 총 보유 유물이 8개 미만일 때 승리 보상을 선택해 가방 I04로 이동한다. 한도 도달 시 유물 선택은 불가하다. 대응 와이어프레임은 미확인이다.',
1445:'체력 카드를 접고 보상 카드를 펼친다. 보유 8개 미만이면 선택 가능, 8개이면 카드에 딤을 적용하고 선택 입력을 차단한다.',
1448:'선택 가능한 카드 입력 시 외곽선 강조·나머지 후보 퇴장 후 I04로 전환한다. 한도 도달 시 선택 강조·획득 전달·I04 전환을 실행하지 않는다.',
1456:'승리 시 유물 후보 표시. 보유 한도이면 선택 비활성.',
1458:'현재 보유 수를 확인한다. 8개 미만이면 선택 유물을 전달하고, 한도이면 선택 입력을 무시한다.',
1459:'선택 성공 시 I04. 한도이면 보상 선택 상태 유지.',
1465:'결과 확인 입력, 후보 중복 방지, 선택 후 변경, 만석 시 보상 선택 없이 다음 단계로 진행하는 입력, 실패 화면 이동은 추가 정의한다. 유물 제거는 기존 아웃게임 상점에서 제공하며 가방 자체 버리기는 없다. 카드 3장은 타임라인 요구다.',
1478:'승리 보상 후보 relicId 목록, 가방 ownedRelicIds의 개수와 총 보유 한도 8. 전달 필드 연결은 미정.',
1479:'후보 이름·등급·아이콘은 콘텐츠에서 조회한다. 보유 수가 한도에 도달하면 후보를 딤·비활성으로 표시한다. 빈 파우치 수가 아니라 전체 보유 수를 기준으로 판정한다.',
1482:'입력 처리 시 보유 수를 재확인한다. 한도이면 획득 전달과 I04 진입을 막는다. 성공 시 강조 카드와 획득 대기는 같은 ID로 연결하고 중복 전달을 차단한다.'
})
