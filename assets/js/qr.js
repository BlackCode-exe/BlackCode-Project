// ── QR Code with center logo ──────────────────────────────────

(function () {
  const qrBtn      = document.getElementById('qrBtn');
  const qrModal    = document.getElementById('qrModal');
  const qrCanvas   = document.getElementById('qrCanvas');
  const qrDownload = document.getElementById('qrDownload');
  if (!qrBtn || !qrModal || !qrCanvas) return;

  const wrapper = document.querySelector('[data-qr-url]');
  const url     = wrapper ? wrapper.dataset.qrUrl : window.location.href;

  let qrGenerated = false;

  qrBtn.addEventListener('click', () => {
    openModal('qrModal');
    if (qrGenerated) return;
    qrGenerated = true;

    // Clear previous
    qrCanvas.innerHTML = '';

    const size = 256;

    // Generate QR
    const qr = new QRCode(qrCanvas, {
      text:           url,
      width:          size,
      height:         size,
      colorDark:      "#000000",
      colorLight:     "#ffffff",
      correctLevel:   QRCode.CorrectLevel.H, // High error correction for logo overlay
    });

    // After QR renders, overlay logo
    setTimeout(() => {
      const img = qrCanvas.querySelector('img');
      const cvs = qrCanvas.querySelector('canvas');
      const source = cvs || img;
      if (!source) return;

      // Draw QR + logo onto a single canvas
      const canvas  = document.createElement('canvas');
      canvas.width  = size;
      canvas.height = size;
      const ctx     = canvas.getContext('2d');

      const qrImg   = new Image();
      qrImg.onload  = () => {
        // Draw QR
        ctx.drawImage(qrImg, 0, 0, size, size);

        // Draw white circle background for logo
        const logoSize = Math.round(size * 0.22);
        const logoX    = (size - logoSize) / 2;
        const logoY    = (size - logoSize) / 2;
        const pad      = 6;
        ctx.fillStyle  = "#ffffff";
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, (logoSize / 2) + pad, 0, Math.PI * 2);
        ctx.fill();

        // Draw logo
        const logo    = new Image();
        logo.onload   = () => {
          ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

          // Replace QR canvas with combined canvas
          qrCanvas.innerHTML = '';
          canvas.style.borderRadius = '8px';
          qrCanvas.appendChild(canvas);
        };
        logo.onerror = () => {
          // No logo, just show QR
          qrCanvas.innerHTML = '';
          canvas.style.borderRadius = '8px';
          qrCanvas.appendChild(canvas);
        };
        logo.src = '/qrlogo.png';
      };

      if (cvs) {
        qrImg.src = cvs.toDataURL();
      } else {
        qrImg.src = img.src;
      }
    }, 100);
  });

  // Download
  if (qrDownload) {
    qrDownload.addEventListener('click', () => {
      const canvas = qrCanvas.querySelector('canvas');
      if (!canvas) return;
      const link    = document.createElement('a');
      link.download = 'qr-code.png';
      link.href     = canvas.toDataURL('image/png');
      link.click();
    });
  }
})();
