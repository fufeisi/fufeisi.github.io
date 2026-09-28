---
layout: page
title: How E-commerce Search Retrieval Works
permalink: /resources/search-retrieval/
back_to_home: true
search_retrieval: true
---

<div class="search-retrieval">
  <section class="retrieval-demo" aria-labelledby="demo-title">
    <div class="demo-toolbar">
      <div class="demo-query-block">
        <p class="demo-kicker">TRY A SEARCH</p>
        <label class="search-field">
          <input type="search" value="comfortable shoes for walking all day" aria-label="Example search query" readonly>
          <span class="search-icon" aria-hidden="true"></span>
        </label>
      </div>
    </div>

    <ol class="search-flow" aria-label="Search stages">
      <li><span class="flow-index">01</span><strong>Catalog</strong><small>6 demo · ~10M real</small></li>
      <li><span class="flow-index">02</span><strong>Retrieval</strong><small>5 demo · ~1K · ~30 ms</small></li>
      <li><span class="flow-index">03</span><strong>Ranking</strong><small>~1K → top 100</small></li>
      <li><span class="flow-index">04</span><strong>Results</strong><small>Top 100 · ~100 ms total</small></li>
    </ol>

    <div class="candidate-heading">
      <h2 id="demo-title">Candidates for ranking</h2>
      <p>Retrieval removes 1 irrelevant item; ranking places 3 of the 5 candidates into results.</p>
    </div>

    <div class="product-grid" aria-label="Six catalog items: five retrieval candidates and one irrelevant item filtered out">
      <article class="product-item" data-photo="0">
        <div class="product-photo"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="product-details"><h3>Knit walking shoe</h3><span class="product-rank">Rank #1</span></div>
      </article>
      <article class="product-item" data-photo="1">
        <div class="product-photo"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="product-details"><h3>Cushioned trainer</h3><span class="product-rank">Rank #2</span></div>
      </article>
      <article class="product-item" data-photo="2">
        <div class="product-photo"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="product-details"><h3>City sneaker</h3><span class="product-rank">Rank #3</span></div>
      </article>
      <article class="product-item" data-photo="3">
        <div class="product-photo"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="product-details"><h3>Trail hiking shoe</h3><span class="product-rank">Candidate</span></div>
      </article>
      <article class="product-item" data-photo="4">
        <div class="product-photo"><img src="{{ '/assets/images/search-retrieval-products.jpg' | relative_url }}" alt=""></div>
        <div class="product-details"><h3>Canvas low-top</h3><span class="product-rank">Candidate</span></div>
      </article>
      <article class="product-item" data-result="filtered">
        <div class="unrelated-photo" role="img" aria-label="Coffee maker, unrelated to the shoe search">
          <div class="coffee-maker"><span class="coffee-controls"></span><span class="coffee-carafe"></span></div>
        </div>
        <div class="product-details"><h3>Coffee maker</h3><span class="product-rank">Filtered by retrieval</span></div>
      </article>
    </div>
  </section>

  <section class="scale-section" aria-labelledby="scale-title">
    <div class="section-intro">
      <p class="section-label">WHY RETRIEVAL</p>
      <h2 id="scale-title">Don't run a pairwise model on all 10 million products</h2>
    </div>

    <div class="scale-visuals">
      <div class="scale-visual pairwise-visual">
        <div class="visual-heading"><strong>Score every pair</strong><span>10M comparisons</span></div>
        <div class="catalog-scan" role="img" aria-label="A scanning beam passes across a dense field representing all 10 million products"><span></span></div>
        <div class="visual-stat"><span>At 100K pair scores / sec</span><strong>~100 sec / search</strong></div>
      </div>

      <div class="scale-visual hybrid-visual">
        <div class="visual-heading"><strong>Combine three retrieval routes</strong><span>~30 ms</span></div>
        <div class="hybrid-flow" role="img" aria-label="Keyword retrieval, a semantic SLM two-tower model, and a personalization DNN two-tower model flow into about one thousand candidates for ranking">
          <div class="channel-lanes">
            <div class="channel-lane"><span class="route-index">1</span><span class="channel-copy"><strong>Keywords</strong><small>Exact terms + attributes</small></span><i class="channel-track"><b></b></i></div>
            <div class="channel-lane"><span class="route-index">2</span><span class="channel-copy"><strong>Semantic SLM</strong><small>Two-tower model</small></span><i class="channel-track"><b></b></i></div>
            <div class="channel-lane"><span class="route-index">3</span><span class="channel-copy"><strong>Personalization DNN</strong><small>Two-tower model</small></span><i class="channel-track"><b></b></i></div>
          </div>
          <span class="merge-arrow" aria-hidden="true">→</span>
          <div class="shortlist-mark"><span class="shortlist-dots" aria-hidden="true"></span><strong>~1K</strong><small>to ranking</small></div>
        </div>
        <div class="visual-stat"><span>Full search, end to end</span><strong>~100 ms total</strong></div>
      </div>
    </div>
  </section>

  <section class="ann-section" aria-labelledby="ann-title">
    <div class="section-intro">
      <p class="section-label">HOW THE TWO-TOWER ROUTES WORK</p>
      <h2 id="ann-title">Map query and product into the same space</h2>
      <p>Semantic SLM and Personalization DNN both use two towers: one encodes the query, the other each product. Similar query–product meanings land close together.</p>
    </div>

    <ol class="ann-sequence">
      <li class="ann-step">
        <div class="ann-diagram shared-space" role="img" aria-label="Products are encoded offline by an item tower and queries online by a query tower; both become vectors in the same space">
          <div class="encoder-lanes">
            <div class="encoder-lane item-lane"><span>Offline</span><strong>Products</strong><i>→</i><b>Item tower</b><i>→</i><em class="item-vector"></em></div>
            <div class="encoder-lane query-lane"><span>Online</span><strong>Query</strong><i>→</i><b>Query tower</b><i>→</i><em class="query-vector-point"></em></div>
          </div>
          <div class="embedding-map" aria-hidden="true">
            <i class="map-point point-a"></i><i class="map-point point-b"></i><i class="map-point point-c"></i>
            <i class="map-point point-d"></i><i class="map-point point-e"></i><i class="map-point point-f"></i>
            <i class="map-point item-match"></i><i class="map-point query-match"></i>
            <span class="map-item-label">item</span><span class="map-query-label">query</span>
            <span class="map-caption">same vector space</span>
          </div>
        </div>
        <strong class="step-title">Two towers, one vector space</strong>
        <span class="step-caption">Product vectors are precomputed offline; each search creates a query vector.</span>
      </li>

      <li class="ann-step">
        <div class="ann-diagram ann-search" role="img" aria-label="A query vector probes one nearby cluster in an index instead of scanning every product vector">
          <div class="ann-index" aria-hidden="true">
            <span class="index-cluster cluster-one"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="index-cluster cluster-two"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="index-cluster cluster-three"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="index-cluster cluster-four"><i></i><i></i><i></i><i></i><i></i><i></i></span>
            <span class="query-beacon"></span>
          </div>
          <span class="diagram-arrow" aria-hidden="true">→</span>
          <div class="shortlist-mark search-shortlist"><span class="shortlist-dots" aria-hidden="true"></span><strong>~1K</strong><small>candidates</small></div>
        </div>
        <strong class="step-title">ANN searches nearby groups</strong>
        <span class="step-caption">It probes likely clusters or graph neighbors, not all 10M vectors.</span>
      </li>
    </ol>

  </section>

  <p class="source-note">Further reading: <a href="https://www.tensorflow.org/recommenders/examples/basic_retrieval">two-tower retrieval and ANN</a> · <a href="https://github.com/facebookresearch/faiss/wiki/Faiss-indexes">vector index trade-offs</a>.</p>
</div>
