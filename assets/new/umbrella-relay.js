(() => {
  "use strict";

  const hero = document.querySelector(".hero");
  const image = hero.querySelector(".hero-art img");
  const card = document.querySelector(".relay-shot");
  const landing = card.querySelector(".relay-still");
  const layer = document.querySelector(".relay-flight");
  const object = layer.querySelector(".relay-object");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const crop = { x:1234, y:330, width:324, height:182 };
  let scheduled = false;

  const clamp = (value) => Math.max(0, Math.min(1, value));
  const ease = (value) => value * value * (3 - 2 * value);
  const mix = (start, end, amount) => start + (end - start) * amount;

  function projectCrop() {
    const box = image.getBoundingClientRect();
    const layoutWidth = image.clientWidth;
    const layoutHeight = image.clientHeight;
    const [positionX, positionY] = getComputedStyle(image).objectPosition.split(/\s+/).map(parseFloat);
    const fit = Math.max(layoutWidth / image.naturalWidth, layoutHeight / image.naturalHeight);
    const scaleX = box.width / layoutWidth;
    const scaleY = box.height / layoutHeight;
    const gapX = (layoutWidth - image.naturalWidth * fit) * (positionX / 100);
    const gapY = (layoutHeight - image.naturalHeight * fit) * (positionY / 100);

    return {
      left: box.left + (gapX + crop.x * fit) * scaleX,
      top: box.top + (gapY + crop.y * fit) * scaleY,
      width: crop.width * fit * scaleX,
      height: crop.height * fit * scaleY,
    };
  }

  function hide(holdShade = false) {
    layer.hidden = true;
    if (holdShade) hero.style.setProperty("--relay-veil", ".94");
    else hero.style.removeProperty("--relay-veil");
    card.removeAttribute("data-catching");
  }

  function render() {
    scheduled = false;
    if (reduce.matches || document.body.dataset.sceneMotion === "still" || !image.naturalWidth) {
      hide();
      return;
    }

    const destination = landing.getBoundingClientRect();
    const heroBox = hero.getBoundingClientRect();
    const start = heroBox.height * .19;
    const traveled = -heroBox.top;
    const end = Math.max(start + 160, traveled + destination.top + destination.height / 2 - innerHeight * .55);
    const progress = clamp((traveled - start) / (end - start));
    if (progress <= 0 || progress >= 1) {
      hide(progress >= 1 && heroBox.bottom > 0);
      return;
    }

    const source = projectCrop();
    const t = ease(clamp((progress - .1) / .9));
    const film = ease(clamp((progress - .57) / .34));
    const compact = innerWidth < 661;
    const arc = Math.sin(Math.PI * t) * (compact ? -23 : Math.min(52, innerHeight * .07));
    const shrink = 1 - Math.sin(Math.PI * t) * (compact ? .42 : .2);
    const originalWidth = mix(source.width, destination.width, t);
    const width = originalWidth * shrink;
    const height = mix(source.height, destination.height, t) * shrink;
    const x = mix(source.left, destination.left, t) + (originalWidth - width) * .71;
    const y = mix(source.top, destination.top, t) - arc;

    object.style.width = width.toFixed(2) + "px";
    object.style.height = height.toFixed(2) + "px";
    object.style.transform = "translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0)";
    object.style.setProperty("--relay-umbrella", (1 - film).toFixed(3));
    object.style.setProperty("--relay-film", film.toFixed(3));
    hero.style.setProperty("--relay-veil", (.94 * ease(clamp((progress - .015) / .21))).toFixed(3));
    layer.hidden = false;
    card.toggleAttribute("data-catching", progress > .27);
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(render);
  }

  addEventListener("scroll", schedule, {passive:true});
  addEventListener("resize", schedule);
  image.addEventListener("load", schedule);
  reduce.addEventListener("change", schedule);
  new MutationObserver(schedule).observe(document.body, {attributes:true, attributeFilter:["data-scene-motion"]});
  schedule();
})();
