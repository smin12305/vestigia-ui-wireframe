import Phaser from 'phaser'
import { pause, motionReduced, playCue } from '../presentation'
import { BattleEngine, distance, rebasePath } from '../game/engine'
import type { AttackPresentationEvent, CombatTextEvent, CounterPresentationEvent, Direction, ForcedMovePreview, ImpactPresentationEvent, Point, TimeAdvanceEvent, Unit } from '../game/types'
import { isPointInPattern } from '../game/patterns'
import { CHARACTER_TEXTURES } from './characterAssets'

// 고원지대 경기장 안쪽 테두리의 경사(세로/가로 약 0.58)에 맞춘 투영값이다.
const VIEW_WIDTH=960,CAMERA_VIEW_WIDTH=1130,CAMERA_ZOOM=1920/CAMERA_VIEW_WIDTH,BASE_ISO_WIDTH=81.49,BASE_ISO_HEIGHT=49.4,BOARD_ORIGIN_X=481,BOARD_CENTER_Y=474,CAMERA_CENTER_Y=425.25
let ISO_WIDTH=BASE_ISO_WIDTH,ISO_HEIGHT=BASE_ISO_HEIGHT,BOARD_ORIGIN_Y=112
const UNIT_BASE_OFFSET_Y=6,UNIT_FEET_OFFSET_Y=9,UNIT_HP_OFFSET_Y=20
const directionVector:Record<Direction,Point>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
const oppositeDirection:Record<Direction,Direction>={상:'하',하:'상',좌:'우',우:'좌'}
const screenPoint=(point:Point)=>({x:BOARD_ORIGIN_X+(point.x-point.y)*ISO_WIDTH/2,y:BOARD_ORIGIN_Y+(point.x+point.y)*ISO_HEIGHT/2})
const centeredDiamond=(inset=2)=>{const halfW=ISO_WIDTH/2-inset,halfH=ISO_HEIGHT/2-inset;return[new Phaser.Geom.Point(0,-halfH),new Phaser.Geom.Point(halfW,0),new Phaser.Geom.Point(0,halfH),new Phaser.Geom.Point(-halfW,0)]}
const localDiamond=(inset=2)=>{const halfW=ISO_WIDTH/2-inset,halfH=ISO_HEIGHT/2-inset;return centeredDiamond(inset).map(vertex=>new Phaser.Geom.Point(vertex.x+halfW,vertex.y+halfH))}
const diamond=(point:Point,inset=2)=>{const {x,y}=screenPoint(point);return centeredDiamond(inset).map(vertex=>new Phaser.Geom.Point(vertex.x+x,vertex.y+y))}
const paintDiamond=(graphics:Phaser.GameObjects.Graphics,point:Point,fill:number,fillAlpha:number,stroke:number,strokeAlpha:number,width=2)=>{const points=diamond(point,5);graphics.fillStyle(fill,fillAlpha).fillPoints(points,true);graphics.lineStyle(width,stroke,strokeAlpha).strokePoints(points,true)}
const inAreaForInput=(origin:Point,target:Point,patternId:string|undefined,range:number)=>origin.x===target.x&&origin.y===target.y||isPointInPattern(origin,target,patternId,range)
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
  private enemyPreviewing=false
  private timeBonusShake?:Animation
  private lastShakeAt=0
  private lastSoundAt=0
  private activeUltimate=false
  private unitPositions=new Map<string,Point>()
  private previewCancelled=false
  private previewSpeed=1
  private ambientTweens:Phaser.Tweens.Tween[]=[]
  constructor(private engine:BattleEngine,private onViewChange:()=>void=()=>{},private onPlanGesture:(repeat:boolean)=>void=()=>{},private isActionConfirmed:(unitId:string)=>boolean=()=>false){super('battle')}
  preload(){for(const asset of Object.values(CHARACTER_TEXTURES))this.load.image(asset.key,asset.url)}
  create(){this.cameras.main.setBackgroundColor('rgba(0,0,0,0)').setZoom(CAMERA_ZOOM).centerOn(VIEW_WIDTH/2,CAMERA_CENTER_Y);this.engine.addEventListener('change',()=>this.renderBoard());this.engine.addEventListener('combat-text',event=>this.showCombatText((event as CustomEvent<CombatTextEvent>).detail));this.engine.addEventListener('attack-presentation',event=>this.showAttackPresentation((event as CustomEvent<AttackPresentationEvent>).detail));this.engine.addEventListener('impact-presentation',event=>this.showImpactPresentation((event as CustomEvent<ImpactPresentationEvent>).detail));this.engine.addEventListener('counter-presentation',event=>this.showCounterPresentation((event as CustomEvent<CounterPresentationEvent>).detail));this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(this.engine.state.phase==='계획'&&this.mode!=='이동'){const point=this.pointFromPointer(pointer);if(point)this.handlePoint(point)}});this.input.on('pointermove',(pointer:Phaser.Input.Pointer)=>this.continueMoveFromPointer(pointer));this.input.on('pointerup',()=>this.endMoveDrag());this.renderBoard()}
  setInputMode(mode:InputMode){this.mode=mode;this.renderBoard()}
  getInputMode(){return this.mode}
  setPlanView(mode:PlanViewMode){this.planView=mode;if(mode!=='current')this.threatFocusSlot=undefined;this.renderBoard()}
  getPlanView(){return this.planView}
  setThreatFocus(slotIndex:number){this.planView='current';this.threatFocusSlot=this.threatFocusSlot===slotIndex?undefined:slotIndex;if(this.threatFocusSlot===undefined)this.planView='all';this.renderBoard();return this.threatFocusSlot}
  focusThreat(slotIndex:number){this.planView='current';this.threatFocusSlot=slotIndex;this.renderBoard()}
  clearThreatFocus(){this.threatFocusSlot=undefined;this.renderBoard()}
  getThreatFocus(){return this.threatFocusSlot}
  private isVisibleSlot(index:number){
    if(this.engine.state.phase==='실행')return index===this.engine.state.executingSlot
    if(this.engine.state.phase==='계획'){const slot=this.engine.state.slots[index];return slot?.team==='적군'||index===this.engine.state.selectedSlot||Boolean(slot?.team==='아군'&&this.isActionConfirmed(slot.unitId))}
    return true
  }
  private isEmphasizedSlot(index:number){return this.threatFocusSlot!==undefined?index===this.threatFocusSlot:(this.engine.state.phase==='실행'?index===this.engine.state.executingSlot:index===this.engine.state.selectedSlot)}

  private renderBoard(){
    const boardSize=this.engine.boardSize,tileScale=1.7
    ISO_WIDTH=BASE_ISO_WIDTH*tileScale;ISO_HEIGHT=BASE_ISO_HEIGHT*tileScale;BOARD_ORIGIN_Y=BOARD_CENTER_Y-(boardSize-1)*ISO_HEIGHT/2
    this.ambientTweens.forEach(tween=>tween.remove());this.ambientTweens=[]
    this.layer?.destroy(true);const layer=this.add.container(0,0);this.layer=layer
    const moveReachableCells:Point[]=[]
    for(let y=0;y<boardSize;y++)for(let x=0;x<boardSize;x++){
      const p={x,y},acceptingAllyInput=this.threatFocusSlot===undefined,planning=acceptingAllyInput&&this.engine.state.phase==='계획',counterRange=planning&&this.isCounterRangePreview(p),targetable=planning&&this.isTargetable(p),inCastRange=planning&&this.isInCastRange(p),moveReachable=planning&&this.isMoveReachable(p)
      const deploy=this.engine.state.phase==='배치'
      if(moveReachable)moveReachableCells.push(p)
      const allyDeployCell=deploy&&y>=Math.ceil(boardSize*2/3),attackRange=(targetable||inCastRange)&&!counterRange
      const fill=attackRange?0x55cdec:deploy&&allyDeployCell?0x55cdec:0x000000
      const fillAlpha=attackRange ? .28 : deploy&&allyDeployCell ? .18 : 0
      const stroke=attackRange?0x70dcf7:deploy&&allyDeployCell?0x55d9ff:0x718087
      const emphasized=attackRange||deploy&&allyDeployCell
      const center=screenPoint(p),tile=this.add.polygon(center.x,center.y,localDiamond(),fill,fillAlpha).setStrokeStyle(emphasized?2:1,stroke,emphasized ? .96 : .58).setInteractive({useHandCursor:true})
      tile.on('pointerdown',()=>{
        if(this.engine.state.phase==='계획'&&this.threatFocusSlot!==undefined){this.exitThreatFocus();return}
        if(this.mode==='이동'&&this.engine.state.phase==='계획')this.handleMoveTilePointer(p)
        else if(this.engine.state.phase==='배치')this.handlePoint(p)
      })
      tile.on('pointerover',(pointer:Phaser.Input.Pointer)=>this.continueMoveDrag(p,pointer));layer.add(tile)
    }
    if(moveReachableCells.length)this.drawRangeBoundary(layer,moveReachableCells,0x58d7ff,1,4,11)
    this.drawFocusedEnemyRange(layer)
    this.drawAllPaths(layer)
    this.drawConfirmedAllyActionRanges(layer)
    this.drawDestinationHolograms(layer)
    this.drawTargetingOrigin(layer)
    this.drawTargetLinks(layer)
    this.drawDirectionIntents(layer)
    ;[...this.engine.livingUnits].sort((a,b)=>(a.position.x+a.position.y)-(b.position.x+b.position.y)||a.position.y-b.position.y).forEach(unit=>this.drawUnit(layer,unit))
    this.drawPlannedActionLabels(layer)
    this.drawTargetingFocus(layer)
    if(this.engine.state.phase==='실행'&&this.engine.state.executingSlot>=0){const slot=this.engine.state.slots[this.engine.state.executingSlot],unit=this.engine.state.units.find(u=>u.id===slot?.unitId);if(unit){const point=screenPoint(unit.position),marker=this.add.ellipse(point.x,point.y+12,68,32,0xffffff,0).setStrokeStyle(4,0xffd56a,1);layer.add(marker)}}
  }

  private drawRangeBoundary(layer:Phaser.GameObjects.Container,cells:Point[],color:number,alpha=.9,width=3,depth=18){
    const keys=new Set(cells.map(point=>`${point.x},${point.y}`)),graphics=this.add.graphics().setDepth(depth)
    const neighbors=[{dx:0,dy:-1,a:0,b:1},{dx:1,dy:0,a:1,b:2},{dx:0,dy:1,a:2,b:3},{dx:-1,dy:0,a:3,b:0}]
    graphics.lineStyle(width,color,alpha)
    for(const point of cells){const vertices=diamond(point,3);for(const edge of neighbors)if(!keys.has(`${point.x+edge.dx},${point.y+edge.dy}`))graphics.beginPath().moveTo(vertices[edge.a].x,vertices[edge.a].y).lineTo(vertices[edge.b].x,vertices[edge.b].y).strokePath()}
    layer.add(graphics)
  }

  private isTargetingInputActive(){return this.engine.state.phase==='계획'&&this.threatFocusSlot===undefined&&this.mode!=='이동'&&this.engine.selectedUnit?.team==='아군'&&Boolean(this.engine.selectedPlan)}

  private isTargetingAllowedPoint(point:Point){
    if(!this.isTargetingInputActive())return true
    const selected=this.engine.selectedUnit
    return Boolean(selected&&(selected.position.x===point.x&&selected.position.y===point.y||this.isTargetable(point)||this.isInCastRange(point)))
  }

  private drawTargetingFocus(layer:Phaser.GameObjects.Container){
    if(!this.isTargetingInputActive())return
    const visibleHeight=1080/CAMERA_ZOOM,dim=this.add.rectangle(VIEW_WIDTH/2,CAMERA_CENTER_Y,CAMERA_VIEW_WIDTH,visibleHeight,0x020507,.7).setDepth(300)
    layer.add(dim)
    const range=this.add.graphics().setDepth(301)
    for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++){
      const point={x,y};if(!this.isTargetable(point)&&!this.isInCastRange(point))continue
      const counterRange=this.isCounterRangePreview(point),origin=this.engine.selectedPlan?.path.at(-1)
      if(counterRange&&origin&&(point.x!==origin.x||point.y!==origin.y))this.paintHatchedDiamond(range,point,0x55cdec,.95)
      else paintDiamond(range,point,0x55cdec,.28,0x70dcf7,.98,3)
    }
    layer.add(range)
    this.drawSelectedTargetingHologram(layer)
    ;[...this.engine.livingUnits].filter(unit=>this.isTargetingAllowedPoint(unit.position)).sort((a,b)=>(a.position.x+a.position.y)-(b.position.x+b.position.y)||a.position.y-b.position.y).forEach(unit=>this.drawUnit(layer,unit))
  }

  private drawSelectedTargetingHologram(layer:Phaser.GameObjects.Container){
    const unit=this.engine.selectedUnit,point=this.engine.selectedPlan?.path.at(-1)
    if(!unit||!point||(unit.position.x===point.x&&unit.position.y===point.y))return
    const projected=screenPoint(point),x=projected.x,y=projected.y,color=0x65d9ff,ring=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,48,20,color,.14).setStrokeStyle(3,color,.95),asset=CHARACTER_TEXTURES[unit.id],visuals:Phaser.GameObjects.GameObject[]=[ring]
    if(asset&&this.textures.exists(asset.key))visuals.push(fitTexture(this.add.image(x,y+UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),46,62).setTint(color).setAlpha(.52).setBlendMode(Phaser.BlendModes.ADD))
    else visuals.push(this.add.circle(x,y,21,color,.25).setStrokeStyle(3,color,.9),this.add.text(x,y-2,unit.name.slice(-1),{fontFamily:'sans-serif',fontSize:'19px',fontStyle:'bold',color:'#b9f3ff'}).setOrigin(.5).setAlpha(.75))
    const label=this.add.text(x,y-40,'이동 후 기준',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'9px',fontStyle:'bold',color:'#d8f8ff',backgroundColor:'#0b3039dd',stroke:'#071013',strokeThickness:2}).setOrigin(.5,1).setPadding(4,2),hitArea=this.add.zone(x,y-15,46,64).setInteractive({useHandCursor:this.isTargetable(point)||this.isInCastRange(point)})
    hitArea.on('pointerdown',(_pointer:Phaser.Input.Pointer,_localX:number,_localY:number,event:{stopPropagation:()=>void})=>{event.stopPropagation();if(this.isTargetable(point)||this.isInCastRange(point))this.handlePoint(point)})
    layer.add([...visuals,label,hitArea])
  }

  private drawTargetingOrigin(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return
    const origin=this.engine.selectedPlan?.path.at(-1);if(!origin)return
    const {x,y}=screenPoint(origin)
    const marker=this.add.ellipse(x,y+10,66,30,0x71d6b5,.1).setStrokeStyle(3,0x8ff0cf,1)
    layer.add(marker)
    const selected=this.engine.selectedUnit,skill=this.mode==='스킬'&&selected?this.engine.getSkill(selected):undefined
    if(skill?.targeting==='자가 버프형'&&skill.effects.some(effect=>effect.type==='반격')){
      const label=this.add.text(x,y-42,'반격 범위 · 3×3',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'12px',fontStyle:'bold',color:'#ffe2a0',backgroundColor:'#36240ddd',stroke:'#120b03',strokeThickness:3}).setOrigin(.5,1).setPadding(6,3).setDepth(24)
      layer.add(label)
    }
  }

  private drawFocusedEnemyRange(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획'||this.threatFocusSlot===undefined)return
    const slot=this.engine.state.slots[this.threatFocusSlot],actor=this.engine.state.units.find(unit=>unit.id===slot?.unitId)
    if(!slot||!actor||actor.team!=='적군')return
    const moveCells:Point[]=[]
    for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(distance(actor.position,{x,y})<=this.engine.getMoveRange(actor))moveCells.push({x,y})
    this.drawRangeBoundary(layer,moveCells,0xf06f72,.95,4,10)
    if(slot.plan.action.kind==='없음')return
    const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor)
    if(!definition)return
    const threat=this.engine.getEnemyThreatPredictions().find(item=>item.slotIndex===this.threatFocusSlot),origin=threat?.origin??slot.plan.path.at(-1)
    if(!origin)return
    const graphics=this.add.graphics().setDepth(12)
    for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(definition.targeting==='자기 기준형'?(origin.x===x&&origin.y===y||isPointInPattern(origin,{x,y},definition.affectedCellPatternId??definition.rangePatternId,definition.range)):isPointInPattern(origin,{x,y},definition.rangePatternId,definition.range)){
      paintDiamond(graphics,{x,y},0xef746e,.25,0xef8a82,.82)
    }
    const selectedCells:Point[]=[]
    if(definition.targeting==='자기 기준형')for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(inAreaForInput(origin,{x,y},definition.affectedCellPatternId??definition.rangePatternId,definition.range))selectedCells.push({x,y})
    else if(slot.plan.action.relativeTarget){const target={x:origin.x+slot.plan.action.relativeTarget.x,y:origin.y+slot.plan.action.relativeTarget.y};if(definition.affectedCellPatternId)for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(inAreaForInput(target,{x,y},definition.affectedCellPatternId,1))selectedCells.push({x,y});else selectedCells.push(target)}
    else if(slot.plan.action.direction){const vector=directionVector[slot.plan.action.direction];for(let step=1;step<=definition.range;step++){const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step};if(point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize)break;selectedCells.push(point)}}
    for(const cell of selectedCells)paintDiamond(graphics,cell,0x8f2028,.58,0xe33842,.98,3)
    const projected=screenPoint(origin),ox=projected.x,oy=projected.y,originRing=this.add.ellipse(ox,oy+10,68,31,0xef746e,.07).setStrokeStyle(3,0xff9d95,.9).setDepth(13)
    layer.add([graphics,originRing])
  }

  private paintHatchedDiamond(graphics:Phaser.GameObjects.Graphics,point:Point,color:number,alpha:number){
    const vertices=diamond(point,6),[top,right,bottom,left]=vertices
    graphics.fillStyle(color,alpha*.2).fillPoints(vertices,true);graphics.lineStyle(2,color,alpha).strokePoints(vertices,true)
    graphics.lineStyle(3,color,alpha*.9)
    for(const t of [.12,.36,.6,.84]){
      const from={x:Phaser.Math.Linear(left.x,top.x,t),y:Phaser.Math.Linear(left.y,top.y,t)},to={x:Phaser.Math.Linear(bottom.x,right.x,t),y:Phaser.Math.Linear(bottom.y,right.y,t)}
      graphics.beginPath().moveTo(from.x,from.y).lineTo(to.x,to.y).strokePath()
    }
  }

  private drawConfirmedAllyActionRanges(layer:Phaser.GameObjects.Container){
    if(this.engine.state.phase!=='계획')return
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(slot.team!=='아군'||!this.isActionConfirmed(slot.unitId)||slot.plan.action.kind==='없음')return
      const actor=this.engine.state.units.find(unit=>unit.id===slot.unitId&&unit.hp>0),origin=slot.plan.path.at(-1);if(!actor||!origin)return
      const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor);if(!definition)return
      const active=this.isEmphasizedSlot(slotIndex),graphics=this.add.graphics().setDepth(active?34:28),alpha=active?.82:.48
      if(definition.targeting==='자가 버프형'&&slot.plan.action.kind==='스킬'&&this.engine.getSkill(actor)?.effects.some(effect=>effect.type==='반격')){
        for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if((x!==origin.x||y!==origin.y)&&Math.max(Math.abs(origin.x-x),Math.abs(origin.y-y))<=1)this.paintHatchedDiamond(graphics,{x,y},0x55cdec,alpha)
        layer.add(graphics);return
      }
      const cells:Point[]=[]
      if(definition.targeting==='자기 기준형'){
        for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(inAreaForInput(origin,{x,y},definition.affectedCellPatternId??definition.rangePatternId,definition.range))cells.push({x,y})
      }else if(slot.plan.action.relativeTarget){
        const target={x:origin.x+slot.plan.action.relativeTarget.x,y:origin.y+slot.plan.action.relativeTarget.y}
        if(definition.affectedCellPatternId)for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(inAreaForInput(target,{x,y},definition.affectedCellPatternId,1))cells.push({x,y})
      }
      for(const cell of cells)paintDiamond(graphics,cell,0x145a88,alpha*.62,0x3aaeff,alpha,active?3:2)
      if(cells.length)layer.add(graphics)
    })
  }

  private drawDirectionIntents(layer:Phaser.GameObjects.Container){
    const phase=this.engine.state.phase
    if(phase!=='계획'&&phase!=='실행')return
    this.engine.state.slots.forEach((slot,slotIndex)=>{
      if(!this.isVisibleSlot(slotIndex))return
      if(phase==='실행'&&slot.result!=='대기')return
      if(slot.plan.action.kind==='없음'||!slot.plan.action.direction&&!slot.plan.action.relativeTarget)return
      const actor=this.engine.state.units.find(unit=>unit.id===slot.unitId);if(!actor)return
      const definition=slot.plan.action.kind==='일반공격'?actor.normalAttack:this.engine.getSkill(actor);if(!definition)return
      const origin=phase==='실행'?actor.position:slot.plan.path.at(-1);if(!origin)return
      const relative=slot.plan.action.relativeTarget,target=relative?{x:origin.x+relative.x,y:origin.y+relative.y}:undefined
      if(target){
        const active=this.isEmphasizedSlot(slotIndex),color=slot.team==='적군'?0xef746e:0x66d3eb,alpha=active?.95:slot.team==='적군'?.55:.3,graphics=this.add.graphics().setDepth(active?50:36),from=screenPoint(origin),to=screenPoint(target),control={x:(from.x+to.x)/2,y:Math.min(from.y,to.y)-80}
        graphics.lineStyle(active?4:3,color,alpha).beginPath().moveTo(from.x,from.y);for(let step=1;step<=16;step++){const t=step/16,inv=1-t;graphics.lineTo(inv*inv*from.x+2*inv*t*control.x+t*t*to.x,inv*inv*from.y+2*inv*t*control.y+t*t*to.y)}graphics.strokePath();paintDiamond(graphics,target,color,.2*alpha,color,.8*alpha,active?3:2);layer.add(graphics);return
      }
      if(!slot.plan.action.direction)return
      const direction=slot.plan.action.direction,vector=directionVector[direction],points:Point[]=[]
      for(let step=1;step<=definition.range;step++){const point={x:origin.x+vector.x*step,y:origin.y+vector.y*step};if(point.x<0||point.y<0||point.x>=this.engine.boardSize||point.y>=this.engine.boardSize)break;points.push(point)}
      if(!points.length)return
      const active=this.isEmphasizedSlot(slotIndex),overview=phase==='계획'&&this.threatFocusSlot===undefined,color=slot.team==='적군'?0xef746e:0x66d3eb,alpha=active?.95:slot.team==='적군'?(overview?.28:.58):.25
      const graphics=this.add.graphics().setDepth(active?50:36),projectedOrigin=screenPoint(origin),originX=projectedOrigin.x,originY=projectedOrigin.y
      for(const point of points)paintDiamond(graphics,point,color,alpha*.2,color,alpha*.76,active?3:2)
      const end=points[points.length-1],projectedEnd=screenPoint(end),endX=projectedEnd.x,endY=projectedEnd.y
      graphics.lineStyle(active?3:2,color,alpha).beginPath().moveTo(originX,originY).lineTo(endX,endY).strokePath()
      const forceEffect=slot.plan.action.kind==='스킬'?this.engine.getSkill(actor)?.effects.find(effect=>effect.type==='밀치기'||effect.type==='당기기'):undefined
      if(forceEffect){
        const forceDirection=forceEffect.type==='밀치기'?direction:oppositeDirection[direction],forceColor=forceEffect.type==='밀치기'?0xffcf5a:0xc99cff
        for(const point of points)this.drawCellDirectionArrow(graphics,point,forceDirection,forceColor,active?1:Math.max(.55,alpha),active,Math.max(1,Math.min(3,forceEffect.value)))
      }else{
        const labelX=(originX+endX)/2-vector.y*14,labelY=(originY+endY)/2+vector.x*14
        const arrow=this.add.text(labelX,labelY,({상:'↑',하:'↓',좌:'←',우:'→'} as Record<Direction,string>)[direction],{fontFamily:'sans-serif',fontSize:active?'22px':'16px',fontStyle:'bold',color:slot.team==='적군'?'#ffd0cb':'#c8f5ff',stroke:'#071013',strokeThickness:4}).setOrigin(.5).setDepth(active?53:39).setAlpha(alpha);layer.add(arrow)
      }
      layer.add(graphics)
      for(const preview of this.engine.getForcedMovePreviews(slotIndex))if(preview.immune||preview.moved===0)this.drawForcedMovePreview(layer,preview,active,alpha)
    })
  }

  private drawCellDirectionArrow(graphics:Phaser.GameObjects.Graphics,point:Point,direction:Direction,color:number,alpha:number,active:boolean,count=1){
    const center=screenPoint(point),step=directionVector[direction],next=screenPoint({x:point.x+step.x,y:point.y+step.y}),dx=next.x-center.x,dy=next.y-center.y,length=Math.max(1,Math.hypot(dx,dy)),ux=dx/length,uy=dy/length,px=-uy,py=ux
    const offsets=count===1?[{along:0,side:0}]:count===2?[{along:0,side:-7},{along:0,side:7}]:[{along:7,side:0},{along:-6,side:-8},{along:-6,side:8}]
    for(const offset of offsets){const cx=center.x+ux*offset.along+px*offset.side,cy=center.y+uy*offset.along+py*offset.side,x1=cx-ux*8,y1=cy-uy*8,x2=cx+ux*9,y2=cy+uy*9
      graphics.lineStyle(active?5:4,0x071013,alpha*.72).beginPath().moveTo(x1+1,y1+1).lineTo(x2+1,y2+1).strokePath()
      graphics.lineStyle(active?3:2,color,alpha).beginPath().moveTo(x1,y1).lineTo(x2,y2).strokePath()
      graphics.fillStyle(0x071013,alpha*.76).fillTriangle(x2+1,y2+1,x2-ux*8+px*5+1,y2-uy*8+py*5+1,x2-ux*8-px*5+1,y2-uy*8-py*5+1)
      graphics.fillStyle(color,alpha).fillTriangle(x2,y2,x2-ux*8+px*5,y2-uy*8+py*5,x2-ux*8-px*5,y2-uy*8-py*5)
    }
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
    if(!definition||!plan.action.relativeTarget)return
    const origin=phase==='실행'?{...actor.position}:plan.path.at(-1)
    if(!origin)return
    const target={x:origin.x+plan.action.relativeTarget.x,y:origin.y+plan.action.relativeTarget.y}
    return{origin,target,range:definition.range,patternId:definition.rangePatternId,team:slot.team,key:`${slotIndex}:${plan.action.kind}:${plan.action.relativeTarget.x},${plan.action.relativeTarget.y}`}
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

  private showImpactPresentation(effect:ImpactPresentationEvent){
    const from=screenPoint(effect.actorPosition),to=screenPoint(effect.targetPosition),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const color=effect.defeated?0xff4d5f:effect.critical?0xffd85a:effect.actionKind==='스킬'?0xc99cff:0x80e8ff
    if(!reduced&&(effect.critical||this.activeUltimate))this.playScreenShake(this.activeUltimate?'ultimate':'critical')
    if(this.time.now-this.lastSoundAt>45){playCue(this.activeUltimate?'ultimate':effect.critical?'critical':effect.actionKind==='반격'?'counter':'hit');this.lastSoundAt=this.time.now}
    const body=this.layer?.getByName('unit-'+effect.targetId) as Phaser.GameObjects.Container|undefined
    const sprite=body?.list.find(child=>child instanceof Phaser.GameObjects.Image) as Phaser.GameObjects.Image|undefined
    if(sprite&&!effect.defeated){sprite.setTintFill(0xffffff);this.time.delayedCall(65,()=>{if(sprite.active)sprite.clearTint()})}
    if(!reduced&&(effect.critical||this.activeUltimate)){this.tweens.timeScale=0;window.setTimeout(()=>{this.tweens.timeScale=1},55)}

    const ring=this.add.circle(to.x,to.y-8,14,color,.42).setStrokeStyle(effect.defeated?7:5,0xffffff,1).setDepth(231).setScale(.35)
    const slash=this.add.rectangle(to.x,to.y-10,effect.defeated?92:68,effect.defeated?9:6,0xffffff,.92).setRotation(Math.atan2(to.y-from.y,to.x-from.x)-.2).setDepth(232).setScale(.35).setBlendMode(Phaser.BlendModes.ADD)
    this.tweens.add({targets:ring,scale:effect.defeated?4.2:effect.critical?3.3:2.6,alpha:0,duration:effect.defeated?520:360,ease:'Cubic.Out',onComplete:()=>ring.destroy()})
    this.tweens.add({targets:slash,scaleX:1.15,scaleY:.3,alpha:0,duration:240,ease:'Cubic.Out',onComplete:()=>slash.destroy()})
    const shardCount=reduced?4:effect.defeated?18:effect.critical?13:8
    for(let index=0;index<shardCount;index++){
      const angle=Math.PI*2*index/shardCount+Phaser.Math.FloatBetween(-.18,.18),distance=Phaser.Math.Between(effect.defeated?55:34,effect.defeated?105:72)
      const shard=this.add.rectangle(to.x,to.y-8,Phaser.Math.Between(3,8),Phaser.Math.Between(2,5),index%3===0?0xffffff:color,1).setRotation(angle).setDepth(230).setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({targets:shard,x:to.x+Math.cos(angle)*distance,y:to.y-8+Math.sin(angle)*distance*.55,rotation:angle+2,scale:.2,alpha:0,duration:reduced?260:effect.defeated?620:440,ease:'Cubic.Out',onComplete:()=>shard.destroy()})
    }
    if(!effect.critical&&!effect.defeated)return
    const caption=effect.defeated?(effect.actionKind==='반격'?'반격 사살':effect.critical?'치명타 사살':'사살'):'치명타'
    const label=this.add.text((from.x+to.x)/2,(from.y+to.y)/2-62,caption,{fontFamily:'Malgun Gothic, sans-serif',fontSize:effect.defeated?'25px':'21px',fontStyle:'bold',color:effect.defeated?'#fff1f2':'#fff0a8',stroke:effect.defeated?'#5a0713':'#402e00',strokeThickness:7}).setOrigin(.5).setDepth(235).setScale(.55)
    this.tweens.add({targets:label,scale:1.08,y:label.y-10,duration:140,ease:'Back.Out',onComplete:()=>this.tweens.add({targets:label,y:label.y-22,alpha:0,delay:effect.defeated?280:150,duration:230,onComplete:()=>label.destroy()})})
    if(effect.defeated){
      const fallen=this.createUnitMotionGhost(effect.targetId,effect.targetPosition,229,0xff7a83)
      this.tweens.add({targets:fallen,x:to.x+(to.x-from.x)*.08,y:to.y+20,angle:(to.x>=from.x?1:-1)*18,scaleX:1.08,scaleY:.72,alpha:0,duration:520,ease:'Cubic.Out',onComplete:()=>fallen.destroy()})
      const aura=this.add.ellipse(from.x,from.y+10,54,22,color,.22).setStrokeStyle(4,color,.9).setDepth(228)
      this.tweens.add({targets:aura,scaleX:2.2,scaleY:2.2,alpha:0,duration:520,ease:'Cubic.Out',onComplete:()=>aura.destroy()})
    }
  }

  private playScreenShake(kind:'critical'|'ultimate'){
    if(this.time.now-this.lastShakeAt<180)return
    this.lastShakeAt=this.time.now
    const screen=document.querySelector<HTMLElement>('#app');if(!screen)return
    const scale=kind==='ultimate'?.75:.42,duration=kind==='ultimate'?220:130
    this.timeBonusShake?.cancel()
    this.timeBonusShake=screen.animate([
      {transform:'translate3d(0,0,0)'},
      {transform:`translate3d(${-11*scale}px,${3*scale}px,0) rotate(${-.18*scale}deg)`},
      {transform:`translate3d(${12*scale}px,${-6*scale}px,0) rotate(${.2*scale}deg)`},
      {transform:`translate3d(${-9*scale}px,${6*scale}px,0) rotate(${-.15*scale}deg)`},
      {transform:`translate3d(${8*scale}px,${-4*scale}px,0) rotate(${.12*scale}deg)`},
      {transform:`translate3d(${-5*scale}px,${3*scale}px,0) rotate(${-.08*scale}deg)`},
      {transform:`translate3d(${3*scale}px,${-2*scale}px,0)`},
      {transform:'translate3d(0,0,0)'}
    ],{duration,easing:'linear'})
  }

  private showCombatText(effect:CombatTextEvent){
    const lane=this.fxLanes.get(effect.unitId)??0;this.fxLanes.set(effect.unitId,lane+1)
    const colors:Record<CombatTextEvent['kind'],string>={피해:'#ff8b7c',치명타:'#ffe07a',상태:'#83e1ff',면역:'#c8d0d4',버프:'#ff7068'}
    const projected=screenPoint(effect.position),x=projected.x,y=projected.y-28-lane*18
    const isBuff=effect.kind==='버프'
    const label=this.add.text(x,y,effect.text,{fontFamily:'sans-serif',fontSize:effect.kind==='치명타'?'22px':isBuff?'11px':'19px',fontStyle:'bold',color:colors[effect.kind],stroke:'#071013',strokeThickness:isBuff?3:5,align:'center'}).setOrigin(.5).setDepth(200).setScale(.72).setAlpha(0)
    label.x=Phaser.Math.Clamp(label.x,label.width/2+8,VIEW_WIDTH-label.width/2-8)
    this.tweens.add({targets:label,y:y-42,alpha:1,scale:1,duration:170,ease:'Back.Out',yoyo:false,onComplete:()=>this.tweens.add({targets:label,y:y-62,alpha:0,duration:Math.max(380,Math.min(900,this.engine.presentationDelayMs*.65)),delay:Math.max(300,Math.min(1100,this.engine.presentationDelayMs)),onComplete:()=>{label.destroy();const remaining=(this.fxLanes.get(effect.unitId)??1)-1;remaining>0?this.fxLanes.set(effect.unitId,remaining):this.fxLanes.delete(effect.unitId)}})})
  }

  private createUnitMotionGhost(unitId:string,point:Point,depth:number,tint?:number){
    const projected=screenPoint(point),unit=this.engine.state.units.find(candidate=>candidate.id===unitId),ghost=this.add.container(projected.x,projected.y).setDepth(depth)
    const asset=unit?CHARACTER_TEXTURES[unit.id]:undefined
    if(asset&&this.textures.exists(asset.key)){
      const image=fitTexture(this.add.image(0,UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),46,62).setAlpha(.96)
      if(tint!==undefined)image.setTint(tint)
      ghost.add(image)
    }else{
      const color=unit?Phaser.Display.Color.HexStringToColor(unit.color).color:0xffffff
      ghost.add(this.add.circle(0,0,22,color,.96).setStrokeStyle(3,tint??0xffffff,1))
    }
    return ghost
  }

  private showAttackPresentation(effect:AttackPresentationEvent){
    this.activeUltimate=Boolean(effect.ultimate)&&!this.enemyPreviewing
    const actor=this.engine.state.units.find(unit=>unit.id===effect.actorId)
    const color=actor?.timeTag==='과거'?0xefc44f:actor?.timeTag==='미래'?0x4baeff:effect.team==='아군'?0x72ddf2:0xff8178
    if(!this.enemyPreviewing)playCue('attack')
    const light=effect.actionKind==='스킬'?'#f0ddff':effect.team==='아군'?'#d8f9ff':'#ffe0dc'
    if(effect.ultimate){
      const point=screenPoint(effect.actorPosition),reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const veil=this.add.rectangle(VIEW_WIDTH/2,CAMERA_CENTER_Y,CAMERA_VIEW_WIDTH,1080/CAMERA_ZOOM,0x130a22,.34).setDepth(238)
      const ring=this.add.ellipse(point.x,point.y+8,72,28,color,.28).setStrokeStyle(6,0xffffff,1).setDepth(240).setBlendMode(Phaser.BlendModes.ADD)
      const title=this.add.text(point.x,point.y-76,'궁극기',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'25px',fontStyle:'bold',color:'#ffffff',stroke:'#331450',strokeThickness:8}).setOrigin(.5).setDepth(242).setScale(.6)
      this.tweens.add({targets:ring,scaleX:reduced?1.3:3.2,scaleY:reduced?1.3:3.2,alpha:0,duration:reduced?260:620,ease:'Cubic.Out',onComplete:()=>ring.destroy()})
      this.tweens.add({targets:title,scale:1.12,y:title.y-10,duration:180,ease:'Back.Out',onComplete:()=>this.tweens.add({targets:title,alpha:0,delay:260,duration:190,onComplete:()=>title.destroy()})})
      this.tweens.add({targets:veil,alpha:0,delay:reduced?80:310,duration:260,onComplete:()=>veil.destroy()})

    }
    const rangeFx=this.add.graphics().setDepth(-1),cells:Point[]=[]
    if(effect.targeting==='방향 선택형'&&effect.direction){
      const v=directionVector[effect.direction]
      for(let step=1;step<=effect.range;step++)cells.push({x:effect.actorPosition.x+v.x*step,y:effect.actorPosition.y+v.y*step})
    }else if(effect.targeting==='자기 기준형'){
      for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(effect.actorPosition.x===x&&effect.actorPosition.y===y||isPointInPattern(effect.actorPosition,{x,y},effect.affectedCellPatternId??effect.rangePatternId,effect.range))cells.push({x,y})
    }else if(effect.trajectory==='곡사'&&effect.targetPoint){
      for(let y=0;y<this.engine.boardSize;y++)for(let x=0;x<this.engine.boardSize;x++)if(effect.targetPoint.x===x&&effect.targetPoint.y===y||isPointInPattern(effect.targetPoint,{x,y},effect.affectedCellPatternId,1))cells.push({x,y})
    }else cells.push({...effect.actorPosition})
    for(const point of cells.filter(point=>point.x>=0&&point.y>=0&&point.x<this.engine.boardSize&&point.y<this.engine.boardSize)){
      paintDiamond(rangeFx,point,color,.22,color,.9)
    }
    const actorPoint=screenPoint(effect.actorPosition),actorX=actorPoint.x,actorY=actorPoint.y
    const target=effect.targetPoint??effect.actorPosition,targetPoint=screenPoint(target),targetX=targetPoint.x,targetY=targetPoint.y
    const angle=Math.atan2(targetY-actorY,targetX-actorX)
    const motionGhost=this.createUnitMotionGhost(effect.actorId,effect.actorPosition,187),motionDistance=effect.targeting==='자가 버프형'?0:Math.min(36,Math.hypot(targetX-actorX,targetY-actorY)*.28)
    if(motionDistance&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)for(const [index,alpha] of [.22,.12].entries()){
      const trail=this.createUnitMotionGhost(effect.actorId,effect.actorPosition,184-index)
      trail.setAlpha(alpha);this.tweens.add({targets:trail,x:actorX+Math.cos(angle)*motionDistance*(.45+index*.22),y:actorY+Math.sin(angle)*motionDistance*(.45+index*.22),alpha:0,duration:220+index*55,ease:'Cubic.Out',onComplete:()=>trail.destroy()})
    }
    this.tweens.add({targets:motionGhost,x:actorX+Math.cos(angle)*motionDistance,y:actorY+Math.sin(angle)*motionDistance-(motionDistance?3:8),scaleX:effect.targeting==='자가 버프형'?1.14:1.1,scaleY:effect.targeting==='자가 버프형'?1.14:.91,duration:Math.max(90,effect.durationMs*.26),ease:'Back.Out',yoyo:true,hold:35,onComplete:()=>motionGhost.destroy()})
    const originFlash=this.add.circle(actorX,actorY,28,color,.12).setStrokeStyle(4,color,1).setDepth(173)
    const label=this.add.text(actorX,actorY-38,effect.actionName,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'13px',fontStyle:'bold',color:light,backgroundColor:effect.actionKind==='스킬'?'#352144':effect.team==='아군'?'#123641':'#4a2023',stroke:'#071013',strokeThickness:3}).setOrigin(.5,1).setPadding(6,3).setDepth(180)
    label.x=Phaser.Math.Clamp(label.x,label.width/2+6,VIEW_WIDTH-6-label.width/2)

    const slash=this.add.graphics().setPosition(actorX+Math.cos(angle)*24,actorY+Math.sin(angle)*24).setRotation(angle).setDepth(181).setScale(.55).setAlpha(0)
    slash.setVisible(effect.trajectory==='없음'&&effect.targeting!=='자가 버프형')
    slash.lineStyle(9,0xffffff,.18).beginPath().arc(0,0,38,-1.02,1.02,false).strokePath()
    slash.lineStyle(5,color,1).beginPath().arc(0,0,36,-1.02,1.02,false).strokePath()
    slash.lineStyle(2,0xffffff,.95).beginPath().arc(0,0,31,-.92,.92,false).strokePath()

    const impact=this.add.circle(targetX,targetY,11,color,.75).setStrokeStyle(3,0xffffff,.9).setDepth(179).setScale(.45).setAlpha(0)
    if(effect.trajectory==='직사'){
      const projectile=this.add.circle(actorX,actorY-12,6,0xffffff,1).setStrokeStyle(3,color,1).setDepth(185)
      this.tweens.add({targets:projectile,x:targetX,y:targetY-8,duration:effect.durationMs,ease:'Linear',onComplete:()=>projectile.destroy()})
    }else if(effect.trajectory==='곡사'){
      const projectile=this.add.circle(actorX,actorY-12,7,0xffffff,1).setStrokeStyle(3,color,1).setDepth(185),progress={value:0},controlX=(actorX+targetX)/2,controlY=Math.min(actorY,targetY)-115
      this.tweens.add({targets:progress,value:1,duration:effect.durationMs,ease:'Sine.In',onUpdate:()=>{const t=progress.value,inv=1-t;projectile.setPosition(inv*inv*actorX+2*inv*t*controlX+t*t*targetX,inv*inv*(actorY-12)+2*inv*t*controlY+t*t*(targetY-8))},onComplete:()=>projectile.destroy()})
    }
    if(effect.actorId==='isaac'&&effect.actionKind==='스킬'){
      for(const cell of cells.filter(p=>p.x>=0&&p.y>=0&&p.x<this.engine.boardSize&&p.y<this.engine.boardSize)){
        const p=screenPoint(cell),column=this.add.rectangle(p.x,p.y,12,70,color,.75).setOrigin(.5,1).setDepth(178).setScale(1,0)
        this.tweens.add({targets:column,scaleY:1,alpha:0,delay:effect.durationMs,duration:300,ease:'Cubic.Out',onComplete:()=>column.destroy()})
      }
    }
    if(effect.actorId==='angelica'){
      const aim=this.add.line(0,0,actorX,actorY-12,targetX,targetY-8,color,.75).setOrigin(0).setDepth(178)
      this.tweens.add({targets:aim,alpha:0,delay:effect.durationMs,duration:180,onComplete:()=>aim.destroy()})
    }
    const flashDuration=Math.max(180,effect.durationMs-70)
    this.tweens.add({targets:rangeFx,alpha:{from:0,to:1},duration:70,yoyo:true,hold:Math.max(20,effect.durationMs-170),ease:'Sine.Out',onComplete:()=>rangeFx.destroy()})
    this.tweens.add({targets:originFlash,scale:{from:.75,to:1.35},alpha:{from:.9,to:0},duration:effect.durationMs,ease:'Cubic.Out',onComplete:()=>originFlash.destroy()})
    this.tweens.add({targets:label,y:label.y-12,alpha:{from:1,to:0},delay:Math.max(80,effect.durationMs-180),duration:180,ease:'Cubic.Out',onComplete:()=>label.destroy()})
    this.tweens.add({targets:slash,rotation:angle+.5,scale:{from:.55,to:1.15},alpha:{from:0,to:1},duration:110,ease:'Back.Out',yoyo:true,hold:35,onComplete:()=>slash.destroy()})
    this.tweens.add({targets:impact,scale:{from:.45,to:2.4},alpha:{from:0,to:.8},delay:effect.durationMs,duration:Math.min(180,flashDuration),ease:'Cubic.Out',onComplete:()=>impact.destroy()})
  }

  private showCounterPresentation(effect:CounterPresentationEvent){
    this.activeUltimate=false
    const from=screenPoint(effect.counterPosition),to=screenPoint(effect.targetPosition),color=0xffd35c,veil=this.add.rectangle(VIEW_WIDTH/2,CAMERA_CENTER_Y,CAMERA_VIEW_WIDTH,1080/CAMERA_ZOOM,0x05080a,.22).setDepth(205),line=this.add.graphics().setDepth(208),label=this.add.text((from.x+to.x)/2,(from.y+to.y)/2-54,'반격',{fontFamily:'sans-serif',fontSize:'22px',fontStyle:'bold',color:'#ffe58c',stroke:'#351500',strokeThickness:6}).setOrigin(.5).setDepth(212)
    const ghost=this.createUnitMotionGhost(effect.counterId,effect.counterPosition,214,0xffdf72),dx=to.x-from.x,dy=to.y-from.y,length=Math.max(1,Math.hypot(dx,dy)),lunge=Math.min(58,length*.58),impact=this.add.circle(to.x,to.y-8,12,color,.8).setStrokeStyle(4,0xffffff,1).setDepth(213).setScale(.3).setAlpha(0)
    line.lineStyle(7,0x090600,.8).beginPath().moveTo(from.x,from.y-15).lineTo(to.x,to.y-15).strokePath();line.lineStyle(3,color,1).beginPath().moveTo(from.x,from.y-15).lineTo(to.x,to.y-15).strokePath()
    this.tweens.add({targets:ghost,x:from.x+dx/length*lunge,y:from.y+dy/length*lunge-4,scaleX:1.12,scaleY:.92,duration:Math.max(150,effect.durationMs*.38),ease:'Sine.InOut',yoyo:true,hold:45,onComplete:()=>ghost.destroy()})
    this.tweens.add({targets:impact,scale:{from:.3,to:2.8},alpha:{from:0,to:.9},delay:effect.durationMs,duration:Math.max(180,effect.durationMs*.45),ease:'Cubic.Out',onComplete:()=>impact.destroy()})
    this.tweens.add({targets:label,scale:{from:.65,to:1.2},alpha:{from:1,to:0},duration:effect.durationMs,onComplete:()=>label.destroy()})
    this.tweens.add({targets:[veil,line],alpha:0,delay:Math.max(80,effect.durationMs*.6),duration:140,onComplete:()=>{veil.destroy();line.destroy()}})
  }

  private showTimeManipulationPresentation(event:TimeAdvanceEvent){
    if(!event.manipulation)return
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches,kind=event.manipulation
    const color=kind==='과거'?0x64d7ff:0xc67aff,label=`${kind} 시간대로 이동`
    const veil=this.add.rectangle(VIEW_WIDTH/2,CAMERA_CENTER_Y,CAMERA_VIEW_WIDTH,1080/CAMERA_ZOOM,kind==='과거'?0x08283d:0x28103d,.28).setDepth(245).setBlendMode(Phaser.BlendModes.ADD)
    const center=this.add.circle(VIEW_WIDTH/2,CAMERA_CENTER_Y,40,color,.08).setStrokeStyle(6,color,.9).setDepth(247).setScale(.3)
    const text=this.add.text(VIEW_WIDTH/2,CAMERA_CENTER_Y-12,label,{fontFamily:'Malgun Gothic, sans-serif',fontSize:'31px',fontStyle:'bold',color:'#ffffff',stroke:kind==='미래'?'#35104e':'#06323b',strokeThickness:8}).setOrigin(.5).setDepth(250).setScale(.6)
    this.tweens.add({targets:center,scale:reduced?2.2:7.5,alpha:0,duration:reduced?260:680,ease:'Cubic.Out',onComplete:()=>center.destroy()})
    this.tweens.add({targets:text,scale:1.08,y:text.y-10,duration:170,ease:'Back.Out',onComplete:()=>this.tweens.add({targets:text,alpha:0,y:text.y-18,delay:reduced?60:230,duration:220,onComplete:()=>text.destroy()})})
    this.tweens.add({targets:veil,alpha:0,delay:reduced?80:260,duration:320,onComplete:()=>veil.destroy()})
    if(reduced)return
    const direction=kind==='과거'?-1:1
    for(let index=0;index<18;index++){
      const angle=Math.PI*2*index/18,orbit=Phaser.Math.Between(80,230),spark=this.add.rectangle(VIEW_WIDTH/2+Math.cos(angle)*orbit,CAMERA_CENTER_Y+Math.sin(angle)*orbit*.42,Phaser.Math.Between(8,18),2,index%4===0?0xffffff:color,.9).setRotation(angle+Math.PI/2).setDepth(248).setBlendMode(Phaser.BlendModes.ADD)
      this.tweens.add({targets:spark,angle:spark.angle+direction*110,x:VIEW_WIDTH/2+Math.cos(angle+direction*.9)*orbit*.35,y:CAMERA_CENTER_Y+Math.sin(angle+direction*.9)*orbit*.15,alpha:0,scaleX:.25,duration:620,delay:index*9,ease:'Cubic.In',onComplete:()=>spark.destroy()})
    }
  }

  async presentTimeArrival(event:TimeAdvanceEvent){
    this.showTimeManipulationPresentation(event)
    await pause(motionReduced()?160:360)
    if(event.to==='현재')return
    const awakened=Phaser.Utils.Array.Shuffle([...this.engine.livingUnits.filter(unit=>unit.timeTag===event.to)])
    for(const unit of awakened){
      const cutin=document.createElement('div')
      cutin.className='awakening-cutin';cutin.dataset.period=event.to
      const portrait=document.createElement('img'),asset=CHARACTER_TEXTURES[unit.id]
      if(asset)portrait.src=asset.url
      portrait.alt=unit.name
      const name=document.createElement('span');name.textContent=unit.name
      const title=document.createElement('strong');title.textContent='각성!'
      cutin.append(portrait,name,title);document.querySelector('.game-shell')?.append(cutin)
      playCue('awaken')
      try{await pause(motionReduced()?330:850)}finally{cutin.remove()}
    }
  }

  cancelEnemyPreview(){this.previewCancelled=true}
  setPreviewSpeed(speed:number){this.previewSpeed=speed}
  projectedClientPoint(point:Point){
    const p=screenPoint(point),camera=this.cameras.main,rect=this.game.canvas.getBoundingClientRect()
    return{x:rect.left+((p.x-camera.midPoint.x)*camera.zoom+camera.width/2)*rect.width/camera.width,y:rect.top+((p.y-camera.midPoint.y)*camera.zoom+camera.height/2)*rect.height/camera.height}
  }

  async previewEnemyAction(slotIndex:number){
    if(this.enemyPreviewing||this.engine.state.phase!=='계획')return
    const slot=this.engine.state.slots[slotIndex],unit=this.engine.state.units.find(candidate=>candidate.id===slot?.unitId);if(!slot||!unit||slot.team!=='적군')return
    this.enemyPreviewing=true;this.previewCancelled=false
    const asset=CHARACTER_TEXTURES[unit.id],start=screenPoint(slot.plan.path[0]),ghost=asset&&this.textures.exists(asset.key)?fitTexture(this.add.image(start.x,start.y+UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),46,62).setTint(0xff8f88).setAlpha(.72).setDepth(220):this.add.circle(start.x,start.y,22,0xef746e,.72).setDepth(220)
    for(const point of slot.plan.path.slice(1)){if(this.previewCancelled)break;const projected=screenPoint(point);await new Promise<void>(resolve=>this.tweens.add({targets:ghost,x:projected.x,y:projected.y+(ghost instanceof Phaser.GameObjects.Image?UNIT_FEET_OFFSET_Y:0),duration:150/this.previewSpeed,ease:'Sine.InOut',onComplete:()=>resolve()}))}
    const definition=slot.plan.action.kind==='스킬'?this.engine.getSkill(unit):slot.plan.action.kind==='일반공격'?unit.normalAttack:undefined,origin=slot.plan.path.at(-1)??unit.position
    if(definition&&!this.previewCancelled){const relative=slot.plan.action.relativeTarget,targetPoint=relative?{x:origin.x+relative.x,y:origin.y+relative.y}:slot.plan.action.direction?{x:origin.x+directionVector[slot.plan.action.direction].x*definition.range,y:origin.y+directionVector[slot.plan.action.direction].y*definition.range}:{...origin};this.showAttackPresentation({actorId:unit.id,actorPosition:{...origin},team:unit.team,actionKind:slot.plan.action.kind as '일반공격'|'스킬',actionName:definition.name,targeting:definition.targeting,trajectory:definition.trajectory,affectedCellPatternId:definition.affectedCellPatternId,range:definition.range,rangePatternId:definition.rangePatternId,direction:slot.plan.action.direction,targetPoint,durationMs:480/this.previewSpeed});await pause(520/this.previewSpeed)}
    ghost.destroy();this.enemyPreviewing=false
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
      const hitArea=this.add.zone(x,y-15,38,58).setInteractive({useHandCursor:true});hitArea.on('pointerdown',(_pointer:Phaser.Input.Pointer,_localX:number,_localY:number,event:{stopPropagation:()=>void})=>{if(this.isTargetingInputActive()&&!this.isTargetingAllowedPoint(item.point)){event.stopPropagation();return}this.handleUnitPointer(item.unit,event,item.point,true);if(this.mode==='이동'&&item.unit.team==='아군')this.beginMoveDrag(item.point)})
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
    const host=layer;layer=this.add.container(0,0).setName('unit-'+unit.id);host.add(layer)
    const previous=this.unitPositions.get(unit.id),position=screenPoint(unit.position)
    this.unitPositions.set(unit.id,{...position})
    if(previous&&this.engine.state.phase==='실행'&&(previous.x!==position.x||previous.y!==position.y)&&!motionReduced()){
      layer.setPosition(previous.x-position.x,previous.y-position.y)
      this.ambientTweens.push(this.tweens.add({targets:layer,x:0,y:0,duration:110,ease:'Sine.Out',onComplete:()=>{
        if(!layer.active)return
        const dust=this.add.ellipse(position.x,position.y+12,28,9,0xe7d3ac,.28).setDepth(170)
        this.tweens.add({targets:dust,scaleX:1.7,alpha:0,duration:160,onComplete:()=>dust.destroy()})
      }}))
    }
    const projected=screenPoint(unit.position),x=projected.x,y=projected.y,focused=this.engine.state.phase==='계획'&&this.threatFocusSlot!==undefined&&this.engine.state.slots[this.threatFocusSlot]?.unitId===unit.id,selected=(this.engine.state.phase==='계획'&&this.threatFocusSlot===undefined&&this.engine.selectedUnit?.id===unit.id)||(this.engine.state.phase==='배치'&&unit.team==='아군'&&this.engine.state.selectedDeployUnitId===unit.id),active=this.engine.state.phase==='실행'&&this.engine.state.slots[this.engine.state.executingSlot]?.unitId===unit.id
    const teamColor=unit.team==='아군'?0x6ed7ef:0xef746e
    const timeStacks=this.engine.getTimeStatBonuses(unit).stacks
    if(timeStacks){
      this.drawTimeFlameAura(layer,x,y,this.engine.state.currentTime)
      const auraColor=timeStacks>=4?0xff1639:timeStacks===3?0x9a38ff:timeStacks===2?0x2878e8:0xffd85a
      const glow=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,72,34,auraColor,.1).setStrokeStyle(2,auraColor,.5).setBlendMode(Phaser.BlendModes.ADD)
      const aura=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,59,26,auraColor,.2).setStrokeStyle(4,auraColor,1).setBlendMode(Phaser.BlendModes.ADD)
      const shine=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,43,16,auraColor,.08).setStrokeStyle(1,0xffffff,.8).setBlendMode(Phaser.BlendModes.ADD)
      layer.add([glow,aura,shine])
    }
    if(selected||focused||active){const emphasisColor=selected||focused?0xffd56a:0xffffff,halo=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,61,27,emphasisColor,.1).setStrokeStyle(3,emphasisColor,1);layer.add(halo)}
    const shadow=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y+3,48,17,0x000000,.5),plate=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y,47,19,teamColor,.12).setStrokeStyle(3,teamColor,.95).setInteractive({useHandCursor:true})
    plate.on('pointerdown',(_pointer:Phaser.Input.Pointer,_localX:number,_localY:number,event:{stopPropagation:()=>void})=>this.handleUnitPointer(unit,event))
    const asset=CHARACTER_TEXTURES[unit.id],visuals:Phaser.GameObjects.GameObject[]=[shadow,plate]
    if(asset&&this.textures.exists(asset.key)){
      const sprite=fitTexture(this.add.image(x,y+UNIT_FEET_OFFSET_Y,asset.key).setOrigin(.5,1),46,62).setInteractive({useHandCursor:true})
      if(unit.statuses.some(status=>status.type==='띄워짐'))sprite.y-=22
      sprite.on('pointerdown',(_pointer:Phaser.Input.Pointer,_localX:number,_localY:number,event:{stopPropagation:()=>void})=>this.handleUnitPointer(unit,event));visuals.push(sprite)
    }else{
      const body=this.add.circle(x,y,22,Phaser.Display.Color.HexStringToColor(unit.color).color).setStrokeStyle(3,unit.team==='아군'?0xc8f4ff:0xffd2cb,1).setInteractive({useHandCursor:true})
      body.on('pointerdown',(_pointer:Phaser.Input.Pointer,_localX:number,_localY:number,event:{stopPropagation:()=>void})=>this.handleUnitPointer(unit,event))
      const initial=this.add.text(x,y-2,unit.name.slice(-1),{fontFamily:'sans-serif',fontSize:'20px',fontStyle:'bold',color:'#081013'}).setOrigin(.5);visuals.push(body,initial)
    }
    const barBg=this.add.rectangle(x,y+UNIT_HP_OFFSET_Y,50,6,0x080d10),hp=48*(unit.hp/unit.maxHp),bar=this.add.rectangle(x-24+hp/2,y+UNIT_HP_OFFSET_Y,hp,4,unit.team==='아군'?0x69d2e7:0xef746e)
    layer.add([...visuals,barBg,bar])
    if(unit.statuses.some(status=>status.type==='기절')){
      const stars=this.add.text(x,y-64,'✦  ✦  ✦',{fontSize:'14px',color:'#ffe47e',stroke:'#38220b',strokeThickness:3}).setOrigin(.5)
      layer.add(stars)
    }
    unit.statuses.forEach((status,index)=>{
      const color=status.type==='띄워짐'?'#8ee7ff':status.type==='반격'?'#ff9f72':'#ffd77d',background=status.type==='띄워짐'?'#12323d':status.type==='반격'?'#4a2118':'#3a2c17'
      const badge=this.add.text(x+25,y-19+index*17,status.type,{fontFamily:'sans-serif',fontSize:'10px',fontStyle:'bold',color,backgroundColor:background,stroke:'#071013',strokeThickness:2}).setOrigin(0,1).setPadding(5,3).setDepth(80)
      badge.x=Math.min(badge.x,VIEW_WIDTH-4-badge.width);layer.add(badge)
    })
  }

  private drawTimeFlameAura(layer:Phaser.GameObjects.Container,x:number,y:number,period:'과거'|'현재'|'미래'){
    const outer=period==='미래'?0x249eff:0xff7b24,inner=period==='미래'?0xa9edff:0xffdc66
    const base=this.add.ellipse(x,y+UNIT_BASE_OFFSET_Y-2,82,34,outer,.13).setStrokeStyle(3,inner,.58).setBlendMode(Phaser.BlendModes.ADD)
    layer.add(base)
    ;[-25,-13,0,13,25].forEach((offset,index)=>{
      const height=index===2?62:index%2?49:39,width=index===2?22:index%2?17:14
      const flame=this.add.triangle(x+offset,y-17,0,height,width/2,0,width,height,outer,index===2?.42:.3).setOrigin(.5,.72).setBlendMode(Phaser.BlendModes.ADD)
      const core=this.add.triangle(x+offset,y-10,0,height*.62,width*.25,0,width*.5,height*.62,inner,index===2?.58:.38).setOrigin(.5,.72).setBlendMode(Phaser.BlendModes.ADD)
      layer.add([flame,core])
      this.ambientTweens.push(this.tweens.add({targets:[flame,core],y:`-=${5+index%3*2}`,scaleY:{from:.82,to:1.16},scaleX:{from:.9,to:1.06},alpha:{from:index===2?.42:.25,to:index===2?.82:.55},duration:520+index*73,delay:index*65,yoyo:true,repeat:-1,ease:'Sine.InOut'}))
    })
  }

  private handleUnitPointer(unit:Unit,event:{stopPropagation:()=>void},inputPoint:Point=unit.position,fromHologram=false){
    if(this.isTargetingInputActive()&&!this.isTargetingAllowedPoint(inputPoint)){event.stopPropagation();return}
    if(this.engine.state.phase==='계획'&&this.mode!=='이동'&&(this.isTargetable(inputPoint)||this.isInCastRange(inputPoint))){
      event.stopPropagation()
      this.handlePoint(inputPoint)
      return
    }
    this.handleUnit(unit,fromHologram)
  }

  private handleUnit(unit:Unit,fromHologram=false){
    if(this.engine.state.phase==='배치'){if(unit.team==='아군')this.engine.selectDeployUnit(unit.id);return}
    if(this.engine.state.phase!=='계획')return
    if(unit.team==='적군'){
      const slotIndex=this.engine.state.slots.findIndex(slot=>slot.unitId===unit.id);if(slotIndex<0)return
      this.focusThreat(slotIndex);if(this.mode==='이동')void this.previewEnemyAction(slotIndex);this.onViewChange();return
    }
    if(this.mode==='이동'){
      const slotIndex=this.engine.state.slots.findIndex(slot=>slot.unitId===unit.id);if(slotIndex>=0){const resetOwnPath=unit.team==='아군'&&!fromHologram&&this.engine.selectedUnit?.id===unit.id&&(this.engine.selectedPlan?.path.length??0)>1;this.planView='current';this.threatFocusSlot=undefined;if(unit.team==='아군'){this.engine.selectSlot(slotIndex);if(resetOwnPath){this.endMoveDrag();this.engine.setPath([{...unit.position}]);this.onViewChange();return}this.beginMoveDrag(unit.position)}else void this.previewEnemyAction(slotIndex);this.renderBoard();this.onViewChange()}
    }else{
      const selected=this.engine.selectedUnit;if(!selected)return
      const definition=this.mode==='일반공격'?selected.normalAttack:this.engine.getSkill(selected)
      if(definition?.targeting==='자가 버프형'&&selected.id===unit.id){const action=this.engine.selectedPlan?.action,repeat=action?.kind===this.mode&&action.selfTargetCell?.x===unit.position.x&&action.selfTargetCell?.y===unit.position.y;this.engine.planSelf(this.mode,unit.position,repeat);this.onPlanGesture(repeat)}
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
    if(definition?.targeting==='자가 버프형'){
      const origin=plan.path.at(-1)!,counterRange=this.mode==='스킬'&&Boolean(this.engine.getSkill(unit)?.effects.some(effect=>effect.type==='반격'))&&Math.max(Math.abs(origin.x-point.x),Math.abs(origin.y-point.y))<=1
      if(!counterRange&&!(origin.x===point.x&&origin.y===point.y))return
      const repeat=plan.action.kind===this.mode&&plan.action.selfTargetCell?.x===point.x&&plan.action.selfTargetCell?.y===point.y;this.engine.planSelf(this.mode,point,repeat);this.onPlanGesture(repeat)
    }else if(definition?.targeting==='자기 기준형'){
      const origin=plan.path.at(-1)!;if(!inAreaForInput(origin,point,definition.affectedCellPatternId??definition.rangePatternId,definition.range))return
      const repeat=plan.action.kind===this.mode&&plan.action.selfTargetCell?.x===point.x&&plan.action.selfTargetCell?.y===point.y;this.engine.planSelf(this.mode,point,repeat);this.onPlanGesture(repeat)
    }else if(definition?.targeting==='방향 선택형'&&definition.trajectory==='곡사'){
      const origin=plan.path.at(-1)!;if(!isPointInPattern(origin,point,definition.rangePatternId,definition.range))return
      const previous=plan.action.relativeTarget,offset={x:point.x-origin.x,y:point.y-origin.y},repeat=plan.action.kind===this.mode&&previous?.x===offset.x&&previous.y===offset.y;this.engine.planRelativeTarget(this.mode,point);this.onPlanGesture(repeat)
    }else if(definition?.targeting==='방향 선택형'){
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
    if(definition.targeting==='자기 기준형')return inAreaForInput(origin,point,definition.affectedCellPatternId??definition.rangePatternId,definition.range)
    if(definition.targeting==='자가 버프형')return this.mode==='스킬'&&this.engine.getSkill(unit)?.effects.some(effect=>effect.type==='반격')?Math.max(Math.abs(origin.x-point.x),Math.abs(origin.y-point.y))<=1:origin.x===point.x&&origin.y===point.y
    if(definition.trajectory==='곡사')return isPointInPattern(origin,point,definition.rangePatternId,definition.range)
    return (origin.x===point.x||origin.y===point.y)&&distance(origin,point)>0&&distance(origin,point)<=definition.range
  }

  private isCounterRangePreview(point:Point){
    if(this.engine.state.phase!=='계획'||this.mode!=='스킬')return false
    const unit=this.engine.selectedUnit,origin=this.engine.selectedPlan?.path.at(-1);if(!unit||!origin)return false
    const definition=this.engine.getSkill(unit)
    if(definition?.targeting!=='자가 버프형'||!definition.effects.some(effect=>effect.type==='반격'))return false
    return Math.max(Math.abs(origin.x-point.x),Math.abs(origin.y-point.y))<=1
  }

  private isInCastRange(point:Point){
    if(this.engine.state.phase!=='계획'||this.mode==='이동')return false
    const unit=this.engine.selectedUnit,origin=this.engine.selectedPlan?.path.at(-1);if(!unit||!origin)return false
    const definition=this.mode==='일반공격'?unit.normalAttack:this.engine.getSkill(unit);if(!definition)return false
    if(definition.targeting==='자기 기준형')return inAreaForInput(origin,point,definition.affectedCellPatternId??definition.rangePatternId,definition.range)
    if(definition.targeting==='자가 버프형')return this.mode==='스킬'&&this.engine.getSkill(unit)?.effects.some(effect=>effect.type==='반격')?Math.max(Math.abs(origin.x-point.x),Math.abs(origin.y-point.y))<=1:origin.x===point.x&&origin.y===point.y
    return isPointInPattern(origin,point,definition.rangePatternId,definition.range)
  }

  private isMoveReachable(point:Point){
    if(this.engine.state.phase!=='계획'||this.mode!=='이동')return false
    const unit=this.engine.selectedUnit
    return Boolean(unit?.team==='아군'&&distance(unit.position,point)<=this.engine.getMoveRange(unit))
  }
}
