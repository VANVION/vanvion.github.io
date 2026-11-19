/* Default product-card presentation; catalogue data and contact routing stay authoritative. */
(() => {
  const design = new URLSearchParams(location.search).get('design');
  if (design && design !== 'atelier-3') return;
  const originalOpen = openDetail;
  const originalSetLang = setLang;
  const originalHash = openFromHash;
  const eligible = p => p && typeof p.id === 'string';
  const link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = 'experiments/atelier-3/card.css?v=colours-20261119-1'; document.head.append(link);
  const originalZoom = openZoom;
  openZoom = function(src) {
    originalZoom(src);
    if (!$('detail').classList.contains('at-card')) return;
    $('zoomBox').setAttribute('role','dialog');
    $('zoomBox').setAttribute('aria-modal','true');
    $('zoomBox').setAttribute('aria-label',L('Фотография изделия','Product photograph'));
    $('zoomClose').setAttribute('aria-label',L('Закрыть фотографию','Close photograph'));
    $('zoomClose').focus();
  };
  document.addEventListener('keydown',e=>{
    if(e.key==='Tab' && $('detail').classList.contains('at-card') && $('zoomBox').classList.contains('show')) {e.preventDefault();$('zoomClose')?.focus();}
  });
  const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><path d="M5 19 19 5M5 5h14v14"/></svg>';
  const sectionTitle = (n, title) => '<h2 class="at-section-title"><span>' + n + '</span>' + esc(title) + '</h2>';
  // Colours belong to a model/category; each article retains its own specifications.
  const variantSpecKeys = ['sizes','fabric_ru','fabric_en','comp_ru','comp_en','sil_ru','sil_en','lin_ru','lin_en','lined','btn_ru','btn_en','country_ru','country_en','ros_ru','ros_en'];
  function variants(p) {
    if (!p.model || !p.model.trim()) return [p];
    return modelVariants(p).filter(x => x.cat === p.cat);
  }
  const mobileLayout = matchMedia('(max-width:999px)');
  function placeColours() {
    const colours = document.querySelector('.at-card .at-colors');
    if (!colours) return;
    if (mobileLayout.matches) document.querySelector('.at-gallery .at-caption').before(colours);
    else document.querySelector('.at-heading').after(colours);
  }
  mobileLayout.addEventListener('change',placeColours);
  openDetail = function(id, card, opts) {
    const p = PRODUCTS.find(x => x.id === id);
    $('detail').classList.remove('at-card');
    originalOpen(id, eligible(p) ? null : card, eligible(p) ? {...opts, noAnim:true} : opts);
    if (!eligible(p)) return;
    document.querySelector('.detail-top .at-language')?.remove();
    const language = document.createElement('button'); language.className = 'at-language';
    language.textContent = LANG === 'ru' ? 'EN' : 'RU';
    language.setAttribute('aria-label', L('Переключить на английский','Switch to Russian'));
    language.onclick = () => setLang(LANG === 'ru' ? 'en' : 'ru');
    $('detailCart').before(language);
    $('detail').classList.add('at-card');
    $('detailArt').textContent = 'VANVION / ATELIER';
    const selectedColor = colorList(p.colors)[0];
    const colorName = selectedColor ? PALETTE[selectedColor][LANG] : '';
    const colourVariants = variants(p);
    const differingSpecs = colourVariants.some(x => variantSpecKeys.some(k => x[k] !== p[k]));
    const choices = colourVariants.map(x => {
      const c = colorList(x.colors)[0];
      const label = c ? PALETTE[c][LANG] : x.id;
      return '<button class="at-swatch" data-variant="' + esc(x.id) + '" aria-pressed="' + (x.id === id) + '" aria-label="' + esc(label + ' · ' + x.id) + '"><span style="--swatch:' + (c ? PALETTE[c].hex : '#cccccc') + '"></span></button>';
    }).join('');
    const hasValue = value => value && !/^[\s—–-]+$/.test(value);
    const lining = specVal(p.lin_ru,p.lin_en);
    const specs = [
      [L('Фактура ткани','Fabric texture'),specVal(p.fabric_ru,p.fabric_en)],
      [L('Состав','Composition'),specVal(p.comp_ru,p.comp_en)],
      [L('Силуэт','Fit'),specVal(p.sil_ru,p.sil_en)],
      [L('Рост','Height'),specVal(p.ros_ru,p.ros_en)],
      [L('Подкладка','Lining'),(hasValue(lining) ? lining : '') || (typeof p.lined === 'boolean' ? (p.lined ? L('Да','Yes') : L('Нет','No')) : '')],
      [L('Конструкция','Construction'),specVal(p.btn_ru,p.btn_en)],
      [L('Производство','Made in'),specVal(p.country_ru,p.country_en)]
    ].filter(([,v]) => hasValue(v));
    const rows = specs.map(([k,v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('');
    const contacts = orderLinks(L('Здравствуйте! Интересует ','Hello! I am interested in ') + getName(p) + ', ' + L('артикул ','article ') + p.id + (colorName ? ', ' + colorName : ''));
    const photos = [...new Set([p.image,p.image2].filter(Boolean))];
    $('detailContent').innerHTML = '<div class="at-gallery" aria-label="' + L('Фотографии изделия','Product photographs') + '"><div class="at-photo-stage">' + (photos.length ? '<button class="at-photo" aria-label="' + L('Увеличить фотографию','Enlarge photograph') + '"><img alt="' + esc(getName(p)) + '"><span class="at-expand">' + arrow + '</span></button><span class="at-photo-error" role="status" aria-live="polite" hidden></span>' : '<p class="at-no-photo">' + L('Фото пока нет','Photograph unavailable') + '</p>') + '</div><div class="at-caption"><span>' + L('01 / Изделие','01 / The garment') + '</span><div class="at-photo-controls"></div></div></div>' +
      '<div class="at-info"><header class="at-heading"><div class="at-eyebrow">' + esc(t().cat[p.cat] || p.cat || '') + (isNewActive(p) ? ' <span class="at-new">NEW</span>' : '') + '</div><h1>' + esc(specVal(p.display_title_ru,p.display_title_en) || p.model || getName(p)) + '</h1><p class="at-product-name' + (p.display_subtitle_ru ? ' at-model-reference' : '') + '">' + esc(specVal(p.display_subtitle_ru,p.display_subtitle_en) || getName(p)) + '</p><div class="at-meta"><span>' + L('Артикул','Article') + '</span><span>' + esc(p.id) + '</span></div></header>' +
      '<section class="at-colors">' + sectionTitle('02',L('Цвет изделия','Colour')) + '<div class="at-color-choice"><div class="at-swatches">' + choices + '</div><span aria-live="polite">' + esc(colorName) + '</span></div></section>' +
      (differingSpecs ? '<p class="at-variant-note">' + L('Характеристики могут отличаться в зависимости от цвета. Ниже — данные выбранного артикула.','Specifications may vary by colour. Details below are for the selected article.') + '</p>' : '') +
      (p.sizes ? '<section class="at-sizes">' + sectionTitle('03',L('Размерный ряд','Size range')) + '<p>' + esc(trSpec(p.sizes)) + '</p></section>' : '') +
      (specs.length ? '<section class="at-specs">' + sectionTitle('04',L('В деталях','In detail')) + '<dl>' + rows + '</dl></section>' : '') +
      '<section class="at-notes">' + sectionTitle('05',L('Оптовым клиентам','For wholesale clients')) + '<p>' + L('Наличие, стоимость и условия поставки уточнит менеджер. В WhatsApp подготовим сообщение с моделью, артикулом и цветом. Telegram и MAX откроют контакт менеджера — укажите данные товара в сообщении.','Your manager will confirm availability, pricing and delivery terms. WhatsApp includes a prepared message with the model, article and colour. Telegram and MAX open the manager’s contact — include the product details in your message.') + '</p></section>' +
      '<section class="at-contact" id="atelierContact"><span class="at-contact-label">' + L('Обсудим ваш заказ','Let’s discuss your order') + '</span><h2>' + L('На связи.<br>По делу.','A direct line.<br>A considered choice.') + '</h2><div class="at-contact-links"><a class="at-primary" href="' + esc(contacts.wa) + '" target="_blank" rel="noopener"><span>' + L('Написать в WhatsApp','Message on WhatsApp') + '</span>' + arrow + '</a><div><a href="' + esc(contacts.tg) + '" target="_blank" rel="noopener">Telegram ' + arrow + '</a><a href="' + esc(contacts.max) + '" target="_blank" rel="noopener">MAX ' + arrow + '</a></div></div></section></div>';
    const dock = document.createElement('div'); dock.className = 'at-dock';
    dock.innerHTML = '<div><span>' + esc(p.model || getName(p)) + '</span><small>' + esc(p.id) + '</small></div><button>' + L('Связаться с менеджером','Contact your manager') + arrow + '</button>';
    dock.querySelector('button').onclick = () => {
      $('atelierContact').scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
      $('atelierContact').querySelector('a').focus({preventScroll:true});
    };
    $('detailContent').append(dock);
    placeColours();
    const swatches = document.querySelector('.at-swatches');
    for (const type of ['touchstart','touchmove','touchend','touchcancel']) {
      swatches.addEventListener(type,event=>event.stopPropagation(),{passive:true});
    }
    $('detailContent').querySelectorAll('[data-variant]').forEach(button => button.onclick = () => {
      if (button.dataset.variant === id) return;
      const variantView = {top:$('detail').scrollTop,left:document.querySelector('.at-swatches').scrollLeft};
      openDetail(button.dataset.variant,null,{noAnim:true,replace:true,variantView});
    });
    initGallery(photos,p);
    if (opts?.variantView) {
      $('detail').scrollTop = opts.variantView.top;
      document.querySelector('.at-swatches').scrollLeft = opts.variantView.left;
      document.querySelector('[data-variant][aria-pressed=true]')?.focus({preventScroll:true});
    }
  };
  function initGallery(photos,p) {
    const gallery = document.querySelector('.at-gallery');
    if (!photos.length) return;
    const photo = gallery.querySelector('img');
    const controls = gallery.querySelector('.at-photo-controls');
    const counter = document.createElement('span'); counter.setAttribute('aria-live','polite');
    const trigger = gallery.querySelector('.at-photo');
    const stage = gallery.querySelector('.at-photo-stage');
    const notice = gallery.querySelector('.at-photo-error');
    const expand = gallery.querySelector('.at-expand');
    const zoomLabel = L('Увеличить фотографию','Enlarge photograph');
    let index = 0, start = null, swiped = false, ready = false;
    function show(next) {
      index = (next + photos.length) % photos.length;
      ready = false;
      photo.hidden = true;
      photo.classList.remove('at-loaded');
      notice.hidden = true;
      notice.textContent = '';
      expand.hidden = true;
      trigger.setAttribute('aria-disabled','true');
      trigger.setAttribute('aria-label',L('Загрузка фотографии','Loading photograph'));
      stage.setAttribute('aria-busy','true');
      photo.src = photos[index];
      counter.textContent = String(index + 1).padStart(2,'0') + ' / ' + String(photos.length).padStart(2,'0');
    }
    photo.onload = () => {
      ready = true;
      photo.hidden = false;
      photo.classList.add('at-loaded');
      expand.hidden = false;
      trigger.setAttribute('aria-disabled','false');
      trigger.setAttribute('aria-label',zoomLabel);
      stage.setAttribute('aria-busy','false');
    };
    photo.onerror = () => {
      ready = false;
      photo.hidden = true;
      photo.classList.remove('at-loaded');
      expand.hidden = true;
      trigger.setAttribute('aria-disabled','true');
      trigger.setAttribute('aria-label',L('Фото недоступно','Photograph unavailable'));
      stage.setAttribute('aria-busy','false');
      notice.textContent = L('Фото недоступно','Photograph unavailable');
      notice.hidden = false;
    };
    if (photos.length > 1) {
      for (const direction of [-1,1]) {
        const button = document.createElement('button'); button.textContent = direction < 0 ? '←' : '→';
        button.setAttribute('aria-label',direction < 0 ? L('Предыдущее фото','Previous photograph') : L('Следующее фото','Next photograph'));
        button.onclick = () => show(index + direction); controls.append(button);
      }
    }
    controls.append(counter); show(0);
    const originals = new Map([[p.image,p.image_original],[p.image2,p.image2_original]]);
    gallery.querySelector('.at-photo').onclick = () => { if (!swiped && ready) openZoom(originals.get(photos[index]) || photos[index]); swiped=false; };
    stage.addEventListener('touchstart',e=>{e.stopPropagation();swiped=false;start=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},{passive:true});
    stage.addEventListener('touchmove',e=>e.stopPropagation(),{passive:true});
    stage.addEventListener('touchend',e=>{e.stopPropagation();if(!start)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=true;show(index+(dx<0?1:-1));}start=null;},{passive:true});
    stage.addEventListener('touchcancel',()=>{start=null;swiped=false;},{passive:true});
    stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.stopPropagation();e.preventDefault();show(index+(e.key==='ArrowRight'?1:-1));}});
    // Keep the existing zoom overlay while restoring focus to the invoking photo.
    const originalClose = closeZoom;
    if (!closeZoom.atelier) {
      const wrapped = function() { const wasOpen=$('zoomBox').classList.contains('show'); originalClose(); if(wasOpen && $('detail').classList.contains('at-card')) document.querySelector('.at-photo')?.focus(); };
      wrapped.atelier=true; closeZoom=wrapped;
    }
  }
  setLang = function(code) {originalSetLang(code); if(eligible(PRODUCTS.find(p=>p.id===currentDetailId)))openDetail(currentDetailId,null,{noAnim:true,fromHash:true});};
  openFromHash = function() {if(design === 'atelier-3' && !location.hash)history.replaceState(null,'',location.pathname+location.search+'#p=PR-3001');originalHash();};
})();
