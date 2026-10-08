import type { AiBehavior, CharacterDefinition, CharacterType, EffectScope, EffectType, RelicDefinition, RelicEffectKind, RelicRarity, RelicTrigger, SkillDefinition, TargetTeam, TargetingType, Team, TimePeriod } from './types'

function read(source:string){const data=new Map<string,string[]>();for(const raw of source.split(/\r?\n/)){const line=raw.trim();if(!line)continue;const index=line.indexOf(':');if(index<1)throw new Error(`':'가 없는 줄이 있습니다: ${line}`);const key=line.slice(0,index).trim(),value=line.slice(index+1).trim();data.set(key,[...(data.get(key)??[]),value])}return data}
const required=(data:Map<string,string[]>,key:string)=>{const value=data.get(key)?.[0];if(!value)throw new Error(`'${key}' 항목이 필요합니다.`);return value}
const num=(data:Map<string,string[]>,key:string,min=0)=>{const value=Number(required(data,key));if(!Number.isFinite(value)||value<min)throw new Error(`'${key}'는 ${min} 이상의 숫자여야 합니다.`);return value}
const oneOf=<T extends string>(value:string,values:T[],key:string)=>{if(!values.includes(value as T))throw new Error(`'${key}'는 ${values.join(', ')} 중 하나여야 합니다.`);return value as T}

export function parseCharacter(source:string):CharacterDefinition{
  const d=read(source),color=required(d,'색상');if(!/^#[0-9a-f]{6}$/i.test(color))throw new Error("'색상'은 #55c7e8 같은 6자리 값이어야 합니다.")
  const immunityText=d.get('상태면역')?.[0]??'없음';const immunities=immunityText==='없음'?[]:immunityText.split(',').map(v=>oneOf(v.trim(),['밀치기','당기기','띄우기','기절'],'상태면역') as EffectType)
  const attackTargeting=oneOf(required(d,'공격방식'),['대상','방향'],'공격방식') as TargetingType,attackRange=num(d,'공격사거리',1)
  const attackPatternId=d.get('공격범위패턴')?.[0]??`${attackTargeting==='방향'?'직선':'마름모'}_${attackRange}`
  const aiBehavior=oneOf(d.get('AI유형')?.[0]??'공통형',['공통형','돌격형','방벽형','저격형'],'AI유형') as AiBehavior
  const normalizedSource=/^AI유형:/m.test(source)?source:source.replace(/^(타입:.*)$/m,`$1\nAI유형: ${aiBehavior}`)
  return{id:required(d,'ID'),name:required(d,'캐릭터'),team:oneOf(required(d,'진영'),['아군','적군'],'진영') as Team,type:oneOf(required(d,'타입'),['계승자','각성자','기술자'],'타입') as CharacterType,aiBehavior,maxHp:num(d,'최대체력',1),attackPower:num(d,'공격력'),moveRange:num(d,'이동력'),criticalRate:num(d,'치명타피해율'),normalAttack:{name:required(d,'일반공격'),targeting:attackTargeting,range:attackRange,rangePatternId:attackPatternId},skillId:required(d,'스킬'),color,immunities,source:normalizedSource}
}

export function parseSkill(source:string):SkillDefinition{
  const d=read(source),targeting=oneOf(required(d,'방식'),['대상','셀','설치','방향'],'방식') as TargetingType,range=num(d,'사거리',1)
  const legacyTeam=d.get('대상')?.[0] as TargetTeam|undefined
  const effects=(d.get('효과')??[]).map(line=>{
    const parts=line.split('|').map(part=>part.trim()),[rawType,legacyValue='0']=parts[0].split(/\s+/)
    const type=oneOf(rawType,['피해','밀치기','당기기','띄우기','기절','설치'],'효과') as EffectType
    const fields=new Map(parts.slice(1).map(part=>{const i=part.indexOf(':');return i<1?[part,'']:[part.slice(0,i).trim(),part.slice(i+1).trim()]}))
    const defaultScope:EffectScope=type==='설치'?'선택셀':targeting==='대상'?'선택대상':targeting==='셀'||targeting==='설치'?'선택셀':'영향셀'
    const scope=oneOf(fields.get('적용')??defaultScope,['선택대상','선택셀','영향셀','자신'],'효과 적용') as EffectScope
    const teamText=fields.get('대상')??legacyTeam??(scope==='자신'?'아군':'')
    const targetTeam=type==='설치'||type==='밀치기'||type==='당기기'?'모두':oneOf(teamText,['적군','아군','모두'],'효과 대상') as TargetTeam
    const rawValue=fields.get(type==='밀치기'||type==='당기기'?'거리':'수치')??legacyValue
    const value=['피해','밀치기','당기기'].includes(type)?Number(rawValue):0
    if(!Number.isFinite(value)||(type==='피해'&&value<0)||(['밀치기','당기기'].includes(type)&&value<1))throw new Error(`효과 수치를 확인하세요: ${line}`)
    const environmentId=fields.get('환경');if(type==='설치'&&!environmentId)throw new Error("설치 효과에는 '환경' ID가 필요합니다.")
    return{type,scope,targetTeam,value,environmentId}
  });if(!effects.length)throw new Error("'효과'를 하나 이상 작성해야 합니다.")
  if(effects.some(e=>e.type==='밀치기'||e.type==='당기기')&&targeting!=='방향')throw new Error('밀치기·당기기 스킬의 방식은 방향이어야 합니다.')
  if(effects.some(e=>e.type==='설치')&&targeting!=='설치')throw new Error('설치 효과의 방식은 설치여야 합니다.')
  const rangePatternId=d.get('범위패턴')?.[0]??`${targeting==='방향'?'직선':'마름모'}_${range}`
  const affectedText=d.get('영향셀패턴')?.[0]??(targeting==='방향'?rangePatternId:'없음')
  if(effects.some(effect=>effect.scope==='영향셀')&&affectedText==='없음')throw new Error("'영향셀' 효과에는 '영향셀패턴'이 필요합니다.")
  const id=required(d,'ID'),name=required(d,'스킬'),description=d.get('설명')?.[0]??'',cooldown=num(d,'쿨타임',1),canCritical=oneOf(required(d,'치명타'),['가능','불가'],'치명타')==='가능'
  const effectLines=effects.map(effect=>{if(effect.type==='설치')return `효과: 설치 | 적용: 선택셀 | 환경: ${effect.environmentId}`;const base=`효과: ${effect.type} | 적용: ${effect.scope} | 대상: ${effect.targetTeam}`;if(effect.type==='피해')return `${base} | 수치: ${effect.value}`;if(effect.type==='밀치기'||effect.type==='당기기')return `${base} | 거리: ${effect.value}`;return base})
  const normalizedSource=[`스킬: ${name}`,`ID: ${id}`,`설명: ${description}`,`방식: ${targeting}`,`사거리: ${range}`,`범위패턴: ${rangePatternId}`,`영향셀패턴: ${affectedText}`,`쿨타임: ${cooldown}`,`치명타: ${canCritical?'가능':'불가'}`,...effectLines].join('\n')
  return{id,name,description,targeting,range,rangePatternId,affectedCellPatternId:affectedText==='없음'?undefined:affectedText,cooldown,canCritical,effects,source:normalizedSource}
}

export function parseRelic(source:string):RelicDefinition{
  const d=read(source),id=required(d,'ID'),name=required(d,'유물'),description=d.get('설명')?.[0]??''
  const rarity=oneOf(required(d,'등급'),['일반','희귀','전설'],'등급') as RelicRarity
  const effects=(d.get('효과')??[]).map(line=>{
    const legacy=line.match(/^(최대체력|공격력|이동력|치명타피해율)\s*([+-]?\d+)$/)
    if(legacy){const value=Number(legacy[2]);if(value===0)throw new Error('유물 효과 수치는 0이 될 수 없습니다.');return{kind:legacy[1] as RelicEffectKind,trigger:'항상' as RelicTrigger,timePeriods:['과거','현재','미래'] as TimePeriod[],value}}
    const parts=line.split('|').map(part=>part.trim()),kind=oneOf(parts[0],['최대체력','공격력','이동력','치명타피해율','체력회복','쿨타임감소','시간포인트','최종피해','받는피해','일반공격피해','스킬피해','첫이동력'],'유물 효과') as RelicEffectKind
    const fields=new Map(parts.slice(1).map(part=>{const index=part.indexOf(':');return index<1?[part,'']:[part.slice(0,index).trim(),part.slice(index+1).trim()]}))
    const trigger=oneOf(fields.get('발동')??'시간대상시',['항상','시간대상시','시간대진입','유효공격'],'발동') as RelicTrigger
    const timeText=fields.get('시간대')??'전체',timePeriods=(timeText==='전체'?['과거','현재','미래']:timeText.split(',').map(value=>oneOf(value.trim(),['과거','현재','미래'],'시간대'))) as TimePeriod[]
    const value=Number(fields.get('수치'));if(!Number.isFinite(value)||value===0)throw new Error(`유물 효과 수치를 확인하세요: ${line}`)
    const hpText=fields.get('체력이하'),hpThreshold=hpText===undefined?undefined:Number(hpText);if(hpThreshold!==undefined&&(!Number.isFinite(hpThreshold)||hpThreshold<=0||hpThreshold>100))throw new Error('체력이하는 1~100 사이 숫자여야 합니다.')
    return{kind,trigger,timePeriods,value,hpThreshold}
  });if(!effects.length)throw new Error("'효과'를 하나 이상 작성해야 합니다.")
  const normalizedSource=[`유물: ${name}`,`ID: ${id}`,`등급: ${rarity}`,`설명: ${description}`,...effects.map(effect=>`효과: ${effect.kind} | 발동: ${effect.trigger} | 시간대: ${effect.timePeriods.length===3?'전체':effect.timePeriods.join(', ')} | 수치: ${effect.value}${effect.hpThreshold?` | 체력이하: ${effect.hpThreshold}`:''}`)].join('\n')
  return{id,name,rarity,description,effects,source:normalizedSource}
}
