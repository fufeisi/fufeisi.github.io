document.addEventListener("DOMContentLoaded", () => {
  const demo = document.querySelector(".relevance-explainer");
  if (!demo) return;

  const radios = demo.querySelectorAll('input[name="relevance-mode"]');
  const products = [...demo.querySelectorAll(".relevance-product")];
  const modelOnlyProducts = products.filter((product) => product.dataset.modelOnly === "true");
  const productList = demo.querySelector(".relevance-products");
  const count = demo.querySelector(".results-count");
  const resultsTitle = demo.querySelector(".results-heading h2");
  const clickOrder = [...products].sort((a, b) => Number(a.dataset.clickRank) - Number(b.dataset.clickRank));
  const relevanceOrder = [...products].sort((a, b) =>
    Number(b.dataset.score) - Number(a.dataset.score) ||
    Number(a.dataset.clickRank) - Number(b.dataset.clickRank)
  );

  const resetProducts = () => {
    products.forEach((product) => {
      product.hidden = false;
      delete product.dataset.excluded;
      product.querySelector(".relevance-score").hidden = true;
      product.querySelector(".relevance-outcome")?.setAttribute("hidden", "");
    });
    clickOrder.forEach((product) => productList.appendChild(product));
  };

  const update = () => {
    const enabled = demo.querySelector('input[name="relevance-mode"]:checked').value === "on";
    resetProducts();
    demo.dataset.mode = enabled ? "on" : "off";

    if (!enabled) {
      modelOnlyProducts.forEach((product) => { product.hidden = true; });
      resultsTitle.textContent = "Search results";
      count.textContent = `${products.length - modelOnlyProducts.length} products · sorted by clicks`;
      return;
    }

    relevanceOrder.forEach((product) => {
      productList.appendChild(product);
      product.querySelector(".relevance-score").hidden = false;
    });

    const excluded = products.find((product) => product.dataset.score === "0");
    excluded.dataset.excluded = "true";
    excluded.querySelector(".relevance-outcome").hidden = false;
    resultsTitle.textContent = "Products ranked by relevance";
    count.textContent = "5 retained · 1 unrelated item filtered · 6 evaluated";
  };

  radios.forEach((radio) => radio.addEventListener("change", update));
  update();
});
