"use strict";

const steps = [
  ["从原文理出剧本。", "导入故事原文，按场查看对白、动作和必要的声音。确认当前剧本，再推进后面的制作。", "waiting.webp", "《潮声到站》中人物隔着雨窗望向江面"],
  ["给人物、场景和道具定样。", "把故事里的角色、空间和关键道具整理到项目资产里。导入已有素材，或生成并确认后续镜头要沿用的参考。", "umbrella.webp", "角色在渡口候船楼的绿椅旁收起红伞"],
  ["每个镜头拍什么，拍多长。", "按场编排镜头，核对时间、动作和对白。编辑需要调整的段落，再确认选用版本。", "arrival.webp", "远景交代候船楼的入口和角色前往的方向"],
  ["先看画面，再决定选哪版。", "从确认过的分镜制作画面。在项目中回看候选帧，确认要用于视频的镜头。", "waiting.webp", "近景参考，到站角色的侧脸和带雨痕的玻璃"],
  ["生成片段，合成成片。", "选择模型和制作范围，生成并审看视频片段。确认所用片段后，在符合条件的本机环境合成 MP4。", "gangway.webp", "角色撑伞沿舷梯走向渡轮"],
];

const tabs = [...document.querySelectorAll(".steps [role=tab]")];
const stepPanel = document.querySelector("#step-panel");
const stepTitle = document.querySelector("#step-title");
const stepText = document.querySelector("#step-text");
const stepImages = new Map();
let lastStep = 0;

function stepImage(file) {
  if (!stepImages.has(file)) {
    const image = new Image(832, 468);
    image.id = "step-art";
    image.src = "assets/" + file;
    stepImages.set(file, image.decode().then(() => image, () => null));
  }
  return stepImages.get(file);
}

async function selectStep(index, focus) {
  lastStep = index;
  const [title, text, file, alt] = steps[index];
  tabs.forEach((tab, position) => {
    const selected = position === index;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  if (focus) tabs[index].focus();
  stepPanel.setAttribute("aria-labelledby", tabs[index].id);
  stepTitle.textContent = title;
  stepText.textContent = text;
  const image = await stepImage(file);
  if (!image || index !== lastStep) return;

  image.alt = alt;
  const current = document.querySelector("#step-art");
  if (current !== image) current.replaceWith(image);
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectStep(index, false));
  tab.addEventListener("keydown", (event) => {
    const key = event.key;
    let target;
    if (key === "Home") target = 0;
    else if (key === "End") target = tabs.length - 1;
    else if (key === "ArrowDown") target = (index + 1) % tabs.length;
    else if (key === "ArrowUp") target = (index - 1 + tabs.length) % tabs.length;
    else return;
    event.preventDefault();
    selectStep(target, true);
  });
});

const shots = [
  ["入场 · 她撑着红伞走到候船楼外", "00:00–00:04"],
  ["动作 · 她在绿椅旁收起湿透的红伞", "00:04–00:07"],
  ["反应 · 她隔着雨痕望向江心", "00:07–00:10"],
  ["结尾 · 她沿着舷梯登上渡轮", "00:10–00:14"],
];
const shotButtons = [...document.querySelectorAll("[data-shot]")];
const frames = [...document.querySelectorAll("[data-shot-frame]")];
const shotCaption = document.querySelector("#shot-caption");
const shotTime = document.querySelector("#shot-time");
let shotRequest = 0;

shotButtons.forEach((button, index) => button.addEventListener("click", async () => {
  const request = ++shotRequest;
  button.setAttribute("aria-busy", "true");
  try {
    await frames[index].decode();
    if (request !== shotRequest) return;
    shotButtons.forEach((item, position) => item.setAttribute("aria-pressed", String(position === index)));
    frames.forEach((frame, position) => frame.classList.toggle("active", position === index));
    [shotCaption.textContent, shotTime.textContent] = shots[index];
  } catch {
    if (request === shotRequest) shotCaption.textContent = "演示静帧暂时无法加载，请再试一次。";
  } finally {
    button.removeAttribute("aria-busy");
  }
}));

const openStudio = document.querySelector("#open-studio");
const dialog = document.querySelector("#studio-dialog");
const zoom = document.querySelector("#toggle-zoom");
const studioImage = document.querySelector("#studio-image");

function setZoom(enabled) {
  studioImage.toggleAttribute("data-zoomed", enabled);
  zoom.setAttribute("aria-pressed", String(enabled));
  studioImage.scrollTo(0, 0);
}

openStudio.addEventListener("click", () => dialog.showModal());
zoom.addEventListener("click", () => setZoom(zoom.getAttribute("aria-pressed") === "false"));
dialog.addEventListener("close", () => {
  setZoom(false);
  openStudio.focus({ preventScroll: true });
});

const workflow = document.querySelector("#workflow");
if ("IntersectionObserver" in window) {
  const observer = new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    steps.forEach(([, , file]) => stepImage(file));
    observer.disconnect();
  }, { rootMargin: "250px" });
  observer.observe(workflow);
}
