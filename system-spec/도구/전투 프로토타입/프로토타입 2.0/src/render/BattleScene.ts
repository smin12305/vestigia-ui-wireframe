import Phaser from'phaser'
import type{BattleEngine}from'../core/BattleEngine'
import{BOARD_SIZE,type BattleEvent,type Cell,type Direction}from'../core/types'
import{directions,inside,key,same}from'../core/grid'
import{BOARD_ORIGIN,cellDiamond,cellToWorld,DESIGN_HEIGHT,DESIGN_WIDTH,worldToCell}from'./BoardGeometry'
import{UnitView}from'./UnitView'
import{emptyViewState,type ViewState}from'./viewState'

const DEPTH={BACKGROUND:0,GRID:100,PLAN:200,GHOST:350,UNIT:400,DIM:600,FOCUS:610,PROMOTED:620,FX:800,TEXT:900}as const
const wait=(ms:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,ms))

export class BattleScene extends Phaser.Scene{
  private grid!:Phaser.GameObjects.Graphics
  private plan!:Phaser.GameObjects.Graphics
  private focus!:Phaser.GameObjects.Graphics
  private unitViews=new Map<string,UnitView>()
  private ghosts:Phaser.GameObjects.Image[]=[]
  private dim?:Phaser.GameObjects.Rectangle
  private view:ViewState=emptyViewState()
  constructor(private engine:BattleEngine,private onReady:(scene:BattleScene)=>void){super('battle')}
  preload(){
    this.load.image('background','/assets/environment/highland-final-web.png')
    for(const unit of this.engine.state.units)this.load.image(unit.asset,`/assets/characters/${unit.asset}.png`)
  }
  create(){
    const background=this.add.image(DESIGN_WIDTH/2,DESIGN_HEIGHT/2,'background').setDepth(DEPTH.BACKGROUND);const scale=Math.max(DESIGN_WIDTH/background.width,DESIGN_HEIGHT/background.height);background.setScale(scale)
    this.grid=this.add.graphics().setDepth(DEPTH.GRID);this.plan=this.add.graphics().setDepth(DEPTH.PLAN);this.focus=this.add.graphics().setDepth(DEPTH.FOCUS);this.drawBaseGrid()
    for(const unit of this.engine.state.units)this.unitViews.set(unit.id,new UnitView(this,unit))
    this.input.on('pointerdown',(pointer:Phaser.Input.Pointer)=>{if(this.engine.state.phase==='실행')return;const world=this.cameras.main.getWorldPoint(pointer.x,pointer.y),cell=worldToCell(world);if(inside(cell)&&Phaser.Geom.Polygon.Contains(new Phaser.Geom.Polygon(cellDiamond(cell)),world.x,world.y))this.events.emit('cell-click',cell)})
    this.engine.addEventListener('change',()=>this.renderState());this.renderState();this.onReady(this)
  }
  setViewState(view:ViewState){this.view={...view,targetCell:view.targetCell?{...view.targetCell}:undefined,selectableCells:view.selectableCells.map(cell=>({...cell})),selectedCells:view.selectedCells.map(cell=>({...cell}))};this.renderState()}
  private drawBaseGrid(){this.grid.clear();for(let y=0;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++){this.grid.lineStyle(2,0x737b7e,.74).strokePoints(cellDiamond({x,y},4),true)}}
  private renderState(){
    if(!this.grid)return;this.plan.clear();this.focus.clear();this.ghosts.forEach(ghost=>ghost.destroy());this.ghosts=[];this.dim?.destroy();this.dim=undefined
    const targeting=this.view.targeting,selectable=new Set(this.view.selectableCells.map(key)),selected=new Set(this.view.selectedCells.map(key))
    if(this.engine.state.phase==='배치')for(let y=4;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++)this.paintCell(this.plan,{x,y},0x5edcff,.16,0x5edcff,.9)
    if(this.engine.state.phase==='계획'){
      for(const slot of this.engine.state.slots){const unit=this.engine.unit(slot.unitId);if(!unit||slot.plan.path.length<2)continue;this.drawFootprints(slot.plan.path,slot.team==='아군'?0x60dbff:0xff6969,slot.team==='아군'||this.view.enemyPreviewUnitId===unit.id?1:.18)
        if(slot.team==='아군'){const destination=slot.plan.path.at(-1)!;if(!same(destination,unit.position)){const point=cellToWorld(destination),ghost=this.add.image(point.x,point.y+9,unit.asset).setOrigin(.5,1).setAlpha(.34).setTint(0x6ee7ff).setDepth(targeting&&unit.id===this.view.selectedUnitId?DEPTH.PROMOTED:DEPTH.GHOST);const scale=Math.min(112/ghost.width,128/ghost.height);ghost.setScale(scale);this.ghosts.push(ghost)}}
      }
      for(const slot of this.engine.state.slots.filter(candidate=>candidate.team==='아군'&&candidate.plan.actionConfirmed&&candidate.plan.action.kind!=='없음')){const unit=this.engine.unit(slot.unitId),skill=slot.plan.action.kind==='스킬'?this.engine.skill(unit):undefined;if(skill?.effects.some(effect=>effect.type==='반격'))continue;for(const cell of this.engine.actionCells(slot))this.paintCell(this.plan,cell,0x145cb8,.34,0x248cff,.8);const push=skill?.effects.find(effect=>effect.type==='밀치기'||effect.type==='당기기');if(push&&slot.plan.action.direction)for(const cell of this.engine.actionCells(slot))this.drawPushMarker(this.plan,cell,push.type==='당기기'?this.opposite(slot.plan.action.direction):slot.plan.action.direction,push.value,0xffd365)}
      const selectedUnit=this.engine.unit(this.view.selectedUnitId)
      if(this.view.mode==='이동'&&selectedUnit?.team==='아군'){const cells=[...this.engine.movementPaths(selectedUnit).values()].map(path=>path.at(-1)!);this.drawBoundary(cells,0x48cfff)}
      if(this.view.enemyPreviewUnitId){const slot=this.engine.slotFor(this.view.enemyPreviewUnitId),previewUnit=this.engine.unit(this.view.enemyPreviewUnitId);if(previewUnit)this.drawBoundary([...this.engine.movementPaths(previewUnit).values()].map(path=>path.at(-1)!),0xff525f);if(slot){const origin=slot.plan.path.at(-1)!,unit=this.engine.unit(slot.unitId),definition=slot.plan.action.kind==='스킬'?this.engine.skill(unit):unit?.normalAttack;if(definition){const maximum=this.maximumRange(origin,definition.pattern,definition.range);maximum.forEach(cell=>this.paintCell(this.plan,cell,0xff9c9c,.24,0xb91f32,.95));this.engine.actionCells(slot).forEach(cell=>this.paintCell(this.plan,cell,0x9d1828,.6,0x7e1020,1));const push=slot.plan.action.kind==='스킬'?this.engine.skill(unit)?.effects.find(effect=>effect.type==='밀치기'||effect.type==='당기기'):undefined;if(push&&slot.plan.action.direction)for(const cell of this.engine.actionCells(slot))this.drawPushMarker(this.plan,cell,push.type==='당기기'?this.opposite(slot.plan.action.direction):slot.plan.action.direction,push.value,0xffd365)}}}
    }
    if(targeting){this.dim=this.add.rectangle(DESIGN_WIDTH/2,DESIGN_HEIGHT/2,DESIGN_WIDTH,DESIGN_HEIGHT,0x020507,.67).setDepth(DEPTH.DIM);for(const cell of this.view.selectableCells)this.paintCell(this.focus,cell,0x73dcff,.35,0x65dbff,1);for(const cell of this.view.selectedCells)this.paintCell(this.focus,cell,0x145cb8,.72,0x248cff,1)}
    for(const unit of this.engine.state.units){const view=this.unitViews.get(unit.id)!;const point=cellToWorld(unit.position);view.setPosition(point.x,point.y);const slot=this.engine.slotFor(unit.id),planned=Boolean(slot?.team==='아군'&&slot.plan.moveConfirmed&&slot.plan.actionConfirmed);view.update(unit,unit.id===this.engine.state.selectedUnitId,planned);const promoted=targeting&&(unit.id===this.view.selectedUnitId||selectable.has(key(unit.position))||selected.has(key(unit.position)));view.setDepth(promoted?DEPTH.PROMOTED:DEPTH.UNIT+point.y/10);view.setVisible(inside(unit.position))}
    const mercan=this.engine.unit('mercan'),mercanSlot=this.engine.slotFor('mercan');if(mercan&&mercanSlot?.plan.action.kind==='스킬'&&mercanSlot.plan.actionConfirmed){const center=mercanSlot.plan.path.at(-1)!;for(let y=0;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++){const cell={x,y};if(!same(cell,center)&&Math.max(Math.abs(x-center.x),Math.abs(y-center.y))<=1)this.paintHatch(this.plan,cell,0x55d9ff)}}
  }
  private maximumRange(origin:Cell,pattern:Parameters<BattleEngine['cellsFor']>[1],range:number){if(pattern.startsWith('직선'))return(['상','하','좌','우']as Direction[]).flatMap(direction=>{const target={x:origin.x+directions[direction].x,y:origin.y+directions[direction].y};return this.engine.cellsFor(origin,pattern,range,target)});return this.engine.cellsFor(origin,pattern,range)}
  private paintCell(graphics:Phaser.GameObjects.Graphics,cell:Cell,fill:number,alpha:number,stroke:number,strokeAlpha:number){graphics.fillStyle(fill,alpha).fillPoints(cellDiamond(cell,5),true);graphics.lineStyle(3,stroke,strokeAlpha).strokePoints(cellDiamond(cell,5),true)}
  private paintHatch(graphics:Phaser.GameObjects.Graphics,cell:Cell,color:number){const [top,right,bottom,left]=cellDiamond(cell,7);graphics.lineStyle(3,color,.72).strokePoints([top,right,bottom,left],true);for(let offset=-55;offset<=55;offset+=15){const center=cellToWorld(cell),x1=center.x+offset-28,y1=center.y+28,x2=center.x+offset+28,y2=center.y-28;graphics.lineBetween(Math.max(left.x,x1),y1,Math.min(right.x,x2),y2)}}
  private drawBoundary(cells:Cell[],color:number){const set=new Set(cells.map(key));this.plan.lineStyle(5,color,1);for(const cell of cells){const [top,right,bottom,left]=cellDiamond(cell,5);if(!set.has(key({x:cell.x-1,y:cell.y})))this.plan.lineBetween(top.x,top.y,left.x,left.y);if(!set.has(key({x:cell.x,y:cell.y-1})))this.plan.lineBetween(top.x,top.y,right.x,right.y);if(!set.has(key({x:cell.x+1,y:cell.y})))this.plan.lineBetween(right.x,right.y,bottom.x,bottom.y);if(!set.has(key({x:cell.x,y:cell.y+1})))this.plan.lineBetween(bottom.x,bottom.y,left.x,left.y)}}
  private opposite(direction:Direction):Direction{return({상:'하',하:'상',좌:'우',우:'좌'}as const)[direction]}
  private drawPushMarker(graphics:Phaser.GameObjects.Graphics,cell:Cell,direction:Direction,count:number,color:number){const center=cellToWorld(cell),vector=directions[direction],to=cellToWorld({x:cell.x+vector.x,y:cell.y+vector.y}),angle=Phaser.Math.Angle.Between(center.x,center.y,to.x,to.y),forward={x:Math.cos(angle),y:Math.sin(angle)},side={x:-forward.y,y:forward.x},offsets=count<=1?[{side:0,front:0}]:count===2?[{side:-11,front:0},{side:11,front:0}]:[{side:0,front:10},{side:-12,front:-8},{side:12,front:-8}];graphics.lineStyle(4,color,.96);graphics.fillStyle(color,.96);for(const offset of offsets){const x=center.x+side.x*offset.side+forward.x*offset.front,y=center.y+side.y*offset.side+forward.y*offset.front,tipX=x+forward.x*22,tipY=y+forward.y*22;graphics.lineBetween(x-forward.x*14,y-forward.y*14,tipX,tipY);graphics.fillTriangle(tipX,tipY,tipX-forward.x*11+side.x*7,tipY-forward.y*11+side.y*7,tipX-forward.x*11-side.x*7,tipY-forward.y*11-side.y*7)}}
  private drawFootprints(path:Cell[],color:number,alpha:number){for(let index=1;index<path.length;index++){const from=cellToWorld(path[index-1]),to=cellToWorld(path[index]),angle=Phaser.Math.Angle.Between(from.x,from.y,to.x,to.y),point={x:Phaser.Math.Linear(from.x,to.x,.58),y:Phaser.Math.Linear(from.y,to.y,.58)};this.plan.fillStyle(color,alpha);this.plan.fillEllipse(point.x-Math.sin(angle)*7,point.y+Math.cos(angle)*7,9,17);this.plan.fillEllipse(point.x+Math.cos(angle)*14+Math.sin(angle)*7,point.y+Math.sin(angle)*14-Math.cos(angle)*7,9,17)}}
  async revealEnemy(unitId:string){this.view.enemyPreviewUnitId=unitId;this.renderState();const view=this.unitViews.get(unitId);view?.pulse(0xff8b8b);await wait(650)}
  async present(event:BattleEvent){
    if(event.type==='move'||event.type==='force'){const view=this.unitViews.get(event.unitId);if(view){const to=cellToWorld(event.to);await new Promise<void>(resolve=>this.tweens.add({targets:view,x:to.x,y:to.y,duration:event.type==='move'?160:240,ease:'Sine.InOut',onComplete:()=>resolve()}))}return}
    if(event.type==='attack'){const actor=this.unitViews.get(event.actorId),origin=cellToWorld(event.origin),target=cellToWorld(event.target),flash=this.add.graphics().setDepth(DEPTH.FX);for(const cell of event.cells)this.paintCell(flash,cell,event.kind==='반격'?0x55d9ff:0xffd15e,.36,event.kind==='반격'?0x55d9ff:0xffd15e,1);actor?.pulse(event.kind==='반격'?0x73e6ff:0xffe29a);if(actor)await new Promise<void>(resolve=>this.tweens.add({targets:actor,x:origin.x+(target.x-origin.x)*.16,y:origin.y+(target.y-origin.y)*.16,duration:110,yoyo:true,onComplete:()=>resolve()}));flash.destroy();return}
    if(event.type==='damage'){const target=this.engine.unit(event.targetId),point=target?cellToWorld(target.position):BOARD_ORIGIN,text=this.add.text(point.x,point.y-112,event.timeBonus?`시간 추가 데미지!\n${event.amount}`:`${event.critical?'치명타!\n':''}${event.amount}`,{fontFamily:'Malgun Gothic, sans-serif',fontSize:event.timeBonus?'27px':'24px',fontStyle:'bold',align:'center',color:event.timeBonus?'#ffe074':event.critical?'#fff1a0':'#ffffff',stroke:'#210d08',strokeThickness:6}).setOrigin(.5).setDepth(DEPTH.TEXT);this.tweens.add({targets:text,y:text.y-45,alpha:0,duration:event.timeBonus?750:520,ease:'Cubic.Out',onComplete:()=>text.destroy()});if(event.timeBonus||event.critical)this.cameras.main.shake(event.timeBonus?360:210,event.timeBonus?0.006:0.003);await wait(event.timeBonus?420:230);return}
    if(event.type==='status'){this.unitViews.get(event.unitId)?.pulse(0xffd86d);await wait(180);return}
    if(event.type==='shards'){this.events.emit('shards',event);await wait(90);return}
    if(event.type==='time'){this.events.emit('time',event);await wait(260);return}
    if(event.type==='turn-end'){this.events.emit('turn-end');await wait(120)}
  }
}
