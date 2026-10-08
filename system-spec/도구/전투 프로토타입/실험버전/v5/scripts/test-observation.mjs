import { build } from 'esbuild'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

// Bundle the same TypeScript model shipped by Vite; skip presentation timers only.
globalThis.window={setTimeout:callback=>{queueMicrotask(callback);return 0}}
const result=await build({stdin:{contents:"export { BattleEngine } from './src/game/engine'; export { seedContent } from './src/game/content'; export { BattleRecord } from './src/game/battle-record'",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node',tsconfigRaw:{},plugins:[{name:'local-source',setup(build){build.onResolve({filter:/^\./},args=>({path:path.resolve(args.importer?path.dirname(args.importer):process.cwd(),args.path)+'.ts',namespace:'source'}));build.onLoad({filter:/.*/,namespace:'source'},async args=>({contents:await readFile(args.path,'utf8'),loader:'ts'}))}}]})
const {BattleEngine,seedContent,BattleRecord}=await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`)
for(const outcome of ['계획','승리','패배']){
  const engine=new BattleEngine(structuredClone(seedContent))
  engine.state.deployedAllyIds=engine.state.units.filter(unit=>unit.team==='아군').map(unit=>unit.id)
  engine.startBattle()
  const allySlot=engine.state.slots.find(slot=>slot.team==='아군')
  const ally=engine.state.units.find(unit=>unit.id===allySlot.unitId)
  allySlot.plan={path:[{...ally.position},{x:ally.position.x-1,y:ally.position.y}],action:{kind:'일반공격',direction:'상'}}
  const record=new BattleRecord(engine,()=>1)
  const original=structuredClone(engine.state)
  const eventsBefore=record.export().events.length
  const observation=engine.createObservation()
  if(outcome!=='계획')for(const unit of observation.state.units)if(unit.team===(outcome==='승리'?'적군':'아군'))unit.hp=0
  await observation.executeTurn()
  assert.equal(observation.state.phase,outcome)
  assert.deepEqual(engine.state,original,'Observation must preserve every original state field, including plans')
  assert.equal(record.export().events.length,eventsBefore,'Observation must not enter the real battle record')
  const repeat=engine.createObservation()
  assert.deepEqual(repeat.state,original,'Repeated observation must begin from the original plan')
  console.log(`PASS: ${outcome} observation / original state and record isolation / repeat`)
}
