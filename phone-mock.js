/* ============================================
   PHONE MOCKUP (Listo hero + Work page)
   The phones video has a white background. Instead of a CSS mask on the video
   (unreliable in Safari), each frame is drawn onto a canvas and cut to the phone
   shapes with a mask image. A multiplied still underneath adds the soft shadows,
   so the phones sit straight on the page colour with no box.
   ============================================ */
(function () {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.querySelectorAll('[data-phone-mock]').forEach(wrap => {
    const video = wrap.querySelector('video');
    const canvas = wrap.querySelector('canvas');
    const ctx = canvas && canvas.getContext('2d');
    if (!video || !ctx) return;

    const W = 1000, H = 1236;
    canvas.width = W; canvas.height = H;

    const mask = new Image();
    const still = new Image();
    let maskReady = false, stillReady = false, raf = 0, visible = true;
    mask.onload = () => { maskReady = true; draw(); };
    still.onload = () => { stillReady = true; draw(); };
    mask.src = wrap.dataset.phoneMock;
    still.src = video.getAttribute('poster');

    function draw() {
      if (!maskReady) return;
      const src = video.readyState >= 2 ? video : (stillReady ? still : null);
      if (!src) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(src, 0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(mask, 0, 0, W, H);
      // only reveal the mockup once the real phones are drawn, so the shadow layer
      // (which tints the phones on its own) never shows by itself
      if (!wrap.classList.contains('is-ready')) wrap.classList.add('is-ready');
    }

    function loop() {
      raf = 0;
      draw();
      if (visible && !video.paused && !document.hidden) raf = requestAnimationFrame(loop);
    }
    const start = () => { if (!raf) raf = requestAnimationFrame(loop); };

    video.addEventListener('playing', start);
    video.addEventListener('loadeddata', draw);
    video.addEventListener('seeked', draw);

    if (reduce) { video.removeAttribute('autoplay'); video.pause(); video.currentTime = 4; }

    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (reduce) return;
      if (visible) { const p = video.play(); if (p && p.catch) p.catch(() => {}); start(); }
      else video.pause();
    }).observe(wrap);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible && !reduce) { video.play().catch(() => {}); start(); } });
  });
})();
