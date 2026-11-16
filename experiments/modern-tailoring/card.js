/* Opt-in presentation only. Product data and existing order handlers stay authoritative. */
(() => {
  if (new URLSearchParams(location.search).get('design') !== 'modern-tailoring') return;
  const originalOpen = openDetail;
  let classic = false;
  const eligible = p => p && p.cat === 'bryuki' && p.model === 'М93V';
  const css = document.createElement('link');
  css.rel = 'stylesheet'; css.href = 'experiments/modern-tailoring/card.css'; document.head.append(css);
  openDetail = function(id, card, opts) {
    const p = PRODUCTS.find(x => x.id === id);
    $('detail').classList.remove('mt-card');
    originalOpen(id, eligible(p) ? null : card, eligible(p) ? {...opts, noAnim:true} : opts);
    if (!eligible(p)) return;
    const toggle = document.createElement('button');
    toggle.className = 'mt-toggle'; toggle.textContent = classic ? L('Новый дизайн', 'New design') : L('Исходный дизайн', 'Original design');
    toggle.onclick = () => { classic = !classic; openDetail(id, null, {noAnim:true, fromHash:true}); };
    $('detailContent').prepend(toggle);
    if (classic) return;
    $('detail').classList.add('mt-card');
    const body = $('detailContent').querySelector('.detail-body');
    body.querySelector('.detail-cat').textContent = t().cat[p.cat] + ' / VANVION';
    body.querySelector('.detail-name').textContent = p.model || getName(p);
    const intro = document.createElement('div'); intro.className = 'mt-intro';
    intro.innerHTML = '<span>' + esc(getName(p)) + '</span><span>' + L('Артикул', 'Article') + ' ' + esc(p.id) + '</span>' + (isNewActive(p) ? '<span>NEW</span>' : '');
    body.querySelector('.detail-name').after(intro);
    const headingBlock = document.createElement('header'); headingBlock.className = 'mt-heading';
    headingBlock.append(body.querySelector('.detail-cat'), body.querySelector('.detail-name'), intro);
    $('detailContent').insertBefore(headingBlock, body);
    const size = document.createElement('section'); size.className = 'mt-size';
    size.innerHTML = '<h2>' + L('Размерный ряд', 'Size range') + '</h2><p>' + esc(trSpec(p.sizes || '—')) + '</p><small>' + L('Отгрузка пачками · наличие уточнит менеджер', 'Sold in packs · availability confirmed by your manager') + '</small>';
    body.querySelector('.addcart').before(size);
    const specs = body.querySelector('.specs');
    // Omit unknown values; use the legacy lining fields when the boolean is absent.
    const values = [specVal(p.comp_ru,p.comp_en),specVal(p.sil_ru,p.sil_en),specVal(p.ros_ru,p.ros_en),typeof p.lined === 'boolean' ? L(p.lined?'ДА':'НЕТ',p.lined?'YES':'NO') : specVal(p.lin_ru,p.lin_en),specVal(p.btn_ru,p.btn_en),specVal(p.country_ru,p.country_en)];
    specs.innerHTML = values.map((v,i) => v ? '<div class="spec-row"><div class="spec-key">'+esc(t().specs[i])+'</div><div class="spec-val">'+esc(v)+'</div></div>' : '').join('');
    const heading = document.createElement('h2'); heading.textContent = L('Детали изделия', 'Garment details'); specs.prepend(heading);
    body.querySelectorAll('.cv').forEach(el => el.setAttribute('aria-pressed', String(el.classList.contains('active'))));
    const colorHeader = document.createElement('div'); colorHeader.className = 'mt-color-header';
    colorHeader.append(body.querySelector('.section-label'), body.querySelector('.cv-current'));
    body.querySelector('.cv-row').before(colorHeader);
    const order = body.querySelector('.addcart'); order.id = 'mtOrder';
    order.querySelectorAll('.ac-q button').forEach(button => button.setAttribute('aria-label', button.dataset.d === '1' ? L('Добавить пачку', 'Increase packs') : L('Убрать пачку', 'Decrease packs')));
    const dock = document.createElement('div'); dock.className = 'mt-dock';
    dock.innerHTML = '<div><span>' + esc(p.model || getName(p)) + '</span><small>' + esc(trSpec(p.sizes || '')) + '</small></div><button>' + L('К оптовому заказу', 'Wholesale order') + ' <span aria-hidden="true">↗</span></button>';
    dock.querySelector('button').onclick = () => {
      order.scrollIntoView({block:'center', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      order.querySelector('button').focus({preventScroll:true});
    };
    $('detailContent').append(dock);
    const gallery = $('detailImg'); gallery.className = 'mt-gallery';
    const photos = [p.image,p.image2].filter(Boolean); let active = 0;
    gallery.innerHTML = '<button class="mt-photo" aria-label="'+L('Увеличить фотографию','Enlarge photograph')+'"><span class="mt-zoom-mark" aria-hidden="true">↗</span><img alt="'+esc(getName(p))+'"></button><div class="mt-gallery-bar"><span>'+L('Нажмите, чтобы рассмотреть','Tap to explore')+'</span><div class="mt-controls"></div></div>';
    const photo = gallery.querySelector('img'); const controls = gallery.querySelector('.mt-controls');
    const status = document.createElement('span'); status.setAttribute('aria-live','polite');
    function show(n) { active = (n + photos.length) % photos.length; photo.src = photos[active]; status.textContent = (active+1)+' / '+photos.length; }
    if (photos.length > 1) {
      for (const [label,dir] of [[L('Предыдущее фото','Previous photo'),-1],[L('Следующее фото','Next photo'),1]]) {
        const b = document.createElement('button'); b.textContent = dir<0?'←':'→'; b.setAttribute('aria-label',label); b.onclick=()=>show(active+dir); controls.append(b);
      }
    }
    controls.append(status); show(0);
    gallery.querySelector('.mt-photo').onclick = () => openZoom(photos[active]);
    let start;
    gallery.addEventListener('touchstart',e=>{e.stopPropagation();start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
    gallery.addEventListener('touchmove',e=>e.stopPropagation(),{passive:true});
    gallery.addEventListener('touchend',e=>{e.stopPropagation();if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5)show(active+(dx<0?1:-1));start=null;},{passive:true});
    gallery.addEventListener('touchcancel',()=>{start=null;},{passive:true});
    gallery.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.stopPropagation();e.preventDefault();show(active+(e.key==='ArrowRight'?1:-1));}});
  };
  const originalSetLang = setLang;
  setLang = function(code) {
    originalSetLang(code);
    if (eligible(PRODUCTS.find(p => p.id === currentDetailId))) openDetail(currentDetailId, null, {noAnim:true, fromHash:true});
  };
  const originalHash = openFromHash;
  openFromHash = function() { if (!location.hash) history.replaceState(null,'',location.pathname+location.search+'#p=PR-3001'); originalHash(); };
})();
