(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const art = hero.querySelector(".hero-art img");
  const rain = hero.querySelector(".weather-rain");
  const finder = hero.querySelector(".viewfinder");
  const closing = document.querySelector(".closing-frame");
  const tail = document.querySelector(".tail-mark");
  const projection = document.querySelector(".projection");
  const player = document.querySelector("#animatic");
  const toggle = document.querySelector("#scene-motion-toggle");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(pointer:fine)");
  const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

  let paused = false;
  let frame = 0;
  let metrics;
  let pointerX = 0;
  let pointerY = 0;
  let easedX = 0;
  let easedY = 0;
  let cameraX = 0;
  let cameraY = 0;
  let lastPointerFrame = 0;

  function measure(scroll) {
    const read = (element) => {
      const {top, bottom, left, width, height} = element.getBoundingClientRect();
      return {top: top + scroll, bottom: bottom + scroll, left, width, height};
    };
    return {hero: read(hero), screen: read(projection), closing: read(closing), tail: read(tail)};
  }

  function setStyle(element, property, value) {
    if (element.style.getPropertyValue(property) !== value) element.style.setProperty(property, value);
  }

  function canRun() {
    return !paused && !reduce.matches && !document.hidden;
  }

  function moveCamera(time, progress, active) {
    const delta = lastPointerFrame ? Math.min((time - lastPointerFrame) / 1000, 0.045) : 1 / 60;
    const catchUp = Math.min(1, delta * 14);
    const closeEnough = 0.005;
    if (active) {
      easedX += (pointerX - easedX) * catchUp;
      easedY += (pointerY - easedY) * catchUp;
      if (Math.abs(pointerX - easedX) < closeEnough) easedX = pointerX;
      if (Math.abs(pointerY - easedY) < closeEnough) easedY = pointerY;
    } else {
      easedX = easedY = 0;
    }
    const x = Number((easedX * 14).toFixed(2));
    const y = Number((easedY * 10 + progress * 53).toFixed(2));

    if (x !== cameraX || y !== cameraY) {
      cameraX = x;
      cameraY = y;
      setStyle(art, "--camera-x", `${x}px`);
      setStyle(art, "--camera-y", `${y}px`);
      hero.dispatchEvent(new CustomEvent("scene:camera", {detail:{x,y}}));
    }

    const moving = active && (easedX !== pointerX || easedY !== pointerY);
    lastPointerFrame = moving ? time : 0;
    if (moving) refreshPosition();
  }

  function positionScenes(time) {
    frame = 0;
    const scroll = scrollY;
    const height = innerHeight;
    metrics ??= measure(scroll);
    const active = canRun();
    const heroVisible = metrics.hero.bottom > scroll && metrics.hero.top < scroll + height;
    const progress = clamp((scroll - metrics.hero.top) / metrics.hero.height);
    const cut = active ? clamp((progress - .19) / .51) : 0;
    rain.toggleAttribute("data-rain-live", active && heroVisible);
    setStyle(hero, "--rain-cut", cut.toFixed(3));
    setStyle(finder, "--finder-scale", (1 - cut * .025).toFixed(3));
    moveCamera(time, active ? progress : 0, active && heroVisible);

    const screenTop = metrics.screen.top - scroll;
    const enter = clamp((height * .96 - screenTop) / (height * .47));
    const curtain = active && metrics.screen.bottom > scroll && screenTop < height && enter < .99 && player.paused;
    projection.toggleAttribute("data-curtain", curtain);
    if (curtain) {
      const position = (enter * 103).toFixed(1);
      setStyle(projection, "--curtain-left", "-" + position + "%");
      setStyle(projection, "--curtain-right", position + "%");
    }

    const endTop = metrics.closing.top - scroll;
    const endVisible = endTop < height && metrics.closing.bottom > scroll;
    closing.toggleAttribute("data-weather-live", active && endVisible);
    if (active && endVisible) {
      const shift = clamp((height / 2 - endTop - metrics.closing.height / 2) * .09, -28, 28);
      setStyle(closing, "--out-shift", shift.toFixed(1) + "px");
    }

    const reveal = active ? clamp((height - metrics.tail.top + scroll) / Math.min(metrics.tail.height * .75, 170)) : 1;
    setStyle(tail, "--roll-up", ((1 - reveal) * 58).toFixed(1) + "px");
    setStyle(tail, "--roll-opacity", (0.58 + reveal * .42).toFixed(3));
  }

  function refreshPosition() {
    if (!frame) frame = requestAnimationFrame(positionScenes);
  }

  function refreshMetrics() {
    metrics = undefined;
    refreshPosition();
  }

  function applyPreference() {
    document.body.dataset.sceneMotion = canRun() ? "active" : "still";
    toggle.hidden = reduce.matches;
    toggle.textContent = paused ? "恢复场景动效" : "暂停场景动效";
    refreshPosition();
  }

  toggle.addEventListener("click", () => {
    paused = !paused;
    if (paused) hero.removeAttribute("data-scene-intro");
    applyPreference();
  });
  hero.addEventListener("pointermove", (event) => {
    if (!finePointer.matches || !canRun() || !metrics) return;
    const box = metrics.hero;
    pointerX = clamp((event.clientX - box.left) / box.width * 2 - 1, -1, 1);
    pointerY = clamp((event.clientY - box.top + scrollY) / box.height * 2 - 1, -1, 1);
    refreshPosition();
  }, {passive:true});
  hero.addEventListener("pointerleave", () => {
    pointerX = pointerY = 0;
    refreshPosition();
  });

  const observer = new ResizeObserver(refreshMetrics);
  for (const element of [document.querySelector("main"), hero, projection, closing, tail]) observer.observe(element);
  addEventListener("scroll", refreshPosition, {passive:true});
  addEventListener("resize", refreshMetrics);
  addEventListener("load", refreshMetrics, {once:true});
  document.fonts.ready.then(refreshMetrics);
  player.addEventListener("play", refreshPosition);
  player.addEventListener("pause", refreshPosition);
  reduce.addEventListener("change", applyPreference);
  document.addEventListener("visibilitychange", applyPreference);
  const navigation = performance.getEntriesByType("navigation")[0];
  if (canRun() && !location.hash && navigation?.type === "navigate") {
    hero.setAttribute("data-scene-intro", "");
    setTimeout(() => hero.removeAttribute("data-scene-intro"), 1200);
  }
  applyPreference();
})();
