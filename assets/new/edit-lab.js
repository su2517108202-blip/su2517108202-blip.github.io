"use strict";

(() => {
  const lab = document.querySelector("#cut-editor");
  const player = document.querySelector("#animatic");
  const source = player?.querySelector("source");
  const transport = document.querySelector("#transport");
  const seek = document.querySelector("#seek");
  const play = document.querySelector("#play");
  const screenPlay = document.querySelector("#screen-play");
  const middle = document.querySelector('.shot[data-shot="1"] img');
  if (!lab || !player || !source || !transport || !seek || !play || !screenPlay || !middle) return;

  const currentScript = document.currentScript;
  const assets = new URL(".", currentScript.src);
  const poster = player.poster;
  const button = lab.querySelector("#cut-play");
  const retry = lab.querySelector("#cut-retry");
  const status = lab.querySelector("#cut-status");
  const takeLabel = lab.querySelector("#cut-take-label");
  const choices = [...lab.querySelectorAll('input[name="umbrella-take"]')];
  const route = [...lab.querySelectorAll("[data-cut-phase]")];
  const chapters = [...document.querySelectorAll(".reel .shot")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const takes = {
    a: { media: source.src, thumb: middle.src, label: "A 版中景", detail: "中景 · 她在绿椅旁收起湿透的红伞。" },
    b: { media: new URL("tide-detail.mp4",assets).href, thumb: new URL("umbrella-detail.webp",assets).href, label: "B 版近景", detail: "近景 · 收伞的手和伞面。同一镜头裁切。" },
  };
  const inPoint = 2;
  // Leave room for a late frame callback before shot 04 starts at 10 seconds.
  const outPoint = 9.8;
  const targetMiddle = 4.1;
  let activeTake = "a";
  let inFlight;
  let failedTake;
  let comparing = false;
  let stopFrame = 0;
  let shownPhase = "";

  function selectedNotice() {
    return "已选 " + takes[activeTake].label + " · 前后两镜固定";
  }

  function markChoice(key) {
    choices.forEach((choice) => { choice.checked = choice.value === key; });
  }

  function paintPhase() {
    const time = player.currentTime;
    const phase = !inFlight && time < 10 ? (time < 4 ? "0" : time < 7 ? "1" : "2") : "";
    if (phase === shownPhase) return;
    shownPhase = phase;
    for (const item of route) {
      const current = item.dataset.cutPhase === phase;
      item.toggleAttribute("data-current",current);
      if (current) item.setAttribute("aria-current","step");
      else item.removeAttribute("aria-current");
    }
  }

  function updateBusy() {
    const loading = Boolean(inFlight);
    lab.toggleAttribute("data-loading",loading);
    player.toggleAttribute("data-cut-loading",loading);
    transport.setAttribute("aria-busy",String(loading));
    play.disabled = seek.disabled = loading || Boolean(player.error);
    for (const chapter of chapters) chapter.disabled = loading;
    if (loading || player.error) screenPlay.hidden = true;
    else screenPlay.hidden = !player.paused || player.currentTime > 0 && !player.ended;
    paintPhase();
  }

  function updateTake(key) {
    activeTake = key;
    const take = takes[key];
    markChoice(key);
    middle.src = take.thumb;
    lab.dataset.take = key;
    takeLabel.textContent = take.label;
    player.dispatchEvent(new CustomEvent("continuity:take", {detail: {key, detail: take.detail}}));
  }

  function clearPlayback() {
    if (comparing && !inFlight) status.textContent = selectedNotice();
    if (stopFrame) cancelAnimationFrame(stopFrame);
    stopFrame = 0;
    comparing = false;
    lab.removeAttribute("data-playing");
  }

  function checkOutPoint() {
    if (!comparing || inFlight) return;
    if (player.currentTime < outPoint) return;
    clearPlayback();
    player.pause();
    player.currentTime = outPoint;
    status.textContent = takes[activeTake].label + " · 三镜衔接播放完毕";
  }

  function watchPlayback() {
    stopFrame = 0;
    checkOutPoint();
    if (comparing && !player.paused) stopFrame = requestAnimationFrame(watchPlayback);
  }

  function playCompare({bringIntoView = true} = {}) {
    if (inFlight) {
      inFlight.action = "compare";
      status.textContent = "镜头加载后将播放三镜衔接。";
      return;
    }
    if (player.error || player.readyState === 0) {
      selectTake(activeTake, {action:"compare", position:inPoint});
      return;
    }
    comparing = true;
    lab.setAttribute("data-playing","");
    player.currentTime = inPoint;
    status.textContent = "正在播放三镜衔接 · " + takes[activeTake].label;
    if (bringIntoView) {
      player.scrollIntoView({block:"center",behavior:reduce.matches?"instant":"smooth"});
      play.focus({preventScroll:true});
    }
    player.play().catch(() => {
      if (!comparing) return;
      clearPlayback();
      status.textContent = "可以用播放按钮继续。";
    });
  }

  function settle(request) {
    request.events.abort();
    clearTimeout(request.timeout);
    inFlight = undefined;
  }

  function failTake(request) {
    if (request !== inFlight) return;
    settle(request);
    failedTake = request.recover ? failedTake : request.key;
    retry.hidden = false;
    markChoice(activeTake);
    if (request.recover || request.key === activeTake) {
      status.textContent = "镜头载入失败，可以重试。";
      updateBusy();
      return;
    }
    status.textContent = takes[request.key].label + "载入失败，正恢复" + takes[activeTake].label + "。";
    selectTake(activeTake, { position: request.previousTime, action: null, recover: true });
  }

  function selectTake(key, { position = targetMiddle, action = null, recover = false } = {}) {
    const take = takes[key];
    if (!take) return;
    if (!inFlight && !player.error && player.readyState > 0 && player.currentSrc === take.media && key === activeTake) {
      markChoice(key);
      if (action === "compare") playCompare();
      return;
    }
    const previousTime = inFlight?.previousTime ?? player.currentTime;
    if (inFlight) settle(inFlight);
    clearPlayback();
    player.pause();
    const request = { key, previousTime, action, recover, events: new AbortController() };
    inFlight = request;
    markChoice(key);
    if (!recover) {
      failedTake = undefined;
      retry.hidden = true;
      status.textContent = "正在载入" + take.label + "…";
    }
    updateBusy();

    const belongsToRequest = () => request === inFlight && player.currentSrc === take.media;
    const eventOptions = {signal:request.events.signal};
    function commit() {
      if (!belongsToRequest() || player.seeking || player.readyState < 2) return;
      settle(request);
      player.poster = poster;
      updateTake(key);
      updateBusy();
      status.textContent = recover ? "已恢复" + take.label + "，可以重试另一版。" : selectedNotice();

      if (request.action === "compare") playCompare();
      if (request.action === "full") {
        player.currentTime = 0;
        player.play().catch(() => { status.textContent = "可以用播放按钮重播。"; });
      }
      if (request.action === "continue") {
        player.play().catch(() => { status.textContent = "可以用播放按钮继续。"; });
      }
    }
    let seekRequested = false;
    player.addEventListener("loadedmetadata", () => {
      if (!belongsToRequest()) return;
      seekRequested = true;
      player.currentTime = Math.min(position,player.duration);
    },eventOptions);
    for (const event of ["loadeddata","seeked","canplay"]) {
      player.addEventListener(event, () => { if (seekRequested) commit(); },eventOptions);
    }
    player.addEventListener("error", () => {
      if (belongsToRequest()) failTake(request);
    },eventOptions);
    request.timeout = setTimeout(() => failTake(request), 14000);

    player.poster = take.thumb;
    player.preload = "auto";
    player.src = take.media;
    player.load();
  }

  player.addEventListener("continuity:play-request", (event) => {
    if (inFlight) {
      event.preventDefault();
      inFlight.action = event.detail.reset ? "full" : "continue";
      return;
    }
    if (event.detail.reset) clearPlayback();
  });
  player.addEventListener("continuity:compare", () => playCompare());
  player.addEventListener("play", () => {
    if (!comparing) return;
    status.textContent = "正在播放三镜衔接 · " + takes[activeTake].label;
    if (!stopFrame) stopFrame = requestAnimationFrame(watchPlayback);
  });
  player.addEventListener("pause", () => {
    if (stopFrame) cancelAnimationFrame(stopFrame);
    stopFrame = 0;
    if (comparing) status.textContent = "三镜衔接已暂停 · " + takes[activeTake].label;
  });
  player.addEventListener("timeupdate", () => { paintPhase(); checkOutPoint(); });
  player.addEventListener("seeked",paintPhase);
  player.addEventListener("ended",clearPlayback);
  seek.addEventListener("input",clearPlayback);
  seek.addEventListener("keydown",(event) => {
    if (["ArrowRight","ArrowLeft","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key)) clearPlayback();
  });
  chapters.forEach((chapter) => chapter.addEventListener("click",clearPlayback));
  choices.forEach((choice) => choice.addEventListener("change", () => {
    if (choice.checked) selectTake(choice.value);
  }));
  button.addEventListener("click", () => playCompare());
  retry.addEventListener("click", () => {
    if (failedTake) selectTake(failedTake);
  });
  lab.hidden = false;
  paintPhase();
})();
