import type{Cell}from'../core/types'
export type InputMode='이동'|'일반공격'|'스킬'
export interface ViewState{mode:InputMode;selectedUnitId?:string;selectableCells:Cell[];selectedCells:Cell[];targetCell?:Cell;enemyPreviewUnitId?:string;targeting:boolean}
export const emptyViewState=():ViewState=>({mode:'이동',selectableCells:[],selectedCells:[],targeting:false})
