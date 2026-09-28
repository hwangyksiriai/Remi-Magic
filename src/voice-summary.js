import { BUNDLED_VOICES } from './bundled-voices.js';
import { resolveVoiceClip } from './audio.js';

const languageName=language=>language==='ja'?'일본어':'한국어';

/** Describe the selected recording before starting, including imported overrides. */
export function summarizeVoice(settings,imports={},voices=[]){
  const clips={...BUNDLED_VOICES,...imports};
  const character=settings.character||'remi',language=settings.language==='ja'?'ja':'ko';
  const selected=languageName(language);
  const recording=resolveVoiceClip(clips,character,language,{languageFallback:settings.languageFallback});
  const coverage=['ko','ja'].map(lang=>{
    const clip=resolveVoiceClip(clips,character,lang,{languageFallback:false})?.clip;
    return `${languageName(lang)} ${clip?(clip.origin==='reference-excerpt'?'원음':'내 녹음'):'녹음 없음'}`;
  }).join(' · ');
  let playback;
  if(recording){
    const actual=languageName(recording.language);
    const kind=recording.clip.origin==='reference-excerpt'?'참고 영상 원음':'내 녹음';
    playback=recording.languageFallback?`${selected} 녹음 없음 → 같은 캐릭터의 ${actual} ${kind} 재생`:`${actual} ${kind} 재생`;
  }else if(settings.voiceFallback){
    playback=voices.some(voice=>voice.lang?.toLowerCase().startsWith(language))?`${selected} 시스템 시연 음성 사용 · 원본 성우 음성 아님`:`${selected} 녹음·시스템 음성 없음 · 주문 없이 변신`;
  }else{
    playback=`${selected} 녹음 없음 · ${settings.languageFallback===false?'다른 언어 재생 꺼짐 · ':''}주문 없이 변신`;
  }
  const note=settings.mode==='focus'?'집중 모드 · 주문 음성도 잠시 쉬어요.':!settings.sound?'전체 소리 꺼짐':settings.spellVoice===false?'주문 음성 꺼짐':playback;
  return {coverage,playback,note,language:recording?.language||null,languageFallback:!!recording?.languageFallback};
}
