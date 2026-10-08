import type { Point } from './types'

export function isPointInPattern(origin:Point,target:Point,patternId:string|undefined,fallbackRange:number){
  const dx=Math.abs(origin.x-target.x),dy=Math.abs(origin.y-target.y)
  if(dx===0&&dy===0)return false
  if(patternId==='십자폭3_3')return (dx<=1&&dy<=3)||(dy<=1&&dx<=3)
  const match=patternId?.match(/^(마름모|사각형|직선)_(\d+)$/),shape=match?.[1]??'마름모',size=Number(match?.[2]??fallbackRange)
  if(shape==='사각형')return Math.max(dx,dy)<=size
  if(shape==='직선')return (dx===0||dy===0)&&dx+dy<=size
  return dx+dy<=size
}
