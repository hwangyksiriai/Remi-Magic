// Small vector jewellery stays sharp at browser zoom and every display density.
// The rose gem's centre is the exact pointer coordinate; only its glow shimmers.
export const POINTER_HALF_SIZE=8;

export const POINTER_STYLES=`
  .pointer{position:absolute;left:0;top:0;width:16px;height:16px;display:none;pointer-events:none}
  .pointer-jewel{display:block;width:16px;height:16px;overflow:visible;filter:drop-shadow(0 1px 1px #80536d45)}
  .pointer-halo{position:absolute;inset:-5px;border-radius:50%;background:radial-gradient(circle,#fff7dba0 0%,#ffc7e26b 30%,#ffc7e200 70%);animation:remi-jewel-glow 3.2s ease-in-out infinite;opacity:.4}
  .pointer[data-kind="link"] .pointer-halo{background:radial-gradient(circle,#fff1ccb3 0%,#ff9fca77 35%,#ffb8d700 72%)}
  .pointer-badge{position:absolute;left:18px;top:-10px;width:14px;height:14px;pointer-events:none;filter:drop-shadow(0 1px 1px #93627c35)}
  .pointer-badge[hidden]{display:none}.pointer-badge svg{display:block;width:100%;height:100%;overflow:visible}
  .pointer-cue-halo{fill:none;stroke:#fffaf1;stroke-width:3.8;stroke-linecap:round;stroke-linejoin:round}
  .pointer-cue-ink{fill:none;stroke:#b87391;stroke-width:1.65;stroke-linecap:round;stroke-linejoin:round}
  .pointer[data-kind="blocked"] .pointer-cue-ink{stroke:#a97687}
  @keyframes remi-jewel-glow{0%,100%{opacity:.28;transform:scale(.92)}50%{opacity:.64;transform:scale(1.08)}}
  :host([data-mode="focus"]) .pointer-halo{animation:none;opacity:.28}
  @media(prefers-reduced-motion:reduce){.pointer-halo{animation:none;opacity:.28}}
`;

export const POINTER_MARKUP=`<div class="pointer"><span class="pointer-halo"></span>
  <svg class="pointer-jewel" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="remi-star-gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff9e1"/><stop offset=".5" stop-color="#f5d7a1"/><stop offset="1" stop-color="#e7b77e"/></linearGradient>
      <linearGradient id="remi-star-rose" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#fff8fc"/><stop offset=".4" stop-color="#f7a7cf"/><stop offset="1" stop-color="#d7659a"/></linearGradient>
      <path id="remi-star-shape" d="M12 2.2C12.9 8.1 15.9 11.1 21.8 12C15.9 12.9 12.9 15.9 12 21.8C11.1 15.9 8.1 12.9 2.2 12C8.1 11.1 11.1 8.1 12 2.2Z"/>
    </defs>
    <use href="#remi-star-shape" fill="none" stroke="#fffaf2" stroke-width="3.2" stroke-linejoin="round"/>
    <use href="#remi-star-shape" fill="url(#remi-star-gold)" stroke="#af7d75" stroke-width=".85"/>
    <path d="M12 7.5 16.5 12 12 16.5 7.5 12Z" fill="url(#remi-star-rose)" stroke="#c983a2" stroke-width=".6"/>
    <path d="m9.2 11.7 2.8-2.8 1.1 1.1" fill="none" stroke="#fffaf7" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>
  <span class="pointer-badge" hidden><svg viewBox="0 0 20 20" aria-hidden="true"><path class="pointer-cue-halo"/><path class="pointer-cue-ink"/></svg></span>
</div>`;

const CUES={
  '↗':'M4.5 15.5 15.5 4.5M6.5 4.5h9v9',
  'Ⅰ':'M6.5 3.5Q10 5.5 13.5 3.5M10 4.5v11M6.5 16.5Q10 14.5 13.5 16.5',
  '↕':'M10 2.5v15M6 6.5l4-4 4 4M6 13.5l4 4 4-4',
  '↔':'M2.5 10h15M6.5 6l-4 4 4 4M13.5 6l4 4-4 4',
  '⤢':'M4 16 16 4M4 10v6h6M10 4h6v6',
  '⤡':'M4 4 16 16M4 10V4h6M10 16h6v-6',
  '⊘':'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 1 1 13 0M5.5 14.5l9-9',
  '◷':'M16.5 10a6.5 6.5 0 1 1-13 0 6.5 6.5 0 1 1 13 0M10 6v4l3 2',
  '✥':'M10 2v16M2 10h16M7.5 4.5 10 2l2.5 2.5M7.5 15.5 10 18l2.5-2.5M4.5 7.5 2 10l2.5 2.5M15.5 7.5 18 10l-2.5 2.5',
  '＋':'M10 3v14M3 10h14',
  '+':'M10 4v12M4 10h12',
  '−':'M4 10h12',
};

export function updatePointerCue(badge,symbol){
  if(badge.dataset.symbol===symbol)return;
  badge.dataset.symbol=symbol;
  const path=CUES[symbol];badge.hidden=!path;
  for(const element of badge.querySelectorAll('path'))element.setAttribute('d',path||'');
}
