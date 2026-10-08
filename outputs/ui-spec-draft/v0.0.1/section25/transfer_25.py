from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import os
import runpy
import sys
from lxml import etree

ROOT = Path(r'C:\Users\smin\Documents\vestigia-ui-wireframe')
TARGET = ROOT / 'docs/VESTIGIA_전투_UI_명세서_v0.0.1.docx'
WORK = ROOT / 'outputs/ui-spec-draft/v0.0.1/section25'
CANDIDATE = WORK / 'candidate.docx'
MANIFEST = WORK / 'transfer.json'
helpers = runpy.run_path(str(ROOT / 'outputs/ui-spec-draft/v0.0.1/ch2/transfer_ch2.py'))
NS, W = helpers['NS'], helpers['W']
text_of, paragraph = helpers['text_of'], helpers['paragraph']
get_or_add, clean_clone, set_cell = helpers['get_or_add'], helpers['clean_clone'], helpers['set_cell']

def edit():
    WORK.mkdir(parents=True, exist_ok=True)
    original = TARGET.read_bytes()
    with ZipFile(TARGET) as z:
        entries = [(item, z.read(item.filename)) for item in z.infolist()]
    parts = {item.filename: content for item, content in entries}
    root = etree.fromstring(parts['word/document.xml'])
    body = root.find(W + 'body')
    assert not any(text_of(p).startswith('2.5 ') for p in body.findall(W + 'p')), 'Section 2.5 already exists.'
    heading_seed = next(p for p in body.findall(W + 'p') if text_of(p) == '2.1 화면 목록')
    subheading_seed = next(p for p in body.findall(W + 'p') if text_of(p) == '2.2.1 전투 진입')
    body_seed = next(p for p in body.findall(W + 'p') if text_of(p).startswith('본 항목은 전투 UI'))
    bullet_seed = next(p for p in body.findall(W + 'p') if text_of(p) == '전투 진입과 적 행동 예고')
    table_seed = heading_seed.getnext()
    assert table_seed.tag == W + 'tbl'
    last = body[-2]
    assert last.tag == W + 'p' and not text_of(last) and not last.xpath('.//w:drawing | .//w:br', namespaces=NS)
    prefix = [etree.tostring(el) for el in list(body)[:-2]]
    body.remove(last)
    sect = body.find(W + 'sectPr')
    added = []

    def add_p(text, kind='body'):
        seed = {'heading': heading_seed, 'subheading': subheading_seed, 'bullet': bullet_seed}.get(kind, body_seed)
        style = {'heading': '3', 'subheading': '4'}.get(kind)
        p = paragraph(text, seed, style=style)
        body.insert(body.index(sect), p)
        added.append(p)

    def add_table(records, widths):
        table = clean_clone(table_seed)
        for row in table.findall(W + 'tr'):
            table.remove(row)
        old_grid = table.find(W + 'tblGrid')
        table.remove(old_grid)
        grid = etree.Element(W + 'tblGrid')
        for width in widths:
            etree.SubElement(grid, W + 'gridCol').set(W + 'w', str(width))
        table.insert(1, grid)
        get_or_add(table.find(W + 'tblPr'), 'tblLayout').set(W + 'type', 'fixed')
        row_seeds = table_seed.findall(W + 'tr')
        for index, record in enumerate(records):
            row = clean_clone(row_seeds[0 if index == 0 else 1])
            cells = row.findall(W + 'tc')
            for cell in cells[len(widths):]:
                row.remove(cell)
            tr_pr = get_or_add(row, 'trPr')
            for height in tr_pr.findall(W + 'trHeight'):
                tr_pr.remove(height)
            get_or_add(tr_pr, 'cantSplit')
            if index == 0:
                get_or_add(tr_pr, 'tblHeader')
            for cell, value, width in zip(row.findall(W + 'tc'), record, widths):
                set_cell(cell, value)
                tc_pr = get_or_add(cell, 'tcPr')
                tc_w = get_or_add(tc_pr, 'tcW')
                tc_w.set(W + 'w', str(width))
                tc_w.set(W + 'type', 'dxa')
                get_or_add(tc_pr, 'vAlign').set(W + 'val', 'center')
            table.append(row)
        body.insert(body.index(sect), table)
        added.append(table)

    add_p('2.5 주 행동 지정 공통 입력 규칙', 'heading')
    add_p('B04 일반 공격 지정과 B05 스킬 지정에 공통으로 적용하는 입력 제한과 계획 반영 규칙을 정의한다. 각 화면의 지정 방식과 상태별 표시 변화는 해당 화면의 명세에서 정의한다.')
    add_p('2.5.1 취소 입력 영역', 'subheading')
    add_p('취소 입력 영역은 행동 범위, 방향 선택부, 확정·철회 버튼, 정보 UI와 반대 행동 전환 버튼을 제외한 전장 영역이다. 구체적인 영역은 와이어프레임에 표시한다.')
    add_p('해당 영역을 누르면 지정 중인 임시 입력을 버리고 B03 이동 계획으로 복귀한다. 지정 진입 전에 저장된 계획은 유지한다.')
    add_p('비활성 버튼을 누른 입력은 취소 입력으로 처리하지 않는다.')
    add_p('2.5.2 철회 활성 조건과 지정 중 입력 제한', 'subheading')
    add_p('철회는 현재 지정 중인 행동 종류의 저장 계획이 있을 때만 활성화한다.')
    add_table([
        ('지정 화면', '저장된 주 행동 계획', '철회 활성 여부'),
        ('B04 일반 공격 지정', '일반 공격', '활성'),
        ('B04 일반 공격 지정', '스킬 또는 계획 없음', '비활성'),
        ('B05 스킬 지정', '스킬', '활성'),
        ('B05 스킬 지정', '일반 공격 또는 계획 없음', '비활성'),
    ], (3600, 4700, 1901))
    add_p('지정 중에는 다른 캐릭터로 선택을 변경할 수 없다. 다른 캐릭터를 선택하려면 취소 입력 영역을 눌러 B03으로 복귀한다.')
    add_p('일반 공격과 스킬은 반대 행동 버튼으로 직접 전환할 수 있다. 전환할 행동을 사용할 수 없으면 해당 버튼을 딤 처리하고 비활성화한다.')
    add_p('2.5.3 계획 반영과 유지', 'subheading')
    add_table([
        ('입력', '계획 반영'),
        ('확정', '지정한 내용을 주 행동 계획으로 저장한다.'),
        ('취소', '지정 중인 임시 입력을 버리고, 지정 진입 전에 저장된 계획을 유지한다.'),
        ('철회', '현재 지정 중인 행동 종류의 저장 계획만 삭제한다.'),
    ], (1400, 8801))
    add_p('취소와 철회는 이동 계획, 현재 체력, 시간 파편과 스킬 쿨타임을 변경하지 않는다. 일반 공격 계획이 저장된 상태에서 스킬 지정에 진입한 뒤 취소하면 기존 일반 공격 계획을 유지한다. 반대의 경우도 동일하게 적용한다.')
    add_p('확인 필요: 기존 v0.9.1에서 보완안으로 제시한 아래 내용은 협의 후 확정한다.')
    add_p('일반 공격·스킬 간 전환 시 임시 방향·대상만 정리하고, 이동 계획과 저장된 주 행동 계획은 유지한다.', 'bullet')
    add_p('전환한 행동을 새로 확정하면 기존 주 행동 계획을 대체한다.', 'bullet')

    assert prefix == [etree.tostring(el) for el in list(body)[:len(prefix)]]
    titles = [el for el in added if el.tag == W + 'p' and text_of(el).startswith('2.5.')]
    assert len(titles) == 3
    assert all(el.find(W + 'pPr').find(W + 'pStyle').get(W + 'val') == '4' for el in titles)
    tables = [el for el in added if el.tag == W + 'tbl']
    assert [len(el.findall(W + 'tr')) for el in tables] == [5, 4]
    xml = etree.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
    with ZipFile(CANDIDATE, 'w') as out:
        for item, content in entries:
            out.writestr(item, xml if item.filename == 'word/document.xml' else content)
    with ZipFile(CANDIDATE) as z:
        assert z.testzip() is None
        assert all(z.read(item.filename) == content for item, content in entries if item.filename != 'word/document.xml')
    (WORK / 'before.docx').write_bytes(original)
    MANIFEST.write_text(json.dumps({'original_sha256': sha256(original).hexdigest(), 'candidate_sha256': sha256(CANDIDATE.read_bytes()).hexdigest()}, indent=2), encoding='utf-8')
    print(json.dumps({'section': '2.5', 'heading4_count': 3, 'new_tables': 2, 'existing_content_preserved': True, 'other_parts_unchanged': True}))

def commit():
    record = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert sha256(TARGET.read_bytes()).hexdigest() == record['original_sha256'], 'User document changed during verification; do not overwrite.'
    assert sha256(CANDIDATE.read_bytes()).hexdigest() == record['candidate_sha256'], 'Candidate changed after verification.'
    os.replace(CANDIDATE, TARGET)
    print('Section 2.5 added to the existing document.')

if __name__ == '__main__':
    commit() if '--commit' in sys.argv else edit()
