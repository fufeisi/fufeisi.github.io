document.addEventListener("DOMContentLoaded", () => {
  const demo = document.querySelector(".relevance-explainer");
  if (!demo) return;

  const radios = demo.querySelectorAll('input[name="relevance-mode"]');
  const products = [...demo.querySelectorAll(".relevance-product")];
  const productList = demo.querySelector(".relevance-products");
  const count = demo.querySelector(".results-count");
  const resultsTitle = demo.querySelector(".results-heading h2");
  const clickOrder = [...products].sort((a, b) => Number(a.dataset.clickRank) - Number(b.dataset.clickRank));
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let animationRun = 0;

  const resetProducts = () => {
    products.forEach((product) => {
      product.hidden = false;
      product.removeAttribute("data-scoring");
      delete product.dataset.scored;
      delete product.dataset.excluded;
      product.querySelector(".relevance-score").hidden = true;
      product.querySelector(".relevance-outcome")?.setAttribute("hidden", "");
    });
    clickOrder.forEach((product) => productList.appendChild(product));
  };

  const showScores = (run, index = 0) => {
    if (run !== animationRun) return;

    if (index === clickOrder.length) {
      const ranked = [...products].sort((a, b) =>
        Number(b.dataset.score) - Number(a.dataset.score) ||
        Number(a.dataset.clickRank) - Number(b.dataset.clickRank)
      );
      ranked.forEach((product) => {
        product.removeAttribute("data-scoring");
        product.dataset.scored = "true";
        productList.appendChild(product);
        product.querySelector(".relevance-score").hidden = false;
      });

      const excluded = products.find((product) => product.dataset.score === "0");
      excluded.dataset.excluded = "true";
      excluded.querySelector(".relevance-outcome").hidden = false;
      resultsTitle.textContent = "Scores for each query–item pair";
      count.textContent = "5 retained · 1 unrelated item filtered · 6 scored";
      return;
    }

    const product = clickOrder[index];
    const revealNext = () => {
      if (run !== animationRun) return;
      product.removeAttribute("data-scoring");
      product.dataset.scored = "true";
      showScores(run, index + 1);
    };

    product.dataset.scoring = "active";
    product.querySelector(".relevance-score").hidden = false;
    count.textContent = `Scoring item ${index + 1} of ${clickOrder.length}`;
    if (reducedMotion) revealNext();
    else window.setTimeout(revealNext, 360);
  };

  const update = () => {
    const enabled = demo.querySelector('input[name="relevance-mode"]:checked').value === "on";
    const run = ++animationRun;
    resetProducts();
    demo.dataset.mode = enabled ? "on" : "off";

    if (!enabled) {
      resultsTitle.textContent = "Search results";
      count.textContent = `${products.length} products · sorted by clicks`;
      return;
    }

    resultsTitle.textContent = "Scoring candidates";
    showScores(run);
  };

  radios.forEach((radio) => radio.addEventListener("change", update));
  update();
});
