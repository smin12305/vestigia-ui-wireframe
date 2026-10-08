import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root=resolve('user-baseline')
const sourcePath=resolve(root,'source-index.html')
const outputPath=resolve(root,'index.html')
let html=await readFile(sourcePath,'utf8')

// 행동 순서 영역에 따로 잘라 붙인 두 번째 배경만 제거한다.
// Phaser 전투판의 원본 배경 한 장과 기존 카메라·말판 좌표는 그대로 둔다.
const duplicateTimelineBackground='<img class="timeline-background" src="${fs}" alt="" aria-hidden="true">'
if(!html.includes(duplicateTimelineBackground))throw new Error('기준본에서 중복 행동 순서 배경을 찾지 못했습니다.')
html=html.replace(duplicateTimelineBackground,'')

const entryStyles=String.raw`
<style id="waredo-entry-mode-style">
  .waredo-entry-gate{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));background:#040a0e;color:#f2fbff;font-family:Pretendard,Noto Sans KR,Malgun Gothic,Arial,sans-serif}
  .waredo-entry-card{width:min(720px,92vw);padding:clamp(20px,3vw,34px);border:1px solid #4e8292;border-radius:16px;background:linear-gradient(145deg,#102630,#071318);box-shadow:0 24px 80px #000c}
  .waredo-entry-card small{display:block;color:#63d9f3;font-size:10px;font-weight:900;letter-spacing:.16em}
  .waredo-entry-card h2{margin:6px 0 7px;font-size:clamp(25px,3.4vw,42px);line-height:1.2}
  .waredo-entry-card p{margin:0;color:#b5c8ce;font-size:clamp(12px,1.2vw,16px);line-height:1.55}
  .waredo-mode-buttons{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:22px}
  .waredo-mode-buttons button{min-height:130px;padding:18px;text-align:left;border:1px solid #416675;border-radius:12px;background:#10232b;color:#eefbff}
  .waredo-mode-buttons button:hover,.waredo-mode-buttons button:focus-visible{border-color:#63dffa;background:#173440;box-shadow:0 0 20px #38badb44}
  .waredo-mode-buttons b,.waredo-mode-buttons span{display:block}.waredo-mode-buttons b{font-size:25px}.waredo-mode-buttons span{margin-top:8px;color:#a9c0c7;font-size:11px;line-height:1.45}
  .waredo-rotate-card{text-align:center}.waredo-rotate-icon{width:82px;height:82px;margin:0 auto 16px;display:grid;place-items:center;border:2px solid #63dff7;border-radius:50%;color:#72e5ff;font-size:45px;box-shadow:0 0 25px #4bd0ef44}
  .waredo-environment-control{border-color:#59cde8!important;color:#e9fbff!important;background:linear-gradient(135deg,#12303b,#0a1c23)!important}
  .waredo-settings-control{order:20}
  .waredo-entry-gate [hidden]{display:none!important}
  html,body{width:100%;height:100%;min-width:0!important;min-height:0!important;overflow:hidden!important;background:#03080b}
  /* 모바일/PC 모두 1920×1080 PC 프레임을 한 덩어리로 축소한다. 내부 HUD와 말판은 재배치하지 않는다. */
  .game-shell{position:fixed!important;left:50%!important;top:50%!important;width:1920px!important;height:1080px!important;min-width:1920px!important;min-height:1080px!important;max-width:none!important;max-height:none!important;margin:0!important;transform:translate(-50%,-50%) scale(var(--waredo-frame-scale,1))!important;transform-origin:center center!important;overflow:hidden!important}
  /* 모바일 모드는 PC 좌표계를 유지하면서 HUD 묶음만 165% 확대한다. transform을 사용해 글자·아이콘·여백을 함께 보존한다. */
  html[data-play-mode="mobile"]{--waredo-mobile-ui-scale:1.65}
  html[data-play-mode="mobile"] .timeline-wrap{z-index:90!important;overflow:visible!important;isolation:isolate}
  html[data-play-mode="mobile"] .timeline{position:relative;z-index:92!important;transform:scale(var(--waredo-mobile-ui-scale));transform-origin:top center}
  html[data-play-mode="mobile"] .reorder-toggle{position:absolute!important;z-index:93!important;left:11.5%!important;top:3px!important;width:82px!important;min-width:82px!important;flex-basis:82px!important;height:58px!important;margin:0!important;padding:5px!important;transform:scale(var(--waredo-mobile-ui-scale));transform-origin:top left;font-size:10px!important;line-height:1.15}
  html[data-play-mode="mobile"] .reorder-toggle:before{margin-bottom:3px!important;font-size:16px!important}
  html[data-play-mode="mobile"] .header-actions{z-index:94!important;transform:scale(var(--waredo-mobile-ui-scale));transform-origin:top right}
  html[data-play-mode="mobile"] .mobile-time-dock{transform:scale(var(--waredo-mobile-ui-scale));transform-origin:top left}
  html[data-play-mode="mobile"] .mobile-unit-dock{width:17.5%!important;min-height:12.5%!important;padding:.45%!important;gap:.45rem!important;transform:scale(var(--waredo-mobile-ui-scale));transform-origin:bottom left}
  html[data-play-mode="mobile"] .mobile-unit-portrait{width:25%!important;min-height:68px!important;border-radius:8px!important}
  html[data-play-mode="mobile"] .mobile-unit-main>small{font-size:11px!important;line-height:1.15}
  html[data-play-mode="mobile"] .mobile-unit-main>b{font-size:22px!important;line-height:1.08;margin-top:1px}
  html[data-play-mode="mobile"] .mobile-unit-main p{margin:3px 0!important;font-size:12px!important;line-height:1.22}
  html[data-play-mode="mobile"] .mobile-unit-main em{padding:1px 5px!important;font-size:10px!important;line-height:1.25}
  html[data-play-mode="mobile"] .mobile-hp{height:6px!important;margin-top:3px!important}
  html[data-play-mode="mobile"] .mobile-skill-detail{padding:6px!important}
  html[data-play-mode="mobile"] .mobile-skill-detail strong{font-size:11px!important}
  html[data-play-mode="mobile"] .mobile-skill-detail span{font-size:9px!important}
  html[data-play-mode="mobile"] .mobile-skill-detail small{font-size:8px!important}
  html[data-play-mode="mobile"] .mobile-action-dock{transform:scale(var(--waredo-mobile-ui-scale));transform-origin:bottom right}
  html[data-play-mode="mobile"] .mobile-execute-dock{transform:scale(var(--waredo-mobile-ui-scale));transform-origin:top right}
  html[data-play-mode="mobile"] .game-shell[data-phase="배치"] .deployment-dock:not(.hidden){left:50%!important;right:auto!important;width:58%!important;transform:translateX(-50%) scale(var(--waredo-mobile-ui-scale));transform-origin:top center}
  html[data-play-mode="mobile"] .main-menu{transform:scale(var(--waredo-mobile-ui-scale));transform-origin:left center}
  html[data-play-mode="mobile"] .settings-card,
  html[data-play-mode="mobile"] .time-popup-card{transform:scale(var(--waredo-mobile-ui-scale));transform-origin:center center}
  /* 외곽 패널 크기는 유지하고 글자만 한 단계 키운다. 고정 폭에서는 말줄임과 짧은 행간으로 넘침을 막는다. */
  html[data-play-mode="mobile"] .title h1{font-size:19px!important}
  html[data-play-mode="mobile"] .title p{font-size:11px!important}
  html[data-play-mode="mobile"] .timeline-label{font-size:12px!important}
  html[data-play-mode="mobile"] .slot i{font-size:11px!important}
  html[data-play-mode="mobile"] .slot{width:112px!important;min-width:112px!important;padding-left:16px!important;padding-right:7px!important}
  html[data-play-mode="mobile"] .slot strong{font-size:13px!important;line-height:1.05}
  html[data-play-mode="mobile"] .slot small{font-size:10px!important;margin-top:3px!important;line-height:1.05}
  html[data-play-mode="mobile"] .mobile-watch b{font-size:16px!important}
  html[data-play-mode="mobile"] .mobile-watch small{font-size:10px!important}
  html[data-play-mode="mobile"] .mobile-action-hint{font-size:9px!important;line-height:1.3}
  html[data-play-mode="mobile"] .combat-button span{font-size:17px!important;line-height:1.05}
  html[data-play-mode="mobile"] .combat-button small{font-size:9px!important}
  html[data-play-mode="mobile"] .confirm-action{font-size:12px!important}
  html[data-play-mode="mobile"] .mobile-execute span{font-size:14px!important}
  html[data-play-mode="mobile"] .mobile-execute small{font-size:8px!important;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  /* 전투 진입 전 화면은 고정 레이아웃을 유지하면서 안내 문자의 실물 크기만 높인다. */
  html[data-play-mode="mobile"] .deployment-heading small{font-size:11px!important}
  html[data-play-mode="mobile"] .deployment-heading b{font-size:20px!important;line-height:1.15}
  html[data-play-mode="mobile"] .deployment-heading span{font-size:11px!important;line-height:1.35}
  html[data-play-mode="mobile"] .deployment-roster span b{font-size:15px!important;line-height:1.1}
  html[data-play-mode="mobile"] .deployment-roster span small{font-size:10px!important;line-height:1.25;margin-top:3px!important}
  html[data-play-mode="mobile"] .deployment-confirm>span b{font-size:15px!important}
  html[data-play-mode="mobile"] .deployment-confirm>span small{font-size:10px!important;line-height:1.25}
  html[data-play-mode="mobile"] .deployment-confirm>button{font-size:18px!important}
  html[data-play-mode="mobile"] .front-dialog>small{font-size:12px!important}
  html[data-play-mode="mobile"] .front-dialog h2{font-size:40px!important;line-height:1.15}
  html[data-play-mode="mobile"] .front-dialog>p{font-size:14px!important;line-height:1.45}
  html[data-play-mode="mobile"] .size-select button span{font-size:15px!important}
  html[data-play-mode="mobile"] .size-select button em{font-size:12px!important}
  html[data-play-mode="mobile"] .front-back{font-size:13px!important}
  html[data-play-mode="mobile"] .coin-toss p b{font-size:30px!important}
  html[data-play-mode="mobile"] .coin-toss p span{font-size:13px!important}
  html[data-play-mode="mobile"] .main-copy p{font-size:16px!important}
  html[data-play-mode="mobile"] .main-menu>button{font-size:16px!important}
  @media(max-width:680px){.waredo-mode-buttons{grid-template-columns:1fr}.waredo-mode-buttons button{min-height:92px}.waredo-entry-card{max-height:calc(100dvh - 28px);overflow:auto}}
</style>`

const entryScript=String.raw`
<script id="waredo-entry-mode-script">
(()=>{
  const MODE_KEY='waredo-display-mode';
  const isPortrait=()=>innerHeight>innerWidth;
  let gate;
  const updateFixedFrame=()=>{
    const viewport=window.visualViewport;
    const width=viewport?.width||innerWidth;
    const height=viewport?.height||innerHeight;
    const scale=Math.min(width/1920,height/1080);
    document.documentElement.style.setProperty('--waredo-frame-scale',String(scale));
  };
  const requestFullscreen=()=>{
    if(document.fullscreenElement||!document.fullscreenEnabled)return;
    const result=document.documentElement.requestFullscreen?.({navigationUI:'hide'});
    if(result&&typeof result.catch==='function')result.catch(()=>{});
  };
  const updateFullscreenLabels=()=>{
    document.querySelectorAll('[data-waredo-fullscreen]').forEach(button=>{
      const active=Boolean(document.fullscreenElement);
      button.querySelector('strong')?.replaceChildren(active?'전체화면 종료':'전체화면 시작');
      button.querySelector('span')?.replaceChildren(active?'전체화면에서 나갑니다.':'브라우저 주소창을 숨기고 실행합니다.');
    });
  };
  const closeGate=()=>{gate?.remove();gate=undefined};
  const setMode=mode=>{
    localStorage.setItem(MODE_KEY,mode);
    document.documentElement.dataset.playMode=mode;
  };
  const updateGate=()=>{
    if(!gate)return;
    const rotate=gate.querySelector('[data-waredo-rotate]');
    const choice=gate.querySelector('[data-waredo-choice]');
    // 카카오톡 인앱 브라우저처럼 터치 판정이 불안정한 환경도 있으므로
    // 기기 종류가 아니라 실제 화면 방향만 보고 회전 안내를 우선 표시한다.
    const needsRotate=isPortrait();
    rotate.hidden=!needsRotate;
    choice.hidden=needsRotate;
  };
  const openGate=()=>{
    closeGate();
    gate=document.createElement('div');
    gate.className='waredo-entry-gate';
    gate.setAttribute('role','dialog');
    gate.setAttribute('aria-modal','true');
    gate.innerHTML='<section class="waredo-entry-card waredo-rotate-card" data-waredo-rotate><div class="waredo-rotate-icon">↻</div><small>MOBILE DISPLAY</small><h2>기기를 가로로 돌려주세요</h2><p>가로 화면이 확인되면 플레이 환경 선택으로 자동 이동합니다.</p></section><section class="waredo-entry-card" data-waredo-choice><small>PLAY ENVIRONMENT</small><h2>플레이 환경을 선택하세요</h2><p>이번 버전에서는 모바일과 PC 모두 같은 고정 UI를 사용합니다. 선택 후 전체화면 전환을 요청합니다.</p><div class="waredo-mode-buttons"><button data-waredo-mode="mobile"><b>모바일 모드</b><span>가로 화면 · 터치 조작 · PC와 동일한 UI</span></button><button data-waredo-mode="pc"><b>PC 모드</b><span>가로 화면 · 마우스 조작 · 기존 UI 그대로</span></button></div></section>';
    document.body.appendChild(gate);
    updateGate();
  };
  const makeEnvironmentButton=()=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='waredo-environment-control';
    button.dataset.waredoEnvironment='';
    button.innerHTML='<strong>플레이 환경 변경</strong><span>모바일 / PC 선택 후 전체화면으로 전환</span>';
    return button;
  };
  const makeFullscreenButton=()=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='waredo-environment-control';
    button.dataset.waredoFullscreen='';
    button.innerHTML='<strong>전체화면 시작</strong><span>브라우저 주소창을 숨기고 실행합니다.</span>';
    return button;
  };
  const ensureControls=()=>{
    const gameDescription=document.querySelector('.main-menu [data-main-info="game"]');
    if(gameDescription&&!document.querySelector('.main-menu [data-waredo-environment]')){
      const button=makeEnvironmentButton();
      button.innerHTML='플레이 환경 / 전체화면';
      gameDescription.insertAdjacentElement('afterend',button);
    }
    const settingsBody=document.querySelector('#settings-modal .settings-body');
    if(settingsBody&&!settingsBody.querySelector('[data-waredo-environment]')){
      const environment=makeEnvironmentButton();
      environment.classList.add('waredo-settings-control');
      settingsBody.appendChild(environment);
      const fullscreen=makeFullscreenButton();
      fullscreen.classList.add('waredo-settings-control');
      settingsBody.appendChild(fullscreen);
      updateFullscreenLabels();
    }
  };
  document.addEventListener('click',event=>{
    const modeButton=event.target.closest('[data-waredo-mode]');
    if(modeButton){setMode(modeButton.dataset.waredoMode);requestFullscreen();closeGate();return}
    if(event.target.closest('[data-waredo-environment]')){openGate();return}
    if(event.target.closest('[data-waredo-fullscreen]')){
      if(document.fullscreenElement)document.exitFullscreen?.();else requestFullscreen();
    }
  });
  addEventListener('resize',()=>{updateGate();updateFixedFrame()});
  addEventListener('orientationchange',()=>setTimeout(()=>{updateGate();updateFixedFrame()},100));
  window.visualViewport?.addEventListener('resize',updateFixedFrame);
  document.addEventListener('fullscreenchange',()=>{updateFullscreenLabels();updateFixedFrame()});
  new MutationObserver(ensureControls).observe(document.body,{childList:true,subtree:true});
  ensureControls();
  const saved=localStorage.getItem(MODE_KEY);
  if(saved==='mobile'||saved==='pc')document.documentElement.dataset.playMode=saved;
  updateFixedFrame();
  openGate();
})();
</script>`

const insertBeforeLast=(source,needle,addition)=>{
  const index=source.lastIndexOf(needle)
  if(index<0)throw new Error(`${needle} 마감 태그를 찾지 못했습니다.`)
  return source.slice(0,index)+addition+'\n'+source.slice(index)
}
html=insertBeforeLast(html,'</head>',entryStyles)
html=insertBeforeLast(html,'</body>',entryScript)
await writeFile(outputPath,html,'utf8')
console.log(`사용자 기준본 생성 완료: ${outputPath}`)
