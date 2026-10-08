from copy import deepcopy
from hashlib import sha256
from pathlib import Path
from zipfile import ZipFile
import json
import os
import re
import runpy
import sys
from lxml import etree
from content import (build_b00, build_b01, build_b02, build_b03, build_b04, build_b05,
                     build_b06, build_b07, build_b08, build_b09, build_b10, build_b11,
                     build_b12, build_b13, build_review)

ROOT = Path(r'C:\Users\smin\Documents\vestigia-ui-wireframe')
WORK = ROOT / 'outputs/ui-spec-draft/v0.0.1/full-transfer'
TARGET = ROOT / 'docs/VESTIGIA_전투_UI_명세서_v0.0.1.docx'
SOURCE = ROOT / 'docs/VESTIGIA_전투_UI_명세서_초안_v0.9.1.docx'
CANDIDATE = WORK / 'candidate.docx'
helpers = runpy.run_path(str(ROOT / 'outputs/ui-spec-draft/v0.0.1/ch2/transfer_ch2.py'))
NS, W = helpers['NS'], helpers['W']
text_of, paragraph = helpers['text_of'], helpers['paragraph']
get_or_add, clean_clone, set_cell = helpers['get_or_add'], helpers['clean_clone'], helpers['set_cell']
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
R = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
XMLSPACE = '{http://www.w3.org/XML/1998/namespace}space'


def norm(text):
    replacements = {
        '[보완안·협의]': '미확정 보완안: ', '[임시 규격]': '임시 표시 규격: ',
        '[임시 기획]': '임시 기획: ', '[제안]': '미확정 제안: ',
        '[화면 보완]': '화면 보완 필요: ', '[확인 필요]': '확인 필요: ',
        '[검토 기준]': '검토 기준: ', '[입력 정의]': '입력 정의: ',
        '[데이터·확인 필요]': '데이터 연결 확인 필요: ', '[데이터]': '데이터 연결: ',
        '[문구에 따른 동작]': '입력 후 동작: ', '[자료 간 차이]': '자료 간 차이: ',
        '[일치]': '자료 간 일치: ', '[미확인]': '확인 필요: ',
        '[차이]': '자료 간 차이: ',
        '[기획·연출]': '[기획] [연출]', '[임시]': '(임시 기획)',
        '스킬 변경 취소 시 제거': '활성 스킬 변경으로 계획 취소 시 제거',
        '주 행동 지정 공통 입력 규칙': 'B04의 주 행동 지정 공통 입력 규칙(3.5.6)',
        'B04 공통 입력 규칙': 'B04의 주 행동 지정 공통 입력 규칙(3.5.6)',
        'B04 공통 규칙': 'B04의 주 행동 지정 공통 입력 규칙(3.5.6)',
        'B05 공통 규칙': 'B05의 상태·입력 정의와 B04의 공통 입력 규칙(3.5.6)',
        'B04-Confirmed': 'B04 확정 후(3.5.5.5)', 'B04-SelfCentered': 'B04 자기기준형 지정(3.5.5.4)',
        'B05-Info': 'B05 정보 열람(3.6.5.3)',
        'SelfCentered 01': '자기기준형 01', 'SelfCentered 02': '자기기준형 02',
        'SelfCentered 03': '자기기준형 03', 'SelfCentered 04·05': '자기기준형 04·05',
        'SelfCentered·SelfBuff 07': '자기기준형·자기버프형 07',
        'SelfBuff 01': '자기버프형 01', 'SelfBuff 02': '자기버프형 02',
        'SelfBuff 03': '자기버프형 03', 'SelfBuff 04·05': '자기버프형 04·05',
        '공통 입력 규칙의 보완안': '3.5.6의 미확정 보완안',
        '공통 입력 규칙 보완안': '3.5.6의 미확정 보완안',
        '공통 보완안': '3.5.6의 미확정 보완안',
        'B01-01': 'B01-01(3.2.3.2)', 'B01-02': 'B01-02(3.2.3.3)',
        'B01-03': 'B01-03(3.2.3.4)', 'B01-07': 'B01-07(3.2.3.5)',
        'B01-08': 'B01-08(3.2.3.6·3.2.5)',
        '이전 스킬 계획이 있으면 가장 최신에 저장한 주 행동 하나로 대체한다.': '기존 주 행동을 새 계획으로 대체하는 처리는 3.5.6의 확인 필요 항목을 따른다.',
        'B04의 공격 계획이 있으면 대체한다.': '기존 공격 계획의 대체 처리는 3.5.6의 확인 필요 항목을 따른다.',
        '스킬 확정 시 기존 일반 공격 계획을 대체.': '새 스킬 확정 시 기존 주 행동의 대체는 3.5.6의 확인 필요 항목 참조.',
        '새 공격 확정 시 기존 주 행동을 대체한다.': '새 공격 확정 시 기존 주 행동의 대체는 3.5.6의 확인 필요 항목을 따른다.',
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    return text.replace('미확정 제안: .', '미확정 제안이다.')


class Builder:
    def __init__(self):
        self.original = TARGET.read_bytes()
        with ZipFile(TARGET) as z:
            self.entries = [(item, z.read(item.filename)) for item in z.infolist()]
        self.parts = {item.filename: content for item, content in self.entries}
        with ZipFile(SOURCE) as z:
            self.source_parts = {item.filename: z.read(item.filename) for item in z.infolist()}
        self.root = etree.fromstring(self.parts['word/document.xml'])
        self.body = self.root.find(W + 'body')
        self.src_root = etree.fromstring(self.source_parts['word/document.xml'])
        self.src = list(self.src_root.find(W + 'body'))
        self.records = json.loads((WORK / 'source.json').read_text(encoding='utf-8'))
        self.relationships = etree.fromstring(self.parts['word/_rels/document.xml.rels'])
        self.source_relationships = etree.fromstring(self.source_parts['word/_rels/document.xml.rels'])
        self.content_types = etree.fromstring(self.parts['[Content_Types].xml'])
        self.rid_map = {}
        self.new_parts = {}
        self.coverage = {}
        self.ref_emitted = set()
        self.heading_seed = next(p for p in self.body.findall(W+'p') if text_of(p)=='2.1 화면 목록')
        self.subheading_seed = next(p for p in self.body.findall(W+'p') if text_of(p)=='2.2.1 전투 진입')
        self.chapter_seed = next(p for p in self.body.findall(W+'p') if text_of(p).startswith('2 전투 화면 구성'))
        self.body_seed = next(p for p in self.body.findall(W+'p') if text_of(p).startswith('본 항목은 전투 UI'))
        self.bullet_seed = next(p for p in self.body.findall(W+'p') if text_of(p)=='전투 진입과 적 행동 예고')
        self.table_seed = self.heading_seed.getnext()
        self.docpr_next = max([int(n.get('id','0')) for n in self.root.xpath('//*[local-name()="docPr"]')] + [0])+1
        cut = next(p for p in self.body.findall(W+'p') if text_of(p).startswith('2.5 '))
        self.cut_index = self.body.index(cut)
        self.prefix = [etree.tostring(e) for e in list(self.body)[:self.cut_index]]
        for el in list(self.body)[self.cut_index:]:
            if el.tag != W+'sectPr': self.body.remove(el)
        self.sect = self.body.find(W+'sectPr')
        self.last_was_table = False
        self.screen_map = []

    def mark(self, indexes, reason='migrated'):
        if isinstance(indexes,int): indexes=[indexes]
        for i in indexes: self.coverage.setdefault(str(i),[]).append(reason)

    def append(self, el):
        self.body.insert(self.body.index(self.sect),el)
        self.last_was_table = el.tag==W+'tbl'

    def p(self, text, kind='body', page=False):
        seeds={'chapter':self.chapter_seed,'screen':self.heading_seed,'sub':self.subheading_seed,'detail':self.subheading_seed,'bullet':self.bullet_seed}
        styles={'chapter':'2','screen':'3','sub':'4','detail':'5'}
        p=paragraph(text if kind in styles else norm(text),seeds.get(kind,self.body_seed),style=styles.get(kind),page_break=page)
        pr=get_or_add(p,'pPr')
        for n in list(pr):
            if n.tag in [W+'pBdr',W+'shd']:pr.remove(n)
        if kind in ['chapter','screen','sub','detail']:
            get_or_add(pr,'keepNext')
            get_or_add(pr,'keepLines')
        else:
            get_or_add(pr,'keepLines')
        if kind=='body' and len(text)<45 and not text.endswith('다.'):
            get_or_add(pr,'keepNext')
            get_or_add(get_or_add(p.find(W+'r'),'rPr'),'b')
        if self.last_was_table:
            get_or_add(pr,'spacing').set(W+'before','100')
        if kind=='caption':
            get_or_add(pr,'spacing').set(W+'after','160')
            rp=get_or_add(p.find(W+'r'),'rPr')
            get_or_add(rp,'sz').set(W+'val','18')
            get_or_add(rp,'color').set(W+'val','555555')
        self.append(p)
        return p

    def h(self, title, level='sub', page=False):return self.p(title,level,page)

    def table(self, records, widths=None):
        if self.last_was_table:
            spacer = self.p('')
            sp = get_or_add(spacer, 'pPr')
            get_or_add(sp, 'keepNext')
            spacing = get_or_add(sp, 'spacing')
            spacing.set(W+'before', '0')
            spacing.set(W+'after', '0')
            spacing.set(W+'line', '60')
            spacing.set(W+'lineRule', 'exact')
        n=len(records[0])
        assert all(len(row)==n for row in records)
        if widths is None:widths={2:(2400,7801),3:(1800,4100,4301),4:(750,2400,3500,3551)}[n]
        assert sum(widths)==10201
        t=clean_clone(self.table_seed)
        for r in t.findall(W+'tr'):t.remove(r)
        grid=t.find(W+'tblGrid')
        for n in list(grid):grid.remove(n)
        for width in widths:etree.SubElement(grid,W+'gridCol').set(W+'w',str(width))
        tp=t.find(W+'tblPr')
        get_or_add(tp,'tblLayout').set(W+'type','fixed')
        get_or_add(tp,'tblW').set(W+'w','10201')
        get_or_add(tp,'tblW').set(W+'type','dxa')
        seeds=self.table_seed.findall(W+'tr')
        for ri,values in enumerate(records):
            row=clean_clone(seeds[0 if ri==0 else 1])
            cells=row.findall(W+'tc')
            while len(cells)<len(widths):row.append(deepcopy(cells[-1]));cells=row.findall(W+'tc')
            for c in cells[len(widths):]:row.remove(c)
            rp=get_or_add(row,'trPr')
            for n in list(rp):
                if n.tag in [W+'trHeight',W+'tblHeader']:rp.remove(n)
            get_or_add(rp,'cantSplit')
            if ri==0:get_or_add(rp,'tblHeader')
            for ci,(cell,value,width) in enumerate(zip(row.findall(W+'tc'),values,widths)):
                set_cell(cell,norm(str(value)))
                cp=get_or_add(cell,'tcPr')
                cw=get_or_add(cp,'tcW');cw.set(W+'w',str(width));cw.set(W+'type','dxa')
                get_or_add(cp,'vAlign').set(W+'val','center')
                pp=get_or_add(cell.find(W+'p'),'pPr')
                for n in list(pp):
                    if n.tag in [W+'keepNext',W+'keepLines']:pp.remove(n)
                if ri==0:get_or_add(pp,'keepNext')
                spacing=get_or_add(pp,'spacing');spacing.set(W+'before','35');spacing.set(W+'after','55')
                if ci==0 and width<=1500:get_or_add(pp,'jc').set(W+'val','center')
                else:get_or_add(pp,'jc').set(W+'val','left')
                for run in cell.xpath('./w:p/w:r',namespaces=NS):
                    rpr=get_or_add(run,'rPr');get_or_add(rpr,'sz').set(W+'val','20')
                    for txt in list(run.findall(W+'t')):
                        if '\n' in (txt.text or ''):
                            position=run.index(txt)
                            pieces=txt.text.split('\n')
                            run.remove(txt)
                            for line_i,line in enumerate(pieces):
                                if line_i:
                                    run.insert(position,etree.Element(W+'br'));position+=1
                                ttext=etree.Element(W+'t');ttext.text=line
                                run.insert(position,ttext);position+=1
            t.append(row)
        self.append(t)
        return t

    def source_p(self,i):
        r=self.records[i]
        self.mark(i)
        if r.get('text'):self.p(r['text'])

    def prose(self,*indexes):
        for i in indexes:self.source_p(i)

    def source_table(self,i,headers=None,component=False,overrides=None):
        self.mark(i)
        rows=deepcopy(self.records[i]['rows'])
        if component and len(rows[0])==4:
            rows=[['번호','UI 요소와 구성','표시 정의']]+[[r[0],r[1]+'\n'+r[2],r[3]] for r in rows[1:]]
            return self.table(rows,(750,2850,6601))
        if headers:rows[0]=headers
        if overrides:
            for ri,ci,value in overrides:rows[ri][ci]=value
        n=len(rows[0])
        if n==3 and rows[0][0] in ['요소','요소 ID','번호']:
            widths=(1400,3350,5451)
        elif n==3 and rows[0][0]=='상태':widths=(1900,4150,4151)
        else:widths=None
        return self.table(rows,widths)

    def ops(self,i,destinations,omit=None,overrides=None):
        self.mark(i)
        raw=deepcopy(self.records[i]['rows'][1:])
        if overrides:
            for ri,ci,value in overrides:raw[ri][ci]=value
        assert len(raw)==len(destinations)
        records=[['요소','입력 또는 발생 조건','입력 후 화면·상태','처리와 유지·해제']]
        for ri,(r,dest) in enumerate(zip(raw,destinations)):
            if omit and ri in omit:continue
            records.append([r[0],r[1],dest,r[2]])
        return self.table(records,(850,2700,2000,4651))

    def data(self,i,records):
        self.mark(i,'data categories rewritten; UI conditions moved to state/input definitions')
        return self.table([['요소','데이터 구분','표시할 정보와 원본','갱신·연결 기준']]+records,(1200,1400,3950,3651))

    def relationship(self,old_rid):
        if old_rid in self.rid_map:return self.rid_map[old_rid]
        old=next(n for n in self.source_relationships if n.get('Id')==old_rid)
        numbers=[int(n.get('Id')[3:]) for n in self.relationships if re.fullmatch(r'rId\d+',n.get('Id',''))]
        new_rid='rId'+str(max(numbers+[0])+1)
        new=deepcopy(old);new.set('Id',new_rid)
        if old.get('TargetMode')!='External':
            part='word/'+old.get('Target')
            blob=self.source_parts[part]
            suffix=Path(part).suffix
            new_part='word/media/migrated-'+sha256(blob).hexdigest()[:16]+suffix
            if new_part not in self.parts:self.new_parts[new_part]=blob
            new.set('Target',new_part.removeprefix('word/'))
            ext=suffix.lstrip('.')
            if not any(n.tag=='{'+CT+'}Default' and n.get('Extension')==ext for n in self.content_types):
                source_ct=etree.fromstring(self.source_parts['[Content_Types].xml'])
                ct=next(n for n in source_ct if n.tag=='{'+CT+'}Default' and n.get('Extension')==ext)
                self.content_types.append(deepcopy(ct))
        self.relationships.append(new)
        self.rid_map[old_rid]=new_rid
        return new_rid

    def image(self,i,label,ref_index=None):
        self.mark(i)
        previous=self.sect.getprevious()
        if previous is not None and previous.tag==W+'p' and len(text_of(previous))<450:
            get_or_add(get_or_add(previous,'pPr'),'keepNext')
        cap=self.p(label,'caption')
        get_or_add(get_or_add(cap,'pPr'),'keepNext')
        p=clean_clone(self.src[i])
        for child in list(p):
            if child.tag==W+'pPr':p.remove(child)
        pp=etree.Element(W+'pPr');p.insert(0,pp)
        get_or_add(pp,'jc').set(W+'val','center')
        get_or_add(pp,'spacing').set(W+'after','160')
        get_or_add(pp,'keepNext')
        for br in p.xpath('.//w:br | .//w:lastRenderedPageBreak',namespaces=NS):br.getparent().remove(br)
        for blip in p.xpath('//*[local-name()="blip"]'):
            if blip.get(R+'embed'):blip.set(R+'embed',self.relationship(blip.get(R+'embed')))
        for extent in p.xpath('.//*[local-name()="extent"]'):
            cx,cy=int(extent.get('cx')),int(extent.get('cy'))
            factor=min(1,6120000/cx,3150000/cy)
            extent.set('cx',str(round(cx*factor)));extent.set('cy',str(round(cy*factor)))
            for ext in p.xpath('.//*[local-name()="xfrm"]/*[local-name()="ext"]'):
                ext.set('cx',str(round(cx*factor)));ext.set('cy',str(round(cy*factor)))
        for docpr in p.xpath('.//*[local-name()="docPr"]'):
            docpr.set('id',str(self.docpr_next));self.docpr_next+=1
            docpr.set('descr',label)
        self.append(p)
        if ref_index is not None:self.reference(ref_index)

    def reference(self,i):
        self.mark(i,'reference retained')
        if i in self.ref_emitted:return
        self.ref_emitted.add(i)
        rec=self.records[i]
        previous=self.sect.getprevious()
        if previous is not None and previous.tag==W+'p' and len(text_of(previous))<450:
            get_or_add(get_or_add(previous,'pPr'),'keepNext')
        elif previous is not None and previous.tag==W+'tbl':
            for cp in previous.findall(W+'tr')[-1].xpath('./w:tc/w:p',namespaces=NS):
                get_or_add(get_or_add(cp,'pPr'),'keepNext')
        p=clean_clone(self.src[i])
        old_pr=p.find(W+'pPr')
        if old_pr is not None:p.remove(old_pr)
        pr=etree.Element(W+'pPr');p.insert(0,pr)
        get_or_add(pr,'keepLines')
        spacing=get_or_add(pr,'spacing');spacing.set(W+'before','80');spacing.set(W+'after','160')
        for run in p.xpath('.//w:r',namespaces=NS):
            rpr=run.find(W+'rPr')
            if rpr is not None:run.remove(rpr)
            rpr=etree.Element(W+'rPr');run.insert(0,rpr)
            get_or_add(rpr,'sz').set(W+'val','18')
            get_or_add(rpr,'color').set(W+'val','555555')
        for h in p.xpath('.//w:hyperlink',namespaces=NS):
            if h.get(R+'id'):h.set(R+'id',self.relationship(h.get(R+'id')))
            for rp in h.xpath('.//w:rPr',namespaces=NS):get_or_add(rp,'color').set(W+'val','0070C0')
        for t in p.xpath('.//w:t',namespaces=NS):t.text=norm(t.text or '')
        self.append(p)

    def screen(self,n,id,title,intro,condition):
        self.h(f'3.{n} {id} {title}','screen',page=n>1)
        self.screen_map.append({'number':f'3.{n}','screen_id':id,'title':title})
        self.h(f'3.{n}.1 화면 개요')
        self.p(intro)
        self.p('진입 조건: '+condition)

    def states(self,n,screen_rows,ui_rows):
        self.h(f'3.{n}.5 화면과 UI 요소의 상태')
        self.h(f'3.{n}.5.1 화면의 상태','detail')
        self.table([['화면 상태','진입·표시 조건','표시 변화와 연결']]+screen_rows,(1600,3900,4701))
        self.h(f'3.{n}.5.2 UI 요소의 상태','detail')
        self.table([['요소','UI 요소 상태','표시와 입력 가능 여부']]+ui_rows,(2300,1600,6301))

    def finish(self):
        # Headings/captions and common boilerplate are accounted for separately.
        for i,r in enumerate(self.records):
            if i<32:continue
            if r.get('style') and r['style'][0] in ['1','21']:
                self.mark(i,'replaced by numbered outline')
            if r.get('text','').startswith('요소 번호는 앞 화면과 동일하다.'):
                self.mark(i,'covered by common specification and chapter introduction')
            if r.get('style')==['af0'] and str(i) not in self.coverage:self.reference(i)
        missing=[]
        for i,r in enumerate(self.records):
            if i<32:continue
            substantive=bool(r.get('text') or r.get('rows') or r.get('images'))
            if substantive and str(i) not in self.coverage:missing.append(i)
        assert not missing, 'Unaccounted source blocks: '+str(missing)
        assert self.prefix==[etree.tostring(el) for el in list(self.body)[:self.cut_index]], 'Content through 2.4 changed'
        assert len(self.screen_map)==14
        xml=etree.tostring(self.root,encoding='UTF-8',xml_declaration=True,standalone=True)
        changes={'word/document.xml':xml,
                 'word/_rels/document.xml.rels':etree.tostring(self.relationships,encoding='UTF-8',xml_declaration=True,standalone=True),
                 '[Content_Types].xml':etree.tostring(self.content_types,encoding='UTF-8',xml_declaration=True,standalone=True)}
        with ZipFile(CANDIDATE,'w') as out:
            for item,content in self.entries:out.writestr(item,changes.get(item.filename,content))
            for name,content in self.new_parts.items():out.writestr(name,content)
        with ZipFile(CANDIDATE) as z:
            assert z.testzip() is None
            for item,content in self.entries:
                if item.filename not in changes:assert z.read(item.filename)==content
        (WORK/'before.docx').write_bytes(self.original)
        report={'original_sha256':sha256(self.original).hexdigest(),'candidate_sha256':sha256(CANDIDATE.read_bytes()).hexdigest(),
                'prefix_element_count':self.cut_index,'preserved_through':'2.4','screens':self.screen_map,'source_coverage':self.coverage,
                'new_media_parts':list(self.new_parts)}
        (WORK/'transfer.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps({'screens':len(self.screen_map),'new_images':len(self.new_parts),'prefix_preserved':True,'source_blocks_accounted_for':len(self.coverage)},ensure_ascii=False))


def commit():
    record=json.loads((WORK/'transfer.json').read_text(encoding='utf-8'))
    assert sha256(TARGET.read_bytes()).hexdigest()==record['original_sha256'],'User document changed during verification; do not overwrite.'
    assert sha256(CANDIDATE.read_bytes()).hexdigest()==record['candidate_sha256'],'Candidate changed after verification.'
    os.replace(CANDIDATE,TARGET)
    print('Full migration committed to the existing v0.0.1 document.')


def build():
    b=Builder()
    b.h('2.5 주 행동 지정 규칙 참조','screen')
    b.p('일반 공격·스킬 지정에 공통으로 적용하는 입력 규칙은 B04 일반 공격 지정의 3.5.6에서 정의한다. B05 스킬 지정에도 해당 규칙을 적용한다.')
    b.h('3 화면별 명세','chapter')
    b.p('각 화면은 화면 개요와 이미지, 구성 및 표시 정의, 데이터 정의, 화면과 UI 요소의 상태, 입력 및 동작 정의 순서로 작성한다. 같은 화면 ID의 지정 전·지정 중·확정 후 표현은 상태로 구분한다. 요소 번호는 v0.9.1의 화면 이미지와 동일하게 유지한다.')
    b.p('표시 데이터는 고정 문구, 콘텐츠 정보, 게임 상태로 구분한다. 임시 방향·대상, 현재 선택과 재생 진행 여부는 데이터 원본과 구분하여 상태·입력 항목에 정의한다. 같은 개체의 정보를 함께 갱신하고, 화면 전환에서 유지·해제하는 선택과 계획을 명시한다.')
    b.p('참조 자료의 기준 버전은 1.3을 따른다. 영문 데이터명은 관련 시스템 기획서의 명칭이며, 필드·리소스 연결이 정해지지 않은 값은 임의의 영문 필드명을 만들지 않는다. 임시 표시 규격과 미확정 보완안은 확정된 게임 규칙과 구분한다.')
    build_b00(b)
    build_b01(b)
    build_b02(b)
    build_b03(b)
    build_b04(b)
    build_b05(b)
    build_b06(b)
    build_b07(b)
    build_b08(b)
    build_b09(b)
    build_b10(b)
    build_b11(b)
    build_b12(b)
    build_b13(b)
    build_review(b)
    b.finish()


if __name__=='__main__':
    commit() if '--commit' in sys.argv else build()
