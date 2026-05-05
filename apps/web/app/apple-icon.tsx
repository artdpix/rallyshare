import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: '#0b0b0c',
          color: '#e11d48',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 120,
          fontWeight: 700,
          fontFamily: 'sans-serif',
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
