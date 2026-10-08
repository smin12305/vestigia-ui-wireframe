import Phaser from'phaser'
import type{Cell}from'../core/types'

export const DESIGN_WIDTH=1920
export const DESIGN_HEIGHT=1080
export const TILE_WIDTH=190
export const TILE_HEIGHT=110
export const BOARD_ORIGIN={x:960,y:315}

export const cellToWorld=(cell:Cell)=>({x:BOARD_ORIGIN.x+(cell.x-cell.y)*TILE_WIDTH/2,y:BOARD_ORIGIN.y+(cell.x+cell.y)*TILE_HEIGHT/2})
export const cellDiamond=(cell:Cell,inset=2)=>{const center=cellToWorld(cell),halfW=TILE_WIDTH/2-inset,halfH=TILE_HEIGHT/2-inset;return[new Phaser.Geom.Point(center.x,center.y-halfH),new Phaser.Geom.Point(center.x+halfW,center.y),new Phaser.Geom.Point(center.x,center.y+halfH),new Phaser.Geom.Point(center.x-halfW,center.y)]}
export function worldToCell(point:{x:number;y:number}){
  const dx=point.x-BOARD_ORIGIN.x,dy=point.y-BOARD_ORIGIN.y
  return{x:Math.round(dx/TILE_WIDTH+dy/TILE_HEIGHT),y:Math.round(dy/TILE_HEIGHT-dx/TILE_WIDTH)}
}
