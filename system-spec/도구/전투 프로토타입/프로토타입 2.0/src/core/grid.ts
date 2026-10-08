import{BOARD_SIZE,type Cell,type Direction,type Pattern}from'./types'

export const directions:Record<Direction,Cell>={상:{x:0,y:-1},하:{x:0,y:1},좌:{x:-1,y:0},우:{x:1,y:0}}
export const same=(a:Cell,b:Cell)=>a.x===b.x&&a.y===b.y
export const key=(cell:Cell)=>`${cell.x},${cell.y}`
export const inside=(cell:Cell)=>cell.x>=0&&cell.y>=0&&cell.x<BOARD_SIZE&&cell.y<BOARD_SIZE
export const distance=(a:Cell,b:Cell)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)
export const directionFrom=(origin:Cell,target:Cell):Direction=>Math.abs(target.x-origin.x)>=Math.abs(target.y-origin.y)?target.x>=origin.x?'우':'좌':target.y>=origin.y?'하':'상'

export function cellsInPattern(origin:Cell,pattern:Pattern,range:number,direction?:Direction){
  const cells:Cell[]=[]
  if(pattern.startsWith('직선')){
    const resolved=direction??'하',vector=directions[resolved]
    for(let step=1;step<=range;step++){const cell={x:origin.x+vector.x*step,y:origin.y+vector.y*step};if(!inside(cell))break;cells.push(cell)}
    return cells
  }
  for(let y=0;y<BOARD_SIZE;y++)for(let x=0;x<BOARD_SIZE;x++){
    const cell={x,y},dx=Math.abs(x-origin.x),dy=Math.abs(y-origin.y)
    if(pattern==='사각형_1'?Math.max(dx,dy)<=range:dx+dy<=range)cells.push(cell)
  }
  return cells
}

export function reachable(origin:Cell,range:number,blocked:Set<string>){
  const found=new Map<string,Cell[]>([[key(origin),[origin]]]),queue=[origin]
  while(queue.length){const current=queue.shift()!,path=found.get(key(current))!;if(path.length-1>=range)continue
    for(const vector of Object.values(directions)){const next={x:current.x+vector.x,y:current.y+vector.y};if(!inside(next)||blocked.has(key(next))||found.has(key(next)))continue;found.set(key(next),[...path,next]);queue.push(next)}
  }
  return found
}
