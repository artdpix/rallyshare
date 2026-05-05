import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
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
          fontSize: 22,
          fontWeight: 700,
          fontFamily: 'sans-serif',
          borderRadius: 6,
        }}
      >
        R
      </div>
    ),
    { ...size },
  );
}
