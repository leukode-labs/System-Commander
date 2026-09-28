const glow = document.querySelector(".cursor-glow");
if (glow) {
  window.addEventListener("pointermove", (event) => {
    glow.style.transform = `translate3d(${event.clientX - 180}px, ${event.clientY - 180}px, 0)`;
  });
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("in-view");
    });
  },
  { threshold: 0.12 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const prompt = document.querySelector("#setupPrompt");
const copyButton = document.querySelector("#copyPrompt");

copyButton?.addEventListener("click", async () => {
  if (!(prompt instanceof HTMLTextAreaElement)) return;
  try {
    await navigator.clipboard.writeText(prompt.value);
    copyButton.classList.add("copied");
    copyButton.innerHTML = "Copied <span>✓</span>";
    window.setTimeout(() => {
      copyButton.classList.remove("copied");
      copyButton.innerHTML = "Copy setup prompt <span>⧉</span>";
    }, 1800);
  } catch {
    prompt.focus();
    prompt.select();
    copyButton.innerHTML = "Select and copy manually <span>!</span>";
  }
});
