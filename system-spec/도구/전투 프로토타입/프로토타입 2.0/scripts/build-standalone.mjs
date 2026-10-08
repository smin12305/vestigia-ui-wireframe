import{mkdir,readFile,readdir,writeFile}from'node:fs/promises'
import path from'node:path'
import{fileURLToPath}from'node:url'
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),dist=path.join(root,'dist'),output=path.join(root,'standalone')
let html=await readFile(path.join(dist,'index.html'),'utf8')
const scriptTag=html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/),styleTag=html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)
if(!scriptTag||!styleTag)throw new Error('빌드 산출물에서 JS 또는 CSS를 찾지 못했습니다.')
const resolveAsset=url=>path.join(dist,url.replace(/^\//,''))
let script=await readFile(resolveAsset(scriptTag[1]),'utf8'),style=await readFile(resolveAsset(styleTag[1]),'utf8')
for(const group of['characters','environment','ui']){const directory=path.join(root,'public','assets',group);for(const file of await readdir(directory)){if(!file.endsWith('.png'))continue;const image=await readFile(path.join(directory,file)),url=`data:image/png;base64,${image.toString('base64')}`;script=script.replaceAll(`/assets/${group}/${file}`,url);style=style.replaceAll(`/assets/${group}/${file}`,url)}}
script=script.replaceAll('</script','<\\/script')
html=html.replace(styleTag[0],()=>`<style>${style}</style>`).replace(scriptTag[0],'').replace('</body>',()=>`<script>${script}</script></body>`)
await mkdir(output,{recursive:true});await writeFile(path.join(output,'index.html'),html,'utf8');console.log(`standalone/index.html 생성 완료 (${Math.round(Buffer.byteLength(html)/1024)} KB)`)
