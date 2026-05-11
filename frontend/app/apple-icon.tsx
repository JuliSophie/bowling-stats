import { ImageResponse } from 'next/og';


export const size = {
  width: 180,
  height: 180,
};

export const contentType = 'image/png';


export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(180deg, #fff4e4 0%, #e4c9a2 100%)',
          borderRadius: 44,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 14,
            borderRadius: 34,
            background: '#fff8ef',
            border: '7px solid #7b4d2a',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 42,
            top: 48,
            width: 66,
            height: 6,
            borderRadius: 999,
            background: '#d7805c',
            boxShadow: '0 22px 0 #d7805c, 0 44px 0 #d7805c, 0 66px 0 #d7805c',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: 110,
            top: 36,
            width: 10,
            height: 108,
            background: '#eedcc0',
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 28,
            bottom: 24,
            width: 78,
            height: 78,
            borderRadius: '50%',
            background: '#201108',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 17,
              left: 19,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#f4ede2',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 20,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#f4ede2',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 36,
              left: 34,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#f4ede2',
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            right: 26,
            top: 20,
            width: 56,
            height: 18,
            borderTop: '8px solid #76d7d3',
            borderRadius: 999,
            transform: 'rotate(28deg)',
          }}
        />
      </div>
    ),
    size,
  );
}