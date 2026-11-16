/* Approved default grid presentation on the existing catalogue. */
(() => {
  const catalog = new URLSearchParams(location.search).get('catalog');
  if (catalog && catalog !== 'atelier') return;
  document.body.classList.add('atelier-grid');
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet'; stylesheet.href = 'experiments/atelier-grid/grid.css'; document.head.append(stylesheet);
  const originalCard = modelCardHTML;
  const originalAttach = attachCardEvents;
  const originalSelect = selectTileColor;
  function sync(card) {
    const p = PRODUCTS.find(p => p.id === card.dataset.id);
    if (!p) return;
    const color = colorList(p.colors)[0];
    card.querySelector('.ag-article').textContent = p.id;
    card.querySelector('.ag-color').textContent = color ? PALETTE[color][LANG] : '';
    card.querySelector('.ag-open').setAttribute('aria-label',L('Открыть ','Open ')+getName(p));
    const image = card.querySelector('.card-img img');
    if (image) image.alt = getName(p);
    card.querySelectorAll('.mdot').forEach(dot => {
      dot.style.setProperty('--ag-swatch', dot.style.backgroundColor);
      dot.setAttribute('aria-pressed', String(dot.dataset.goto === p.id));
    });
  }
  modelCardHTML = function(group) {
    const template = document.createElement('template'); template.innerHTML = originalCard(group);
    const card = template.content.querySelector('.card');
    const p = PRODUCTS.find(p => p.id === card.dataset.id);
    const info = card.querySelector('.card-info');
    const kicker = document.createElement('div'); kicker.className='ag-category'; kicker.textContent=catWordOf(p.cat);
    info.prepend(kicker);
    const name = card.querySelector('.card-name');
    const open = document.createElement('button'); open.className='card-name ag-open'; open.type='button';
    open.textContent=p.model || getName(p); open.setAttribute('aria-label',L('Открыть ','Open ')+getName(p)); name.replaceWith(open);
    const meta=document.createElement('div'); meta.className='ag-meta';
    meta.innerHTML='<span class="ag-article"></span><span class="ag-color"></span>'; open.after(meta);
    card.querySelector('.card-press').append(card.querySelector('.card-packs'));
    sync(card);
    return template.innerHTML;
  };
  attachCardEvents = function(card) {
    originalAttach(card);
    card.querySelector('.ag-open').onclick=()=>openDetail(card.dataset.id,card);
  };
  selectTileColor = function(card,id) {originalSelect(card,id);sync(card);};
})();
