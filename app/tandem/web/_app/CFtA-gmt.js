function e(e,t=`logo`,n=114){let r=`${t}-bg`,i=`${t}-page`,a=`${t}-agent`;return`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="${r}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" style="stop-color:${e(400)}"/>
      <stop offset="1" style="stop-color:${e(600)}"/>
    </linearGradient>
    <linearGradient id="${i}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:#ffffff"/>
      <stop offset="1" style="stop-color:${e(50)}"/>
    </linearGradient>
    <linearGradient id="${a}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" style="stop-color:#fde68a"/>
      <stop offset="1" style="stop-color:#fbbf24"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${n}" fill="url(#${r})"/>
  <g transform="rotate(9 318 226)">
    <rect x="222" y="92" width="192" height="268" rx="30" fill="url(#${a})"/>
    <rect x="254" y="150" width="96" height="20" rx="10" fill="#ffffff" opacity="0.7"/>
  </g>
  <g transform="rotate(-7 206 290)">
    <rect x="104" y="160" width="204" height="268" rx="30" fill="#000000" opacity="0.14" transform="translate(6 12)"/>
    <rect x="104" y="160" width="204" height="268" rx="30" fill="url(#${i})"/>
    <rect x="138" y="214" width="136" height="22" rx="11" style="fill:${e(500)}"/>
    <rect x="138" y="262" width="104" height="22" rx="11" fill="#f59e0b"/>
    <rect x="138" y="310" width="124" height="22" rx="11" style="fill:${e(300)}"/>
    <rect x="138" y="358" width="80" height="22" rx="11" fill="#fbbf24"/>
  </g>
</svg>`}var t=e=>`var(--ui-color-primary-${e})`;function n(e){return getComputedStyle(document.documentElement).getPropertyValue(`--ui-color-primary-${e}`).trim()}export{e as n,n as r,t};