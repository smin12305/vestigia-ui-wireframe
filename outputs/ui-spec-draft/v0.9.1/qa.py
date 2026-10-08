from pathlib import Path
import pypdfium2 as pdfium,json
from PIL import Image,ImageDraw
o=Path(__file__).parent/'qa';pdf=pdfium.PdfDocument(o/'render.pdf')
pages=[]
for i,p in enumerate(pdf):
    text=p.get_textpage().get_text_range()
    p.render(scale=1.4).to_pil().save(o/f'page-{i+1}.png')
    pages.append({'page':i+1,'text':text})
    print(i+1, ' | '.join(text.splitlines()[:3]))
(o/'pages.json').write_text(json.dumps(pages,ensure_ascii=False,indent=2),encoding='utf-8')
for start in range(0,len(pdf),6):
    sheet=Image.new('RGB',(1250,1800),'#c4c4c4');dr=ImageDraw.Draw(sheet)
    for k in range(6):
        i=start+k
        if i>=len(pdf):break
        im=Image.open(o/f'page-{i+1}.png');im.thumbnail((600,850));x=(k%2)*625;y=(k//2)*600
        im.thumbnail((600,565));sheet.paste(im,(x,y+25));dr.text((x+5,y+5),str(i+1),fill='black')
    sheet.save(o/f'contact-{start+1}.png')
