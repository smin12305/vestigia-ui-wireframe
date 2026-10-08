import type { BattleEngine } from './engine'
export class BattleRecord{
  private startedAt=new Date().toISOString()
  private events:{sequence:number;at:string;stage:number;round:number;type:string;data:unknown}[]=[]
  constructor(private engine:BattleEngine,private stage:()=>number){
    engine.addEventListener('change',()=>this.add('state',engine.state))
    for(const type of ['battle-log','attack-presentation','counter-presentation','impact-presentation','combat-text','time-advance','shard-gain'])engine.addEventListener(type,event=>this.add(type,(event as CustomEvent).detail))
  }
  reset(){this.startedAt=new Date().toISOString();this.events=[]}
  add(type:string,data:unknown){this.events.push({sequence:this.events.length+1,at:new Date().toISOString(),stage:this.stage(),round:this.engine.state.round,type,data:structuredClone(data)})}
  export(){
    const stats:Record<string,{hits:number;damage:number;critical:number;counter:number;kills:number}>={}
    for(const event of this.events){
      if(event.type!=='impact-presentation')continue
      const hit=event.data as {actorId:string;damage:number;critical:boolean;actionKind:string;defeated:boolean}
      const key=`stage-${event.stage}:${hit.actorId}`
      const tally=stats[key]??={hits:0,damage:0,critical:0,counter:0,kills:0}
      tally.hits++;tally.damage+=hit.damage;tally.critical+=Number(hit.critical);tally.counter+=Number(hit.actionKind==='반격');tally.kills+=Number(hit.defeated)
    }
    return{schemaVersion:1,startedAt:this.startedAt,exportedAt:new Date().toISOString(),stage:this.stage(),outcome:this.engine.state.phase,content:structuredClone(this.engine.content),statisticsByStageAndActor:stats,finalState:structuredClone(this.engine.state),events:structuredClone(this.events)}
  }
}
