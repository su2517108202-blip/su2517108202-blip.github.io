"use strict";

(() => {
  const lab = document.querySelector("#cut-editor");
  const player = document.querySelector("#animatic");
  const source = player?.querySelector("source");
  const transport = document.querySelector("#transport");
  const seek = document.querySelector("#seek");
  const play = document.querySelector("#play");
  const screenPlay = document.querySelector("#screen-play");
  const still = document.querySelector("#switch-frame");
  const middle = document.querySelector('.shot[data-shot="1"] img');
  if (!lab || !player || !source || !transport || !seek || !play || !screenPlay || !still || !middle) return;

  const assets = new URL(".", document.currentScript.src);
  const button = lab.querySelector("#cut-play");
  const retry = lab.querySelector("#cut-retry");
  const status = lab.querySelector("#cut-status");
  const takeLabel = lab.querySelector("#cut-take-label");
  const choices = [...lab.querySelectorAll('input[name="umbrella-take"]')];
  const route = [...lab.querySelectorAll("[data-cut-phase]")];
  const chapters = [...document.querySelectorAll(".reel .shot")];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const takes = {
    a: {
      full: source.src,
      three: new URL("tide-animatic-three.mp4", assets).href,
      thumb: middle.src,
      label: "A 版中景",
      detail: "中景 · 她在绿椅旁收起湿透的红伞。",
    },
    b: {
      full: new URL("tide-detail.mp4", assets).href,
      three: new URL("tide-detail-three.mp4", assets).href,
      thumb: new URL("umbrella-detail.webp", assets).href,
      label: "B 版近景",
      detail: "近景 · 收伞的手和伞面。同一镜头裁切。",
    },
  };
  const inPoint = 2;
  const targetMiddle = 4.1;
  let activeTake = "a";
  let activeMode = "full";
  let inFlight;
  let failed;
  let shownPhase = "";

  function selectedNotice() {
    return "已选 " + takes[activeTake].label + " · 前后两镜固定";
  }

  function markChoice(key) {
    choices.forEach((choice) => { choice.checked = choice.value === key; });
  }

  function paintPhase() {
    if (inFlight) return;
    const time = player.currentTime;
    const phase = activeMode === "full" && time >= 10 ? "" : (time < 4 ? "0" : time < 7 ? "1" : "2");
    if (phase === shownPhase) return;
    shownPhase = phase;
    for (const item of route) {
      const current = item.dataset.cutPhase === phase;
      item.toggleAttribute("data-current",current);
      if (current) item.setAttribute("aria-current","step");
      else item.removeAttribute("aria-current");
    }
  }

  function holdFrame() {
    if (!still.hidden || player.readyState < 2 || player.seeking) return;
    still.getContext("2d").drawImage(player,0,0,still.width,still.height);
    still.hidden = false;
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

  function startPlayback() {
    player.play().catch(() => {
      if (player.paused && !inFlight) status.textContent = "可以用播放按钮继续。";
    });
  }

  function settle(request) {
    request.events.abort();
    clearTimeout(request.timeout);
    inFlight = undefined;
  }

  function fail(request) {
    if (request !== inFlight) return;
    settle(request);
    if (!request.recover) failed = request;
    retry.hidden = false;
    markChoice(activeTake);
    if (request.recover || request.src === takes[activeTake][activeMode]) {
      still.hidden = true;
      status.textContent = "镜头载入失败，可以重试。";
      updateBusy();
      return;
    }
    status.textContent = takes[request.key].label + "载入失败，正恢复" + takes[activeTake].label + "。";
    select(activeTake, { mode:activeMode, position:request.previousTime, recover:true });
  }

  function select(key, { mode = "full", position = targetMiddle, shouldPlay = false, recover = false, focus = false } = {}) {
    const take = takes[key];
    if (!take) return;
    const src = take[mode];
    if (inFlight?.src === src) {
      inFlight.shouldPlay ||= shouldPlay;
      inFlight.focus ||= focus;
      if (inFlight.position !== position) {
        inFlight.position = position;
        if (inFlight.seekRequested) player.currentTime = Math.min(position,player.duration);
      }
      return;
    }
    if (!inFlight && !player.error && player.readyState > 0 && player.currentSrc === src) {
      markChoice(key);
      if (player.currentTime !== position) player.currentTime = position;
      if (shouldPlay) startPlayback();
      if (focus) play.focus({preventScroll:true});
      return;
    }

    const previousTime = inFlight?.previousTime ?? player.currentTime;
    if (inFlight) settle(inFlight);
    holdFrame();
    player.pause();
    const request = { key, mode, src, position, previousTime, shouldPlay, recover, focus, events:new AbortController() };
    inFlight = request;
    markChoice(key);
    lab.removeAttribute("data-playing");
    if (!recover) {
      failed = undefined;
      retry.hidden = true;
      status.textContent = "正在载入" + take.label + "…";
    }
    updateBusy();

    const belongs = () => request === inFlight && player.currentSrc === src;
    const eventOptions = {signal:request.events.signal};
    let commitFrame = 0;
    const commit = () => {
      if (!belongs() || player.seeking || player.readyState < 2) return;
      settle(request);
      activeTake = key;
      activeMode = mode;
      player.toggleAttribute("data-three-cut", mode === "three");
      middle.src = take.thumb;
      lab.dataset.take = key;
      takeLabel.textContent = take.label;
      updateBusy();
      player.dispatchEvent(new CustomEvent("continuity:take", {detail:{key, detail:take.detail}}));
      still.hidden = true;
      status.textContent = recover ? "已恢复" + take.label + "，可以重试。" : selectedNotice();
      if (request.shouldPlay) startPlayback();
      if (request.focus) play.focus({preventScroll:true});
    };
    player.addEventListener("loadedmetadata", () => {
      if (!belongs()) return;
      request.seekRequested = true;
      player.currentTime = Math.min(request.position,player.duration);
    },eventOptions);
    for (const event of ["loadeddata","seeked","canplay"]) {
      player.addEventListener(event, () => {
        if (!request.seekRequested || !belongs() || player.seeking || player.readyState < 2 || commitFrame) return;
        if (document.hidden) {
          commit();
          return;
        }
        commitFrame = requestAnimationFrame(() => {
          commitFrame = 0;
          commit();
        });
      },eventOptions);
    }
    player.addEventListener("error", () => {
      if (request === inFlight && player.error) fail(request);
    },eventOptions);
    request.timeout = setTimeout(() => fail(request), 14000);

    player.preload = "auto";
    player.src = src;
    player.load();
  }

  function playCompare() {
    player.scrollIntoView({block:"center",behavior:reduce.matches?"instant":"smooth"});
    select(inFlight?.key ?? activeTake, {mode:"three", position:inPoint, shouldPlay:true, focus:true});
  }

  player.addEventListener("continuity:play-request", (event) => {
    if (inFlight) {
      event.preventDefault();
      if (event.detail.reset) {
        select(inFlight.key, {position:0, shouldPlay:true});
      } else {
        inFlight.shouldPlay = true;
      }
      return;
    }
    if (activeMode === "three" && event.detail.reset) {
      event.preventDefault();
      select(activeTake, {position:0, shouldPlay:true});
    } else if (activeMode === "three" && player.ended) {
      event.preventDefault();
      playCompare();
    }
  });
  player.addEventListener("continuity:seek-request", (event) => {
    if (inFlight) {
      event.preventDefault();
    } else if (activeMode === "three" && event.detail.chapter && event.detail.time >= 10) {
      event.preventDefault();
      select(activeTake, {position:event.detail.time, shouldPlay:!player.paused});
    }
  });
  player.addEventListener("play", () => {
    if (activeMode !== "three" || inFlight) return;
    lab.setAttribute("data-playing","");
    status.textContent = "正在播放三镜衔接 · " + takes[activeTake].label;
  });
  player.addEventListener("pause", () => {
    if (activeMode !== "three" || inFlight || player.ended) return;
    lab.removeAttribute("data-playing");
    status.textContent = "三镜衔接已暂停 · " + takes[activeTake].label;
  });
  player.addEventListener("ended", () => {
    if (activeMode !== "three" || inFlight) return;
    lab.removeAttribute("data-playing");
    paintPhase();
    status.textContent = takes[activeTake].label + " · 三镜衔接播放完毕";
  });
  for (const event of ["timeupdate","seeked"]) player.addEventListener(event,paintPhase);
  choices.forEach((choice) => choice.addEventListener("change", () => {
    if (choice.checked) select(choice.value);
  }));
  button.addEventListener("click",playCompare);
  retry.addEventListener("click", () => {
    if (failed) select(failed.key, failed);
  });
  lab.hidden = false;
  paintPhase();
})();
