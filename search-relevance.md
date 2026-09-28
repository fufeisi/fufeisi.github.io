---
layout: page
title: How Relevance Models Improve E-commerce Search
permalink: /resources/search-relevance/
back_to_home: true
relevance_model: true
---

<div class="relevance-explainer" data-mode="off">
  <section class="relevance-demo" aria-labelledby="relevance-title">
    <p class="demo-kicker">TRY A SEARCH</p>
    <label class="relevance-search">
      <input type="search" value="black shoes for everyday wear" aria-label="Example search query" readonly>
      <span class="search-icon" aria-hidden="true"></span>
    </label>

    <div class="relevance-intro">
      <h2 id="relevance-title">Popularity isn't the same as relevance</h2>
      <p>A product can get many clicks and still miss what someone asked for. After retrieval narrows the catalog, a small language model (SLM) scores each query–product pair in the ranking stage. Ranking uses these scores to put better matches above popular mismatches.</p>
    </div>

    <fieldset class="relevance-switch">
      <legend>Compare results</legend>
      <div class="mode-options">
        <label class="mode-option">
          <input type="radio" name="relevance-mode" value="off" checked>
          <span>No relevance model</span>
        </label>
        <label class="mode-option">
          <input type="radio" name="relevance-mode" value="on">
          <span>With relevance model</span>
        </label>
      </div>
    </fieldset>

    <p class="relevance-summary" aria-live="polite">Sorted by clicks: high-click items can appear even when they miss “black” or everyday wear.</p>

    <div class="results-heading">
      <h2>Search results</h2>
      <span class="results-count" aria-live="polite">6 products · sorted by clicks</span>
    </div>

    <div class="relevance-products" aria-label="Five shoes and one poker chip case evaluated for the example search">
      <article class="relevance-product" data-score="1" data-click-rank="3">
        <div class="relevance-photo" data-photo="3"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="relevance-details"><h3>Trail hiking shoe</h3><div class="product-meta"><span class="signal-popular">High clicks</span><span>Brown · trail use</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>1</strong><span> / 2</span></div></div>
      </article>
      <article class="relevance-product" data-score="1" data-click-rank="2">
        <div class="relevance-photo" data-photo="0"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="relevance-details"><h3>Knit walking shoe</h3><div class="product-meta"><span class="signal-popular">High clicks</span><span>White · knit</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>1</strong><span> / 2</span></div></div>
      </article>
      <article class="relevance-product" data-score="2" data-click-rank="4">
        <div class="relevance-photo" data-photo="1"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="relevance-details"><h3>Cushioned trainer</h3><div class="product-meta"><span class="signal-match">Matches query</span><span>Black · cushioned</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>2</strong><span> / 2</span></div></div>
      </article>
      <article class="relevance-product" data-score="2" data-click-rank="5">
        <div class="relevance-photo" data-photo="2"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="relevance-details"><h3>City sneaker</h3><div class="product-meta"><span class="signal-match">Matches query</span><span>Black · everyday style</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>2</strong><span> / 2</span></div></div>
      </article>
      <article class="relevance-product" data-score="1" data-click-rank="6">
        <div class="relevance-photo" data-photo="4"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="relevance-details"><h3>Canvas low-top</h3><div class="product-meta"><span class="signal-popular">Popular</span><span>Navy · canvas</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>1</strong><span> / 2</span></div></div>
      </article>
      <article class="relevance-product" data-score="0" data-click-rank="1">
        <div class="relevance-photo poker-case-photo" role="img" aria-label="A box containing colorful poker chips">
          <div class="poker-case" aria-hidden="true">
            <span class="poker-case-handle"></span>
            <span class="chip-stack"><i></i><i></i><i></i></span>
            <span class="chip-stack blue-chips"><i></i><i></i><i></i></span>
            <span class="chip-stack green-chips"><i></i><i></i><i></i></span>
          </div>
        </div>
        <div class="relevance-details"><h3>Poker chip case</h3><div class="product-meta"><span class="signal-popular">High clicks</span><span>Gaming accessory</span></div><div class="relevance-score" hidden><span>SLM score · example</span><strong>0</strong><span> / 2</span></div><span class="relevance-outcome" hidden>Filtered: unrelated to shoes</span></div>
      </article>
    </div>
  </section>
</div>
