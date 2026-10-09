'use client';

import React, { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

interface QRCodeDownloadButtonProps {
  publicToken: string;
  nickname: string;
  className?: string;
  buttonText?: string;
}

export const QRCodeDownloadButton: React.FC<QRCodeDownloadButtonProps> = ({
  publicToken,
  nickname,
  className = '',
  buttonText = 'Download QR Code',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Dynamic derivation of target URL
  const getAppUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.protocol}//${window.location.host}`;
    }
    return 'http://localhost:3000';
  };

  const qrUrl = `${getAppUrl()}/qr/${publicToken}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        qrUrl,
        {
          width: 250,
          margin: 2,
          color: {
            dark: '#1e293b', // slate-800
            light: '#ffffff',
          },
        },
        (err) => {
          if (err) console.error('Error drawing canvas QR code:', err);
        }
      );
    }
  }, [qrUrl]);

  const handleDownload = () => {
    if (!canvasRef.current) return;

    // Create a temporary canvas with label layout
    // Label dimensions: 300px width x 400px height (portrait tag)
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = 300;
    labelCanvas.height = 380;
    const ctx = labelCanvas.getContext('2d');

    if (ctx) {
      // 1. White Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 300, 380);

      // 2. Draw border
      ctx.strokeStyle = '#e2e8f0'; // slate-200
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, 284, 364);

      // 3. Draw header/title line
      ctx.fillStyle = '#4f46e5'; // indigo-600
      ctx.fillRect(10, 10, 280, 50);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINDMINE OWNER TAG', 150, 35);

      // 4. Draw QR Code from source canvas
      ctx.drawImage(canvasRef.current, 25, 75, 250, 250);

      // 5. Draw item nickname & scan caption at bottom
      ctx.fillStyle = '#0f172a'; // slate-900
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(`Item: "${nickname}"`, 150, 340);

      ctx.fillStyle = '#64748b'; // slate-500
      ctx.font = 'italic 10px sans-serif';
      ctx.fillText('Scan to contact owner safely', 150, 360);

      // Convert combined label canvas to png and trigger download
      const pngUrl = labelCanvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.href = pngUrl;
      downloadLink.download = `${nickname.replace(/\s+/g, '_')}_owner_tag.png`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
    }
  };

  return (
    <>
      {/* Hidden source canvas to compile QR code */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <button
        type="button"
        onClick={handleDownload}
        className={className}
      >
        <span>{buttonText}</span>
      </button>
    </>
  );
};
