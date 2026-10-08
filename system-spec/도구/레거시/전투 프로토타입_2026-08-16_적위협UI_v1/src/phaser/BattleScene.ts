import Phaser from 'phaser'
import { BOARD_SIZE, BattleEngine, distance, rebasePath } from '../game/engine'
import type { CombatTextEvent, Direction, ForcedMovePreview, Point, Unit } from '../game/types'
import { isPointInPattern } from '../game/patterns'

const CELL=72,OFFSET=36
const directionVector:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
export type InputMode='이동'|'일반공격'|'스킬'

export class BattleScene extends Phaser.Scene{
  private layer?:Phaser.GameObjects.Container
  private mode:InputMode='이동'
  private focusOnly=false
  private threatFocusSlot?:number
  private fxLanes=new Map<string,number>()
  private previousLinks=new Map<string,boolean>()
  constructor(private engine:BattleEngine){super('battle')}
  create(){this.cameras.main.setBackgroundColor('#080d10');this.engine.addEventListener('change',()=>this.renderBoard());this.engine.addEventListener('combat-text',event=>this.showCombatText((event as CustomEvent<CombatTextEvent>).detail));this.renderBoard()}
  setInputMode(mode:InputMode){this.mode=mode;this.renderBoard()}
  getInputMode(){return this.mode}
  toggleFocusOnly(){if(this.threatFocusSlot!==undefined){this.threatFocusSlot=undefined;this.focusOnly=false}else this.focusOnly=!this.focusOnly;this.renderBoard();return this.focusOnly}
  getFocusOnly(){return this.focusOnly}
  setThreatFocus(slotIndex:number){this.focusOnly=false;this.threatFocusSlot=this.threatFocusSlot===slotIndex?undefined:slotIndex;this.renderBoard();return this.threatFocusSlot}
  clearThreatFocus(){this.threatFocusSlot=undefined;this.renderBoard()}
  getThreatFocus(){return this.threatFocusSlot}
  private isVisibleSlot(index:number){if(this.threatFocusSlot!==undefined)return index===this.threatFocusSlot;return !this.focusOnly||(this.engine.state.phase==='실행'?index===this.engine.state.executingSlot:index===this.engine.state.selectedSlot)}
  private isEmphasizedSlot(index:number){return this.threatFocusSlot!==undefined?index===this.threatFocusSlot:(this.engine.state.phase==='실행'?index===this.engine.state.executingSlot:index===this.engine.state.selectedSlot)}

  private renderBoard(){
    this.layer?.destroy(true);const layer=this.add.container(0,0);this.layer=layer
    const time=this.engine.state.currentTime,palette=time==='과거'?[0x30251e,0x3a2c22]:time==='미래'?[0x112b2b,0x153536]:[0x172228,0x1b2a31]
    for(let y=0;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++){
      const p={x,y},selectedPath=this.engine.selectedPlan?.path.some(v=>v.x===x&&v.y===y)??false,targetable=this.isTargetable(p),inCastRange=this.isInCastRange(p)
      const deploy=this.engine.state.phase==='배치'
      const fill=selectedPath?0xb99a4c:inCastRange?0x193f4d:targetable?0x33281d:deploy?(y>=6?0x173844:0x422728):palette[(x+y)%2]
      const stroke=selectedPath?0xffdd82:inCastRange?0x63c9f0:targetable?0xd98b38:0x37505a
      const tile=this.add.rectangle(OFFSET+x*CELL,OFFSET+y*CELL,CELL-3,CELL-3,fill).setStrokeStyle(selectedPath||targetable?2:1,stroke,targetable?1:.85).setInteractive({useHandCursor:true})
      tile.on('pointerdown',()=>this.handlePoint(p));layer.add(tile)
    }
    this.drawAllPaths(layer)
    this.drawTargetingOrigin(layer)
    this.drawTargetLinks(layer)
    this.drawDirectionIntents(layer)
    this.engine.livingUnits.forEach(unit=>this.drawUnit(layer,unit))
    this.drawThreatOutcomeBadges(layer)
    if(this.engine.state.phase==='실행'&&this.engine.state.executingSlot>=0){const slot=this.engine.state.slots[this.engine.state.executingSlot],unit=this.engine.state.units.find(u=>u.id===slot?.unitId);if(unit){const marker=this.add.circle(OFFSET+unit.position.x*CELL,OFFSET+unit.position.y*CELL,31,0xffffff,0).setStrokeStyle(4,0xffd56a,1);layer.add(marker)}}
  }

  private drawTargetingOrigin(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return
    const origin=this.engine.selectedPlan?.path.at(-1);if(!origin)return
    const x=OFFSET+origin.x*CELL,y=OFFSET+origin.y*CELL
    const marker=this.add.circle(x,y,27,0x71d6b5,.1).setStrokeStyle(3,0x8ff0cf,1)
    const label=this.add.text(x,y-25,'공격 기준',{fontFamily:'sans-serif',fontSize:'9px',fontStyle:'bold',color:'#d6fff0',backgroundColor:'#173b34'}).setOrigin(.5,1).setPadding(4,2)
    layer.add([marker,label])
  }

  private drawDirectionIntents(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획')return
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex))return
      if(!slot.plan.action.direction||slot.plan.action.kind==='없음')return
      const actor=this.engine.state.units.find(unit=>unit.id===slot.unitId);if(!actor)return
      const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor);if(!definition)return
      const origin=slot.plan.path.at(-1);if(!origin)return
      const vector=directionVector[slot.plan.action.direction],points:Point[]=[]
      for(let step=1;step<=definition.range;step++){const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step};if(point.x<0||point.y<0||point.x>=BOARD_SIZE||point.y>=BOARD_SIZE)break;points.push(point)}
      if(!points.length)return
      const active=this.isEmphasizedSlot(slotIndex),color=slot.team==='적군'?0xef746e:0x66d3eb,alpha=active?.9:slot.team==='적군'?.58:.25
      const graphics=this.add.graphics().setDepth(active?50:36),originX=OFFSET+origin.x*CELL,originY=OFFSET+origin.y*CELL
      for(const point of points){const x=OFFSET+point.x*CELL,y=OFFSET+point.y*CELL;graphics.fillStyle(color,alpha*.17).fillRect(x-CELL/2+5,y-CELL/2+5,CELL-10,CELL-10);graphics.lineStyle(active?2:1,color,alpha*.72).strokeRect(x-CELL/2+5,y-CELL/2+5,CELL-10,CELL-10)}
      const end=points[points.length-1],endX=OFFSET+end.x*CELL,endY=OFFSET+end.y*CELL
      graphics.lineStyle(active?3:2,color,alpha).beginPath().moveTo(originX,originY).lineTo(endX,endY).strokePath()
      const labelX=(originX+endX)/2-vector.y*14,labelY=(originY+endY)/2+vector.x*14
      const attackLabel=this.add.text(labelX,labelY,`공격 ${({상:'↑',하:'↓',좌:'←',우:'→'} as Record<Direction,string>)[slot.plan.action.direction]}`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:active?'11px':'9px',fontStyle:'bold',color:slot.team==='적군'?'#ffd0cb':'#c8f5ff',backgroundColor:slot.team==='적군'?'#4a1f22':'#123743',stroke:'#071013',strokeThickness:2}).setOrigin(.5).setPadding(5,3).setDepth(active?53:39).setAlpha(alpha)
      layer.add([graphics,attackLabel])
      for(const preview of this.engine.getForcedMovePreviews(slotIndex))this.drawForcedMovePreview(layer,preview,active,alpha)
    })
  }

  private drawForcedMovePreview(layer:Phaser.GameObjects.Container,preview:ForcedMovePreview,active:boolean,baseAlpha:number){
    const target=this.engine.state.units.find(unit=>unit.id===preview.targetId);if(!target)return
    const x1=OFFSET+preview.from.x*CELL,y1=OFFSET+preview.from.y*CELL,x2=OFFSET+preview.to.x*CELL,y2=OFFSET+preview.to.y*CELL
    const alpha=active?1:Math.max(.42,baseAlpha),color=preview.type==='밀치기'?0xffcf5a:0xc99cff,graphics=this.add.graphics().setDepth(active?70:55)
    if(preview.immune||preview.moved===0){
      graphics.lineStyle(3,color,alpha).strokeCircle(x1,y1,27)
      const cross=this.add.text(x1,y1,'×',{fontFamily:'sans-serif',fontSize:'28px',fontStyle:'bold',color:preview.immune?'#d8e0e3':'#ffb16f',stroke:'#071013',strokeThickness:5}).setOrigin(.5).setDepth(active?73:58).setAlpha(alpha)
      const text=this.add.text(x1,y1-34,preview.immune?`${preview.type} 면역`:`${preview.type} 0 · 막힘`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'10px',fontStyle:'bold',color:preview.immune?'#e5ecef':'#ffd09b',backgroundColor:'#2a2020'}).setOrigin(.5,1).setPadding(5,3).setDepth(active?74:59).setAlpha(alpha)
      layer.add([graphics,cross,text]);return
    }
    if(preview.type==='밀치기')graphics.lineStyle(active?8:5,color,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
    else this.drawDashedLine(graphics,x1,y1,x2,y2,color,alpha,active?6:4)
    const dx=x2-x1,dy=y2-y1,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length,px=-uy,py=ux
    graphics.fillStyle(color,alpha).fillTriangle(x2,y2,x2-ux*18+px*10,y2-uy*18+py*10,x2-ux*18-px*10,y2-uy*18-py*10)
    const ghost=this.add.circle(x2,y2,23,color,.15*alpha).setStrokeStyle(3,color,.9*alpha).setDepth(active?71:56)
    const initial=this.add.text(x2,y2-2,target.name.slice(-1),{fontFamily:'sans-serif',fontSize:'20px',fontStyle:'bold',color:preview.type==='밀치기'?'#fff0b8':'#ead9ff',stroke:'#071013',strokeThickness:3}).setOrigin(.5).setDepth(active?72:57).setAlpha(alpha*.72)
    const midpointX=(x1+x2)/2,midpointY=(y1+y2)/2
    const label=this.add.text(midpointX,midpointY-15,`${preview.type} ${preview.moved}/${preview.requested}${preview.blocked?' · 충돌':''}`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:active?'11px':'9px',fontStyle:'bold',color:preview.type==='밀치기'?'#fff0b8':'#ead9ff',backgroundColor:preview.type==='밀치기'?'#493811':'#312144',stroke:'#071013',strokeThickness:2}).setOrigin(.5,1).setPadding(5,3).setDepth(active?74:59).setAlpha(alpha)
    layer.add([graphics,ghost,initial,label])
    if(preview.type==='당기기')for(const ratio of [.32,.62]){const chevron=this.add.text(x1+dx*ratio,y1+dy*ratio,'»',{fontFamily:'sans-serif',fontSize:active?'20px':'15px',fontStyle:'bold',color:'#ead9ff',stroke:'#071013',strokeThickness:3}).setOrigin(.5).setRotation(Math.atan2(dy,dx)).setDepth(active?73:58).setAlpha(alpha);layer.add(chevron)}
    if(preview.blocked){const blockedX=Phaser.Math.Clamp(x2+ux*29,10,638),blockedY=Phaser.Math.Clamp(y2+uy*29,10,638),collision=this.add.text(blockedX,blockedY,'✕',{fontFamily:'sans-serif',fontSize:'22px',fontStyle:'bold',color:'#ff8d68',stroke:'#071013',strokeThickness:5}).setOrigin(.5).setDepth(active?75:60).setAlpha(alpha);layer.add(collision)}
  }

  private plannedTarget(slotIndex:number){
    const slot=this.engine.state.slots[slotIndex],plan=slot?.plan,actor=this.engine.state.units.find(unit=>unit.id===slot?.unitId)
    const phase=this.engine.state.phase
    if(!['계획','실행'].includes(phase)||!plan||!actor||plan.action.kind==='없음')return
    if(phase==='실행'&&(slotIndex<this.engine.state.executingSlot||slotIndex===this.engine.state.executingSlot&&slot.result!=='대기'))return
    const definition=plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor)
    if(!definition||!['대상','셀','설치'].includes(definition.targeting))return
    const target=plan.action.targetUnitId?this.engine.livingUnits.find(unit=>unit.id===plan.action.targetUnitId)?.position:plan.action.targetCell
    const origin=phase==='실행'?(slotIndex===this.engine.state.executingSlot?actor.position:rebasePath(plan.path,actor.position).at(-1)):plan.path.at(-1)
    if(!origin||!target)return
    return{origin,target,range:definition.range,patternId:definition.rangePatternId,team:slot.team,key:`${slotIndex}:${plan.action.kind}:${plan.action.targetUnitId??`${target.x},${target.y}`}`}
  }

  private drawTargetLinks(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase
    if(!['계획','실행'].includes(phase)){this.previousLinks.clear();return}
    const currentLinks=new Map<string,boolean>()
    this.engine.state.slots.forEach((_,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex))return
      const link=this.plannedTarget(slotIndex);if(!link)return
      const active=this.isEmphasizedSlot(slotIndex)
      this.drawTargetLink(layer,link,active)
      currentLinks.set(link.key,isPointInPattern(link.origin,link.target,link.patternId,link.range))
    })
    this.previousLinks=currentLinks
  }

  private drawTargetLink(layer:Phaser.GameObjects.Container,link:{origin:Point;target:Point;range:number;patternId?:string;team:'아군'|'적군';key:string},active:boolean){
    const inRange=isPointInPattern(link.origin,link.target,link.patternId,link.range),enemy=link.team==='적군',solidColor=enemy?0xef746e:0x60cfff,solidLight=enemy?0xffb3ac:0xd8f7ff
    const x1=OFFSET+link.origin.x*CELL,y1=OFFSET+link.origin.y*CELL,x2=OFFSET+link.target.x*CELL,y2=OFFSET+link.target.y*CELL
    const alpha=active?.95:enemy?.62:.3,graphics=this.add.graphics().setDepth(active?45:enemy?39:34)
    if(inRange){
      graphics.lineStyle(active?5:enemy?4:3,solidColor,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
      if(active)graphics.lineStyle(1,solidLight,.9).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
    }else this.drawDashedLine(graphics,x1,y1,x2,y2,0xe8963e,alpha,active?4:3)
    const ringColor=inRange?solidColor:0xe8963e,targetRing=this.add.circle(x2,y2,active?30:enemy?28:25,ringColor,active?.08:enemy?.07:.03).setStrokeStyle(active?3:enemy?3:2,ringColor,active?1:enemy?.8:.35).setDepth(active?46:enemy?41:35)
    layer.add([graphics,targetRing])
    if(active||enemy){const text=enemy?(inRange?'적 공격 대상':'적 공격 · 범위 밖'):(inRange?'시전 가능':'사거리 밖'),label=this.add.text((x1+x2)/2,(y1+y2)/2-10,text,{fontFamily:'sans-serif',fontSize:active?'10px':'9px',fontStyle:'bold',color:enemy?(inRange?'#ffd0cb':'#ffd19c'):(inRange?'#c8f4ff':'#ffd19c'),backgroundColor:enemy?(inRange?'#4a1f22':'#3b2715'):(inRange?'#12313d':'#3b2715')}).setOrigin(.5,1).setPadding(5,3).setDepth(active?47:42).setAlpha(active?1:.82);layer.add(label)}
    const previous=this.previousLinks.get(link.key)
    if(previous!==undefined&&previous!==inRange)this.showLinkTransition(x1,y1,x2,y2,inRange,link.team)
  }

  private drawDashedLine(graphics:Phaser.GameObjects.Graphics,x1:number,y1:number,x2:number,y2:number,color:number,alpha=.95,width=4){
    const length=Phaser.Math.Distance.Between(x1,y1,x2,y2),dash=13,gap=9,dx=(x2-x1)/length,dy=(y2-y1)/length
    graphics.lineStyle(width,color,alpha)
    for(let start=0;start<length;start+=dash+gap){const end=Math.min(start+dash,length);graphics.beginPath().moveTo(x1+dx*start,y1+dy*start).lineTo(x1+dx*end,y1+dy*end).strokePath()}
  }

  private showLinkTransition(x1:number,y1:number,x2:number,y2:number,fused:boolean,team:'아군'|'적군'='아군'){
    const midX=(x1+x2)/2,midY=(y1+y2)/2,color=fused?(team==='적군'?0xef746e:0x65d5ff):0xe8963e
    const flash=this.add.circle(midX,midY,10,color,.7).setDepth(190)
    this.tweens.add({targets:flash,scale:fused?2.2:3.2,alpha:0,duration:420,ease:'Cubic.Out',onComplete:()=>flash.destroy()})
    for(let index=0;index<12;index++){
      const angle=Phaser.Math.FloatBetween(0,Math.PI*2),radius=Phaser.Math.Between(28,70)
      const startX=fused?midX+Math.cos(angle)*radius:midX,startY=fused?midY+Math.sin(angle)*radius:midY
      const endX=fused?midX:midX+Math.cos(angle)*radius,endY=fused?midY:midY+Math.sin(angle)*radius
      const shard=this.add.rectangle(startX,startY,fused?4:Phaser.Math.Between(4,9),fused?4:2,color,1).setRotation(angle).setDepth(191)
      this.tweens.add({targets:shard,x:endX,y:endY,scale:fused?1.5:.35,alpha:0,duration:fused?360:460,delay:index*12,ease:fused?'Cubic.In':'Cubic.Out',onComplete:()=>shard.destroy()})
    }
    const word=this.add.text(midX,midY-18,fused?'융합':'연결 파괴',{fontFamily:'sans-serif',fontSize:'13px',fontStyle:'bold',color:fused?(team==='적군'?'#ffc0ba':'#a9ecff'):'#ffc078',stroke:'#071013',strokeThickness:4}).setOrigin(.5).setDepth(192)
    this.tweens.add({targets:word,y:midY-38,alpha:0,duration:650,ease:'Cubic.Out',onComplete:()=>word.destroy()})
  }

  private showCombatText(effect:CombatTextEvent){
    const lane=this.fxLanes.get(effect.unitId)??0;this.fxLanes.set(effect.unitId,lane+1)
    const colors:Record<CombatTextEvent['kind'],string>={피해:'#ff8b7c',치명타:'#ffe07a',상태:'#83e1ff',면역:'#c8d0d4'}
    const x=OFFSET+effect.position.x*CELL,y=OFFSET+effect.position.y*CELL-28-lane*18
    const label=this.add.text(x,y,effect.text,{fontFamily:'sans-serif',fontSize:effect.kind==='치명타'?'22px':'19px',fontStyle:'bold',color:colors[effect.kind],stroke:'#071013',strokeThickness:5,align:'center'}).setOrigin(.5).setDepth(200).setScale(.72).setAlpha(0)
    label.x=Phaser.Math.Clamp(label.x,label.width/2+8,648-label.width/2-8)
    this.tweens.add({targets:label,y:y-42,alpha:1,scale:1,duration:170,ease:'Back.Out',yoyo:false,onComplete:()=>this.tweens.add({targets:label,y:y-62,alpha:0,duration:Math.max(380,Math.min(900,this.engine.presentationDelayMs*.65)),delay:Math.max(300,Math.min(1100,this.engine.presentationDelayMs)),onComplete:()=>{label.destroy();const remaining=(this.fxLanes.get(effect.unitId)??1)-1;remaining>0?this.fxLanes.set(effect.unitId,remaining):this.fxLanes.delete(effect.unitId)}})})
  }

  private drawAllPaths(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase;if(phase!=='계획'&&phase!=='실행')return
    this.engine.state.slots.forEach((slot,index)=>{
      if(!this.isVisibleSlot(index))return
      if(slot.plan.path.length<2||phase==='실행'&&index<=this.engine.state.executingSlot)return
      const unit=this.engine.state.units.find(candidate=>candidate.id===slot.unitId);if(!unit)return
      const shifted=phase==='실행'&&(unit.position.x!==slot.plan.path[0].x||unit.position.y!==slot.plan.path[0].y)
      const displayPath=phase==='실행'?rebasePath(slot.plan.path,unit.position):slot.plan.path
      const visiblePath:Point[]=[];for(const point of displayPath){if(point.x<0||point.y<0||point.x>=BOARD_SIZE||point.y>=BOARD_SIZE)break;visiblePath.push(point)}if(!visiblePath.length)return
      const active=phase==='계획'&&this.isEmphasizedSlot(index),color=slot.team==='아군'?0x6ed7ef:0xef746e
      const line=this.add.graphics().lineStyle(active?7:shifted?5:3,color,active ? .95 : shifted ? .72 : .3).setDepth(20)
      line.beginPath();visiblePath.forEach((point,pathIndex)=>{const x=OFFSET+point.x*CELL,y=OFFSET+point.y*CELL;pathIndex?line.lineTo(x,y):line.moveTo(x,y)});line.strokePath();layer.add(line)
      if(shifted){
        const start=visiblePath[0],x=OFFSET+start.x*CELL,y=OFFSET+start.y*CELL
        const marker=this.add.circle(x,y,13,0xffc35e,.16).setStrokeStyle(2,0xffc35e,.9).setDepth(21)
        const label=this.add.text(x,y-17,'경로 이동',{fontFamily:'sans-serif',fontSize:'9px',fontStyle:'bold',color:'#ffe0a6',backgroundColor:'#3b2715'}).setOrigin(.5,1).setPadding(4,2).setDepth(22)
        layer.add([marker,label])
      }
    })
  }

  private drawUnit(layer:Phaser.GameObjects.Container,unit:Unit){
    const x=OFFSET+unit.position.x*CELL,y=OFFSET+unit.position.y*CELL,selected=this.engine.selectedUnit?.id===unit.id,active=this.engine.state.phase==='실행'&&this.engine.state.slots[this.engine.state.executingSlot]?.unitId===unit.id
    if(selected||active){const halo=this.add.circle(x,y,29,selected?0xffd56a:0xffffff,.13).setStrokeStyle(3,selected?0xffd56a:0xffffff,1);layer.add(halo)}
    const shadow=this.add.ellipse(x,y+18,47,18,0x000000,.45)
    const body=this.add.circle(x,y,22,Phaser.Display.Color.HexStringToColor(unit.color).color).setStrokeStyle(3,unit.team==='아군'?0xc8f4ff:0xffd2cb,1).setInteractive({useHandCursor:true})
    body.on('pointerdown',()=>this.handleUnit(unit))
    const initial=this.add.text(x,y-2,unit.name.slice(-1),{fontFamily:'sans-serif',fontSize:'20px',fontStyle:'bold',color:'#081013'}).setOrigin(.5)
    const barBg=this.add.rectangle(x,y+29,50,6,0x080d10),hp=48*(unit.hp/unit.maxHp),bar=this.add.rectangle(x-24+hp/2,y+29,hp,4,unit.team==='아군'?0x69d2e7:0xef746e)
    layer.add([shadow,body,initial,barBg,bar])
    unit.statuses.forEach((status,index)=>{
      const color=status.type==='띄워짐'?'#8ee7ff':'#ffd77d',background=status.type==='띄워짐'?'#12323d':'#3a2c17'
      const badge=this.add.text(x+25,y-19+index*17,status.type,{fontFamily:'sans-serif',fontSize:'10px',fontStyle:'bold',color,backgroundColor:background,stroke:'#071013',strokeThickness:2}).setOrigin(0,1).setPadding(5,3).setDepth(80)
      badge.x=Math.min(badge.x,644-badge.width);layer.add(badge)
    })
    if(this.engine.state.phase==='계획'&&unit.team==='적군'){
      const threat=this.engine.getEnemyThreatPredictions().find(item=>item.actorId===unit.id),focused=threat&&this.threatFocusSlot===threat.slotIndex
      if(threat){const color=threat.state==='적중 예상'?'#ffd0cb':threat.state==='취소 예상'?'#ffc27d':'#c5ced1',background=threat.state==='적중 예상'?'#4a1f22':threat.state==='취소 예상'?'#493019':'#253035',badge=this.add.text(x,y-32,`${threat.slotNumber} · ${threat.actionName}`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:focused?'11px':'9px',fontStyle:'bold',color,backgroundColor:background,stroke:'#071013',strokeThickness:2}).setOrigin(.5,1).setPadding(5,3).setDepth(91);layer.add(badge)}
    }
  }

  private drawThreatOutcomeBadges(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획')return
    const lanes=new Map<string,number>(),threats=this.engine.getEnemyThreatPredictions().filter(threat=>this.threatFocusSlot===undefined||threat.slotIndex===this.threatFocusSlot)
    for(const threat of threats)for(const outcome of threat.outcomes){
      const unit=this.engine.state.units.find(candidate=>candidate.id===outcome.unitId&&candidate.hp>0);if(!unit)continue
      const lane=lanes.get(unit.id)??0;lanes.set(unit.id,lane+1)
      const parts:string[]=[];if(outcome.damage)parts.push(`${outcome.critical?'치명타 ':''}-${outcome.damage}`);parts.push(...outcome.statuses);for(const force of outcome.forceMoves)parts.push(`${force.type} ${force.moved}/${force.requested}`);if(outcome.ko)parts.push('전투불능')
      if(!parts.length)continue
      const x=OFFSET+unit.position.x*CELL,y=OFFSET+unit.position.y*CELL-39-lane*19,focused=this.threatFocusSlot===threat.slotIndex
      const badge=this.add.text(x,y,`${threat.slotNumber}번 ${parts.join(' · ')}`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:focused?'11px':'9px',fontStyle:'bold',color:'#ffd3ce',backgroundColor:'#4b2023',stroke:'#071013',strokeThickness:3}).setOrigin(.5,1).setPadding(5,3).setDepth(96).setAlpha(focused?1:.8)
      badge.x=Phaser.Math.Clamp(badge.x,badge.width/2+5,643-badge.width/2);layer.add(badge)
    }
  }

  private handleUnit(unit:Unit){
    if(this.engine.state.phase==='배치'){this.engine.selectDeployUnit(unit.id);return}
    if(this.engine.state.phase!=='계획')return
    if(this.mode==='이동'){
      const slotIndex=this.engine.state.slots.findIndex(slot=>slot.unitId===unit.id);if(slotIndex>=0)this.engine.selectSlot(slotIndex)
    }else{
      const selected=this.engine.selectedUnit;if(!selected)return
      const definition=this.mode==='일반공격'?selected.normalAttack:this.engine.getSkill(selected)
      if(definition?.targeting==='대상')this.engine.planTarget(this.mode,unit.id)
    }
  }

  private handlePoint(point:Point){
    if(this.engine.state.phase==='배치'){this.engine.moveDeployment(point);return}
    if(this.engine.state.phase!=='계획')return
    const unit=this.engine.selectedUnit,plan=this.engine.selectedPlan;if(!unit||!plan)return
    if(this.mode==='이동'){
      const path=plan.path.length?plan.path:[{...unit.position}],existing=path.findIndex(p=>p.x===point.x&&p.y===point.y)
      if(existing>=0){this.engine.setPath(path.slice(0,existing+1));return}
      if(distance(path[path.length-1],point)===1)this.engine.setPath([...path,{...point}])
      return
    }
    const definition=this.mode==='일반공격'?unit.normalAttack:this.engine.getSkill(unit)
    if(definition?.targeting==='셀'||definition?.targeting==='설치'){
      this.engine.planCell(this.mode,point)
    }else if(definition?.targeting==='방향'){
      const origin=plan.path[plan.path.length-1],dx=point.x-origin.x,dy=point.y-origin.y;let direction:Direction|undefined
      if(dx===0&&dy<0)direction='상';else if(dx===0&&dy>0)direction='하';else if(dy===0&&dx<0)direction='좌';else if(dy===0&&dx>0)direction='우'
      if(direction&&distance(origin,point)<=definition.range)this.engine.planDirection(this.mode,direction)
    }
  }

  private isTargetable(point:Point){
    if(this.engine.state.phase==='배치')return false
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return false
    const unit=this.engine.selectedUnit,plan=this.engine.selectedPlan;if(!unit||!plan)return false
    const origin=plan.path[plan.path.length-1],definition=this.mode==='일반공격'?unit.normalAttack:this.engine.getSkill(unit);if(!definition)return false
    if(definition.targeting==='대상'||definition.targeting==='셀'||definition.targeting==='설치')return true
    return (origin.x===point.x||origin.y===point.y)&&distance(origin,point)>0&&distance(origin,point)<=definition.range
  }

  private isInCastRange(point:Point){
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return false
    const unit=this.engine.selectedUnit,origin=this.engine.selectedPlan?.path.at(-1);if(!unit||!origin)return false
    const definition=this.mode==='일반공격'?unit.normalAttack:this.engine.getSkill(unit);if(!definition)return false
    return isPointInPattern(origin,point,definition.rangePatternId,definition.range)
  }
}
