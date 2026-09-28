document.addEventListener("DOMContentLoaded", () => {
  const demo = document.querySelector(".relevance-explainer");
  if (!demo) return;

  const radios = demo.querySelectorAll('input[name="relevance-mode"]');
  const products = [...demo.querySelectorAll(".relevance-product")];
  const summary = demo.querySelector(".relevance-summary");
  const count = demo.querySelector(".results-count");

  const update = () => {
    const enabled = demo.querySelector('input[name="relevance-mode"]:checked').value === "on";
    const filtered = enabled ? products.filter((product) => product.dataset.relevant !== "true").length : 0;
    products.forEach((product) => {
      product.hidden = enabled && product.dataset.relevant !== "true";
    });
    demo.dataset.mode = enabled ? "on" : "off";
    summary.textContent = enabled
      ? `The relevance model filters out ${filtered} high-click or popular products that miss the query.`
      : "Sorted by clicks: high-click items can appear even when they miss “black” or everyday wear.";
    count.textContent = enabled
      ? `${products.length - filtered} matching products · ${filtered} filtered out`
      : `${products.length} products · sorted by clicks`;
  };

  radios.forEach((radio) => radio.addEventListener("change", update));
});
