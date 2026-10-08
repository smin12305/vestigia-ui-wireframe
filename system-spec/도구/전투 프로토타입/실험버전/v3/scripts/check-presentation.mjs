import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

// Check combat event contracts without launching or playing the browser game.
const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const bundle=await build({stdin:{contents:"export { BattleEngine } from './game/engine'; export { seedContent } from './game/content'",resolveDir:path.join(projectRoot,'src')},absWorkingDir:projectRoot,bundle:true,write:false,format:'esm',platform:'node'})
const {BattleEngine,seedContent}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'))
let elapsed=0
globalThis.window={setTimeout(callback,ms){elapsed+=ms;queueMicrotask(callback);return 0}}
function scenario(id,time='현재'){
 const engine=new BattleEngine(structuredClone(seedContent),{},6)
 const actor=engine.state.units.find(unit=>unit.id===id),target=engine.state.units.find(unit=>unit.team==='적군')
 actor.position={x:2,y:2};target.position={x:3,y:2}
 engine.state.phase='실행';engine.state.currentTime=time
 engine.state.units=[actor,target];engine.state.deployedAllyIds=[actor.id]
 return{engine,actor,target}
}
for(const [id,kind,time] of [['isaac','일반공격','현재'],['angelica','일반공격','현재'],['isaac','스킬','과거'],['angelica','스킬','과거']]){
 elapsed=0
 const {engine,actor,target}=scenario(id,time),hp=target.hp
 let expected,impact,visibleHp
 engine.addEventListener('attack-presentation',event=>{expected=elapsed+event.detail.durationMs;assert.equal(target.hp,hp)})
 engine.addEventListener('change',()=>{visibleHp=target.hp})
 engine.addEventListener('impact-presentation',event=>{impact=elapsed;assert.equal(visibleHp,target.hp);assert.equal(hp-target.hp,Math.min(hp,event.detail.damage))})
 await engine.executeAction(actor,{path:[actor.position],action:{kind,direction:'우',selfConfirmed:true}})
 assert.ok(expected!==undefined&&impact!==undefined,id+' must produce attack and impact')
 assert.equal(impact,expected,id+' damage must land at the advertised impact boundary')
 console.log('PASS impact timing / HP visibility:',id,kind,time)
}
{
 elapsed=0
 const {engine,actor,target}=scenario('mercan','미래')
 actor.statuses=[{type:'반격',enhanced:true,appliedRound:1,triggeredTargetIds:[]}]
 let expected,impact
 engine.addEventListener('counter-presentation',event=>{expected=elapsed+event.detail.durationMs})
 engine.addEventListener('impact-presentation',()=>{impact=elapsed;assert.ok(target.statuses.some(status=>status.type==='기절'))})
 await engine.triggerCounters(target,'범위 진입')
 assert.equal(impact,expected);assert.ok(impact!==undefined)
 console.log('PASS counter timing / immediate stun')
}
{
 const {engine,actor,target}=scenario('isaac')
 target.hp=1
 engine.state.slots=[{number:1,team:'적군',unitId:target.id,plan:{path:[target.position],action:{kind:'없음'}}}]
 let phaseAtImpact
 engine.addEventListener('impact-presentation',()=>{phaseAtImpact=engine.state.phase})
 await engine.executeAction(actor,{path:[actor.position],action:{kind:'일반공격',direction:'우'}})
 assert.equal(target.hp,0);assert.equal(engine.state.slots[0].result,'취소')
 assert.equal(phaseAtImpact,'실행')
 engine.checkOutcome();assert.equal(engine.state.phase,'승리')
 console.log('PASS death before result transition / pending action cancellation')
}
