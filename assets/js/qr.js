// ── QR Code with center logo ──────────────────────────────────

(function () {
  const qrBtn      = document.getElementById('qrBtn');
  const qrModal    = document.getElementById('qrModal');
  const qrCanvas   = document.getElementById('qrCanvas');
  const qrDownload = document.getElementById('qrDownload');
  if (!qrBtn || !qrModal || !qrCanvas) return;

  const wrapper  = document.querySelector('[data-qr-url]');
  const url      = wrapper ? wrapper.dataset.qrUrl : window.location.href;
  const rawTitle = wrapper ? (wrapper.dataset.qrTitle || "QR-Code") : "QR-Code";
  const filename = "QR-" + rawTitle.replace(/[^a-zA-Z0-9_\-]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") + ".png";

  const RENDER_SIZE  = 512; // actual canvas size (download resolution)
  const DISPLAY_SIZE = 300; // CSS display size

  let finalCanvas = null;

  qrBtn.addEventListener('click', () => {
    openModal('qrModal');
    if (finalCanvas) return;

    // Native, Trusted-Types-safe clear (was qrCanvas.innerHTML = '').
    qrCanvas.replaceChildren();

    // Temp container for QRCode lib
    const tempDiv = document.createElement('div');
    tempDiv.style.display = 'none';
    document.body.appendChild(tempDiv);

    new QRCode(tempDiv, {
      text:         url,
      width:        RENDER_SIZE,
      height:       RENDER_SIZE,
      colorDark:    "#000000",
      colorLight:   "#ffffff",
      correctLevel: QRCode.CorrectLevel.H,
    });

    setTimeout(() => {
      const srcCanvas = tempDiv.querySelector('canvas');
      const srcImg    = tempDiv.querySelector('img');

      const canvas  = document.createElement('canvas');
      canvas.width  = RENDER_SIZE;
      canvas.height = RENDER_SIZE;
      canvas.style.borderRadius = '8px';
      canvas.style.maxWidth = '100%';
      const ctx = canvas.getContext('2d');

      const qrImg  = new Image();
      qrImg.onload = () => {
        // Draw QR
        ctx.drawImage(qrImg, 0, 0, RENDER_SIZE, RENDER_SIZE);

        // Logo overlay
        const logoSize = Math.round(RENDER_SIZE * 0.20);
        const logoX    = (RENDER_SIZE - logoSize) / 2;
        const logoY    = (RENDER_SIZE - logoSize) / 2;
        const pad      = Math.round(RENDER_SIZE * 0.025);

        // White circle bg
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(RENDER_SIZE / 2, RENDER_SIZE / 2, (logoSize / 2) + pad, 0, Math.PI * 2);
        ctx.fill();

        const logo   = new Image();
        logo.onload  = () => {
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);
          finish(canvas);
        };
        logo.onerror = () => finish(canvas);
        logo.src = '/qrlogo.png';
      };

      qrImg.src = srcCanvas ? srcCanvas.toDataURL() : srcImg.src;
      document.body.removeChild(tempDiv);
    }, 150);
  });

  function finish(canvas) {
    finalCanvas = canvas;
    qrCanvas.appendChild(canvas);
  }

  if (qrDownload) {
    qrDownload.addEventListener('click', () => {
      if (!finalCanvas) return;
      const link    = document.createElement('a');
      link.download = filename;
      link.href     = finalCanvas.toDataURL('image/png');
      link.click();
    });
  }
})();
