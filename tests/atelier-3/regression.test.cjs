const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..');
const preview = '/?design=atelier-3#p=PR-3001';
let server, browser, base;
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf' };
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
      const bytes = await fs.readFile(file);
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}), args:['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });
async function pageFor(t, url = preview, width = 390) {
  const context = await browser.newContext({ viewport:{ width,height:900 }, reducedMotion:'reduce', serviceWorkers:'block' });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  // External SDKs and production services are intentionally excluded.
  await page.route('**/*', r => new URL(r.request().url()).origin === base ? r.continue() : r.abort());
  t.after(async () => { await context.close(); assert.deepEqual(errors, [], 'JavaScript page errors'); });
  if (url) await page.goto(base + url);
  return page;
}
async function loaded(p) {
  await p.waitForFunction(() => { const i = document.querySelector('.at-photo img'); return i && !i.hidden && i.complete && i.naturalWidth > 0 && i.classList.contains('at-loaded'); });
}
async function geometry(p) {
  return p.evaluate(() => ({ stage:document.querySelector('.at-photo-stage').getBoundingClientRect().height, gallery:document.querySelector('.at-gallery').getBoundingClientRect().height, heading:document.querySelector('.at-heading').getBoundingClientRect().top + document.getElementById('detail').scrollTop }));
}
function stable(a,b) { for (const k of Object.keys(a)) assert(Math.abs(a[k]-b[k]) < 1, `${k}: ${a[k]} -> ${b[k]}`); }
async function failed(p) {
  await p.locator('.at-photo-error:not([hidden])').waitFor();
  assert.equal(await p.locator('.at-photo-error').count(),1);
  assert.equal(await p.locator('.at-photo img').evaluate(i => getComputedStyle(i).display),'none');
  assert.equal(await p.locator('.at-photo').getAttribute('aria-disabled'),'true');
  assert.equal(await p.locator('.at-photo-error').getAttribute('role'),'status');
  await p.locator('.at-photo').click({force:true});
  await p.locator('.at-photo').focus(); await p.keyboard.press('Enter');
  assert.equal(await p.locator('#zoomBox.show').count(),0,'No zoom for unavailable photo');
}
async function twoPhotos(p, failSecond) {
  // Network-only fixture: never writes product data or image files.
  await p.route('**/data/products.json*', async r => {
    const response = await r.fetch(), products = await response.json();
    products.find(x => x.id === 'PR-3001').image2 = 'images/atelier-qa-second.jpg';
    await r.fulfill({ response,json:products });
  });
  await p.route('**/images/atelier-qa-second.jpg', async r => failSecond
    ? r.fulfill({status:404,body:''})
    : r.fulfill({status:200,contentType:'image/jpeg',body:await fs.readFile(path.join(root,'images/PR-3001.jpg'))}));
}
test('default catalogue: category, search and ATELIER detail without auto-open',async t => {
  const p = await pageFor(t,'/'); await p.locator('.card').first().waitFor();
  assert.equal(await p.locator('#detail.open').count(),0, 'Catalogue must not auto-open a product');
  await p.locator('[data-cat="bryuki"]').click(); await p.locator('#search').fill('PR-3001');
  await p.waitForFunction(() => document.querySelectorAll('.card').length === 1);
  await p.locator('.card').click(); await p.locator('#detail.open').waitFor();
  await loaded(p);
  assert.equal(await p.locator('.at-card').count(),1);
  assert.match(await p.locator('.at-meta').innerText(),/PR-3001/);
});
test('PR-3001 ↔ PR-3003, sizes, RU/EN and unchanged contact routes',async t => {
  const p = await pageFor(t); await loaded(p);
  assert.match(await p.locator('.at-sizes').innerText(),/46–54/);
  assert.equal(await p.locator('.at-photo-controls').innerText(),'01 / 01');
  assert.equal(await p.locator('.at-photo-controls button').count(),0);
  for (const id of ['PR-3003','PR-3001']) {
    await p.locator(`[data-variant="${id}"]`).click(); await loaded(p);
    assert.match(await p.locator('.at-meta').innerText(),new RegExp(id));
    assert.match(await p.locator('.at-photo img').getAttribute('src'),new RegExp(id));
    const links = await p.locator('.at-contact-links a').evaluateAll(a => a.map(x => x.href));
    const expected = await p.evaluate(() => orderLinks('')), wa = new URL(links[0]);
    assert.equal(wa.origin + wa.pathname,expected.wa.split('?')[0]);
    assert.match(wa.searchParams.get('text'),new RegExp(id));
    assert.equal(links[1],expected.tg); assert.equal(links[2],expected.max);
  }
  assert.match(await p.locator('.at-notes').innerText(),/Telegram и MAX откроют контакт/);
  await p.locator('.at-language').click();
  assert.match((await p.locator('.at-sizes').innerText()).toLowerCase(),/size range/);
  assert.match(await p.locator('.at-notes').innerText(),/Telegram and MAX open the manager/);
  await p.locator('.at-language').click();
  assert.match((await p.locator('.at-sizes').innerText()).toLowerCase(),/размерный ряд/);
});
test('zoom: keyboard activation, focus containment and restoration',async t => {
  const p = await pageFor(t); await loaded(p); await p.locator('.at-photo').focus(); await p.keyboard.press('Enter');
  await p.locator('#zoomBox.show').waitFor();
  assert.equal(await p.locator('#zoomBox').getAttribute('role'),'dialog');
  for (const key of ['Tab','Shift+Tab']) { await p.keyboard.press(key); assert.equal(await p.locator('#zoomClose').evaluate(e => e === document.activeElement),true); }
  await p.keyboard.press('Escape'); assert.equal(await p.locator('.at-photo').evaluate(e => e === document.activeElement),true);
});
test('first photo: loading → failure → working second photo keeps geometry',async t => {
  const p = await pageFor(t,null); await twoPhotos(p,false);
  let release, requested;
  const gate = new Promise(r => { release = r; }), started = new Promise(r => { requested = r; });
  await p.route('**/images/PR-3001.jpg',async r => { requested(); await gate; await r.fulfill({status:404,body:''}); });
  t.after(() => release());
  await p.goto(base+preview, {waitUntil:'domcontentloaded'}); await started;
  await p.waitForFunction(() => document.querySelector('.at-photo-stage')?.getAttribute('aria-busy') === 'true');
  const initial = await geometry(p);
  await p.locator('.at-photo').click({force:true}); assert.equal(await p.locator('#zoomBox.show').count(),0);
  release(); await failed(p); stable(initial,await geometry(p));
  await p.locator('.at-photo-controls button').last().click(); await loaded(p); stable(initial,await geometry(p));
  assert.equal(await p.locator('.at-photo-error').isVisible(),false);
  assert.equal(await p.locator('.at-photo').getAttribute('aria-disabled'),'false');
  await p.locator('.at-photo').click({force:true}); await p.locator('#zoomBox.show').waitFor();
});
test('second photo: failure is stable, error is unique, recovery and variants work',async t => {
  const p = await pageFor(t,null); await twoPhotos(p,true); await p.goto(base+preview); await loaded(p);
  const initial = await geometry(p);
  await p.locator('.at-photo-controls button').last().click(); await failed(p); stable(initial,await geometry(p));
  await p.locator('.at-photo img').evaluate(i => { i.dispatchEvent(new Event('error')); i.dispatchEvent(new Event('error')); });
  assert.equal(await p.locator('.at-photo-error').count(),1); stable(initial,await geometry(p));
  await p.locator('.at-photo-controls button').first().click(); await loaded(p); stable(initial,await geometry(p));
  assert.match(await p.locator('.at-photo').getAttribute('aria-label'),/Увеличить/);
  await p.locator('.at-photo-controls button').last().click(); await failed(p);
  for (const id of ['PR-3003','PR-3001']) {
    await p.locator(`[data-variant="${id}"]`).click(); await loaded(p);
    const current = await geometry(p);
    // PR-3003 has one real photo; its caption has no navigation buttons.
    assert.equal(current.stage, initial.stage);
    if (id === 'PR-3001') stable(initial,current);
  }
});
test('failed PR-3001 recovers via PR-3003 and fails cleanly on return',async t => {
  const p = await pageFor(t,null);
  await p.route('**/images/PR-3001.jpg',r => r.fulfill({status:404,body:''}));
  await p.goto(base+preview); await failed(p); const initial = await geometry(p);
  await p.locator('[data-variant="PR-3003"]').click(); await loaded(p); stable(initial,await geometry(p));
  await p.locator('[data-variant="PR-3001"]').click(); await failed(p); stable(initial,await geometry(p));
});
for (const width of [320,390,1440]) test(`RU/EN successful/error layouts at ${width}px`,async t => {
  const p = await pageFor(t,preview,width); await loaded(p);
  for (const lang of ['ru','en']) {
    if (lang === 'en') await p.locator('.at-language').click(); await loaded(p);
    const initial = await geometry(p);
    const overflow = () => p.evaluate(() => { const d=document.getElementById('detail'); return d.scrollWidth>d.clientWidth || document.documentElement.scrollWidth>innerWidth; });
    assert.equal(await overflow(),false);
    await p.locator('.at-photo img').evaluate(i => i.dispatchEvent(new Event('error'))); await failed(p);
    stable(initial,await geometry(p)); assert.equal(await overflow(),false);
    if (lang === 'ru') await p.evaluate(() => openDetail('PR-3001',null,{noAnim:true,fromHash:true}));
  }
});

test('all real products render correct data in RU/EN at 320/390/1440px', async t => {
  const p = await pageFor(t);
  await loaded(p);
  const products = await p.evaluate(() => PRODUCTS.map(x => ({id:x.id,cat:x.cat})));
  assert(products.length > 0, 'Catalogue must contain products');
  t.diagnostic(`Checked ${products.length} products in both languages at all three widths`);
  for (const width of [320,390,1440]) {
    await p.setViewportSize({width,height:900});
    for (const lang of ['ru','en']) {
      const failures = await p.evaluate(({lang}) => {
        setLang(lang);
        const failures=[];
        for (const product of PRODUCTS) {
          openDetail(product.id,null,{noAnim:true,fromHash:true});
          const detail=document.getElementById('detail');
          const heading=detail.querySelector('.at-heading h1');
          const sizes=detail.querySelector('.at-sizes p');
          const image=detail.querySelector('.at-photo img');
          const link=detail.querySelector('.at-primary');
          if(!detail.classList.contains('at-card') || heading?.textContent !== (product.model || getName(product))) failures.push(product.id+': heading');
          if(product.sizes && sizes?.textContent !== trSpec(product.sizes)) failures.push(product.id+': sizes');
          if(product.image && image?.getAttribute('src') !== product.image) failures.push(product.id+': image');
          if(!new URL(link.href).searchParams.get('text').includes(product.id)) failures.push(product.id+': order context');
          if([...detail.querySelectorAll('.at-specs dd')].some(el=>/^[\s—–-]+$/.test(el.textContent))) failures.push(product.id+': empty specification');
          if(detail.scrollWidth>detail.clientWidth) failures.push(product.id+': overflow');
          const group=[...detail.querySelectorAll('[data-variant]')].map(el=>PRODUCTS.find(x=>x.id===el.dataset.variant));
          if(group.some(x=>x.cat!==product.cat || x.model!==product.model || x.sizes!==product.sizes || x.comp_ru!==product.comp_ru)) failures.push(product.id+': incompatible variant');
        }
        return failures;
      },{lang});
      assert.deepEqual(failures,[],`${lang} at ${width}px`);
    }
  }
});

test('real two-photo jacket gallery, full size ranges and original comparison', async t => {
  const p=await pageFor(t);
  const jacket=await p.evaluate(()=>PRODUCTS.find(x=>x.cat==='pidzhaki' && x.image2 && x.sizes.includes('БАТАЛ')).id);
  await p.evaluate(id=>openDetail(id,null,{noAnim:true,fromHash:true}),jacket);
  await loaded(p);
  assert.match(await p.locator('.at-sizes').innerText(),/НОРМА/);
  assert.match(await p.locator('.at-sizes').innerText(),/БАТАЛ/);
  assert.equal(await p.locator('.at-photo-controls').innerText().then(s=>s.includes('01 / 02')),true);
  await p.locator('.at-photo-controls button').last().click(); await loaded(p);
  assert.match(await p.locator('.at-photo-controls').innerText(),/02 \/ 02/);
  await p.locator('.at-photo').focus(); await p.keyboard.press('ArrowLeft'); await loaded(p);
  assert.match(await p.locator('.at-photo-controls').innerText(),/01 \/ 02/);
  await p.locator('.at-compare').click();
  assert.equal(await p.locator('.at-card').count(),0);
  assert.equal(await p.locator('#acBtn').count(),1);
  await p.locator('.at-compare').click(); await loaded(p);
  assert.match(await p.locator('.at-meta').innerText(),new RegExp(jacket));
});


test('explicit classic and previous Modern Tailoring modes remain available', async t => {
  for (const mode of ['classic','modern-tailoring']) {
    const p=await pageFor(t,`/?design=${mode}#p=PR-3001`);
    await p.locator('#detail.open').waitFor();
    assert.equal(await p.locator('link[href="experiments/atelier-3/card.css"]').count(),0);
    assert.equal(await p.locator('.at-card').count(),0);
    assert.equal(await p.locator('#acBtn').count(),1);
    if(mode==='modern-tailoring') assert.equal(await p.locator('.mt-card').count(),1);
  }
});

test('ATELIER grid preview: variants, pack cart action and detail navigation', async t => {
  const p=await pageFor(t,'/?catalog=atelier');
  const card=p.locator('.card').filter({has:p.locator('.mdot:not(.active)')}).first();
  await card.locator('.ag-open').waitFor(); await card.scrollIntoViewIfNeeded();
  const dot=card.locator('.mdot:not(.active)').first();
  const id=await dot.getAttribute('data-goto'); await dot.click();
  assert.equal(await card.getAttribute('data-id'),id);
  assert.equal(await card.locator('.ag-article').innerText(),id);
  assert.equal(await card.locator('.mdot.active').getAttribute('aria-pressed'),'true');
  const expected=await p.evaluate(id=>PRODUCTS.find(x=>x.id===id),id);
  assert.equal(await card.locator('.card-img img').getAttribute('src'),expected.image);
  await card.locator('.card-pack').first().click();
  assert.equal(await p.evaluate(()=>cartPacks()),1);
  assert.equal(await p.evaluate(()=>CART[0].id),id);
  assert.equal(await p.locator('#detail.open').count(),0,'Quick add must not open detail');
  await card.locator('.ag-open').click(); await loaded(p);
  assert.match(await p.locator('.at-meta').innerText(),new RegExp(id));
  await p.locator('#backBtn').click();
  await p.waitForFunction(()=>!document.getElementById('detail').classList.contains('open'));
  await p.evaluate(()=>setLang('en'));
  assert.match(await p.locator('.ag-open').first().getAttribute('aria-label'),/^Open /);
  await p.locator('#search').fill('PR-3001');
  await p.waitForFunction(()=>document.querySelectorAll('.card').length===1);
  assert.equal(await p.locator('.ag-category').innerText(),'TROUSERS');
});

test('grid preview is scoped and responsive with usable touch controls',async t=>{
  const normal=await pageFor(t,'/'); await normal.locator('.card').first().waitFor();
  assert.equal(await normal.locator('.atelier-grid').count(),0);
  assert.equal(await normal.locator('link[href="experiments/atelier-grid/grid.css"]').count(),0);
  const p=await pageFor(t,'/?catalog=atelier'); await p.locator('.ag-open').first().waitFor();
  for(const width of [320,390,768,1440]) {
    await p.setViewportSize({width,height:900});
    for(const lang of ['ru','en']) {
      await p.evaluate(lang=>setLang(lang),lang);
      const issues=await p.evaluate(()=>{
        const issues=[];
        if(document.documentElement.scrollWidth>innerWidth)issues.push('page overflow');
        for(const card of document.querySelectorAll('.card')) {
          if(card.scrollWidth>card.clientWidth)issues.push(card.dataset.id+': card overflow');
          for(const button of card.querySelectorAll('.mdot,.card-pack')) {
            const rect=button.getBoundingClientRect();
            if(rect.height && rect.height<44)issues.push(card.dataset.id+': small control');
          }
        }
        return issues;
      });
      assert.deepEqual(issues,[],`${lang} at ${width}px`);
    }
  }
});
