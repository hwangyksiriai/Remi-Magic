// Original demonstration lines: not quotations or imitations of the cast.
// Profiles change system voice delivery; they cannot create a new actor voice.
export const VOICE_PROFILES = Object.freeze({
  remi: { voiceIndex: 0, pitch: 1.22, rate: 1.07, ko: '반짝이는 음악의 힘으로, 레미의 마법 시작!', ja: 'きらめく音楽の力で、どれみの魔法、はじまるよ！' },
  aiko: { voiceIndex: 1, pitch: .94, rate: 1.12, ko: '용기를 모아서, 사랑이의 푸른 마법 시작!', ja: '勇気を集めて、あいこの青い魔法、いくで！' },
  hazuki: { voiceIndex: 2, pitch: 1.10, rate: .90, ko: '따뜻한 멜로디를 담아, 메이의 마법이 피어날 거야!', ja: 'やさしいメロディーにのせて、はづきの魔法が花ひらく！' },
  onpu: { voiceIndex: 3, pitch: .88, rate: .96, ko: '별빛을 노래하며, 보라의 마법 무대를 열어 볼까!', ja: '星の光を歌にして、おんぷの魔法のステージへ！' },
  momoko: { voiceIndex: 4, pitch: 1.32, rate: 1.15, ko: '햇살처럼 신나게, 모모의 달콤한 마법 시작!', ja: 'おひさまみたいに元気よく、ももこの甘い魔法、スタート！' },
});

export function matchingVoices(synthesis, language) {
  try {
    return (synthesis?.getVoices() || [])
      .filter(voice => String(voice.lang || '').toLowerCase().replaceAll('_', '-').split('-')[0] === language)
      .sort((a, b) => String(a.voiceURI || a.name).localeCompare(String(b.voiceURI || b.name)));
  } catch { return []; }
}

export function selectVoice(synthesis, language, character) {
  const voices = matchingVoices(synthesis, language);
  const profile = VOICE_PROFILES[character] || VOICE_PROFILES.remi;
  return voices.length ? voices[profile.voiceIndex % voices.length] : null;
}
