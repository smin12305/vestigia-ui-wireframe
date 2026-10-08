import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(projectRoot, 'dist')
const outputDir = path.join(projectRoot, 'standalone')

let html = await readFile(path.join(distDir, 'index.html'), 'utf8')

const scriptMatch = html.match(/<script[^>]+src="([^"]+\.js)"[^>]*><\/script>/)
const styleMatch = html.match(/<link[^>]+href="([^"]+\.css)"[^>]*>/)

if (!scriptMatch || !styleMatch) {
  throw new Error('Vite 산출물에서 JavaScript 또는 CSS 파일을 찾지 못했습니다.')
}

const resolveDistAsset = (url) => path.join(distDir, url.replace(/^\//, ''))
let script = await readFile(resolveDistAsset(scriptMatch[1]), 'utf8')
let style = await readFile(resolveDistAsset(styleMatch[1]), 'utf8')

for (const assetGroup of ['characters', 'environment', 'ui']) {
  const assetDir = path.join(projectRoot, 'public', 'assets', assetGroup)
  for (const file of await readdir(assetDir)) {
    if (!file.toLowerCase().endsWith('.png')) continue
    const image = await readFile(path.join(assetDir, file))
    const dataUrl = `data:image/png;base64,${image.toString('base64')}`
    script = script
      .replaceAll(`/assets/${assetGroup}/${file}`, dataUrl)
      .replaceAll(`./assets/${assetGroup}/${file}`, dataUrl)
    style = style
      .replaceAll(`/assets/${assetGroup}/${file}`, dataUrl)
      .replaceAll(`./assets/${assetGroup}/${file}`, dataUrl)
  }
}

// 인라인 스크립트 종료로 오인될 수 있는 문자열을 방지한다.
script = script.replaceAll('</script', '<\\/script')

html = html
  // 치환 문자열 안의 Phaser 코드에 포함된 `$&`, `$'` 등을 replace 토큰으로 해석하지 않게 한다.
  .replace(styleMatch[0], () => `<style>\n${style}\n</style>`)
  // file://에서 모듈 스크립트가 차단되는 브라우저가 있으므로 원래 태그는 제거한다.
  .replace(scriptMatch[0], '')
  // #app이 생성된 뒤 일반 스크립트로 실행하면 모듈·CORS 없이 더블클릭 실행이 가능하다.
  .replace('</body>', () => `  <script>\n${script}\n</script>\n  </body>`)
  .replace('<head>', '<head>\n    <!-- 오프라인 단일 파일 배포판: 서버와 Node.js 없이 실행 가능 -->')

await mkdir(outputDir, { recursive: true })
await writeFile(path.join(outputDir, 'index.html'), html, 'utf8')

console.log(`standalone/index.html 생성 완료 (${Math.round(Buffer.byteLength(html) / 1024)} KB)`)
