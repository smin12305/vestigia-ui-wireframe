from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import os
import sys

from lxml import etree

ROOT = Path(r'C:\Users\smin\Documents\vestigia-ui-wireframe')
TARGET = ROOT / 'docs' / 'VESTIGIA_전투_UI_명세서_v0.0.1.docx'
WORK = ROOT / 'outputs' / 'ui-spec-draft' / 'v0.0.1' / 'ch2'
CANDIDATE = WORK / 'candidate.docx'
BACKUP = WORK / 'before.docx'
MANIFEST = WORK / 'transfer.json'
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'

SCREENS = [
    ('B00', '전투 진입', '배치 확정 후 전장과 전투 UI 표시'),
    ('B01', '턴 설계', '전투 상태 확인, 행동 순서 편집과 계획 입력 진입'),
    ('B02', '캐릭터 정보', '선택한 아군·적의 상세 정보 열람'),
    ('B03', '이동 계획', '선택한 아군의 예정 이동 경로 지정과 계획 편집'),
    ('B04', '일반 공격 지정', '일반 공격 범위·방향 지정과 계획 확정'),
    ('B05', '스킬 지정', '스킬 정보 열람, 스킬 지정과 계획 확정'),
    ('B06', '턴 실행', '저장된 계획에 따른 실제 이동·행동과 결과 표시'),
    ('B07', '시간대 선택과 전환', '과거·미래 선택과 전환 후 상태 표시'),
    ('B08', '미래 관측과 개별 미리보기', '전체 계획 또는 한 캐릭터의 예정 행동 재생'),
    ('B09', '적 행동 예고', '턴 설계 전 적의 예정 행동 시연'),
    ('B10', '전투 결과와 보상', '전투 결과, 잔여 체력과 유물 보상 표시'),
    ('B11', '계획 미입력 경고', '계획이 없는 아군이 있을 때 실행 여부 확인'),
    ('B12', '설정', '효과음·배경음 조절과 적용·취소'),
    ('B13', '도전 포기 확인', '도전 포기 여부 확인과 전투 복귀'),
]

SECTIONS = [
    ('2.2.1 전투 진입', [
        ('body', '전투 배치 화면에서 배치를 확정하면 B00으로 진입한다. 전장과 전투 UI 표시가 완료되면 B09에서 첫 턴의 적 행동을 예고한다. 예고 종료와 원위치 복귀 후 B01에서 계획 입력을 시작한다.'),
        ('flow', '전투 배치 확정 → B00 전투 진입 → B09 적 행동 예고 → B01 턴 설계'),
    ]),
    ('2.2.2 턴 설계', [
        ('body', 'B01에서 아군의 행동 순서를 편집하고, 캐릭터 선택 후 B03에서 이동 계획을 작성한다. B04·B05에서는 일반 공격이나 스킬을 지정한다. 확정 후에는 저장된 계획을 표시하며 편집을 이어간다.'),
        ('body', '계획 중에는 B02의 캐릭터 정보, B07의 시간대 전환, B08의 관측·미리보기로 연결할 수 있다. 각 화면에서 돌아올 때 유지할 선택과 계획, 갱신할 표시는 해당 화면의 명세를 따른다.'),
    ]),
    ('2.2.3 작전 개시와 턴 실행', [
        ('body', '작전 개시를 선택하면 현재 계획으로 턴 실행을 시작한다. 이동 계획과 주 행동 계획이 모두 없는 아군이 있으면 B11에서 진행 여부를 먼저 확인한다.'),
        ('bullet', '실행 조건 충족: B01 → B06'),
        ('bullet', '계획 미입력 아군 존재: B01 → B11'),
        ('bullet', 'B11에서 계속 진행: B11 → B06'),
        ('bullet', 'B11에서 돌아가기: B11 → B01'),
        ('body', 'B11에서 돌아가면 기존 계획을 유지하며 턴을 진행하지 않는다. 계속 진행하면 계획이 없는 아군은 이동·주 행동 없이 자기 순서를 넘긴다.'),
    ]),
    ('2.2.4 다음 턴', [
        ('body', 'B06에서 현재 턴의 행동 처리가 끝나고 전투가 계속되면, 다음 턴의 B09 적 행동 예고를 거쳐 B01 턴 설계로 돌아간다.'),
        ('flow', 'B06 턴 실행 → B09 적 행동 예고 → B01 턴 설계'),
    ]),
    ('2.2.5 전투 결과와 보상', [
        ('body', '전투 종료 후 결과 흐름으로 전환한다. 현재 정의된 승리 흐름은 B10에서 전투 완료, 잔여 체력, 유물 보상 순서로 표시한다. 보상 유물을 획득하면 해당 유물을 가방 명세서의 I04 획득 유물 배치로 전달한다.'),
        ('body', '보상 건너뛰기 이후의 목적 화면, 실패 결과 화면과 이후 연결은 추가 정의가 필요하다.'),
    ]),
    ('2.2.6 설정과 도전 포기 확인', [
        ('body', '설정 입력은 B12, 도전 포기 확인 입력은 B13으로 연결한다. B12의 적용·취소와 B13의 아니오 입력 후에는 호출한 전투 화면으로 복귀한다.'),
        ('body', '진행 단계별 호출 가능 여부와 재생 중 정지 범위, 도전 포기 확정 후 목적 화면은 해당 화면의 명세에서 구분해 정의한다.'),
    ]),
]


def text_of(element):
    return ''.join(element.xpath('.//w:t/text()', namespaces=NS))


def clean_clone(element):
    clone = deepcopy(element)
    for node in clone.iter():
        for attr in list(node.attrib):
            if etree.QName(attr).localname in ('paraId', 'textId') or etree.QName(attr).localname.startswith('rsid'):
                del node.attrib[attr]
    return clone


def get_or_add(parent, local):
    node = parent.find(W + local)
    if node is None:
        node = etree.SubElement(parent, W + local)
    return node


def set_cell(cell, value):
    old_p = cell.find(W + 'p')
    p_pr = old_p.find(W + 'pPr')
    r_prs = old_p.xpath('./w:r/w:rPr | ./w:pPr/w:rPr', namespaces=NS)
    r_pr = deepcopy(r_prs[0]) if r_prs else None
    for node in list(cell):
        if node.tag != W + 'tcPr':
            cell.remove(node)
    p = etree.SubElement(cell, W + 'p')
    if p_pr is not None:
        p.append(deepcopy(p_pr))
    r = etree.SubElement(p, W + 'r')
    if r_pr is not None:
        r.append(r_pr)
    t = etree.SubElement(r, W + 't')
    t.text = value


def paragraph(value, seed, style=None, bold=False, page_break=False):
    p = etree.Element(W + 'p')
    seed_pr = seed.find(W + 'pPr')
    if seed_pr is not None:
        p.append(deepcopy(seed_pr))
    p_pr = get_or_add(p, 'pPr')
    if style is not None:
        get_or_add(p_pr, 'pStyle').set(W + 'val', style)
    if page_break:
        p_pr.insert(1, etree.Element(W + 'pageBreakBefore'))
    r = etree.SubElement(p, W + 'r')
    seed_runs = seed.xpath('./w:r/w:rPr', namespaces=NS)
    if seed_runs:
        r.append(deepcopy(seed_runs[0]))
    if bold:
        get_or_add(get_or_add(r, 'rPr'), 'b')
    t = etree.SubElement(r, W + 't')
    t.text = value
    return p


def edit():
    WORK.mkdir(parents=True, exist_ok=True)
    original = TARGET.read_bytes()
    original_hash = sha256(original).hexdigest()
    with ZipFile(TARGET) as z:
        entries = [(item, z.read(item.filename)) for item in z.infolist()]
    parts = {item.filename: content for item, content in entries}
    root = etree.fromstring(parts['word/document.xml'])
    body = root.find(W + 'body')
    heading = next(p for p in body.findall(W + 'p') if text_of(p) == '2.1 화면 목록')
    table = heading.getnext()
    assert table.tag == W + 'tbl'
    prefix = [etree.tostring(e) for e in list(body)[:list(body).index(table)]]
    assert all(not text_of(e) for e in list(body)[list(body).index(table) + 1:] if e.tag != W + 'sectPr'), 'Unexpected content after 2.1; preserve user changes.'
    intro = next(p for p in body.findall(W + 'p') if text_of(p).startswith('본 항목은 전투 명세서'))
    bullet_seed = next(p for p in body.findall(W + 'p') if text_of(p) == '전투 진입과 적 행동 예고')

    rows = table.findall(W + 'tr')
    seed_row = rows[1]
    widths = (988, 2750, 6463)
    grid = table.find(W + 'tblGrid')
    for node, width in zip(grid, widths):
        node.set(W + 'w', str(width))
    get_or_add(table.find(W + 'tblPr'), 'tblLayout').set(W + 'type', 'fixed')
    header = rows[0]
    get_or_add(get_or_add(header, 'trPr'), 'tblHeader')
    for row in rows[1:]:
        table.remove(row)
    for record in SCREENS:
        row = clean_clone(seed_row)
        get_or_add(get_or_add(row, 'trPr'), 'cantSplit')
        for cell, value in zip(row.findall(W + 'tc'), record):
            set_cell(cell, value)
        table.append(row)
    for row in table.findall(W + 'tr'):
        for cell, width in zip(row.findall(W + 'tc'), widths):
            tc_pr = get_or_add(cell, 'tcPr')
            get_or_add(tc_pr, 'tcW').set(W + 'w', str(width))
            get_or_add(tc_pr, 'vAlign').set(W + 'val', 'center')
    for element in list(body)[list(body).index(table) + 1:]:
        if element.tag != W + 'sectPr':
            body.remove(element)
    sect_pr = body.find(W + 'sectPr')
    body.insert(body.index(sect_pr), paragraph('2.2 전체 전투 진행 흐름', heading, style='3', page_break=True))
    for title, contents in SECTIONS:
        body.insert(body.index(sect_pr), paragraph(title, heading, style='4'))
        for kind, value in contents:
            seed = bullet_seed if kind == 'bullet' else intro
            body.insert(body.index(sect_pr), paragraph(value, seed, bold=kind == 'flow'))

    assert prefix == [etree.tostring(e) for e in list(body)[:list(body).index(table)]]
    assert len(table.findall(W + 'tr')) == 15
    subheads = [p for p in body.findall(W + 'p') if text_of(p).startswith('2.2.')]
    assert [text_of(p) for p in subheads] == [title for title, _ in SECTIONS]
    assert all(p.find(W + 'pPr').find(W + 'pStyle').get(W + 'val') == '4' for p in subheads)
    xml = etree.tostring(root, encoding='UTF-8', xml_declaration=True, standalone=True)
    with ZipFile(CANDIDATE, 'w') as out:
        for item, content in entries:
            out.writestr(item, xml if item.filename == 'word/document.xml' else content)
    with ZipFile(CANDIDATE) as z:
        assert z.testzip() is None
        assert all(z.read(item.filename) == content for item, content in entries if item.filename != 'word/document.xml')
    BACKUP.write_bytes(original)
    MANIFEST.write_text(json.dumps({'original_sha256': original_hash, 'candidate_sha256': sha256(CANDIDATE.read_bytes()).hexdigest(), 'sections': [title for title, _ in SECTIONS], 'screen_count': len(SCREENS)}, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'screen_count': len(SCREENS), 'heading4_count': len(subheads), 'unchanged_other_parts': True, 'unchanged_existing_content_before_2_1_table': True}, ensure_ascii=False))


def commit():
    record = json.loads(MANIFEST.read_text(encoding='utf-8'))
    assert sha256(TARGET.read_bytes()).hexdigest() == record['original_sha256'], 'The user document changed during verification; do not overwrite.'
    assert sha256(CANDIDATE.read_bytes()).hexdigest() == record['candidate_sha256'], 'Candidate changed after verification.'
    os.replace(CANDIDATE, TARGET)
    print('Updated approved sections 2.1 and 2.2 in the existing document.')


if __name__ == '__main__':
    commit() if '--commit' in sys.argv else edit()
