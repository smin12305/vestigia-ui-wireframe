// Shared presentation timing: impact is the boundary used by simulation and visuals.
export const motionReduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches
export const pause=(ms:number)=>new Promise<void>(resolve=>window.setTimeout(resolve,ms))
export const timeTravelDuration=(manual:boolean)=>motionReduced()?320:manual?2400:720
type Cue='select'|'equip'|'attack'|'hit'|'critical'|'counter'|'ultimate'|'clock'|'awaken'|'win'|'lose'
let context:AudioContext|undefined
let muted=localStorage.getItem('waredo-sound-muted')==='true'
export const soundMuted=()=>muted
export function toggleSound(){muted=!muted;localStorage.setItem('waredo-sound-muted',String(muted));return muted}
export function unlockSound(){
  try{context??=new AudioContext();void context.resume().catch(()=>{})}catch{/* Audio is optional. */}
}
export function playCue(cue:Cue){
  if(muted||!context||context.state!=='running')return
  const patterns:Record<Cue,number[]>={select:[640],equip:[420,720],attack:[180],hit:[110,65],critical:[980,140,65],counter:[740,220],ultimate:[90,55,40],clock:[900,760,630],awaken:[330,440,660],win:[440,550,660,880],lose:[330,260,165]}
  const now=context.currentTime
  patterns[cue].forEach((frequency,index)=>{
    const oscillator=context!.createOscillator(),gain=context!.createGain(),start=now+index*.055,length=cue==='ultimate'?.3:.11
    oscillator.type=['hit','critical','ultimate'].includes(cue)?'triangle':'sine'
    oscillator.frequency.setValueAtTime(frequency,start);oscillator.frequency.exponentialRampToValueAtTime(Math.max(25,frequency*.6),start+length)
    gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.035,start+.006);gain.gain.exponentialRampToValueAtTime(.001,start+length)
    oscillator.connect(gain);gain.connect(context!.destination);oscillator.start(start);oscillator.stop(start+length+.02)
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect()}
  })
}
document.addEventListener('pointerdown',unlockSound,{once:true})
document.addEventListener('keydown',unlockSound,{once:true})
