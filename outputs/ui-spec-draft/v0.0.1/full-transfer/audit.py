from pathlib import Path
from zipfile import ZipFile
from lxml import etree
import json, hashlib, re, posixpath

work = Path(__file__).parent
manifest = json.loads((work/'transfer.json').read_text(encoding='utf-8'))
ns = {'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
with ZipFile(work/'candidate.docx') as z, ZipFile(work/'before.docx') as old:
    assert z.testzip() is None
    root = etree.fromstring(z.read('word/document.xml'))
    prev = etree.fromstring(old.read('word/document.xml'))
    body = root.find('w:body',ns)
    before = prev.find('w:body',ns)
    count = manifest['prefix_element_count']
    assert [etree.tostring(e) for e in body[:count]] == [etree.tostring(e) for e in before[:count]]
    rels = etree.fromstring(z.read('word/_rels/document.xml.rels'))
    relmap = {r.get('Id'):r for r in rels}
    for e in root.iter():
        for name,value in e.attrib.items():
            if name.startswith('{'+ns['r']+'}'):
                assert value in relmap, value
                rel = relmap[value]
                if rel.get('TargetMode') != 'External':
                    path = posixpath.normpath('word/'+rel.get('Target'))
                    assert path in z.namelist(), path
    headings=[]
    for p in body.findall('w:p',ns):
        text=''.join(p.xpath('.//w:t/text()',namespaces=ns))
        style=p.find('w:pPr/w:pStyle',ns)
        if style is not None:
            sid=style.get('{'+ns['w']+'}val')
            if sid in ['2','3','4','5']:headings.append((text,sid))
    screens=[h for h in headings if re.match(r'3\.\d+ B\d\d ',h[0])]
    assert len(screens)==14
    assert all(sid=='3' for text,sid in screens)
    assert len({h[0] for h in headings})==len(headings)
    for title,style in headings:
        if re.match(r'3\.\d+\.\d+ ',title):assert style=='4', (title,style)
        if re.match(r'3\.\d+\.\d+\.\d+ ',title):assert style=='5', (title,style)
    allowed={'고정 문구','콘텐츠 정보','게임 상태'}
    data_tables=0
    for t in body[count:]:
        if t.tag!='{'+ns['w']+'}tbl':continue
        rows=t.findall('w:tr',ns)
        hdr=[''.join(c.xpath('.//w:t/text()',namespaces=ns)) for c in rows[0].findall('w:tc',ns)]
        if '데이터 구분' in hdr:
            data_tables+=1
            for row in rows[1:]:
                c=row.findall('w:tc',ns)[1]
                category=''.join(c.xpath('.//w:t/text()',namespaces=ns))
                assert set(category.split('·'))<=allowed,category
    assert data_tables==14
    drawings=root.xpath('//*[local-name()="docPr"]')
    assert len(drawings)==28
    assert len({d.get('id') for d in drawings})==28
    text='\n'.join(root.xpath('//w:t/text()',namespaces=ns))
    assert '미확정 제안: .' not in text
    assert '2.5 주 행동 지정 규칙 참조' in text
    assert '3.5.6 주 행동 지정 공통 입력 규칙' in text
    assert len(manifest['new_media_parts'])==26
    assert hashlib.sha256((work/'candidate.docx').read_bytes()).hexdigest()==manifest['candidate_sha256']
    print(json.dumps({'preserved_through':'2.4','screens':len(screens),'data_tables':data_tables,
                      'images':len(drawings),'references_valid':True,'headings_valid':True},ensure_ascii=False))
