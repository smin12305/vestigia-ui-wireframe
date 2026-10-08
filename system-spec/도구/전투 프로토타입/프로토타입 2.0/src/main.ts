import Phaser from'phaser'
import'./style.css'
import{BattleEngine}from'./core/BattleEngine'
import{DESIGN_HEIGHT,DESIGN_WIDTH}from'./render/BoardGeometry'
import{BattleScene}from'./render/BattleScene'
import{AppController}from'./ui/AppController'

const root=document.querySelector<HTMLElement>('#app')!
root.innerHTML='<main class="game-frame" data-phase="배치" data-time="현재"><div id="game"></div></main>'
const engine=new BattleEngine()
const scene=new BattleScene(engine,readyScene=>new AppController(root,engine,readyScene))
new Phaser.Game({type:Phaser.AUTO,width:DESIGN_WIDTH,height:DESIGN_HEIGHT,parent:'game',transparent:true,scene,render:{antialias:true,roundPixels:true},scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH}})
