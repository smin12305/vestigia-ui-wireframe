import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(projectRoot, 'dist')
const outputDir = path.join(projectRoot, 'portable')
const assetsDir = path.join(outputDir, 'assets')

const builtHtml = await readFile(path.join(distDir, 'index.html'), 'utf8')
const scriptMatch = builtHtml.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/)
const styleMatch = builtHtml.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)

if (!scriptMatch || !styleMatch) {
  throw new Error('Vite 산출물에서 JavaScript 또는 CSS 파일을 찾지 못했습니다.')
}

const resolveDistAsset = (url) => path.join(distDir, url.replace(/^\//, ''))
let script = await readFile(resolveDistAsset(scriptMatch[1]), 'utf8')
const style = await readFile(resolveDistAsset(styleMatch[1]), 'utf8')

// 이미지도 JavaScript에 포함해 file:// 환경의 로컬 파일 접근 차이를 없앤다.
const characterDir = path.join(projectRoot, 'public', 'assets', 'characters')
for (const file of await readdir(characterDir)) {
  if (!file.toLowerCase().endsWith('.png')) continue
  const image = await readFile(path.join(characterDir, file))
  const dataUrl = `data:image/png;base64,${image.toString('base64')}`
  script = script
    .replaceAll(`/assets/characters/${file}`, dataUrl)
    .replaceAll(`./assets/characters/${file}`, dataUrl)
}

const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="theme-color" content="#101619" />
    <title>쿼리도 슈팅 전투 개편 시스템 프로토타입</title>
    <link rel="stylesheet" href="./assets/style.css" />
    <script defer src="./assets/app.js"></script>
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
`

await mkdir(assetsDir, { recursive: true })
await writeFile(path.join(outputDir, 'index.html'), html, 'utf8')
await writeFile(path.join(assetsDir, 'app.js'), script, 'utf8')
await writeFile(path.join(assetsDir, 'style.css'), style, 'utf8')

console.log('portable 폴더 생성 완료: index.html을 직접 열어 실행')
