const glow = document.querySelector(".cursor-glow");
if (glow) window.addEventListener("pointermove", e => { glow.style.transform = `translate3d(${e.clientX - 180}px, ${e.clientY - 180}px, 0)`; });

const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => { if (entry.isIntersecting) entry.target.classList.add("in-view"); });
}, { threshold: 0.12 });
document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

document.querySelectorAll(".docs-copy").forEach(button => {
  button.addEventListener("click", async () => {
    const target = document.getElementById(button.dataset.copyTarget);
    if (!target) return;
    const value = target.textContent || "";
    try {
      await navigator.clipboard.writeText(value);
      const old = button.textContent;
      button.textContent = "Copied ✓";
      setTimeout(() => { button.textContent = old; }, 1400);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(target);
      const selection = window.getSelection();
      selection?.removeAllRanges(); selection?.addRange(range);
      button.textContent = "Select and copy";
      setTimeout(() => { button.textContent = "Copy"; }, 1600);
    }
  });
});

const prompt = document.querySelector("#docsPrompt");
const promptButton = document.querySelector("#copyDocsPrompt");
promptButton?.addEventListener("click", async () => {
  if (!(prompt instanceof HTMLTextAreaElement)) return;
  try {
    await navigator.clipboard.writeText(prompt.value);
    promptButton.innerHTML = "Copied <span>✓</span>";
    setTimeout(() => { promptButton.innerHTML = "Copy AI setup prompt <span>⧉</span>"; }, 1600);
  } catch {
    prompt.focus(); prompt.select();
    promptButton.innerHTML = "Select and copy <span>!</span>";
  }
});