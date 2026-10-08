import Phaser from 'phaser'
import { BattleEngine, distance, rebasePath } from '../game/engine'
import type { AttackPresentationEvent, CombatTextEvent, Direction, ForcedMovePreview, Point, Unit } from '../game/types'
import { isPointInPattern } from '../game/patterns'
import { CHARACTER_TEXTURES } from './characterAssets'

// 고원지대 경기장 안쪽 테두리의 경사(세로/가로 약 0.58)에 맞춘 투영값이다.
const VIEW_WIDTH=960,CAMERA_VIEW_WIDTH=1130,CAMERA_ZOOM=1920/CAMERA_VIEW_WIDTH,CAMERA_CENTER_Y=405,BASE_ISO_WIDTH=81.49,BASE_ISO_HEIGHT=48.25,BOARD_ORIGIN_X=486.3,BOARD_CENTER_Y=425.25
let ISO_WIDTH=BASE_ISO_WIDTH,ISO_HEIGHT=BASE_ISO_HEIGHT,BOARD_ORIGIN_Y=112
const UNIT_BASE_OFFSET_Y=6,UNIT_FEET_OFFSET_Y=9,UNIT_HP_OFFSET_Y=20
const directionVector:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const oppositeDirection:Record<Direction,Direction>={상:'하',하:'상',좌:'우',우:'좌'}
const screenPoint=(point:Point)=>({x:BOARD_ORIGIN_X+(point.x-point.y)*ISO_WIDTH/2,y:BOARD_ORIGIN_Y+(point.x+point.y)*ISO_HEIGHT/2})
const centeredDiamond=(inset=2)=>{const halfW=ISO_WIDTH/2-inset,halfH=ISO_HEIGHT/2-inset;return[new Phaser.Geom.Point(0,-halfH),new Phaser.Geom.Point(halfW,0),new Phaser.Geom.Point(0,halfH),new Phaser.Geom.Point(-halfW,0)]}
const localDiamond=(inset=2)=>{const halfW=ISO_WIDTH/2-inset,halfH=ISO_HEIGHT/2-inset;return centeredDiamond(inset).map(vertex=>new Phaser.Geom.Point(vertex.x+halfW,vertex.y+halfH))}
const diamond=(point:Point,inset=2)=>{const {x,y}=screenPoint(point);return centeredDiamond(inset).map(vertex=>new Phaser.Geom.Point(vertex.x+x,vertex.y+y))}
const paintDiamond=(graphics:Phaser.GameObjects.Graphics,point:Point,fill:number,fillAlpha:number,stroke:number,strokeAlpha:number,width=2)=>{const points=diamond(point,5);graphics.fillStyle(fill,fillAlpha).fillPoints(points,true);graphics.lineStyle(width,stroke,strokeAlpha).strokePoints(points,true)}
const fitTexture=(image:Phaser.GameObjects.Image,maxWidth:number,maxHeight:number)=>{const scale=Math.min(maxWidth/image.width,maxHeight/image.height);return image.setDisplaySize(image.width*scale,image.height*scale)}
export type InputMode='이동'|'일반공격'|'스킬'
export type PlanViewMode='summary'|'all'|'current'

export class BattleScene extends Phaser.Scene{
  private layer?:Phaser.GameObjects.Container
  private mode:InputMode='이동'
  private planView:PlanViewMode='summary'
  private threatFocusSlot?:number
  private fxLanes=new Map<string,number>()
  private previousLinks=new Map<string,boolean>()
  private dragUnitId?:string
  private dragStarted=false
  private dragBasePath:Point[]=[]
  constructor(private engine:BattleEngine,private onViewChange:()=>void=()=>{},private onPlanGesture:(repeat:boolean)=>void=()=>{}){super('battle')}
  preload(){for(const asset of Object.values(CHARACTER_TEXTURES))this.load.image(asset.key,asset.url)}
  create(){this.cameras.main.setBackgroundColor('rgba(0,0,0,0)').setZoom(CAMERA_ZOOM).centerOn(VIEW_WIDTH/2,CAMERA_CENTER_Y);this.engine.addEventListener('change',()=>this.renderBoard());this.engine.addEventListener('combat-text',event=>this.showCombatText((event as CustomEvent<CombatTextEvent>).detail));this.engine.addEventListener('attack-presentation',event=>this.showAttackPresentation((event as CustomEvent<AttackPresentationEvent>).detail));this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(this.engine.state.phase==='계획'&&this.mode!=='이동'){const point=this.pointFromPointer(pointer);if(point)this.handlePoint(point)}});this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>this.continueMoveFromPointer(pointer));this.input.on('pointerup',()=>this.endMoveDrag());this.renderBoard()}
  setInputMode(mode:InputMode){this.mode=mode;this.renderBoard()}
  getInputMode(){return this.mode}
  setPlanView(mode:PlanViewMode){this.planView=mode;if(mode!=='current')this.threatFocusSlot=undefined;this.renderBoard()}
  getPlanView(){return this.planView}
  setThreatFocus(slotIndex:number){this.planView='current';this.threatFocusSlot=this.threatFocusSlot===slotIndex?undefined:slotIndex;if(this.threatFocusSlot===undefined)this.planView='all';this.renderBoard();return this.threatFocusSlot}
  clearThreatFocus(){this.threatFocusSlot=undefined;this.renderBoard()}
  getThreatFocus(){return this.threatFocusSlot}
  private isVisibleSlot(index:number){
    if(this.engine.state.phase==='실행')return index===this.engine.state.executingSlot
    if(this.engine.state.phase==='계획'&&this.threatFocusSlot!==undefined)return index===this.threatFocusSlot
    return true
  }
  private isEmphasizedSlot(index:number){return this.threatFocusSlot!==undefined?index===this.threatFocusSlot:(this.engine.state.phase==='실행'?index===this.engine.state.executingSlot:index===this.engine.state.selectedSlot)}

  private renderBoard(){
    const boardSize=this.engine.boardSize,tileScale=9/boardSize
    ISO_WIDTH=BASE_ISO_WIDTH*tileScale;ISO_HEIGHT=BASE_ISO_HEIGHT*tileScale;BOARD_ORIGIN_Y=BOARD_CENTER_Y-(boardSize-1)*ISO_HEIGHT/2
    this.layer?.destroy(true);const layer=this.add.container(0,0);this.layer=layer
    const time=this.engine.state.currentTime
    const palette=time==='과거'?[0x30251e,0x3a2c22]:time==='미래'?[0x112b2b,0x153536]:[0x172228,0x1b2a31]
    for(let y=0;y<boardSize;y++)for(let x=0;x<boardSize;x++){
      const p={x,y},acceptingAllyInput=this.threatFocusSlot===undefined,planning=acceptingAllyInput&&this.engine.state.phase==='계획',selectedPath=planning&&(this.engine.selectedPlan?.path.some(v=>v.x===x&&v.y===y)??false),targetable=planning&&this.isTargetable(p),inCastRange=planning&&this.isInCastRange(p),moveReachable=planning&&this.isMoveReachable(p)
      const deploy=this.engine.state.phase==='배치'
      const allyDeployCell=deploy&&y>=Math.ceil(boardSize*2/3),fill=selectedPath?0xb99a4c:inCastRange?0x193f4d:targetable?0x33281d:moveReachable?0x153a43:deploy?(allyDeployCell?0x126283:palette[(x+y)%2]):palette[(x+y)%2]
      const fillAlpha=selectedPath ? .72 : inCastRange ? .48 : targetable ? .44 : moveReachable ? .42 : deploy ? (allyDeployCell ? .42 : .12) : .18
      const stroke=selectedPath?0xffdd82:inCastRange?0x63c9f0:targetable?0xd98b38:moveReachable?0x3f91a5:deploy?(allyDeployCell?0x55d9ff:0x37505a):0x37505a
      const center=screenPoint(p),tile=this.add.polygon(center.x,center.y,localDiamond(),fill,fillAlpha).setStrokeStyle(selectedPath||targetable||moveReachable?2:1,stroke,selectedPath||targetable||moveReachable ? .96 : .58).setInteractive({useHandCursor:true})
      tile.on('pointerdown',()=>{
        if(this.engine.state.phase==='계획'&&this.threatFocusSlot!==undefined){this.exitThreatFocus();return}
        if(this.mode==='이동'&&this.engine.state.phase==='계획')this.handleMoveTilePointer(p)
        else if(this.engine.state.phase==='배치')this.handlePoint(p)
      })
      tile.on('pointerover',(pointer:Phaser.Input.Pointer)=>this.continueMoveDrag(p,pointer));layer.add(tile)
    }
    this.drawFocusedEnemyRange(layer)
    this.drawAllPaths(layer)
    this.drawDestinationHolograms(layer)
    this.drawTargetingOrigin(layer)
    this.drawTargetLinks(layer)
    this.drawDirectionIntents(layer)
    ;[...this.engine.livingUnits].sort((a,b)=>(a.position.x+a.position.y)-(b.position.x+b.position.y)||a.position.y-b.position.y).forEach(unit=>this.drawUnit(layer,unit))
    this.drawPlannedActionLabels(layer)
    if(this.engine.state.phase==='실행'&&this.engine.state.executingSlot>=0){const slot=this.engine.state.slots[this.engine.state.executingSlot],unit=this.engine.state.units.find(u=>u.id===slot?.unitId);if(unit){const point=screenPoint(unit.position),marker=this.add.ellipse(point.x,point.y+12,68,32,0xffffff,0).setStrokeStyle(4,0xffd56a,1);layer.add(marker)}}
  }

  private drawTargetingOrigin(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return
    const origin=this.engine.selectedPlan?.path.at(-1);if(!origin)return
    const {x,y}=screenPoint(origin)
    const marker=this.add.ellipse(x,y+10,66,30,0x71d6b5,.1).setStrokeStyle(3,0x8ff0cf,1)
    layer.add(marker)
  }

  private drawFocusedEnemyRange(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획'||this.threatFocusSlot===undefined)return
    const slot=this.engine.state.slots[this.threatFocusSlot],actor=this.engine.state.units.find(unit=>unit.id===slot?.unitId)
    if(!slot||!actor||actor.team!=='적군'||slot.plan.action.kind==='없음')return
    const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor)
    if(!definition||definition.targeting!=='대상')return
    const threat=this.engine.getEnemyThreatPredictions().find(item=>item.slotIndex===this.threatFocusSlot),origin=threat?.origin??slot.plan.path.at(-1)
    if(!origin)return
    const graphics=this.add.graphics().setDepth(12)
    for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(isPointInPattern(origin,{x,y},definition.rangePatternId,definition.range)){
      paintDiamond(graphics,{x,y},0xef746e,.16,0xef8a82,.6)
    }
    const projected=screenPoint(origin),ox=projected.x,oy=projected.y,originRing=this.add.ellipse(ox,oy+10,68,31,0xef746e,.07).setStrokeStyle(3,0xff9d95,.9).setDepth(13)
    layer.add([graphics,originRing])
  }

  private drawDirectionIntents(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase
    if(phase!=='계획'&&phase!=='실행')return
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex))return
      if(phase==='실행'&&slot.result!=='대기')return
      if(!slot.plan.action.direction||slot.plan.action.kind==='없음')return
      const actor=this.engine.state.units.find(unit=>unit.id===slot.unitId);if(!actor)return
      const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor);if(!definition)return
      const origin=phase==='실행'?actor.position:slot.plan.path.at(-1);if(!origin)return
      const vector=directionVector[slot.plan.action.direction],points:Point[]=[]
      for(let step=1;step<=definition.range;step++){const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step};if(point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize)break;points.push(point)}
      if(!points.length)return
      const active=this.isEmphasizedSlot(slotIndex),overview=phase==='계획'&&this.threatFocusSlot===undefined,color=slot.team==='적군'?0xef746e:0x66d3eb,alpha=active?.95:slot.team==='적군'?(overview?.28:.58):.25
      const graphics=this.add.graphics().setDepth(active?50:36),projectedOrigin=screenPoint(origin),originX=projectedOrigin.x,originY=projectedOrigin.y
      for(const point of points)paintDiamond(graphics,point,color,alpha*.2,color,alpha*.76,active?3:2)
      const end=points[points.length-1],projectedEnd=screenPoint(end),endX=projectedEnd.x,endY=projectedEnd.y
      graphics.lineStyle(active?3:2,color,alpha).beginPath().moveTo(originX,originY).lineTo(endX,endY).strokePath()
      const forceEffect=slot.plan.action.kind==='스킬'?this.engine.getSkill(actor)?.effects.find(effect=>effect.type==='밀치기'||effect.type==='당기기'):undefined
      if(forceEffect){
        const forceDirection=forceEffect.type==='밀치기'?slot.plan.action.direction:oppositeDirection[slot.plan.action.direction],forceColor=forceEffect.type==='밀치기'?0xffcf5a:0xc99cff
        for(const point of points)this.drawCellDirectionArrow(graphics,point,forceDirection,forceColor,active?1:Math.max(.55,alpha),active)
      }else{
        const labelX=(originX+endX)/2-vector.y*14,labelY=(originY+endY)/2+vector.x*14
        const arrow=this.add.text(labelX,labelY,({상:'↑',하:'↓',좌:'←',우:'→'} as Record<Direction,string>)[slot.plan.action.direction],{fontFamily:'sans-serif',fontSize:active?'22px':'16px',fontStyle:'bold',color:slot.team==='적군'?'#ffd0cb':'#c8f5ff',stroke:'#071013',strokeThickness:4}).setOrigin(.5).setDepth(active?53:39).setAlpha(alpha);layer.add(arrow)
      }
      layer.add(graphics)
      for(const preview of this.engine.getForcedMovePreviews(slotIndex))if(preview.immune||preview.moved===0)this.drawForcedMovePreview(layer,preview,active,alpha)
    })
  }

  private drawCellDirectionArrow(graphics:Phaser.GameObjects.Graphics,point:Point,direction:Direction,color:number,alpha:number,active:boolean){
    const center=screenPoint(point),step=directionVector[direction],next=screenPoint({x:point.x+step.x,y:point.y+step.y}),dx=next.x-center.x,dy=next.y-center.y,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length,px=-uy,py=ux
    const x1=center.x-ux*11,y1=center.y-uy*11,x2=center.x+ux*12,y2=center.y+uy*12
    graphics.lineStyle(active?6:5,0x071013,alpha*.72).beginPath().moveTo(x1+1,y1+1).lineTo(x2+1,y2+1).strokePath()
    graphics.lineStyle(active?4:3,color,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
    graphics.fillStyle(0x071013,alpha*.76).fillTriangle(x2+1,y2+1,x2-ux*10+px*7+1,y2-uy*10+py*7+1,x2-ux*10-px*7+1,y2-uy*10-py*7+1)
    graphics.fillStyle(color,alpha).fillTriangle(x2,y2,x2-ux*10+px*7,y2-uy*10+py*7,x2-ux*10-px*7,y2-uy*10-py*7)
  }

  private drawForcedMovePreview(layer:Phaser.GameObjects.Container,preview:ForcedMovePreview,active:boolean,baseAlpha:number){
    const target=this.engine.state.units.find(unit=>unit.id===preview.targetId);if(!target)return
    const from=screenPoint(preview.from),step=directionVector[preview.direction],toward=screenPoint({x:preview.from.x+step.x,y:preview.from.y+step.y}),x1=from.x,y1=from.y,x2=x1+(toward.x-x1)*.55,y2=y1+(toward.y-y1)*.55
    const alpha=active?1:Math.max(.42,baseAlpha),color=preview.type==='밀치기'?0xffcf5a:0xc99cff,graphics=this.add.graphics().setDepth(active?70:55)
    if(preview.immune||preview.moved===0){
      graphics.lineStyle(3,color,alpha).strokeCircle(x1,y1,27)
      const cross=this.add.text(x1,y1,'×',{fontFamily:'sans-serif',fontSize:'28px',fontStyle:'bold',color:preview.immune?'#d8e0e3':'#ffb16f',stroke:'#071013',strokeThickness:5}).setOrigin(.5).setDepth(active?73:58).setAlpha(alpha)
      layer.add([graphics,cross]);return
    }
    graphics.lineStyle(active?8:5,color,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
    const dx=x2-x1,dy=y2-y1,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length,px=-uy,py=ux
    graphics.fillStyle(color,alpha).fillTriangle(x2,y2,x2-ux*18+px*10,y2-uy*18+py*10,x2-ux*18-px*10,y2-uy*18-py*10)
    layer.add(graphics)
  }

  private plannedTarget(slotIndex:number){
    const slot=this.engine.state.slots[slotIndex],plan=slot?.plan,actor=this.engine.state.units.find(unit=>unit.id===slot?.unitId)
    const phase=this.engine.state.phase
    if(!['계획','실행'].includes(phase)||!plan||!actor||plan.action.kind==='없음')return
    if(phase==='실행'&&(slotIndex<this.engine.state.executingSlot||slotIndex===this.engine.state.executingSlot&&slot.result!=='대기'))return
    const definition=plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor)
    if(!definition||!['대상','셀','설치'].includes(definition.targeting))return
    const targetUnit=plan.action.targetUnitId?this.engine.livingUnits.find(unit=>unit.id===plan.action.targetUnitId):undefined
    // 대상형은 유닛 ID를 계속 추적한다. 예정 경로의 끝점이나 홀로그램을 참조하면,
    // 이동·강제 이동 뒤 실제 SD와 선/강조 타일이 서로 다른 좌표를 가리킬 수 있다.
    const target=targetUnit?{...targetUnit.position}:plan.action.targetCell
    // 실행 중에는 계획 경로 끝점이 아니라 현재 그려진 시전자 SD 위치를 사용한다.
    // 이동 단계마다 엔진이 emit하므로 대상 SD의 현재 위치와 함께 실시간으로 갱신된다.
    const origin=phase==='실행'?{...actor.position}:plan.path.at(-1)
    if(!origin||!target)return
    return{origin,target,range:definition.range,patternId:definition.rangePatternId,team:slot.team,targetUnitId:targetUnit?.id,key:`${slotIndex}:${plan.action.kind}:${plan.action.targetUnitId??`${target.x},${target.y}`}`}
  }

  private drawTargetLinks(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase
    if(!['계획','실행'].includes(phase)){this.previousLinks.clear();return}
    const currentLinks=new Map<string,boolean>()
    this.engine.state.slots.forEach((_,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex))return
      const link=this.plannedTarget(slotIndex);if(!link)return
      const active=this.isEmphasizedSlot(slotIndex)||(phase==='계획'&&link.targetUnitId===this.engine.selectedUnit?.id)
      this.drawTargetLink(layer,link,active)
      currentLinks.set(link.key,isPointInPattern(link.origin,link.target,link.patternId,link.range))
    })
    this.previousLinks=currentLinks
  }

  private drawTargetLink(layer:Phaser.GameObjects.Container,link:{origin:Point;target:Point;range:number;patternId?:string;team:'아군'|'적군';targetUnitId?:string;key:string},active:boolean){
    const inRange=isPointInPattern(link.origin,link.target,link.patternId,link.range),enemy=link.team==='적군',solidColor=enemy?0xef746e:0x60cfff,solidLight=enemy?0xffb3ac:0xd8f7ff
    const origin=screenPoint(link.origin),targetGround=screenPoint(link.target),x1=origin.x,y1=origin.y-22,x2=targetGround.x,y2=targetGround.y-22
    const overview=this.engine.state.phase==='계획'&&this.threatFocusSlot===undefined,alpha=active?.95:enemy?(overview?.3:.62):.3,graphics=this.add.graphics().setDepth(active?45:enemy?39:34)
    if(inRange){
      graphics.lineStyle(active?5:enemy?4:3,solidColor,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
      if(active)graphics.lineStyle(1,solidLight,.9).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
    }else this.drawDashedLine(graphics,x1,y1,x2,y2,0xe8963e,alpha,active?4:3)
    const ringColor=inRange?solidColor:0xe8963e,targetTile=this.add.graphics().setDepth(active?44:enemy?38:33),targetRing=this.add.circle(targetGround.x,targetGround.y,active?30:enemy?28:25,ringColor,active?.08:enemy?.07:.03).setStrokeStyle(active?3:enemy?3:2,ringColor,active?1:enemy?.8:.35).setDepth(active?46:enemy?41:35)
    paintDiamond(targetTile,link.target,ringColor,active?.24:enemy?.16:.1,ringColor,active?.92:enemy?.72:.48,active?3:2)
    layer.add([targetTile,graphics,targetRing])
    const previous=this.previousLinks.get(link.key)
    if(previous!==undefined&&previous!==inRange)this.showLinkTransition(x1,y1,x2,y2,inRange,link.team)
  }

  private drawDashedLine(graphics:Phaser.GameObjects.Graphics,x1:number,y1:number,x2:number,y2:number,color:number,alpha=.95,width=4,offset=0){
    const length=Phaser.Math.Distance.Between(x1,y1,x2,y2);if(length<=0)return
    const dash=13,gap=9,period=dash+gap,dx=(x2-x1)/length,dy=(y2-y1)/length
    graphics.lineStyle(width,color,alpha)
    for(let start=-period+offset;start<length;start+=period){const visibleStart=Math.max(0,start),end=Math.min(start+dash,length);if(end<=visibleStart)continue;graphics.beginPath().moveTo(x1+dx*visibleStart,y1+dy*visibleStart).lineTo(x1+dx*end,y1+dy*end).strokePath()}
  }

  private drawFootprintPath(layer:Phaser.GameObjects.Container,path:Point[],color:number,alpha:number,active:boolean){
    const scale=active?1.2:1.14,footprints=this.add.graphics().setDepth(12)
    const unitVector=(from:Point,to:Point)=>{const a=screenPoint(from),b=screenPoint(to),dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);return length?{x:dx/length,y:dy/length}:{x:0,y:1}}
    for(let pathIndex=1;pathIndex<path.length;pathIndex++){
      const point=path[pathIndex],incoming=unitVector(path[pathIndex-1],point),outgoing=path[pathIndex+1]?unitVector(point,path[pathIndex+1]):undefined
      let ux=incoming.x,uy=incoming.y
      if(outgoing&&Math.abs(incoming.x-outgoing.x)+Math.abs(incoming.y-outgoing.y)>.01){const bx=incoming.x+outgoing.x,by=incoming.y+outgoing.y,length=Math.hypot(bx,by);if(length>.01){ux=bx/length;uy=by/length}}
      const px=-uy,py=ux,center=screenPoint(point),leadSide=pathIndex%2===0?-1:1
      const drawFoot=(forward:number,side:number,handedness:number)=>{
        const cx=center.x+ux*forward+px*side,cy=center.y+uy*forward+py*side
        const shape=[{x:-7,y:-2.2},{x:-3.5,y:-2.5},{x:-1.5,y:-1.25},{x:1.2,y:-3},{x:4.7,y:-3.5},{x:7.2,y:-2.5},{x:8.2,y:0},{x:7.2,y:2.3},{x:4.7,y:3.25},{x:1.2,y:2.8},{x:-1.5,y:1.4},{x:-3.5,y:2.45},{x:-7,y:2.2}]
        const points=(offsetX=0,offsetY=0)=>shape.map(vertex=>{const lateral=vertex.y*handedness;return new Phaser.Geom.Point(cx+offsetX+ux*vertex.x*scale+px*lateral*scale,cy+offsetY+uy*vertex.x*scale+py*lateral*scale)})
        footprints.fillStyle(0x020608,alpha*.5).fillPoints(points(1.2,1.2),true)
        footprints.fillStyle(color,alpha*(active?.58:.38)).fillPoints(points(),true)
        footprints.lineStyle(1,color,alpha*(active?.78:.52)).strokePoints(points(),true)
      }
      drawFoot(-6,-leadSide*3.5,-leadSide)
      drawFoot(6,leadSide*3.5,leadSide)
    }
    layer.add(footprints)
  }

  private drawSelectedPathLine(layer:Phaser.GameObjects.Container,path:Point[],color:number){
    const line=this.add.graphics().setDepth(21),draw=()=>{line.beginPath();path.forEach((point,index)=>{const projected=screenPoint(point),x=projected.x,y=projected.y;index?line.lineTo(x,y):line.moveTo(x,y)});line.strokePath()}
    line.lineStyle(7,0x071013,.78);draw()
    line.lineStyle(3,color,1);draw()
    layer.add(line)
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
    if(effect.kind==='치명타')this.cameras.main.shake(105,.0025,false)
    const colors:Record<CombatTextEvent['kind'],string>={피해:'#ff8b7c',치명타:'#ffe07a',상태:'#83e1ff',면역:'#c8d0d4',버프:'#ff7068'}
    const projected=screenPoint(effect.position),x=projected.x,y=projected.y-28-lane*18
    const isBuff=effect.kind==='버프'
    const label=this.add.text(x,y,effect.text,{fontFamily:'sans-serif',fontSize:effect.kind==='치명타'?'22px':isBuff?'11px':'19px',fontStyle:'bold',color:colors[effect.kind],stroke:'#071013',strokeThickness:isBuff?3:5,align:'center'}).setOrigin(.5).setDepth(200).setScale(.72).setAlpha(0)
    label.x=Phaser.Math.Clamp(label.x,label.width/2+8,VIEW_WIDTH-label.width/2-8)
    this.tweens.add({targets:label,y:y-42,alpha:1,scale:1,duration:170,ease:'Back.Out',yoyo:false,onComplete:()=>this.tweens.add({targets:label,y:y-62,alpha:0,duration:Math.max(380,Math.min(900,this.engine.presentationDelayMs*.65)),delay:Math.max(300,Math.min(1100,this.engine.presentationDelayMs)),onComplete:()=>{label.destroy();const remaining=(this.fxLanes.get(effect.unitId)??1)-1;remaining>0?this.fxLanes.set(effect.unitId,remaining):this.fxLanes.delete(effect.unitId)}})})
  }

  private showAttackPresentation(effect:AttackPresentationEvent){
    const color=effect.actionKind==='스킬'?0xc99cff:effect.team==='아군'?0x72ddf2:0xff8178
    const light=effect.actionKind==='스킬'?'#f0ddff':effect.team==='아군'?'#d8f9ff':'#ffe0dc'
    const rangeFx=this.add.graphics().setDepth(170),cells:Point[]=[]
    if(effect.targeting==='방향'&&effect.direction){
      const v=directionVector[effect.direction]
      for(let step=1;step<=effect.range;step++)cells.push({x:effect.actorPosition.x+v.x*step,y:effect.actorPosition.y+v.y*step})
    }else{
      for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(isPointInPattern(effect.actorPosition,{x,y},effect.rangePatternId,effect.range))cells.push({x,y})
    }
    for(const point of cells.filter(point=>point.x>=0&&point.y>=0&&point.x<this.engine.boardSize&&point.y<this.engine.boardSize)){
      paintDiamond(rangeFx,point,color,.22,color,.9)
    }
    const actorPoint=screenPoint(effect.actorPosition),actorX=actorPoint.x,actorY=actorPoint.y
    const target=effect.targetPoint??effect.actorPosition,targetPoint=screenPoint(target),targetX=targetPoint.x,targetY=targetPoint.y
    const angle=Math.atan2(targetY-actorY,targetX-actorX)
    const originFlash=this.add.circle(actorX,actorY,28,color,.12).setStrokeStyle(4,color,1).setDepth(173)
    const label=this.add.text(actorX,actorY-38,effect.actionName,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'13px',fontStyle:'bold',color:light,backgroundColor:effect.actionKind==='스킬'?'#352144':effect.team==='아군'?'#123641':'#4a2023',stroke:'#071013',strokeThickness:3}).setOrigin(.5,1).setPadding(6,3).setDepth(180)
    label.x=Phaser.Math.Clamp(label.x,label.width/2+6,VIEW_WIDTH-6-label.width/2)

    const slash=this.add.graphics().setPosition(actorX+Math.cos(angle)*24,actorY+Math.sin(angle)*24).setRotation(angle).setDepth(181).setScale(.55).setAlpha(0)
    slash.lineStyle(9,0xffffff,.18).beginPath().arc(0,0,38,-1.02,1.02,false).strokePath()
    slash.lineStyle(5,color,1).beginPath().arc(0,0,36,-1.02,1.02,false).strokePath()
    slash.lineStyle(2,0xffffff,.95).beginPath().arc(0,0,31,-.92,.92,false).strokePath()

    const impact=this.add.circle(targetX,targetY,11,color,.75).setStrokeStyle(3,0xffffff,.9).setDepth(179).setScale(.45).setAlpha(0)
    const flashDuration=Math.max(180,effect.durationMs-70)
    this.tweens.add({targets:rangeFx,alpha:{from:0,to:1},duration:70,yoyo:true,hold:Math.max(20,effect.durationMs-170),ease:'Sine.Out',onComplete:()=>rangeFx.destroy()})
    this.tweens.add({targets:originFlash,scale:{from:.75,to:1.35},alpha:{from:.9,to:0},duration:effect.durationMs,ease:'Cubic.Out',onComplete:()=>originFlash.destroy()})
    this.tweens.add({targets:label,y:label.y-12,alpha:{from:1,to:0},delay:Math.max(80,effect.durationMs-180),duration:180,ease:'Cubic.Out',onComplete:()=>label.destroy()})
    this.tweens.add({targets:slash,rotation:angle+.5,scale:{from:.55,to:1.15},alpha:{from:0,to:1},duration:110,ease:'Back.Out',yoyo:true,hold:35,onComplete:()=>slash.destroy()})
    this.tweens.add({targets:impact,scale:{from:.45,to:2.4},alpha:{from:0,to:.8},delay:90,duration:flashDuration,ease:'Cubic.Out',onComplete:()=>impact.destroy()})
  }

  private drawAllPaths(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase;if(phase!=='계획'&&phase!=='실행')return
    this.engine.state.slots.forEach((slot,index)=>{
      if(!this.isVisibleSlot(index))return
      if(slot.plan.path.length<2||phase==='실행'&&index<=this.engine.state.executingSlot)return
      const unit=this.engine.state.units.find(candidate=>candidate.id===slot.unitId);if(!unit)return
      const shifted=phase==='실행'&&(unit.position.x!==slot.plan.path[0].x||unit.position.y!==slot.plan.path[0].y)
      const displayPath=phase==='실행'?rebasePath(slot.plan.path,unit.position):slot.plan.path
      const visiblePath:Point[]=[];for(const point of displayPath){if(point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize)break;visiblePath.push(point)}if(!visiblePath.length)return
      const active=phase==='계획'&&this.planView==='current'&&this.isEmphasizedSlot(index),color=slot.team==='아군'?0x6ed7ef:0xef746e,summaryEnemy=phase==='계획'&&this.planView==='summary'&&slot.team==='적군',alpha=active?.95:summaryEnemy?.72:shifted?.72:.3
      this.drawFootprintPath(layer,visiblePath,color,alpha,active)
      if(active)this.drawSelectedPathLine(layer,visiblePath,color)
      if(slot.team==='적군'&&visiblePath.length>1){const destination=visiblePath.at(-1)!,projected=screenPoint(destination),x=projected.x,y=projected.y,marker=this.add.ellipse(x,y+9,38,18,color,.08).setStrokeStyle(2,color,alpha).setDepth(22);layer.add(marker)}
      if(shifted){
        const start=visiblePath[0],projected=screenPoint(start),x=projected.x,y=projected.y
        const marker=this.add.circle(x,y,13,0xffc35e,.16).setStrokeStyle(2,0xffc35e,.9).setDepth(21)
        layer.add(marker)
      }
    })
  }

  private drawDestinationHolograms(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase;if(phase!=='계획'&&phase!=='실행')return
    const destinations:{slotIndex:number;slotNumber:number;unit:Unit;point:Point}[]=[]
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex)||slot.plan.path.length<2||phase==='실행'&&slotIndex<=this.engine.state.executingSlot)return
      const unit=this.engine.state.units.find(candidate=>candidate.id===slot.unitId&&candidate.hp>0);if(!unit)return
      const path=phase==='실행'?rebasePath(slot.plan.path,unit.position):slot.plan.path,point=path.at(-1);if(!point||point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize)return
      destinations.push({slotIndex,slotNumber:slot.number,unit,point})
    })
    const groups=new Map<string,typeof destinations>()
    for(const item of destinations){const key=`${item.point.x},${item.point.y}`,group=groups.get(key)??[];group.push(item);groups.set(key,group)}
    for(const group of groups.values())group.forEach((item,index)=>{
      const projected=screenPoint(item.point),overlapOffset=(index-(group.length-1)/2)*11,x=projected.x+overlapOffset,y=projected.y,color=item.unit.team==='아군'?0x65d9ff:0xff716b
      const ring=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,42,17,color,.1).setStrokeStyle(2,color,.72),asset=CHARACTER_TEXTURES[item.unit.id],visuals:Phaser.GameObjects.GameObject[]=[ring]
      if(asset&&this.textures.exists(asset.key)){
        const ghost=fitTexture(this.add.image(x,y+UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),42,56).setTint(color).setAlpha(.38).setBlendMode(Phaser.BlendModes.ADD)
        visuals.push(ghost)
      }else{
        const ghost=this.add.circle(x,y,20,color,.2).setStrokeStyle(2,color,.65),initial=this.add.text(x,y-2,item.unit.name.slice(-1),{fontFamily:'sans-serif',fontSize:'18px',fontStyle:'bold',color:item.unit.team==='아군'?'#9decff':'#ffaaa4'}).setOrigin(.5).setAlpha(.55)
        visuals.push(ghost,initial)
      }
      const hitArea=this.add.zone(x,y-15,38,58).setInteractive({useHandCursor:true});hitArea.on('pointerdown',()=>{this.handleUnit(item.unit,true);if(this.mode==='이동'&&item.unit.team==='아군')this.beginMoveDrag(item.point)})
      layer.add([...visuals,hitArea])
    })
  }

  private drawPlannedActionLabels(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획')return
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex)||slot.plan.action.kind==='없음')return
      const actor=this.engine.state.units.find(unit=>unit.id===slot.unitId&&unit.hp>0),origin=slot.plan.path.at(-1);if(!actor||!origin)return
      const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor)
      const text=slot.plan.action.kind==='일반공격'?'일반공격':`스킬 · ${definition?.name??'사용'}`,enemy=slot.team==='적군',skill=slot.plan.action.kind==='스킬',projected=screenPoint(origin)
      const label=this.add.text(projected.x,projected.y-38,text,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'8px',fontStyle:'bold',color:skill?'#f0ddff':enemy?'#ffd5d1':'#d8f7ff',backgroundColor:skill?'#30213f':enemy?'#4a1f22':'#12343d',stroke:'#071013',strokeThickness:2}).setOrigin(.5,1).setPadding(4,2).setDepth(98)
      label.x=Phaser.Math.Clamp(label.x,label.width/2+4,VIEW_WIDTH-label.width/2-4);layer.add(label)
    })
  }

  private drawUnit(layer:Phaser.GameObjects.Container,unit:Unit){
    const projected=screenPoint(unit.position),x=projected.x,y=projected.y,focused=this.engine.state.phase==='계획'&&this.threatFocusSlot!==undefined&&this.engine.state.slots[this.threatFocusSlot]?.unitId===unit.id,selected=(this.engine.state.phase==='계획'&&this.threatFocusSlot===undefined&&this.engine.selectedUnit?.id===unit.id)||(this.engine.state.phase==='배치'&&unit.team==='아군'&&this.engine.state.selectedDeployUnitId===unit.id),active=this.engine.state.phase==='실행'&&this.engine.state.slots[this.engine.state.executingSlot]?.unitId===unit.id
    const teamColor=unit.team==='아군'?0x6ed7ef:0xef746e
    if(selected||focused||active){const emphasisColor=selected||focused?0xffd56a:0xffffff,halo=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,61,27,emphasisColor,.1).setStrokeStyle(3,emphasisColor,1);layer.add(halo)}
    const shadow=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y+3,48,17,0x000000,.5),plate=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,47,19,teamColor,.12).setStrokeStyle(3,teamColor,.95).setInteractive({useHandCursor:true})
    plate.on('pointerdown',()=>this.handleUnit(unit))
    const asset=CHARACTER_TEXTURES[unit.id],visuals:Phaser.GameObjects.GameObject[]=[shadow,plate]
    if(asset&&this.textures.exists(asset.key)){
      const sprite=fitTexture(this.add.image(x,y+UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),46,62).setInteractive({useHandCursor:true})
      sprite.on('pointerdown',()=>this.handleUnit(unit));visuals.push(sprite)
    }else{
      const body=this.add.circle(x,y,22,Phaser.Display.Color.HexStringToColor(unit.color).color).setStrokeStyle(3,unit.team==='아군'?0xc8f4ff:0xffd2cb,1).setInteractive({useHandCursor:true})
      body.on('pointerdown',()=>this.handleUnit(unit))
      const initial=this.add.text(x,y-2,unit.name.slice(-1),{fontFamily:'sans-serif',fontSize:'20px',fontStyle:'bold',color:'#081013'}).setOrigin(.5);visuals.push(body,initial)
    }
    const barBg=this.add.rectangle(x,y+UNIT_HP_OFFSET_Y,50,6,0x080d10),hp=48*(unit.hp/unit.maxHp),bar=this.add.rectangle(x-24+hp/2,y+UNIT_HP_OFFSET_Y,hp,4,unit.team==='아군'?0x69d2e7:0xef746e)
    layer.add([...visuals,barBg,bar])
    unit.statuses.forEach((status,index)=>{
      const color=status.type==='띄워짐'?'#8ee7ff':'#ffd77d',background=status.type==='띄워짐'?'#12323d':'#3a2c17'
      const badge=this.add.text(x+25,y-19+index*17,status.type,{fontFamily:'sans-serif',fontSize:'10px',fontStyle:'bold',color,backgroundColor:background,stroke:'#071013',strokeThickness:2}).setOrigin(0,1).setPadding(5,3).setDepth(80)
      badge.x=Math.min(badge.x,VIEW_WIDTH-4-badge.width);layer.add(badge)
    })
  }

  private handleUnit(unit:Unit,fromHologram=false){
    if(this.engine.state.phase==='배치'){if(unit.team==='아군')this.engine.selectDeployUnit(unit.id);return}
    if(this.engine.state.phase!=='계획')return
    if(this.mode==='이동'){
      const slotIndex=this.engine.state.slots.findIndex(slot=>slot.unitId===unit.id);if(slotIndex>=0){const closingEnemyFocus=unit.team==='적군'&&this.threatFocusSlot===slotIndex,resetOwnPath=unit.team==='아군'&&!fromHologram&&this.threatFocusSlot===undefined&&this.engine.selectedUnit?.id===unit.id&&(this.engine.selectedPlan?.path.length??0)>1;this.planView=closingEnemyFocus?'all':'current';this.threatFocusSlot=unit.team==='적군'&&!closingEnemyFocus?slotIndex:undefined;if(unit.team==='아군'){this.engine.selectSlot(slotIndex);if(resetOwnPath){this.endMoveDrag();this.engine.setPath([{...unit.position}]);this.onViewChange();return}this.beginMoveDrag(unit.position)}else{this.renderBoard();this.onViewChange()}}
    }else{
      const selected=this.engine.selectedUnit;if(!selected)return
      const definition=this.mode==='일반공격'?selected.normalAttack:this.engine.getSkill(selected)
      if(definition?.targeting==='대상'){const action=this.engine.selectedPlan?.action,repeat=action?.kind===this.mode&&action.targetUnitId===unit.id;this.engine.planTarget(this.mode,unit.id);this.onPlanGesture(repeat)}
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
      const action=plan.action,repeat=action.kind===this.mode&&action.targetCell?.x===point.x&&action.targetCell?.y===point.y;this.engine.planCell(this.mode,point);this.onPlanGesture(repeat)
    }else if(definition?.targeting==='방향'){
      const origin=plan.path[plan.path.length-1],dx=point.x-origin.x,dy=point.y-origin.y;let direction:Direction|undefined
      if(dx===0&&dy<0)direction='상';else if(dx===0&&dy>0)direction='하';else if(dy===0&&dx<0)direction='좌';else if(dy===0&&dx>0)direction='우'
      if(direction&&distance(origin,point)<=definition.range){const repeat=plan.action.kind===this.mode&&plan.action.direction===direction;this.engine.planDirection(this.mode,direction);this.onPlanGesture(repeat)}
    }
  }

  private handleMoveTilePointer(point:Point){
    if(this.threatFocusSlot!==undefined){this.exitThreatFocus();return}
    const plan=this.engine.selectedPlan,pathIndex=plan?.path.findIndex(candidate=>candidate.x===point.x&&candidate.y===point.y)??-1
    if(pathIndex>=0){this.beginMoveDrag(point);return}
    const occupied=this.engine.livingUnits.some(unit=>unit.position.x===point.x&&unit.position.y===point.y)
    if(occupied)return
    this.planView='summary';this.threatFocusSlot=undefined;this.endMoveDrag();this.engine.clearSelection();this.onViewChange()
  }

  private exitThreatFocus(){
    this.planView='all';this.threatFocusSlot=undefined;this.mode='이동';this.endMoveDrag();this.engine.clearSelection();this.onViewChange()
    this.renderBoard()
  }

  private beginMoveDrag(point:Point){
    const unit=this.engine.selectedUnit,plan=this.engine.selectedPlan
    if(this.engine.state.phase!=='계획'||this.mode!=='이동'||unit?.team!=='아군'||!plan)return
    const pathIndex=plan.path.findIndex(candidate=>candidate.x===point.x&&candidate.y===point.y)
    if(pathIndex<0)return
    this.dragUnitId=unit.id;this.dragStarted=false;this.dragBasePath=plan.path.slice(0,pathIndex+1).map(candidate=>({...candidate}))
  }

  private continueMoveDrag(point:Point,pointer:Phaser.Input.Pointer){
    if(!pointer.isDown||!this.dragUnitId)return
    const unit=this.engine.selectedUnit,plan=this.engine.selectedPlan
    if(!unit||unit.id!==this.dragUnitId||!plan)return
    const path=this.dragStarted?plan.path:this.dragBasePath,last=path[path.length-1]
    if(distance(last,point)!==1)return
    const existing=path.findIndex(candidate=>candidate.x===point.x&&candidate.y===point.y)
    const nextPath=existing>=0?path.slice(0,existing+1):[...path,{...point}]
    if(this.engine.setPath(nextPath))this.dragStarted=true
  }

  private pointFromPointer(pointer:Phaser.Input.Pointer){
    const horizontal=(pointer.worldX-BOARD_ORIGIN_X)/(ISO_WIDTH/2),vertical=(pointer.worldY-BOARD_ORIGIN_Y)/(ISO_HEIGHT/2)
    const point={x:Math.round((horizontal+vertical)/2),y:Math.round((vertical-horizontal)/2)}
    return point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize?undefined:point
  }

  private continueMoveFromPointer(pointer:Phaser.Input.Pointer){
    if(!pointer.isDown||!this.dragUnitId)return
    const point=this.pointFromPointer(pointer)
    if(point)this.continueMoveDrag(point,pointer)
  }

  private endMoveDrag(){this.dragUnitId=undefined;this.dragStarted=false;this.dragBasePath=[]}

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

  private isMoveReachable(point:Point){
    if(this.engine.state.phase!=='계획'||this.mode!=='이동')return false
    const unit=this.engine.selectedUnit
    return Boolean(unit?.team==='아군'&&distance(unit.position,point)<=this.engine.getMoveRange(unit))
  }
}
