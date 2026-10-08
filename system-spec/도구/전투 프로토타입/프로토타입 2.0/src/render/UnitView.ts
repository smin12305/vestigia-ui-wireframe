import Phaser from'phaser'
import type{Unit}from'../core/types'

export class UnitView extends Phaser.GameObjects.Container{
  private portrait:Phaser.GameObjects.Image
  private hpFill:Phaser.GameObjects.Rectangle
  private selection:Phaser.GameObjects.Ellipse
  private planAura:Phaser.GameObjects.Ellipse
  private statusText:Phaser.GameObjects.Text
  constructor(scene:Phaser.Scene,unit:Unit){
    super(scene,0,0);scene.add.existing(this)
    const color=unit.team==='아군'?0x55d9ff:0xff6969
    const shadow=scene.add.ellipse(0,15,84,30,0x071014,.5)
    const plate=scene.add.ellipse(0,12,76,27,0x0a171d,.9).setStrokeStyle(4,color,.95)
    this.planAura=scene.add.ellipse(0,12,93,38,0x6de9ff,0).setStrokeStyle(5,0x7beaff,0)
    this.selection=scene.add.ellipse(0,12,102,42,0xffdd78,0).setStrokeStyle(5,0xffdf78,0)
    this.portrait=scene.add.image(0,9,unit.asset).setOrigin(.5,1)
    const scale=Math.min(112/this.portrait.width,128/this.portrait.height);this.portrait.setScale(scale)
    const hpBack=scene.add.rectangle(0,30,82,9,0x251216,.96).setStrokeStyle(2,0x071014,1)
    this.hpFill=scene.add.rectangle(-40,30,80,7,unit.team==='아군'?0x55d9ff:0xff6969,1).setOrigin(0,.5)
    this.statusText=scene.add.text(0,-122,'',{fontFamily:'Malgun Gothic, sans-serif',fontSize:'16px',fontStyle:'bold',color:'#fff1bb',backgroundColor:'#14100bcc',stroke:'#05080a',strokeThickness:3}).setOrigin(.5,1).setPadding(5,2)
    this.add([shadow,this.planAura,plate,this.selection,this.portrait,hpBack,this.hpFill,this.statusText])
  }
  update(unit:Unit,selected:boolean,planned:boolean){this.hpFill.width=80*Math.max(0,unit.hp/unit.maxHp);this.selection.setStrokeStyle(5,0xffdf78,selected?1:0);this.planAura.setStrokeStyle(5,0x7beaff,planned?1:0);this.statusText.setText(unit.statuses.map(status=>status.type).join(' · '));this.setAlpha(unit.hp>0?1:.24);this.portrait.setTint(unit.hp>0?0xffffff:0x777777)}
  pulse(color=0xffffff){this.scene.tweens.add({targets:this,scale:1.14,duration:150,yoyo:true,ease:'Back.Out'});this.portrait.setTint(color);this.scene.time.delayedCall(320,()=>this.portrait.clearTint())}
}
