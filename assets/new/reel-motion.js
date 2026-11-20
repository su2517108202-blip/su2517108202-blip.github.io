"use strict";

(() => {
  const seek = document.querySelector(".transport #seek");
  const filmstrip = document.querySelector(".reel");
  const video = document.querySelector("#animatic");
  if (!seek || !filmstrip || !video) return;

  const chapters = Array.from(filmstrip.querySelectorAll(".shot"), (button) => ({
    button,
    time: Number(button.querySelector("time")?.dateTime.match(/^PT([\d.]+)S$/)?.[1]),
    name: button.querySelector("strong")?.textContent ?? "",
    src: button.querySelector("img")?.src,
  }));
  if (!chapters.length || chapters.some(({time, src}) => !Number.isFinite(time) || !src)) return;

  const theater = seek.closest(".theater") || seek.closest(".transport");
  const track = document.createElement("div");
  track.className = "reel-motion";
  seek.before(track);
  track.append(seek);
  filmstrip.classList.add("has-reel-motion");

  const markers = document.createElement("span");
  markers.className = "reel-motion__markers";
  markers.setAttribute("aria-hidden", "true");
  track.append(markers);
  for (const chapter of chapters.slice(1)) markers.append(document.createElement("i"));

  const preview = document.createElement("div");
  preview.className = "reel-motion__preview";
  preview.setAttribute("aria-hidden", "true");
  const previewImage = document.createElement("img");
  previewImage.alt = "";
  previewImage.width = 832;
  previewImage.height = 468;
  const caption = document.createElement("span");
  const title = document.createElement("strong");
  const timecode = document.createElement("span");
  caption.append(title, timecode);
  preview.append(previewImage, caption);
  track.append(preview);

  const thumbRadius = 8;
  const navigationKeys = new Set(["Home", "End", "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]);
  let dragPointerId;
  let previewChapter;
  let previewSource;

  function proportion(time) {
    const limit = Number(seek.max);
    return limit > 0 ? Math.max(0, Math.min(1, time / limit)) : 0;
  }

  function renderProgress() {
    track.style.setProperty("--reel-progress", proportion(seek.valueAsNumber) * 100 + "%");
    chapters.slice(1).forEach((chapter, index) => {
      markers.children[index].style.left = proportion(chapter.time) * 100 + "%";
    });
  }

  function hidePreview() {
    track.removeAttribute("data-reel-peek");
    previewChapter?.button.removeAttribute("data-reel-preview");
    previewChapter = undefined;
    previewSource = undefined;
  }

  function renderPreview(time, source) {
    if (seek.disabled || !Number.isFinite(time)) {
      hidePreview();
      return;
    }
    const chapter = chapters.findLast((item) => time >= item.time) || chapters[0];
    if (chapter !== previewChapter) {
      previewChapter?.button.removeAttribute("data-reel-preview");
      previewChapter = chapter;
      chapter.button.setAttribute("data-reel-preview", "");
      previewImage.src = chapter.src;
      title.textContent = chapter.name;
    }
    timecode.textContent = "00:" + String(Math.floor(time)).padStart(2, "0");

    const rail = seek.getBoundingClientRect();
    const boundary = theater.getBoundingClientRect();
    const half = preview.offsetWidth / 2;
    const anchor = rail.left + thumbRadius + proportion(time) * Math.max(0, rail.width - 2 * thumbRadius);
    const min = Math.max(8, boundary.left) + half;
    const max = Math.min(document.documentElement.clientWidth - 8, boundary.right) - half;
    const center = Math.max(min, Math.min(max, anchor));
    const pin = Math.max(11, Math.min(half * 2 - 11, anchor - center + half));
    preview.style.setProperty("--reel-peek-left", center - rail.left + "px");
    preview.style.setProperty("--reel-pin-left", pin + "px");
    track.setAttribute("data-reel-peek", "");
    previewSource = source;
  }

  function timeAt(clientX) {
    const bounds = seek.getBoundingClientRect();
    const position = (clientX - bounds.left - thumbRadius) / Math.max(1, bounds.width - 2 * thumbRadius);
    return Math.max(0, Math.min(1, position)) * Number(seek.max);
  }

  seek.addEventListener("pointermove", (event) => {
    if (event.pointerId === dragPointerId) renderPreview(seek.valueAsNumber, "drag");
    else if (event.pointerType !== "touch" && event.buttons === 0) {
      renderPreview(timeAt(event.clientX), "hover");
    }
  });
  seek.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch" && event.buttons === 0) renderPreview(timeAt(event.clientX), "hover");
  });
  seek.addEventListener("pointerleave", () => {
    if (previewSource === "hover" && dragPointerId === undefined) hidePreview();
  });
  seek.addEventListener("pointerdown", (event) => {
    if (seek.disabled || !event.isPrimary || event.button !== 0) return;
    dragPointerId = event.pointerId;
    renderPreview(timeAt(event.clientX), "drag");
  });

  addEventListener("pointerup", (event) => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = undefined;
    if (event.pointerType === "touch" || !seek.matches(":hover")) hidePreview();
    else renderPreview(timeAt(event.clientX), "hover");
  });
  addEventListener("pointercancel", (event) => {
    if (event.pointerId !== dragPointerId) return;
    dragPointerId = undefined;
    hidePreview();
  });

  seek.addEventListener("input", () => {
    renderProgress();
    if (dragPointerId !== undefined) renderPreview(seek.valueAsNumber, "drag");
    else if (seek.matches(":focus-visible")) renderPreview(seek.valueAsNumber, "keyboard");
  });
  seek.addEventListener("focus", () => {
    if (dragPointerId === undefined && seek.matches(":focus-visible")) {
      renderPreview(seek.valueAsNumber, "keyboard");
    }
  });
  seek.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hidePreview();
      return;
    }
    if (!navigationKeys.has(event.key)) return;
    requestAnimationFrame(() => {
      if (document.activeElement !== seek) return;
      renderProgress();
      renderPreview(seek.valueAsNumber, "keyboard");
    });
  });
  seek.addEventListener("blur", hidePreview);

  addEventListener("scroll", () => {
    if (dragPointerId === undefined) hidePreview();
  }, {passive:true});
  addEventListener("resize", hidePreview);
  for (const event of ["loadedmetadata", "timeupdate", "seeked"]) video.addEventListener(event, renderProgress);
  video.addEventListener("error", hidePreview);
  renderProgress();
})();
