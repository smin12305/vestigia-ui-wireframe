from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree as E
from PIL import Image, ImageDraw, ImageFont
import hashlib, json

R=Path(__file__).parent
O=R/'v0.8'
src=R.parent.parent/'docs/VESTIGIA_전투_UI_명세서_초안_v0.7.docx'
dst=src.with_name('VESTIGIA_전투_UI_명세서_초안_v0.8.docx')
W='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
ns={'w':W}
with ZipFile(src) as z: entries={n:z.read(n) for n in z.namelist()}
root=E.fromstring(entries['word/document.xml'])
ps=root.xpath('//w:body//w:p',namespaces=ns)
def txt(p):return ''.join(p.xpath('.//w:t/text()',namespaces=ns))
before=[E.tostring(p) for p in ps]
changes=[]
def edit(i,start,new):
 p=ps[i];old=txt(p)
 assert old.startswith(start),(i,old,start)
 ts=p.xpath('.//w:t',namespaces=ns)
 assert ts
 ts[0].text=new
 ts[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 for t in ts[1:]:t.text=''
 changes.append({'paragraph':i,'before':old,'after':new})

# Preserve the user's edited file; only these review-related paragraphs change.
edit(267,'이동 도착 셀에','이동 도착 셀의 캐릭터 복제와 캐릭터 모양으로 마스킹한 진영색 레이어. HP 바·숫자는 없다.')
edit(295,'이동 도착 셀에','캐릭터 스프라이트는 기본 불투명도 100%. 그 위에 캐릭터 모양으로 마스킹한 아군 #7EF2FF·적군 #FF92D9 색상 레이어를 60%로 덮는다. 계획됨 링은 발밑에 놓인다.')
edit(296,'HP 바','선택 시 미리보기 묶음 100%, 미선택 시 묶음 전체에 75%를 한 번 적용한다. HP 바·숫자는 실제 캐릭터에만 표시한다.')
edit(312,'75%는','75%는 계획 표시 묶음에 한 번만 적용한다. 도착 미리보기의 스프라이트 자체는 100%, 색상 마스크 자체는 60%다. 미선택 시 두 레이어를 합친 묶음이 75%로 감쇠한다. 마스크만 45%로 바꾸거나 하위 레이어에도 75%를 중복 적용하지 않는다. 실제 캐릭터·HP는 감쇠하지 않는다. 경로선은 선택 아군만 표시한다.')
edit(638,'이동 도착 셀의','도착 셀의 캐릭터 복제. 구성: 스프라이트·진영색 마스크. HP 바·숫자 없음')
edit(639,'예정 도착 셀에','스프라이트 100% 위에 진영색 마스크 60%를 덮는다. 미선택 시 묶음에 75% 적용. 상세 규격은 B01-03.')
edit(670,'임시 또는 저장','임시 또는 저장 movePath 마지막 셀과 캐릭터 스프라이트. 진영색 마스크를 결합하며 불투명도는 B01-03을 따른다.')
edit(674,'선택된 아군에게만','선택 아군에게만 경로선을 표시한다. 실제 캐릭터 또는 도착 위치 미리보기에서 시작한 드래그로 경로를 갱신한다. 끝점에서 되짚으면 해당 구간을 제거한다. 경로선·발자국은 입력부가 아니다. 미선택 시 경로선만 숨긴다.')
edit(691,'01→02','01·03→02')
edit(692,'아군을','선택 아군의 실제 캐릭터 또는 도착 위치 미리보기를 잡고 드래그한다.')
edit(693,'현재 셀부터','실제 캐릭터에서는 현재 셀부터 새 경로를, 도착 위치 미리보기에서는 기존 끝점부터 경로를 편집한다. 직교 인접 셀을 잇고 시작 셀은 경로 수에서 제외한다. 03·04·07을 함께 갱신하며 실제 말·HP는 유지한다.')
edit(697,'04','03→04')
edit(698,'그려진 경로를','도착 위치 미리보기를 잡고 기존 경로를 역방향으로 되짚는다.')
edit(701,'범위 밖','이동력 초과 셀 또는 이동 불가 셀 방향으로 드래그한다.')
edit(702,'같은 경로','해당 셀까지 경로를 그리지 않는다. 경로선·발자국·도착 미리보기는 마지막 유효 끝점에 유지한다. 드래그를 놓아도 복귀 연출이나 사유 안내는 없다. 실행 중 점유 충돌 처리는 별도 전투 규칙을 따른다.')
edit(724,'입력 협의','경로 입력 영역')
edit(725,'경로 입력은','드래그 시작점은 선택 아군의 실제 캐릭터와 도착 위치 미리보기뿐이다. 경로선·발자국을 터치하거나 그 위치에서 드래그해도 반응하지 않는다. 도착 미리보기를 잡아 역방향으로 되짚으면 기존 경로를 줄이고, 원위치까지 되짚은 뒤 손을 이어 움직여 새 경로를 작성할 수 있다.')

# Same clock outline serves two display modes. Stay time does not spend shards again.
edit(392,'timeShard /','현재: timeShard/maxTimeShard. 과거·미래: timeStayRemainingTurns/timeStayTurns(2). 채움 비율은 0~1. 전환 조건은 현재·계획 단계·timeShard≥timeShiftCost.')
edit(393,'0~360°','현재에서는 연속 파편 게이지, 과거·미래에서는 체류 게이지로 표시한다. 체류 2→1→0턴에 100%→50%→0%로 줄어든다. 현재로 복귀하면 남은 파편 채움으로 돌아간다. B01-07 참조.')
edit(439,'둥근 원','둥근 원 테두리. 위·아래 중앙의 빈 부분은 외형 마스크다. 현재에서는 연속 파편량, 과거·미래에서는 같은 외형의 두 반쪽으로 남은 2턴을 읽는다.')
edit(440,'게이지 값','시간대에 따라 파편량 표시와 체류 턴 표시를 전환한다.')
edit(442,'전체 진행','현재: timeShard/maxTimeShard를 0~360°로 채운다. 과거·미래: 남은 체류 턴/2를 같은 게이지에 표시한다.')
edit(443,'0이면','체류 진입 시 2턴=100%, 첫 실행 턴 종료 후 1턴=50%, 두 번째 종료 후 0%. 현재 복귀 시 저장된 파편 비율로 다시 표시한다.')
edit(449,'떨림 폭','떨림 폭·주기·반복 횟수는 연출 리소스 명세와 조율. 현재는 파편 변경, 과거·미래는 체류 턴 감소 시 갱신한다. 체류 중 매 턴 파편을 추가 차감하지 않는다.')
edit(1210,'timeShard,','timeShard, maxTimeShard, currentTimePeriod, battlePhase, timeStayRemainingTurns, timeStayTurns와 전환 가능 판정.')
edit(1211,'선택창을','선택창 열기에는 비용이 없다. 현재는 파편 비율, 과거·미래는 남은 체류 턴/2를 표시한다. 체류 게이지의 100→50→0은 표시 비율이며 실제 파편 차감량이 아니다.')
edit(1239,'시간대 버튼','시간대 버튼 입력 시 효과를 즉시 적용한다. effectiveMoveRange가 바뀌면 이동 계획을 비우고, activeSkillId가 저장된 스킬 actionId와 다르면 해당 스킬 계획을 취소한다. 그 외 계획은 유지한다. 시간대 문구·색상과 계획 표시를 갱신하고 체류 게이지를 2턴=100%로 표시한다.')
edit(1241,'진입 턴을','과거·미래에서 한 턴의 실행이 끝난다.')
edit(1242,'현재로','첫 턴 종료 후 timeStayRemainingTurns가 1이 되면 게이지를 50%로 줄인다. 두 번째 종료 후 0%가 되면 현재로 자동 복귀하고 저장된 파편 비율로 전환한다. 체류 중 파편 획득·추가 차감은 없다.')
edit(1262,'과거는','과거는 아군 이동력 +1, 미래는 일반 공격력 +3이다. 계획 재검증은 B01-03을 따른다. 남은 체류 턴은 회중시계 게이지로 표시하며 별도 숫자 문구는 추가하지 않는다. 자동 현재 복귀의 세부 연출은 추가 협의한다.')

# Short tap playback is available to both factions, with no individual cancel.
edit(427,'무효 드롭','무효 드롭은 원위치 복귀. 아군·적군 카드 모두 짧게 터치하면 개별 미리보기. 개별 재생은 취소할 수 없음.')
edit(491,'순서 카드를','아군 또는 적군 순서 카드를 짧게 터치한다.')
edit(492,'해당 캐릭터만','해당 캐릭터만 B08 개별 시뮬레이션으로 빠르게 재생한다. 취소 입력 없이 끝까지 재생한 뒤 편집으로 복귀한다. 드래그와 짧은 터치의 구분 임계값은 구현 협의 대상이다.')
edit(1311,'선택한 actionSlots','짧게 터치한 아군·적군 actionSlots의 characterInstanceId와 해당 개체의 이동·주 행동 계획. 재생 연출은 TL-03-05.')
edit(1312,'선택 개체만','해당 개체의 가상 이동·공격 또는 스킬과 피해를 빠르게 재생한다. 취소 입력은 없으며 완료 후 계획 상태로 복귀한다. 실제 상태·currentActionNumber·저장 계획은 변경하지 않는다.')
edit(1330,'B01에서','B01에서 아군 또는 적군 순서 카드를 짧게 터치한다.')
edit(1331,'해당 캐릭터의','해당 캐릭터의 이동·공격 또는 스킬과 피해를 빠르게 가상 재생한다. 단계 문구는 계획 중, 카드 강조는 B01-02를 따른다. 개별 취소 버튼·취소 입력은 없고 편집 입력을 잠근다. 끝까지 재생 후 기존 계획 상태로 복귀한다.')
edit(1345,'개별 재생과','개별·전체 재생을 겹쳐 실행하지 않는다. 개별 재생은 완료까지 취소·편집·다른 카드 재생 입력을 받지 않는다.')
edit(1351,'전체 미래 관측','전체 미래 관측은 시스템 기획서의 임시 규칙을 따른다. 개별 미리보기는 아군·적군 카드의 짧은 터치로 실행하며 취소 없이 완료한다. 실제 전투 상태와 저장 계획을 보존한다.')
edit(1430,'배속의 다음','선택한 배속은 다음 턴 적 행동 예고에도 유지한다. 배속 버튼의 문구는 현재 속도에 맞춰 표시한다. 주 행동 계획 표시의 중첩 우선순위는 반응형·표시 공통 규칙의 제안을 따른다.')

# Update version without touching user edits in any other paragraph.
for p in ps:
 for t in p.xpath('.//w:t',namespaces=ns):
  if t.text:t.text=t.text.replace('v0.7','v0.8')
# Keep the expanded B03 definition and its source on one page.
for e in ps[623].xpath('.//*[local-name()="extent" or local-name()="ext"]'):
 for key in ['cx','cy']:
  if e.get(key):e.set(key,str(round(int(e.get(key))*0.90)))
allowed={x['paragraph'] for x in changes}|{623}
for i,(a,p) in enumerate(zip(before,ps)):
 if a!=E.tostring(p) and i not in allowed:
  assert b'v0.7' in a,(i,txt(p))
entries['word/document.xml']=E.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True)
for n,b in list(entries.items()):
 if n.startswith('word/header') and n.endswith('.xml'):entries[n]=b.replace(b'v0.7',b'v0.8')

def annotate(name,marks):
 im=Image.open(O/(name+'-source.png')).convert('RGB')
 dr=ImageDraw.Draw(im);font=ImageFont.truetype('C:/Windows/Fonts/malgunbd.ttf',25)
 for n,x,y,tx,ty in marks:
  dr.line([(x,y),(tx,ty)],fill='white',width=7);dr.line([(x,y),(tx,ty)],fill='#C04C16',width=3)
  dr.ellipse((tx-4,ty-4,tx+4,ty+4),fill='#C04C16')
  dr.ellipse((x-25,y-25,x+25,y+25),fill='#A7350C',outline='white',width=3)
  dr.text((x,y-2),str(n).zfill(2),font=font,fill='white',anchor='mm')
 fn=O/(name+'-annotated.png');im.save(fn);return fn.read_bytes()
entries['word/media/image5.png']=annotate('B03',[(1,517,401,595,467),(2,384,347,463,335),(3,861,298,740,336),(4,544,515,658,466),(5,1160,567,1270,655),(6,1525,490,1481,631),(7,875,427,736,455)])
entries['word/media/image6.png']=annotate('B04',[(1,943,269,852,377),(2,1055,620,736,651),(3,1520,490,1330,609),(4,1090,662,1205,697),(5,1520,403,1470,642)])
with ZipFile(dst,'w',ZIP_DEFLATED) as z:
 for n,b in entries.items():z.writestr(n,b)
with ZipFile(src) as z:
 changed_entries=[n for n,b in entries.items() if b!=z.read(n)]
assert set(changed_entries)<= {'word/document.xml','word/media/image5.png','word/media/image6.png','word/header1.xml'},changed_entries
audit={'source_sha256':hashlib.sha256(src.read_bytes()).hexdigest(),'source':str(src),'output':str(dst),'changed_package_entries':changed_entries,'changed_paragraphs':changes,'other_paragraphs':'Byte-identical except version text'}
(O/'edit-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
print(f'Saved {dst.name}; {len(changes)} targeted paragraphs; unchanged user paragraphs verified.')
