(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const art = hero.querySelector(".hero-art");
  const image = art.querySelector("img");
  const screening = document.querySelector("#screening");
  const card = screening.querySelector(".relay-shot");
  const landing = card.querySelector(".relay-still");
  const layer = document.querySelector(".relay-flight");
  const object = layer.querySelector(".relay-object");
  const landingImage = landing.querySelector("img");
  const flightImage = object.querySelector("img");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const crop = { x:1234, y:330, width:324, height:182 };
  const zoom = 1.105;
  let frame = 0;
  let geometry;
  let needsMeasure = true;
  let cameraX = 0;
  let cameraY = 0;
  let ready = false;

  const clamp = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, amount) => start + (end - start) * amount;

  function measure(y) {
    if (!image.naturalWidth) return;
    const heroBox = hero.getBoundingClientRect();
    const artBox = art.getBoundingClientRect();
    const destination = landing.getBoundingClientRect();
    const fit = Math.max(artBox.width / image.naturalWidth, artBox.height / image.naturalHeight);
    const [positionX, positionY] = getComputedStyle(image).objectPosition.split(/\s+/).map(parseFloat);
    const imageWidth = image.naturalWidth * fit;
    const imageHeight = image.naturalHeight * fit;
    const source = {
      left: artBox.left + (1 - zoom) * artBox.width / 2 + zoom * ((artBox.width - imageWidth) * positionX / 100 + crop.x * fit),
      top: artBox.top + y + (1 - zoom) * artBox.height / 2 + zoom * ((artBox.height - imageHeight) * positionY / 100 + crop.y * fit),
      scale: fit * zoom,
    };
    const start = heroBox.top + y + heroBox.height * .19;
    const landingTop = destination.top + y;
    const naturalEnd = Math.max(start + 160, landingTop + destination.height / 2 - innerHeight * .55);
    const anchor = Math.floor(screening.getBoundingClientRect().top + y);
    // The thumbnail must own the shot as soon as the native anchor reaches #screening.
    const end = Math.min(anchor, naturalEnd);

    geometry = {
      source, start, end,
      heroBottom:heroBox.bottom + y,
      landing:{left:destination.left, top:landingTop, width:destination.width, height:destination.height},
      compact:innerWidth < 661,
      arc:Math.min(52, innerHeight * .07),
    };
    needsMeasure = false;
  }

  function hide(holdShade = false) {
    if (!layer.hidden) {
      layer.hidden = true;
      card.removeAttribute("data-catching");
    }
    if (holdShade) art.style.setProperty("--relay-veil", ".94");
    else art.style.removeProperty("--relay-veil");
  }

  function render() {
    frame = 0;
    if (reduce.matches || document.body.dataset.sceneMotion === "still") {
      hide();
      return;
    }

    const y = scrollY;
    if (needsMeasure) measure(y);
    if (!geometry) return;

    const {source, landing, start, end, heroBottom, compact, arc} = geometry;
    const progress = clamp((y - start) / Math.max(1, end - start));
    if (progress <= 0 || progress >= 1) {
      hide(progress >= 1 && y < heroBottom);
      return;
    }

    const t = ease(clamp((progress - .1) / .79));
    const film = ready ? ease(clamp((progress - .89) / .08)) : 0;
    const swing = Math.sin(Math.PI * t);
    const shrink = 1 - swing * (compact ? .42 : .2);
    const width = mix(crop.width * source.scale, landing.width, t);
    const height = mix(crop.height * source.scale, landing.height, t);
    const x = mix(source.left + cameraX * zoom, landing.left, t) + width * (1 - shrink) * .71;
    const top = mix(source.top + cameraY * zoom, landing.top, t) - y - swing * (compact ? -48 : arc);

    object.style.transform = `translate3d(${x.toFixed(2)}px,${top.toFixed(2)}px,0) scale(${(width * shrink / crop.width).toFixed(4)},${(height * shrink / crop.height).toFixed(4)})`;
    object.style.setProperty("--relay-umbrella", (1 - film).toFixed(3));
    object.style.setProperty("--relay-film", film.toFixed(3));
    art.style.setProperty("--relay-veil", (.94 * ease(clamp((progress - .015) / .21))).toFixed(3));
    layer.hidden = false;
    card.toggleAttribute("data-catching", ready && film >= .99 && t > .98);
  }

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function remeasure() {
    needsMeasure = true;
    schedule();
  }

  function watchStill() {
    ready = false;
    card.setAttribute("data-still-loading", "");
    card.removeAttribute("data-catching");
    const src = flightImage.src;
    Promise.all([flightImage.decode(), landingImage.decode()]).then(() => {
      if (flightImage.src !== src) return;
      ready = true;
      card.removeAttribute("data-still-loading");
      schedule();
    }).catch(schedule);
  }

  addEventListener("scroll", schedule, {passive:true});
  addEventListener("resize", remeasure);
  addEventListener("pageshow", remeasure);
  image.addEventListener("load", remeasure);
  hero.addEventListener("scene:camera", ({detail}) => {
    cameraX = detail.x;
    cameraY = detail.y;
    schedule();
  });
  reduce.addEventListener("change", remeasure);
  const resize = new ResizeObserver(remeasure);
  [hero, landing, document.body].forEach((element) => resize.observe(element));
  new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:["data-scene-motion"]});
  layer.addEventListener("relay:still", watchStill);
  watchStill();
  schedule();
})();
