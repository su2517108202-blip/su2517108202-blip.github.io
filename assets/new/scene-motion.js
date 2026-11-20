(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const closing = document.querySelector(".closing-frame");
  const tail = document.querySelector(".tail-mark");
  const projection = document.querySelector(".projection");
  const player = document.querySelector("#animatic");
  const canvas = document.querySelector(".weather-rain");
  const toggle = document.querySelector("#scene-motion-toggle");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer:fine)");
  const ctx = canvas.getContext("2d");
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

  let paused = false;
  let frame = 0;
  let scrollFrame = 0;
  let lastTime = 0;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let raindrops = [];
  let pointerX = 0;
  let pointerY = 0;
  let easedX = 0;
  let easedY = 0;

  function configRain() {
    if (!ctx || reduce.matches) return;
    const nextWidth = hero.clientWidth;
    const nextHeight = hero.clientHeight;
    const nextRatio = Math.min(devicePixelRatio || 1, 1.5);
    if (nextWidth === width && nextHeight === height && nextRatio === ratio) return;

    width = nextWidth;
    height = nextHeight;
    ratio = nextRatio;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    const count = Math.round(clamp(width * height / 8500, 38, 145));
    raindrops = Array.from({length: count}, (_, index) => {
      const depth = index % 3;
      return {
        depth,
        x: Math.random() * (width + 160) - 60,
        y: Math.random() * (height + 120) - 60,
        speed: 295 + depth * 140 + Math.random() * 190,
        length: 13 + depth * 19 + Math.random() * 17,
      };
    });
  }

  function paintRain(delta) {
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);
    const wind = -.21 + easedX * .045;
    const tones = [
      {color:"rgba(161,200,239,.31)", width:.58},
      {color:"rgba(183,220,254,.48)", width:.88},
      {color:"rgba(225,237,245,.62)", width:1.2},
    ];

    for (const [depth, tone] of tones.entries()) {
      ctx.beginPath();
      ctx.strokeStyle = tone.color;
      ctx.lineWidth = tone.width;
      for (const drop of raindrops) {
        if (drop.depth !== depth) continue;
        drop.y += drop.speed * delta;
        drop.x += drop.speed * wind * delta;
        if (drop.y > height + 12 || drop.x < -80) {
          drop.y = -drop.length - Math.random() * 140;
          drop.x = Math.random() * (width + 180) - 15;
        }
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x - drop.length * wind, drop.y - drop.length);
      }
      ctx.stroke();
    }
  }

  function canRun() {
    return !paused && !reduce.matches && !document.hidden;
  }

  function animate(time) {
    frame = 0;
    const rect = hero.getBoundingClientRect();
    if (!canRun() || rect.bottom <= 0 || !ctx) {
      lastTime = 0;
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, .045) : 0;
    lastTime = time;
    easedX += (pointerX - easedX) * Math.min(1,delta * 9);
    easedY += (pointerY - easedY) * Math.min(1,delta * 9);
    const progress = clamp(-rect.top / rect.height);
    hero.style.setProperty("--camera-x", (easedX * 14).toFixed(2) + "px");
    hero.style.setProperty("--camera-y", (easedY * 10 + progress * 53).toFixed(2) + "px");
    paintRain(delta);
    frame = requestAnimationFrame(animate);
  }

  function runRain() {
    if (!frame && ctx && canRun() && hero.getBoundingClientRect().bottom > 0) {
      configRain();
      frame = requestAnimationFrame(animate);
    }
  }

  function positionScenes() {
    scrollFrame = 0;
    const active = canRun();
    const heroRect = hero.getBoundingClientRect();
    const progress = clamp(-heroRect.top / heroRect.height);
    const cut = active ? clamp((progress - .19) / .51) : 0;
    hero.style.setProperty("--rain-cut", (cut * 96).toFixed(1) + "%");
    hero.style.setProperty("--finder-scale", (1 - cut * .025).toFixed(3));

    const screen = projection.getBoundingClientRect();
    const enter = clamp((innerHeight * .96 - screen.top) / (innerHeight * .47));
    const curtain = active && screen.bottom > 0 && screen.top < innerHeight && enter < .99 && player.paused;
    projection.toggleAttribute("data-curtain", curtain);
    if (curtain) {
      const position = (enter * 103).toFixed(1);
      projection.style.setProperty("--curtain-left", "-" + position + "%");
      projection.style.setProperty("--curtain-right", position + "%");
    }

    const end = closing.getBoundingClientRect();
    const endVisible = end.top < innerHeight && end.bottom > 0;
    closing.toggleAttribute("data-weather-live",active && endVisible);
    if (active && endVisible) {
      const shift = clamp((innerHeight / 2 - end.top - end.height / 2) * .09,-28,28);
      closing.style.setProperty("--out-shift",shift.toFixed(1) + "px");
    }

    const mark = tail.getBoundingClientRect();
    const reveal = active ? clamp((innerHeight - mark.top) / Math.min(mark.height * .75,170)) : 1;
    tail.style.setProperty("--roll-up", ((1 - reveal) * 58).toFixed(1) + "px");
    tail.style.setProperty("--roll-opacity", (0.58 + reveal * .42).toFixed(3));
    runRain();
  }

  function refreshPosition() {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(positionScenes);
  }

  function applyPreference() {
    document.body.dataset.sceneMotion = canRun() ? "active" : "still";
    toggle.hidden = reduce.matches || !ctx;
    toggle.textContent = paused ? "恢复场景动效" : "暂停场景动效";
    if (!canRun() && frame) {
      cancelAnimationFrame(frame);
      frame = 0;
      lastTime = 0;
    }
    if (reduce.matches && ctx) ctx.clearRect(0,0,width,height);
    refreshPosition();
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    if (paused) hero.removeAttribute("data-scene-intro");
    applyPreference();
  });
  hero.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || !canRun()) return;
    const rect = hero.getBoundingClientRect();
    pointerX = clamp((event.clientX - rect.left) / rect.width * 2 - 1,-1,1);
    pointerY = clamp((event.clientY - rect.top) / rect.height * 2 - 1,-1,1);
  }, {passive:true});
  hero.addEventListener("pointerleave", () => {
    pointerX = 0;
    pointerY = 0;
  });
  addEventListener("scroll", refreshPosition, {passive:true});
  addEventListener("resize", () => {
    configRain();
    refreshPosition();
  });
  player.addEventListener("play", refreshPosition);
  player.addEventListener("pause", refreshPosition);
  reduce.addEventListener("change",applyPreference);
  document.addEventListener("visibilitychange",applyPreference);
  if (canRun() && scrollY < innerHeight * .65 && !location.hash) {
    hero.setAttribute("data-scene-intro", "");
    setTimeout(() => hero.removeAttribute("data-scene-intro"), 1200);
  }
  applyPreference();
})();
