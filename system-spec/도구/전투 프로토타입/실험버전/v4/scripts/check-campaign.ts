import {stageContent,rewardChoices,healStageReward} from '../src/game/campaign'
import {BattleRecord} from '../src/game/battle-record'
import {seedContent} from '../src/game/content'
import {BattleEngine} from '../src/game/engine'
import {isPointInPattern} from '../src/game/patterns'
function check(ok:unknown,label:string){if(!ok)throw new Error(label);console.log('PASS '+label)}
const original=JSON.stringify(seedContent)
for(let stage=1;stage<=3;stage++){
 const c=stageContent(seedContent,stage)
 for(const enemy of c.characters.filter(u=>u.team==='적군')){
  const base=seedContent.characters.find(u=>u.id===enemy.id)!
  check(enemy.maxHp===base.maxHp+5*(stage-1)&&enemy.attackPower===base.attackPower+2*(stage-1),`stage ${stage} ${enemy.id} scaling`)
 }
}
const owned=new Set<string>()
while(owned.size<seedContent.relics.length){const offered=rewardChoices(seedContent,owned);check(offered.length===Math.min(3,seedContent.relics.length-owned.size)&&new Set(offered).size===offered.length&&!offered.some(id=>owned.has(id)),'unique reward pool');owned.add(offered[0])}
check(rewardChoices(seedContent,owned).length===0,'exhausted reward pool')
const bossStage=stageContent(seedContent,4,{angelica:0}),engine=new BattleEngine(bossStage,{},6)
check(!engine.state.units.some(u=>u.id==='angelica'),'fallen ally is not revived')
const ally=engine.state.units.find(u=>u.team==='아군')!;ally.hp=7
engine.setRelicLoadouts({과거:[seedContent.relics[0].id]})
check(engine.state.units.find(u=>u.id===ally.id)?.hp===7,'inventory preserves carried HP')
engine.state.deployedAllyIds=engine.state.units.filter(u=>u.team==='아군').map(u=>u.id)
engine.startBattle()
check(engine.state.slots.filter(s=>s.team==='적군')[0].unitId==='fallen_paladin','boss acts before escorts')
const boss=engine.state.units.find(u=>u.id==='fallen_paladin')!
check(boss.hp===100&&boss.attackPower===10&&boss.moveRange===5&&boss.criticalRate===150,'boss stats')
check(engine.state.units.filter(u=>u.team==='적군').length===3,'boss and two escorts')
check(isPointInPattern({x:2,y:2},{x:3,y:5},'십자폭3_3',3)&&!isPointInPattern({x:2,y:2},{x:4,y:4},'십자폭3_3',3),'wide cross includes arm and excludes corner')
check(JSON.stringify(seedContent)===original,'source content unchanged')
// Exercise actual damage/status resolution, without starting a browser playtest.
Object.assign(globalThis,{window:{setTimeout:(callback:()=>void)=>{callback();return 0}}})
const combat=new BattleEngine(stageContent(seedContent,4),{},6)
combat.state.phase='계획'
const actor=combat.state.units.find(u=>u.id==='fallen_paladin')!,targets=combat.state.units.filter(u=>u.team==='아군')
actor.position={x:2,y:0}
targets.forEach((u,i)=>{u.position={x:2,y:i+1};u.hp=u.maxHp;u.statuses=[]})
targets[0].statuses=[{type:'띄워짐',appliedRound:1}]
const before=targets.map(u=>u.hp)
await (combat as any).executeAction(actor,{path:[actor.position],action:{kind:'일반공격',direction:'하'}})
check(targets.every((u,i)=>before[i]-u.hp===(i===0?15:10)),'boss forward 3 cells damage and 150% critical')
targets.forEach((u,i)=>{u.hp=u.maxHp;u.statuses=[];u.position=i===0?{x:3,y:3}:i===1?{x:0,y:2}:{x:2,y:2}})
actor.position={x:2,y:0}
const beforeSkill=targets.map(u=>u.hp)
await (combat as any).executeAction(actor,{path:[actor.position],action:{kind:'스킬',selfConfirmed:true}})
check(beforeSkill[0]-targets[0].hp===10&&targets[0].statuses.some(s=>s.type==='기절'),'boss skill damage and stun')
check(beforeSkill[1]===targets[1].hp&&!targets[1].statuses.length,'cross corner not damaged')
check(actor.cooldownRemaining===2,'boss skill cooldown')
check(seedContent.skills.find(s=>s.id==='snipe')?.effects.find(e=>e.type==='피해')?.value===10,'Angelica skill damage 10')
const debugEngine=new BattleEngine(stageContent(seedContent,2),{},6)
const debugHp=debugEngine.state.units.filter(u=>u.team==='아군').map(u=>u.hp)
check(debugEngine.debugWinStage()&&debugEngine.state.phase==='승리'&&debugEngine.state.units.filter(u=>u.team==='적군').every(u=>u.hp===0),'debug actual stage victory')
check(JSON.stringify(debugHp)===JSON.stringify(debugEngine.state.units.filter(u=>u.team==='아군').map(u=>u.hp)),'debug preserves ally HP')
const revived=stageContent(seedContent,3,{isaac:30,angelica:0,mercan:12})
check(revived.characters.some(u=>u.id==='isaac')&&!revived.characters.some(u=>u.id==='angelica'),'revival restores selected ally only')
const recovery=[{id:'a',team:'아군',hp:10,maxHp:60},{id:'b',team:'아군',hp:29,maxHp:30},{id:'c',team:'아군',hp:0,maxHp:50},{id:'e',team:'적군',hp:10,maxHp:100}]
healStageReward(recovery)
check(recovery[0].hp===22&&recovery[1].hp===30&&recovery[2].hp===0&&recovery[3].hp===10,'20% healing capped, no revival or enemy healing')
const recorder=new BattleRecord(combat,()=>4)
for(let i=0;i<55;i++)(combat as any).log(`event ${i}`)
combat.dispatchEvent(new CustomEvent('impact-presentation',{detail:{actorId:actor.id,damage:15,critical:true,actionKind:'반격',defeated:true}}))
combat.state.phase='패배'
const exported=JSON.parse(JSON.stringify(recorder.export()))
check(exported.events.filter((e:any)=>e.type==='battle-log').length===55,'export keeps logs beyond HUD limit')
check(exported.outcome==='패배'&&exported.statisticsByStageAndActor['stage-4:fallen_paladin'].damage===15,'JSON outcome and statistics')
recorder.reset();check(recorder.export().events.length===0,'new run clears recorder')
const orderEngine=new BattleEngine(stageContent(seedContent,1),{},6)
orderEngine.enemyAiEnabled=false
orderEngine.state.deployedAllyIds=orderEngine.state.units.filter(u=>u.team==='아군').map(u=>u.id)
orderEngine.startBattle()
const allyIndexes=orderEngine.state.slots.flatMap((s,i)=>s.team==='아군'?[i]:[])
orderEngine.swapAllySlots(allyIndexes[0],allyIndexes[2])
const remembered=orderEngine.state.slots.filter(s=>s.team==='아군').map(s=>s.unitId)
await orderEngine.executeTurn()
check(JSON.stringify(orderEngine.state.slots.filter(s=>s.team==='아군').map(s=>s.unitId))===JSON.stringify(remembered),'ally order retained after turn execution')
check(orderEngine.state.firstTeam==='적군','initiative still alternates')
orderEngine.state.units.find(u=>u.id===remembered[1])!.hp=0
await orderEngine.executeTurn()
check(JSON.stringify(orderEngine.state.slots.filter(s=>s.team==='아군').map(s=>s.unitId))===JSON.stringify([remembered[0],remembered[2]]),'survivors retain relative order')
