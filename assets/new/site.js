"use strict";

const motion = matchMedia("(prefers-reduced-motion: reduce)");
const reel = [
  { time: 0, detail: "远景 · 她撑着红伞走到候船楼外。" },
  { time: 4, detail: "中景 · 她在绿椅旁收起湿透的红伞。" },
  { time: 7, detail: "近景 · 她隔着雨痕望向江心。" },
  { time: 10, detail: "远景 · 她沿着舷梯登上渡轮。" },
];

const player = document.querySelector("#animatic");
const play = document.querySelector("#play");
const screenPlay = document.querySelector("#screen-play");
const seek = document.querySelector("#seek");
const elapsed = document.querySelector("#elapsed");
const status = document.querySelector("#media-status");
const frameDetail = document.querySelector("#frame-detail");
const shotButtons = [...document.querySelectorAll(".shot")];
let currentShot = -1;
let pendingSeek;

function syncPlayer() {
  const time = pendingSeek ?? player.currentTime;
  seek.value = time;
  elapsed.textContent = "00:" + String(Math.floor(time)).padStart(2, "0");
  seek.setAttribute("aria-valuetext", elapsed.textContent);
  const index = reel.findLastIndex((shot) => time >= shot.time);
  if (index === currentShot) return;
  currentShot = index;
  frameDetail.textContent = reel[index].detail;
  shotButtons.forEach((button, position) => button.setAttribute("aria-pressed", String(position === index)));
}

function syncPlay() {
  play.textContent = player.paused ? "播放" : "暂停";
  screenPlay.hidden = !player.paused || player.currentTime > 0 && !player.ended;
}

function beginPlayback({reset = false} = {}) {
  if (reset || player.ended) jumpTo(0);
  player.play().then(() => {
    status.textContent = "基于静帧剪辑 · 无声预演";
  }).catch(() => {
    if (!player.paused || player.error) return;
    status.textContent = "可用播放按钮重新开始预演。";
  });
}

function jumpTo(time) {
  if (player.readyState === 0) {
    pendingSeek = time;
    player.preload = "auto";
  } else {
    pendingSeek = undefined;
    player.currentTime = time;
  }
  syncPlayer();
}

player.addEventListener("loadedmetadata", () => {
  seek.max = player.duration;
  if (pendingSeek !== undefined) jumpTo(pendingSeek);
});
for (const event of ["timeupdate", "seeked", "ended"]) player.addEventListener(event, syncPlayer);
for (const event of ["play", "pause", "ended"]) player.addEventListener(event, syncPlay);
player.addEventListener("error", () => {
  status.textContent = "当前无法播放预演。四张分镜静帧仍可在下方查看。";
  screenPlay.hidden = true;
  play.disabled = true;
  seek.disabled = true;
});
play.addEventListener("click", () => player.paused ? beginPlayback() : player.pause());
screenPlay.addEventListener("click", () => {
  beginPlayback();
  play.focus({preventScroll:true});
});
document.querySelector("[data-start]").addEventListener("click", () => beginPlayback({reset:true}));
seek.addEventListener("input", () => jumpTo(Number(seek.value)));
seek.addEventListener("keydown", (event) => {
  const increments = {ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1};
  if (!(event.key in increments)) return;
  event.preventDefault();
  const time = Number(seek.value) + increments[event.key];
  jumpTo(Math.min(Number(seek.max), Math.max(0, time)));
});
shotButtons.forEach((button, index) => button.addEventListener("click", () => jumpTo(reel[index].time)));
player.addEventListener("click", () => player.paused ? beginPlayback() : player.pause());
player.controls = false;
document.querySelector("#transport").hidden = false;
syncPlay();
syncPlayer();

const steps = [
  {
    title: "从原稿理出分场剧本",
    text: "原稿与分场剧本可以并读，逐场核对动作、对白和必要的声音。定稿后确认本步，再整理下一步需要的资产。",
    image: "step-source.webp",
    alt: "故事蓝本与原始剧本并排的工作室实屏",
  },
  {
    title: "确认角色、场景和道具",
    text: "整理剧本里会用到的人物、地点和物件。确认后续镜头要沿用的参考，逐项核对设定与当前剧本是否一致。",
    image: "step-assets.webp",
    alt: "资产设定页，包含角色、场景、道具和声音分类",
  },
  {
    title: "把场次编排成镜头",
    text: "在分镜里检查起止时间、动作与对白，确认相邻镜头如何衔接。分镜内容确认后，继续制作画面。",
    image: "step-boards.webp",
    alt: "分镜结构编辑页和一组对应的参考画面",
  },
  {
    title: "看画面，选择要用的版本",
    text: "对照分镜产生的画面，检查人物、动线与构图。选定后核对选用标记，再把该版本用于下一步。",
    image: "step-image.webp",
    alt: "分镜成图实屏，示范画面和选用版本",
  },
  {
    title: "审看片段，再合成成片",
    text: "确认模型、费用和本次范围后生成视频。核对每段选用结果，满足本机编码条件时合成并导出 MP4。",
    image: "step-video.webp",
    alt: "连续制作实屏，展示当前完成的片段和完整视频导出",
  },
];

const tabs = [...document.querySelectorAll(".stage-tabs [role=tab]")];
const tabLayout = matchMedia("(max-width: 660px)");
const panel = document.querySelector("#stage-panel");
const stageTitle = document.querySelector("#stage-title");
const stageText = document.querySelector("#stage-text");
const stageOpen = document.querySelector("#stage-open");
const stagePreview = document.querySelector("#stage-preview");
const dialog = document.querySelector("#stage-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogPreview = document.querySelector("#dialog-preview");
const zoom = document.querySelector("#zoom");
const dialogImage = document.querySelector("#dialog-image");
const base = new URL(".", document.currentScript.src);
const images = new Map();
let stage = 0;
let stageRequest = 0;

function prepare(file) {
  if (!images.has(file)) {
    const image = new Image();
    image.src = new URL(file, base).href;
    images.set(file, image.decode().then(() => image.src).catch(() => {
      images.delete(file);
      return null;
    }));
  }
  return images.get(file);
}

async function chooseStep(index, focus = false) {
  const request = ++stageRequest;
  const step = steps[index];
  if (focus) tabs[index].focus();
  if (index === stage) {
    stageOpen.removeAttribute("aria-busy");
    return;
  }
  stageOpen.setAttribute("aria-busy", "true");
  const src = await prepare(step.image);
  if (request !== stageRequest) return;
  stageOpen.removeAttribute("aria-busy");
  if (!src) return;

  stage = index;
  for (const [position, tab] of tabs.entries()) {
    tab.tabIndex = position === index ? 0 : -1;
    tab.setAttribute("aria-selected", String(position === index));
  }
  panel.setAttribute("aria-labelledby", tabs[index].id);
  stageTitle.textContent = step.title;
  stageText.textContent = step.text;
  stagePreview.src = src;
  stagePreview.alt = step.alt;

  stageOpen.removeAttribute("data-changing");
  if (!motion.matches) {
    stageOpen.getBoundingClientRect();
    stageOpen.setAttribute("data-changing", "");
  }
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => chooseStep(index));
  tab.addEventListener("keydown", (event) => {
    const keys = { Home: 0, End: tabs.length - 1 };
    keys[tabLayout.matches ? "ArrowLeft" : "ArrowUp"] = index - 1;
    keys[tabLayout.matches ? "ArrowRight" : "ArrowDown"] = index + 1;
    if (!(event.key in keys)) return;
    event.preventDefault();
    chooseStep((keys[event.key] + tabs.length) % tabs.length, true);
  });
});

function syncTabLayout() {
  tabs[0].parentElement.setAttribute("aria-orientation", tabLayout.matches ? "horizontal" : "vertical");
}
syncTabLayout();
tabLayout.addEventListener("change", syncTabLayout);

function setZoom(enabled) {
  dialogImage.toggleAttribute("data-zoomed", enabled);
  zoom.setAttribute("aria-pressed", String(enabled));
  dialogImage.scrollTo(0, 0);
}

stageOpen.addEventListener("click", () => {
  dialogTitle.textContent = steps[stage].title;
  dialogPreview.src = stagePreview.src;
  dialogPreview.alt = stagePreview.alt;
  dialog.showModal();
});
zoom.addEventListener("click", () => setZoom(zoom.getAttribute("aria-pressed") === "false"));
dialog.addEventListener("close", () => {
  setZoom(false);
  stageOpen.focus({preventScroll:true});
});

const desk = document.querySelector(".desk");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    steps.forEach((step) => prepare(step.image));
    observer.disconnect();
  }, {rootMargin:"300px"});
  observer.observe(desk);
}

const cover = document.querySelector(".hero");
const closeFrame = document.querySelector(".closing-frame");
let scrollFrame;

function positionArt() {
  scrollFrame = undefined;
  if (motion.matches) return;
  const rect = cover.getBoundingClientRect();
  if (rect.bottom > 0) cover.style.setProperty("--art-shift", Math.min(25, -rect.top * .07) + "px");
  const end = closeFrame.getBoundingClientRect();
  if (end.top < innerHeight && end.bottom > 0) {
    const shift = Math.max(-24, Math.min(24, (innerHeight / 2 - (end.top + end.height / 2)) * .065));
    closeFrame.style.setProperty("--out-shift", shift + "px");
  }
}

function queuePosition() {
  if (scrollFrame === undefined) scrollFrame = requestAnimationFrame(positionArt);
}
addEventListener("scroll", queuePosition, {passive:true});
addEventListener("resize", queuePosition);
motion.addEventListener("change", queuePosition);
queuePosition();
