(() => {
  "use strict";

  const player = document.querySelector("#animatic");
  const compare = document.querySelector(".framing-picture");
  const split = compare.querySelector("input");
  const landing = document.querySelector(".relay-still img");
  const layer = document.querySelector(".relay-flight");
  const flight = layer.querySelector("img");
  const strip = document.querySelector("[data-editable] img");
  const stills = [...compare.querySelectorAll("img")].map((image) => image.src);

  split.addEventListener("input", () => {
    const value = split.valueAsNumber;
    compare.style.setProperty("--split", value + "%");
    split.setAttribute("aria-valuetext", `中景占 ${value}%，近景占 ${100 - value}%`);
  });

  player.addEventListener("continuity:take", ({detail}) => {
    const close = detail.key === "b";
    const still = stills[Number(close)];
    landing.src = flight.src = strip.src = still;
    layer.dispatchEvent(new Event("relay:still"));
    landing.alt = close ? "她收拢红伞的手与伞面" : "候船楼里，她低头收起红伞";
  });
})();
