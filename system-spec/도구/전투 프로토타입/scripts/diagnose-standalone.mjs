import { spawn } from 'node:child_process'
import { writeFile } from 'node:fs/promises'

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const profilePath = new URL('../.chrome-cdp-profile/', import.meta.url).pathname.replace(/^\/(.:)/, '$1')
const pageUrl = process.argv[2] ?? new URL('../standalone/index.html', import.meta.url).href
const port = 9333

const chrome = spawn(chromePath, [
  '--headless=new',
  '--no-sandbox',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--disable-dev-shm-usage',
  '--no-first-run',
  `--user-data-dir=${profilePath}`,
  `--remote-debugging-port=${port}`,
  'about:blank',
], { stdio: 'ignore' })

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let socket

try {
  let tabs
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      tabs = await fetch(`http://127.0.0.1:${port}/json`).then(response => response.json())
      if (tabs.length) break
    } catch {}
    await delay(200)
  }
  if (!tabs?.length) throw new Error('Chrome 디버그 탭에 연결하지 못했습니다.')

  const page = tabs.find(tab => tab.type === 'page' && tab.url === 'about:blank') ?? tabs.find(tab => tab.type === 'page')
  if (!page) throw new Error('진단할 브라우저 페이지를 찾지 못했습니다.')
  socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true })
    socket.addEventListener('error', reject, { once: true })
  })

  let nextId = 1
  const pending = new Map()
  const events = []
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data)
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id)
      pending.delete(message.id)
      message.error ? reject(new Error(message.error.message)) : resolve(message.result)
      return
    }
    if (message.method === 'Runtime.exceptionThrown') {
      events.push({ type: 'exception', detail: message.params.exceptionDetails })
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      events.push({ type: 'console', detail: message.params })
    }
  })

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })

  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  const navigation = await send('Page.navigate', { url: pageUrl })
  await delay(5000)
  await send('Runtime.evaluate', { expression: `document.querySelector('#open-settings')?.click()` })
  await delay(180)
  const settingsScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-board-settings-latest.png', import.meta.url), Buffer.from(settingsScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-board-size="6"]')?.click();document.querySelector('#apply-board-size')?.click()` })
  await delay(900)
  const boardSixEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({boardSize:document.querySelector('.game-shell')?.dataset.boardSize,subtitle:document.querySelector('#board-size-subtitle')?.textContent,phase:document.querySelector('.game-shell')?.dataset.phase,saved:localStorage.getItem('waredo-board-size-v1'),settingsClosed:document.querySelector('#settings-modal')?.classList.contains('hidden')})`, returnByValue: true })
  const boardSixScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-board-6x6-latest.png', import.meta.url), Buffer.from(boardSixScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('#open-settings')?.click();document.querySelector('[data-board-size="9"]')?.click();document.querySelector('#apply-board-size')?.click()` })
  await delay(900)
  const boardNineEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({boardSize:document.querySelector('.game-shell')?.dataset.boardSize,subtitle:document.querySelector('#board-size-subtitle')?.textContent,phase:document.querySelector('.game-shell')?.dataset.phase,saved:localStorage.getItem('waredo-board-size-v1'),settingsClosed:document.querySelector('#settings-modal')?.classList.contains('hidden')})`, returnByValue: true })
  const boardNineScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-board-9x9-latest.png', import.meta.url), Buffer.from(boardNineScreenshot.data, 'base64'))
  console.log(`BOARD_6 ${boardSixEvaluation.result.value}`)
  console.log(`BOARD_9 ${boardNineEvaluation.result.value}`)
  const evaluation = await send('Runtime.evaluate', {
    expression: `JSON.stringify({href:location.href,ready:document.readyState,title:document.title,html:document.documentElement?.outerHTML.slice(0,300)??'',appChildren:document.querySelector('#app')?.children.length??-1,bodyText:document.body?.innerText.slice(0,300)??'',canvas:Boolean(document.querySelector('canvas')),enemyCards:['holy_lancer','holy_shield','tower_guard'].map(id=>{document.querySelector('[data-deploy-unit="'+id+'"]')?.click();return{id,text:document.querySelector('#right-rail')?.innerText.slice(0,260)??'',relicButtons:document.querySelectorAll('#right-rail [data-equip-relic]').length}})})`,
    returnByValue: true,
  })
  await send('Runtime.evaluate', { expression: `document.querySelector('#start-battle')?.click()` })
  await delay(1800)
  const battleEvaluation = await send('Runtime.evaluate', {
    expression: `JSON.stringify({phase:document.querySelector('.game-shell')?.getAttribute('data-phase'),timelineCards:document.querySelectorAll('#timeline [data-slot]').length,canvas:Boolean(document.querySelector('canvas')),timeDock:Boolean(document.querySelector('#mobile-time-button')),unitDock:document.querySelector('#mobile-unit-dock')?.innerText.slice(0,220)??'',actionButtons:document.querySelectorAll('[data-mobile-mode]').length,executeText:document.querySelector('#mobile-execute')?.innerText??'',executeDisabled:document.querySelector('#mobile-execute')?.hasAttribute('disabled'),viewport:[innerWidth,innerHeight]})`,
    returnByValue: true,
  })
  const combatFrameEvaluation = await send('Runtime.evaluate', { expression: `(()=>{const read=selector=>{const element=document.querySelector(selector),rect=element?.getBoundingClientRect(),style=element?getComputedStyle(element):null;return{left:rect?.left,top:rect?.top,width:rect?.width,height:rect?.height,cssWidth:style?.width,cssHeight:style?.height,maxWidth:style?.maxWidth,maxHeight:style?.maxHeight,transform:style?.transform}};return JSON.stringify({stage:read('.board-stage'),game:read('#game'),canvas:read('#game canvas'),layout:read('.battle-layout')})})()`, returnByValue: true })
  console.log(`COMBAT_FRAME ${combatFrameEvaluation.result.value}`)
  const actionToggleEvaluation = await send('Runtime.evaluate', { expression: `(()=>{document.querySelector('[data-mobile-mode="일반공격"]')?.click();const attackOn=document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active')??false;document.querySelector('[data-mobile-mode="일반공격"]')?.click();const attackOff=!document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active');document.querySelector('[data-mobile-mode="스킬"]')?.click();const skillOn=document.querySelector('[data-mobile-mode="스킬"]')?.classList.contains('active')??false;document.querySelector('[data-mobile-mode="스킬"]')?.click();const skillOff=!document.querySelector('[data-mobile-mode="스킬"]')?.classList.contains('active');return JSON.stringify({attackOn,attackOff,skillOn,skillOff,confirmDisabled:document.querySelector('#confirm-action')?.hasAttribute('disabled'),hint:document.querySelector('.mobile-action-hint')?.textContent??''})})()`, returnByValue: true })
  const actionToggleScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-action-toggle-cancel-latest.png', import.meta.url), Buffer.from(actionToggleScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('#mobile-time-button')?.click()` })
  await delay(180)
  const closeTimeRectEvaluation = await send('Runtime.evaluate', { expression: `(()=>{const button=document.querySelector('#close-time-popup'),rect=button?.getBoundingClientRect();return JSON.stringify({visible:Boolean(button&&!document.querySelector('#time-popup')?.classList.contains('hidden')),left:rect?.left??0,top:rect?.top??0,width:rect?.width??0,height:rect?.height??0})})()`, returnByValue: true })
  const closeTimeRect = JSON.parse(closeTimeRectEvaluation.result.value)
  const openTimeScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-time-popup-open-latest.png', import.meta.url), Buffer.from(openTimeScreenshot.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: closeTimeRect.left+closeTimeRect.width/2, y: closeTimeRect.top+closeTimeRect.height/2 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: closeTimeRect.left+closeTimeRect.width/2, y: closeTimeRect.top+closeTimeRect.height/2, button: 'left', buttons: 1, clickCount: 1 })
  await delay(80)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: closeTimeRect.left+closeTimeRect.width/2, y: closeTimeRect.top+closeTimeRect.height/2, button: 'left', buttons: 0, clickCount: 1 })
  await delay(180)
  const timeCloseEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({opened:JSON.parse('${JSON.stringify(closeTimeRect)}').visible,closeRect:JSON.parse('${JSON.stringify(closeTimeRect)}'),closed:document.querySelector('#time-popup')?.classList.contains('hidden'),topElement:document.elementFromPoint(${closeTimeRect.left+closeTimeRect.width/2},${closeTimeRect.top+closeTimeRect.height/2})?.id??document.elementFromPoint(${closeTimeRect.left+closeTimeRect.width/2},${closeTimeRect.top+closeTimeRect.height/2})?.className??''})`, returnByValue: true })
  console.log(`TIME_CLOSE ${timeCloseEvaluation.result.value}`)
  await send('Runtime.evaluate', { expression: `document.querySelector('#mobile-time-button')?.click();document.querySelector('#time-popup [data-time="현재"]')?.click()` })
  await delay(200)
  const timeFirstPressEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({popupOpen:!document.querySelector('#time-popup')?.classList.contains('hidden'),confirming:document.querySelector('#time-popup [data-time="현재"]')?.classList.contains('confirming'),guide:document.querySelector('#time-popup [data-time="현재"] em')?.textContent??''})`, returnByValue: true })
  const timeConfirmScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-time-double-confirm-latest.png', import.meta.url), Buffer.from(timeConfirmScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('#time-popup [data-time="현재"]')?.click()` })
  await delay(200)
  const timeSecondPressEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({popupClosed:document.querySelector('#time-popup')?.classList.contains('hidden'),watch:document.querySelector('#mobile-time-button b')?.textContent??''})`, returnByValue: true })
  const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-smoke-latest.png', import.meta.url), Buffer.from(screenshot.data, 'base64'))
  const uiInteraction = await send('Runtime.evaluate', {
    expression: `(()=>{const cards=[...document.querySelectorAll('#timeline [data-slot]')],before=cards.map(card=>card.querySelector('strong')?.textContent),firstAlly=document.querySelector('#timeline .slot.ally');firstAlly?.click();const reorder={selected:document.querySelectorAll('.slot.order-selected').length,swappable:document.querySelectorAll('.slot.swappable').length,locked:document.querySelectorAll('.slot.order-locked').length,dim:document.querySelector('.game-shell')?.classList.contains('reorder-mode')};const allies=[...document.querySelectorAll('#timeline .slot.ally')];allies.at(-1)?.click();const after=[...document.querySelectorAll('#timeline [data-slot]')].map(card=>card.querySelector('strong')?.textContent);document.querySelector('#mobile-time-button')?.click();const timeOptions=document.querySelectorAll('#time-popup [data-time]').length;document.querySelector('#close-time-popup')?.click();document.querySelector('#mobile-unit-dock')?.click();return JSON.stringify({before,after,reorder,timeOptions,skillDetail:Boolean(document.querySelector('.mobile-skill-detail'))})})()`,
    returnByValue: true,
  })
  const detailScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-card-detail-latest.png', import.meta.url), Buffer.from(detailScreenshot.data, 'base64'))
  const canvasRect = await send('Runtime.evaluate', { expression: `(()=>{const rect=document.querySelector('canvas').getBoundingClientRect();return JSON.stringify({left:rect.left,top:rect.top,width:rect.width,height:rect.height})})()`, returnByValue: true })
  const rect = JSON.parse(canvasRect.result.value)
  const toViewport = point => ({ x: rect.left + point.x / 960 * rect.width, y: rect.top + point.y / 680 * rect.height })
  const clickInternal = async internal => {
    const point = toViewport(internal)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
    await delay(100)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 })
    await delay(250)
  }
  const plansBeforeEnemyFocusEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify([...document.querySelectorAll('#timeline [data-slot]')].map(card=>card.querySelector('small')?.textContent??''))`, returnByValue: true })
  const plansBeforeEnemyFocus = JSON.parse(plansBeforeEnemyFocusEvaluation.result.value)
  await clickInternal({ x: 526, y: 184 })
  const enemyFocusEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({unitDock:document.querySelector('#mobile-unit-dock')?.innerText.slice(0,180)??'',attackDisabled:document.querySelector('[data-mobile-mode="일반공격"]')?.hasAttribute('disabled'),skillDisabled:document.querySelector('[data-mobile-mode="스킬"]')?.hasAttribute('disabled'),message:document.querySelector('#battle-message')?.textContent??''})`, returnByValue: true })
  const enemyFocusScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-enemy-focus-latest.png', import.meta.url), Buffer.from(enemyFocusScreenshot.data, 'base64'))
  await clickInternal({ x: 480, y: 112 })
  const enemyFocusExitEvaluation = await send('Runtime.evaluate', { expression: `(()=>{const plans=[...document.querySelectorAll('#timeline [data-slot]')].map(card=>card.querySelector('small')?.textContent??'');return JSON.stringify({message:document.querySelector('#battle-message')?.textContent??'',allActive:document.querySelector('[data-plan-view="all"]')?.classList.contains('active'),unitCleared:Boolean(document.querySelector('#mobile-unit-dock .mobile-empty')),plansUnchanged:JSON.stringify(plans)===JSON.stringify(${JSON.stringify(plansBeforeEnemyFocus)})})})()`, returnByValue: true })
  const enemyFocusExitScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-enemy-focus-exit-latest.png', import.meta.url), Buffer.from(enemyFocusExitScreenshot.data, 'base64'))
  await clickInternal({ x: 572, y: 256 })
  const rangedThreatFocusEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({focused:document.querySelector('#mobile-unit-dock')?.textContent?.includes('철탑 방위병')??false,message:document.querySelector('#battle-message')?.textContent??''})`, returnByValue: true })
  await delay(250)
  const rangedThreatFocusScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-ranged-enemy-focus-latest.png', import.meta.url), Buffer.from(rangedThreatFocusScreenshot.data, 'base64'))
  await clickInternal({ x: 480, y: 112 })
  const rangedThreatExitEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({message:document.querySelector('#battle-message')?.textContent??'',allActive:document.querySelector('[data-plan-view="all"]')?.classList.contains('active'),unitCleared:Boolean(document.querySelector('#mobile-unit-dock .mobile-empty'))})`, returnByValue: true })
  const rangedThreatExitScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-ranged-enemy-exit-latest.png', import.meta.url), Buffer.from(rangedThreatExitScreenshot.data, 'base64'))
  const start = toViewport({ x: 250, y: 328 })
  const next = toViewport({ x: 296, y: 352 })
  const second = toViewport({ x: 342, y: 328 })
  const alternate = toViewport({ x: 250, y: 376 })
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: next.x, y: next.y, button: 'left', buttons: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: second.x, y: second.y, button: 'left', buttons: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: second.x, y: second.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(350)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: next.x, y: next.y, button: 'left', buttons: 1, clickCount: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: alternate.x, y: alternate.y, button: 'left', buttons: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: alternate.x, y: alternate.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(350)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
  await delay(100)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: start.x, y: start.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(280)
  const pathResetEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({pathLength:document.querySelector('.game-shell')?.getAttribute('data-path-length'),pathEnd:document.querySelector('.game-shell')?.getAttribute('data-path-end')})`, returnByValue: true })
  const pathResetScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-path-reset-latest.png', import.meta.url), Buffer.from(pathResetScreenshot.data, 'base64'))
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: start.x, y: start.y, button: 'left', buttons: 1, clickCount: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: next.x, y: next.y, button: 'left', buttons: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: second.x, y: second.y, button: 'left', buttons: 1 })
  await delay(140)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: second.x, y: second.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(300)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: next.x, y: next.y, button: 'left', buttons: 1, clickCount: 1 })
  await delay(120)
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: alternate.x, y: alternate.y, button: 'left', buttons: 1 })
  await delay(120)
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: alternate.x, y: alternate.y, button: 'left', buttons: 0, clickCount: 1 })
  await delay(300)
  const gestureEvaluation = await send('Runtime.evaluate', { expression: `(()=>{const shell=document.querySelector('.game-shell'),pathLength=shell?.getAttribute('data-path-length'),pathEnd=shell?.getAttribute('data-path-end');document.querySelector('[data-mobile-mode="일반공격"]')?.click();return JSON.stringify({pathLength,pathEnd,midPathRedraw:pathLength==='3'&&pathEnd==='3,8',attackMode:document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active'),confirmDisabled:document.querySelector('#confirm-action')?.hasAttribute('disabled')})})()`, returnByValue: true })
  const gestureState = JSON.parse(gestureEvaluation.result.value)
  const movingTargetLinksScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-moving-target-links-latest.png', import.meta.url), Buffer.from(movingTargetLinksScreenshot.data, 'base64'))
  const cancelReadyEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({cancelEnabled:!document.querySelector('#cancel-action')?.hasAttribute('disabled'),attackMode:document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active')})`, returnByValue: true })
  await send('Runtime.evaluate', { expression: `document.querySelector('#cancel-action')?.click()` })
  await delay(220)
  const cancelActionEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({attackMode:document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active'),cancelDisabled:document.querySelector('#cancel-action')?.hasAttribute('disabled'),confirmDisabled:document.querySelector('#confirm-action')?.hasAttribute('disabled'),executeText:document.querySelector('#mobile-execute')?.innerText??''})`, returnByValue: true })
  const cancelActionScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-action-cancel-latest.png', import.meta.url), Buffer.from(cancelActionScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-mobile-mode="일반공격"]')?.click()` })
  await delay(220)
  const directionInternal = gestureState.pathEnd === '3,8' ? { x: 296, y: 352 } : gestureState.pathLength === '2' ? { x: 342, y: 328 } : { x: 296, y: 304 }
  const directionPoint = toViewport(directionInternal)
  const clickBoard = async () => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: directionPoint.x, y: directionPoint.y, button: 'left', buttons: 1, clickCount: 1 })
    await delay(100)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: directionPoint.x, y: directionPoint.y, button: 'left', buttons: 0, clickCount: 1 })
    await delay(250)
  }
  await clickBoard()
  const previewEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({confirmDisabled:document.querySelector('#confirm-action')?.hasAttribute('disabled'),hint:document.querySelector('.mobile-action-hint')?.textContent})`, returnByValue: true })
  await clickBoard()
  const quickConfirmEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({attackMode:document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active'),executeText:document.querySelector('#mobile-execute')?.innerText??''})`, returnByValue: true })
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-mobile-mode="일반공격"]')?.click()` })
  await delay(180)
  await send('Runtime.evaluate', { expression: `document.querySelector('#cancel-action')?.click()` })
  await delay(220)
  const confirmedCancelEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({attackMode:document.querySelector('[data-mobile-mode="일반공격"]')?.classList.contains('active'),executeText:document.querySelector('#mobile-execute')?.innerText??'',confirmText:document.querySelector('#confirm-action')?.textContent??''})`, returnByValue: true })
  const clickPoint = async internal => {
    const point = toViewport(internal)
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 })
    await delay(100)
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 })
    await delay(250)
  }
  await clickPoint({ x: 388, y: 352 })
  await send('Runtime.evaluate', { expression: `document.querySelector('[data-mobile-mode="스킬"]')?.click()` })
  await delay(250)
  await clickPoint({ x: 434, y: 328 })
  const forceIntentEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({skillMode:document.querySelector('[data-mobile-mode="스킬"]')?.classList.contains('active'),confirmDisabled:document.querySelector('#confirm-action')?.hasAttribute('disabled'),hint:document.querySelector('.mobile-action-hint')?.textContent})`, returnByValue: true })
  const forceIntentScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-force-intent-latest.png', import.meta.url), Buffer.from(forceIntentScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('#confirm-action')?.click()` })
  await delay(250)
  await clickPoint({ x: 480, y: 112 })
  const emptyDeselectEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({emptyPrompt:document.querySelector('#mobile-unit-dock .mobile-empty')?.textContent??'',attackDisabled:document.querySelector('[data-mobile-mode="일반공격"]')?.hasAttribute('disabled'),skillDisabled:document.querySelector('[data-mobile-mode="스킬"]')?.hasAttribute('disabled'),executeDisabled:document.querySelector('#mobile-execute')?.hasAttribute('disabled'),executeText:document.querySelector('#mobile-execute')?.innerText??'',pathLength:document.querySelector('.game-shell')?.getAttribute('data-path-length')})`, returnByValue: true })
  const emptyDeselectScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-empty-deselect-latest.png', import.meta.url), Buffer.from(emptyDeselectScreenshot.data, 'base64'))
  const enemyPlansBeforeResetEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify([...document.querySelectorAll('#timeline .slot.enemy small')].map(item=>item.textContent??''))`, returnByValue: true })
  const enemyPlansBeforeReset = JSON.parse(enemyPlansBeforeResetEvaluation.result.value)
  await send('Runtime.evaluate', { expression: `document.querySelector('#mobile-reset-plans')?.click()` })
  await delay(260)
  const resetPlansEvaluation = await send('Runtime.evaluate', { expression: `(()=>{const allies=[...document.querySelectorAll('#timeline .slot.ally small')].map(item=>item.textContent??''),enemies=[...document.querySelectorAll('#timeline .slot.enemy small')].map(item=>item.textContent??'');return JSON.stringify({buttonBelow:Boolean(document.querySelector('#mobile-execute')?.nextElementSibling?.matches('#mobile-reset-plans')),alliesReset:allies.every(action=>action==='대기'),enemyPlansUnchanged:JSON.stringify(enemies)===JSON.stringify(${JSON.stringify(enemyPlansBeforeReset)}),executeText:document.querySelector('#mobile-execute')?.innerText??'',allView:document.querySelector('[data-plan-view="all"]')?.classList.contains('active')})})()`, returnByValue: true })
  const resetPlansScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-reset-all-plans-latest.png', import.meta.url), Buffer.from(resetPlansScreenshot.data, 'base64'))
  await send('Runtime.evaluate', { expression: `document.querySelector('#mobile-execute')?.click()` })
  await delay(180)
  const partialExecuteEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({phase:document.querySelector('.game-shell')?.getAttribute('data-phase'),executing:Boolean(document.querySelector('.game-shell[data-phase="실행"]'))})`, returnByValue: true })
  await delay(520)
  const executionCurrentEvaluation = await send('Runtime.evaluate', { expression: `JSON.stringify({phase:document.querySelector('.game-shell')?.getAttribute('data-phase'),executingCards:document.querySelectorAll('#timeline .slot.executing').length,executingName:document.querySelector('#timeline .slot.executing strong')?.textContent??''})`, returnByValue: true })
  const executionCurrentScreenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  await writeFile(new URL('../standalone-execution-current-latest.png', import.meta.url), Buffer.from(executionCurrentScreenshot.data, 'base64'))
  console.log(JSON.stringify({ pageUrl, navigation, state: JSON.parse(evaluation.result.value), battleState: JSON.parse(battleEvaluation.result.value), actionToggleState:JSON.parse(actionToggleEvaluation.result.value), timeCloseState: JSON.parse(timeCloseEvaluation.result.value), timeFirstPressState:JSON.parse(timeFirstPressEvaluation.result.value), timeSecondPressState:JSON.parse(timeSecondPressEvaluation.result.value), canvasRect:{...rect,ratio:rect.width/rect.height,intrinsic:[1920,1360]}, uiInteraction: JSON.parse(uiInteraction.result.value), enemyFocusState: JSON.parse(enemyFocusEvaluation.result.value), enemyFocusExitState:JSON.parse(enemyFocusExitEvaluation.result.value), rangedThreatFocusState:JSON.parse(rangedThreatFocusEvaluation.result.value), rangedThreatExitState:JSON.parse(rangedThreatExitEvaluation.result.value), pathResetState:JSON.parse(pathResetEvaluation.result.value), gestureState, cancelReadyState:JSON.parse(cancelReadyEvaluation.result.value), cancelActionState:JSON.parse(cancelActionEvaluation.result.value), previewState: JSON.parse(previewEvaluation.result.value), quickConfirmState: JSON.parse(quickConfirmEvaluation.result.value), confirmedCancelState:JSON.parse(confirmedCancelEvaluation.result.value), forceIntentState: JSON.parse(forceIntentEvaluation.result.value), emptyDeselectState: JSON.parse(emptyDeselectEvaluation.result.value), resetPlansState:JSON.parse(resetPlansEvaluation.result.value), partialExecuteState: JSON.parse(partialExecuteEvaluation.result.value), executionCurrentState: JSON.parse(executionCurrentEvaluation.result.value), events }, null, 2))
} finally {
  socket?.close()
  chrome.kill()
}
