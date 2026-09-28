const glow = document.querySelector(".cursor-glow");

window.addEventListener("pointermove", (event) => {
  glow.style.transform = `translate3d(${event.clientX - 180}px, ${event.clientY - 180}px, 0)`;
});

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) entry.target.classList.add("in-view");
    });
  },
  { threshold: 0.14 }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

const sequenceRows = [...document.querySelectorAll(".sequence-row")];
let active = 3;
setInterval(() => {
  sequenceRows.forEach((row) => row.classList.remove("active"));
  active = (active + 1) % sequenceRows.length;
  sequenceRows[active].classList.add("active");
}, 1900);

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const target = document.querySelector(link.getAttribute("href"));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});
