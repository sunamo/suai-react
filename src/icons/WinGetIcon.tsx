import React from "react";

export function WinGetIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 12.5 180 150"
      style={{ width: "1.2em", height: "1em", flexShrink: 0, display: "inline-block", verticalAlign: "middle", ...style }}>
      <defs>
        <linearGradient id="wg-grad-back" x1="58.5" y1="15.1" x2="121.1" y2="123.6" gradientUnits="userSpaceOnUse">
          <stop offset=".08" stopColor="#9c640a"/>
          <stop offset=".91" stopColor="#ba8636"/>
        </linearGradient>
        <linearGradient id="wg-grad-mid" x1="56.5" y1="27.8" x2="123.1" y2="143.2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bc822a"/>
          <stop offset=".91" stopColor="#ba8636"/>
        </linearGradient>
        <linearGradient id="wg-grad-front" x1="54.5" y1="40.2" x2="125.1" y2="162.6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#dcb374"/>
          <stop offset=".91" stopColor="#ba8636"/>
        </linearGradient>
        <linearGradient id="wg-grad-arrow" x1="90" y1="69.1" x2="90" y2="133.6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fefefe"/>
          <stop offset=".56" stopColor="#f8f8f8"/>
          <stop offset="1" stopColor="#f0f0f0"/>
        </linearGradient>
      </defs>
      <rect fill="url(#wg-grad-back)"  x="41.8" y="21.4" width="96" height="96" rx="8" ry="8"/>
      <rect fill="url(#wg-grad-mid)"   x="33.8" y="37.5" width="112" height="96" rx="8" ry="8"/>
      <rect fill="url(#wg-grad-front)" x="25.8" y="53.4" width="128" height="96" rx="8" ry="8"/>
      <path fill="none" stroke="url(#wg-grad-arrow)" strokeWidth="16" strokeLinecap="round" strokeMiterlimit="10"
        d="M110,105.5l-20,20M70,105.5l20,20M90,77.1v48.5"/>
    </svg>
  );
}
