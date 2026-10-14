/*
  VANVION · ИИ-консультант — Cloudflare Worker
  --------------------------------------------------------------
  Три роли в одном воркере:
    • POST /            — чат на сайте (принимает {messages}, отвечает {reply})
    • POST /tg          — webhook Telegram-бота (отвечает клиентам в чате/ЛС)
    • POST /max         — webhook MAX-бота (отвечает клиентам в диалоге)

  Переменные окружения (Settings → Variables and Secrets воркера):
    YANDEX_API_KEY          — секрет: API-ключ сервисного аккаунта Yandex Cloud
    YANDEX_FOLDER_ID         — ID каталога Yandex Cloud
    TELEGRAM_BOT_TOKEN       — секрет: токен Telegram-бота (чтобы отвечать)
    TELEGRAM_BOT_USERNAME    — (необяз.) username бота без @, для реакции на упоминание в группе
    TELEGRAM_SECRET          — (необяз.) секрет вебхука Telegram (проверка заголовка)
    MAX_BOT_TOKEN            — секрет: токен MAX-бота (чтобы отвечать)
    ALLOW_ORIGIN             — (необяз.) https://vanvion.github.io (для чата на сайте)
*/

const CATALOG_URL = 'https://vanvion.github.io/data/products.json';
let CATALOG_CACHE = { text: '', at: 0 };

/* slug цвета -> русское название (как на сайте) */
const COLOR_RU = {
  charcoal: 'УГОЛЬНЫЙ', navy: 'ТЁМНО-СИНИЙ', black: 'ЧЁРНЫЙ', camel: 'КЭМЕЛ', beige: 'БЕЖЕВЫЙ',
  grey: 'СЕРЫЙ', brown: 'КОРИЧНЕВЫЙ', green: 'ЗЕЛЁНЫЙ', lightgrey: 'СВЕТЛО-СЕРЫЙ', burgundy: 'БОРДОВЫЙ',
  sand: 'ПЕСОЧНЫЙ', slate: 'СЛАНЦЕВЫЙ', taba: 'ТАБА', kiremit: 'КИРПИЧНЫЙ', kkiremit: 'Т.КИРПИЧНЫЙ',
  kahve: 'КОФЕ', antrasit: 'АНТРАЦИТ', yesil: 'ЗЕЛЁНЫЙ', murdum: 'СЛИВОВЫЙ', laci: 'СИНИЙ',
  klaci: 'ТЁМНО-СИНИЙ', siyah: 'ЧЁРНЫЙ', haki: 'ХАКИ', alaci: 'СВЕТЛО-СИНИЙ', c295: 'СЕРЫЙ',
  c671: 'ГОЛУБОЙ', abej: 'СВЕТЛО-БЕЖЕВЫЙ', bej: 'БЕЖЕВЫЙ', ekru: 'ЭКРЮ', beyaz: 'БЕЛЫЙ',
  vizon: 'ВИЗОН', gri: 'СЕРЫЙ',
};
/* транслитерация кириллицы в латиницу + нормализация (для нечёткого поиска) */
const CYR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'c',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
function translit(s) { return String(s || '').toLowerCase().split('').map(c => (CYR[c] !== undefined ? CYR[c] : c)).join(''); }
function norm(s) { return translit(s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = []; for (let i = 0; i <= m; i++) d[i] = [i];
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    // одноразовая настройка вебхука MAX: открой /max-subscribe в браузере
    if (request.method === 'GET' && path === '/max-subscribe') {
      const hookUrl = url.origin + '/max';
      try {
        const r = await fetch('https://botapi.max.ru/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': env.MAX_BOT_TOKEN || '' },
          body: JSON.stringify({ url: hookUrl }),
        });
        const t = await r.text();
        return new Response('MAX subscribe → ' + hookUrl + '\nHTTP ' + r.status + '\n' + t,
          { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      } catch (e) {
        return new Response('MAX subscribe error: ' + e, { status: 500 });
      }
    }
    // тест пересылки заказа в группу: открой /test-forward в браузере
    if (request.method === 'GET' && path === '/test-forward') {
      const chat = env.TELEGRAM_CHAT_ID || env.MANAGERS_CHAT_ID;
      if (!env.TELEGRAM_BOT_TOKEN) return new Response('no TELEGRAM_BOT_TOKEN', { status: 500 });
      if (!chat) return new Response('no TELEGRAM_CHAT_ID / MANAGERS_CHAT_ID', { status: 500 });
      const r = await fetch('https://api.telegram.org/bot' + env.TELEGRAM_BOT_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chat, text: '🛒 Тест пересылки заказа — проверка связи бота с группой' }),
      });
      const t = await r.text();
      return new Response('chat_id=' + chat + '\nHTTP ' + r.status + '\n' + t,
        { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (request.method === 'GET') return new Response('VANVION AI worker OK', { status: 200 });
    if (request.method !== 'POST') return json({ reply: 'Только POST.' }, cors);

    // --- webhook Telegram ---
    if (path === '/tg') {
      if (env.TELEGRAM_SECRET) {
        const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (got !== env.TELEGRAM_SECRET) return new Response('forbidden', { status: 403 });
      }
      let update; try { update = await request.json(); } catch (e) { return new Response('ok'); }
      // отвечаем асинхронно, Telegram сразу получает 200
      await handleTelegram(update, env).catch(e => console.log('TG err', e));
      return new Response('ok');
    }

    // --- webhook MAX ---
    if (path === '/max') {
      let update; try { update = await request.json(); } catch (e) { return new Response('ok'); }
      await handleMax(update, env).catch(e => console.log('MAX err', e));
      return new Response('ok');
    }

    // --- чат на сайте ---
    let body; try { body = await request.json(); } catch (e) { return json({ reply: 'Неверный запрос.' }, cors); }
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];
    const msgs = [];
    for (const m of incoming) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const text = String(m.content || '').slice(0, 1000);
      if (text) msgs.push({ role, text });
    }
    if (!msgs.length) return json({ reply: 'Здравствуйте! Чем помочь?' }, cors);
    const reply = await askYandex(env, msgs);
    return json({ reply }, cors);
  },
};

/* ---------------- Telegram ---------------- */
async function handleTelegram(update, env) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return;
  if (msg.from && msg.from.is_bot) return;
  const chat = msg.chat || {};
  const chatId = chat.id;
  const isPrivate = chat.type === 'private';
  const uname = (env.TELEGRAM_BOT_USERNAME || '').replace('@', '');
  let text = msg.text;
  let shouldReply = isPrivate;
  if (!isPrivate) {
    // в группе отвечаем только на упоминание бота или ответ на его сообщение
    if (uname && text.indexOf('@' + uname) >= 0) { shouldReply = true; text = text.split('@' + uname).join('').trim(); }
    if (msg.reply_to_message && msg.reply_to_message.from && msg.reply_to_message.from.is_bot) shouldReply = true;
  }
  if (!shouldReply || !text) return;
  const key = 'tg:' + chatId;
  const hist = await loadHist(env, key);
  hist.push({ role: 'user', text: text.slice(0, 1000) });
  const raw = await askYandex(env, hist);
  const { clean, order } = extractOrder(raw);
  let reply = clean;
  if (order) {
    const v = await validateOrder(parseOrder(order));
    if (v.ok) {
      const f = msg.from || {};
      const who = 'Клиент: ' + [f.first_name, f.last_name].filter(Boolean).join(' ') +
        (f.username ? ' (@' + f.username + ')' : '') + ' · id ' + (f.id || '');
      await forwardOrder(env, 'Telegram', who, v);
    } else {
      reply = 'Уточните, пожалуйста, заказ: ' + v.error + '. Модель выберите из каталога — https://vanvion.github.io';
    }
  }
  hist.push({ role: 'assistant', text: reply });
  await saveHist(env, key, hist);
  await tgSend(env.TELEGRAM_BOT_TOKEN, chatId, reply, isPrivate ? null : msg.message_id);
}

/* вытаскиваем служебную строку [[ORDER]] ... из ответа ИИ */
function extractOrder(reply) {
  const m = reply.match(/\[\[ORDER\]\]([^\n]*)/i);
  if (!m) return { clean: reply, order: null };
  return { clean: reply.replace(m[0], '').trim(), order: m[1].trim() };
}
/* разбор строки заказа (терпим к key=val и «ключ: значение») */
function parseOrder(s) {
  const o = { model: '', color: '', size: '', qty: '' };
  for (const part of String(s).split(/[;\n]/)) {
    const p = part.trim(); if (!p) continue;
    const low = p.toLowerCase();
    const val = (p.split(/[:=]/).slice(1).join(':') || p).trim();
    if (/model|модел/.test(low)) o.model = val;
    else if (/color|цвет|rəng|renk/.test(low)) o.color = val;
    else if (/size|разм|ölç|beden/.test(low)) o.size = val;
    else if (/qty|кол|пач|adet|paket|say/.test(low)) o.qty = val;
  }
  return o;
}
/* проверка заказа по каталогу: модель есть, размер доступен, количество реально */
/* нечёткий поиск модели: транслит кириллицы + расстояние Левенштейна */
function matchModel(input, names) {
  const q = norm(input);
  if (!q) return null;
  let exact = names.find(n => norm(n) === q);
  if (exact) return exact;
  // подстрока (напр. «сонили» внутри «MILANO SONILI» — но сначала точное выше)
  let sub = names.filter(n => { const nn = norm(n); return nn.indexOf(q) >= 0 || q.indexOf(nn) >= 0; });
  if (sub.length === 1) return sub[0];
  // ближайшее по опечаткам
  let best = null, bd = 99;
  for (const n of names) { const d = lev(q, norm(n)); if (d < bd) { bd = d; best = n; } }
  const thr = Math.max(1, Math.floor(q.length * 0.34));
  return best && bd <= thr ? best : null;
}
/* нечёткий поиск цвета среди цветов модели; возвращает русское название */
function matchColor(input, colors) {
  if (!input || !colors || !colors.length) return (input || '').trim();
  const q = norm(input);
  for (const c of colors) if (norm(c.ru) === q || norm(c.slug) === q) return c.ru;
  let best = null, bd = 99;
  for (const c of colors) { const d = Math.min(lev(q, norm(c.ru)), lev(q, norm(c.slug))); if (d < bd) { bd = d; best = c; } }
  return best && bd <= Math.max(1, Math.floor(q.length * 0.4)) ? best.ru : input.trim();
}
async function validateOrder(o) {
  const data = await getCatalogData();
  const model = matchModel(o.model, data.names);
  if (!model) return { ok: false, error: 'такой модели нет в каталоге' };
  const sizes = (data.byModel[model].sizes || '').toUpperCase();
  const size = /батал|büyük|böyük|batal/i.test(o.size) ? 'БАТАЛ'
    : /норм|normal/i.test(o.size) ? 'НОРМА' : '';
  if (size === 'БАТАЛ' && sizes.indexOf('БАТАЛ') < 0) return { ok: false, error: 'у модели ' + model + ' нет ряда БАТАЛ (есть только НОРМА)' };
  const qty = parseInt(String(o.qty).replace(/[^\d]/g, ''), 10);
  if (!qty || qty < 1 || qty > 2000) return { ok: false, error: 'укажите реальное количество пачек (1–2000)' };
  const color = matchColor(o.color, data.byModel[model].colors);
  return { ok: true, model, color, size: size || (o.size || '').trim(), qty };
}
function plPack(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'пачка';
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return 'пачки';
  return 'пачек';
}
/* красиво пересылаем проверенный заказ в Telegram-группу менеджеров */
async function forwardOrder(env, source, who, v) {
  const chat = env.MANAGERS_CHAT_ID || env.TELEGRAM_CHAT_ID;
  if (!chat || !env.TELEGRAM_BOT_TOKEN) return;
  const lines = ['🛒 НОВЫЙ ЗАКАЗ · ' + source, '', who, '', '👔 Модель: ' + v.model];
  if (v.color) lines.push('🎨 Цвет: ' + v.color);
  if (v.size) lines.push('📏 Размер: ' + v.size);
  lines.push('📦 Количество: ' + v.qty + ' ' + plPack(v.qty));
  await tgSend(env.TELEGRAM_BOT_TOKEN, chat, lines.join('\n'), null);
}

/* память диалога (Cloudflare KV binding CHATS); без неё — без контекста */
async function loadHist(env, key) {
  if (!env.CHATS) return [];
  try { const v = await env.CHATS.get(key); return v ? JSON.parse(v) : []; } catch (e) { return []; }
}
async function saveHist(env, key, hist) {
  if (!env.CHATS) return;
  try { await env.CHATS.put(key, JSON.stringify(hist.slice(-8)), { expirationTtl: 1800 }); } catch (e) {}
}

async function tgSend(token, chatId, text, replyTo) {
  if (!token) return;
  const payload = { chat_id: chatId, text: text, disable_web_page_preview: true };
  if (replyTo) payload.reply_to_message_id = replyTo;
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
  } catch (e) { console.log('tgSend err', e); }
}

/* ---------------- MAX ---------------- */
async function handleMax(update, env) {
  // новое сообщение от пользователя
  if (!update || update.update_type !== 'message_created') return;
  const m = update.message || {};
  const body = m.body || {};
  const text = body.text || '';
  const rec = m.recipient || {};
  const chatId = rec.chat_id;
  const chatType = rec.chat_type; // 'dialog' (ЛС) или 'chat' (группа)
  if (!text || !chatId) return;
  // автоответ только в личных диалогах, чтобы не спамить в группе
  if (chatType && chatType !== 'dialog') return;
  const key = 'max:' + chatId;
  const hist = await loadHist(env, key);
  hist.push({ role: 'user', text: String(text).slice(0, 1000) });
  const raw = await askYandex(env, hist);
  const { clean, order } = extractOrder(raw);
  let reply = clean;
  if (order) {
    const v = await validateOrder(parseOrder(order));
    if (v.ok) {
      const s = m.sender || {};
      const who = 'Клиент (MAX): ' + (s.name || [s.first_name, s.last_name].filter(Boolean).join(' ') || '') +
        (s.username ? ' (@' + s.username + ')' : '') + ' · id ' + (s.user_id || '');
      await forwardOrder(env, 'MAX', who, v);
    } else {
      reply = 'Уточните, пожалуйста, заказ: ' + v.error + '. Модель выберите из каталога — https://vanvion.github.io';
    }
  }
  hist.push({ role: 'assistant', text: reply });
  await saveHist(env, key, hist);
  await maxSend(env.MAX_BOT_TOKEN, chatId, reply);
}

async function maxSend(token, chatId, text) {
  if (!token) return;
  try {
    await fetch('https://botapi.max.ru/messages?' + new URLSearchParams({ chat_id: String(chatId) }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Authorization': token },
      body: JSON.stringify({ text: text }),
    });
  } catch (e) { console.log('maxSend err', e); }
}

/* ---------------- YandexGPT ---------------- */
async function askYandex(env, messages) {
  const catalog = await getCatalogSummary();
  const system = buildSystemPrompt(catalog);
  const full = [{ role: 'system', text: system }].concat(messages);
  try {
    const r = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Api-Key ' + env.YANDEX_API_KEY },
      body: JSON.stringify({
        modelUri: 'gpt://' + env.YANDEX_FOLDER_ID + '/yandexgpt/latest',
        completionOptions: { stream: false, temperature: 0.3, maxTokens: 300 },
        messages: full,
      }),
    });
    const data = await r.json();
    return (data && data.result && data.result.alternatives && data.result.alternatives[0]
      && data.result.alternatives[0].message && data.result.alternatives[0].message.text)
      || 'Извините, не получилось ответить. Напишите менеджеру: +7 916 259 1643.';
  } catch (e) {
    return 'Сервис временно недоступен. Напишите менеджеру: +7 916 259 1643.';
  }
}

function json(obj, cors) {
  return new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors } });
}

async function getCatalogSummary() {
  if (CATALOG_CACHE.text && Date.now() - CATALOG_CACHE.at < 10 * 60 * 1000) return CATALOG_CACHE.text;
  try {
    const r = await fetch(CATALOG_URL, { cf: { cacheTtl: 600 } });
    const products = await r.json();
    const byModel = new Map();
    for (const p of products) {
      if (!byModel.has(p.model)) byModel.set(p.model, { cat: p.cat, n: 0, comp: p.comp_ru, sizes: p.sizes, sil: p.sil_ru, colors: [], _seen: {} });
      const v = byModel.get(p.model); v.n++;
      const slug = String(p.colors || '').split(',')[0].trim().toLowerCase();
      const ru = COLOR_RU[slug];
      if (slug && !v._seen[slug]) { v._seen[slug] = 1; v.colors.push(ru || slug); }
    }
    const lines = [];
    for (const [model, v] of byModel) {
      const kind = v.cat === 'bryuki' ? 'БРЮКИ' : 'ПИДЖАК';
      lines.push(`${kind} ${model} — цвета: ${v.colors.join(', ') || '—'}; состав: ${v.comp || '—'}; размеры: ${v.sizes || '—'}; силуэт: ${v.sil || '—'}`);
    }
    CATALOG_CACHE = { text: lines.join('\n'), at: Date.now() };
    return CATALOG_CACHE.text;
  } catch (e) {
    return '';
  }
}

let CATALOG_DATA = { names: [], byModel: {}, at: 0 };
async function getCatalogData() {
  if (CATALOG_DATA.names.length && Date.now() - CATALOG_DATA.at < 10 * 60 * 1000) return CATALOG_DATA;
  try {
    const r = await fetch(CATALOG_URL, { cf: { cacheTtl: 600 } });
    const products = await r.json();
    const byModel = {};
    for (const p of products) {
      const m = (p.model || '').toUpperCase().trim();
      if (!m) continue;
      if (!byModel[m]) byModel[m] = { sizes: p.sizes || '', cat: p.cat, colors: [], _seen: {} };
      const slug = String(p.colors || '').split(',')[0].trim().toLowerCase();
      const ru = COLOR_RU[slug];
      if (slug && !byModel[m]._seen[slug]) { byModel[m]._seen[slug] = 1; byModel[m].colors.push({ slug, ru: ru || slug }); }
    }
    CATALOG_DATA = { names: Object.keys(byModel), byModel, at: Date.now() };
    return CATALOG_DATA;
  } catch (e) {
    return CATALOG_DATA;
  }
}

function buildSystemPrompt(catalog) {
  return [
    'Ты — вежливый консультант оптового каталога мужской одежды VANVION (ТЦ «Садовод», Москва). Мы продаём оптом мужские КОСТЮМНЫЕ пиджаки и брюки — это демисезонная одежда для помещения/офиса, а НЕ зимняя и НЕ верхняя одежда.',
    'ЯЗЫК: отвечай на том же языке, на котором пишет клиент (ru/en/tr/az). Если не ясно — по-русски.',
    '',
    'СТИЛЬ ОТВЕТА (строго):',
    '• Очень КОРОТКО: 1–3 коротких предложения. Без воды и вступлений.',
    '• НЕ здоровайся повторно, если диалог уже начат. НЕ повторяй телефоны/контакты в каждом сообщении.',
    '• Телефоны давай ТОЛЬКО если клиент просит контакты. Не добавляй их к каждому ответу.',
    '• Помни предыдущие сообщения в диалоге и отвечай по контексту, не начинай заново.',
    '• Если клиент говорит «хочу заказать / нужны пиджаки» БЕЗ деталей — НЕ вываливай список моделей. Задай 1 короткий вопрос: какая ткань, цвет или фасон интересует.',
    '• Называй конкретные модели ТОЛЬКО когда клиент назвал параметры (цвет/ткань/фасон). Тогда 1–3 модели, по одной строке.',
    '',
    'РАСПОЗНАВАНИЕ: клиент может писать модель и цвет как угодно — кириллицей, с опечатками, по-русски или на своём языке. Примеры: «Шонили» = SONILI, «Викинг» = VIKING; «к.лаки»/«к лачи»/«тёмно-синий» = цвет Тёмно-синий. Распознай и подставляй ТОЧНОЕ название модели из каталога и правильный цвет (цвета каждой модели перечислены в ассортименте ниже).',
    '',
    'ОФОРМЛЕНИЕ ЗАКАЗА (важно):',
    '• Модель бери ТОЛЬКО из ассортимента ниже, точно как написано. Если клиент назвал модель, которой нет в списке, — НЕ подтверждай заказ, скажи, что такой модели нет, и предложи похожую.',
    '• Количество пачек должно быть реальным (обычно 1–100). При абсурдных числах (например, 1000000) переспроси.',
    '• Собери 4 параметра: модель, цвет, размер (НОРМА или БАТАЛ), количество пачек. Чего не хватает — спроси коротко.',
    '• Когда всё собрано, модель из каталога и клиент подтвердил — ответь коротко: «Заказ принят ✅ Передал менеджеру, он свяжется для подтверждения и расчёта.» И в САМОМ КОНЦЕ добавь ОТДЕЛЬНОЙ последней строкой (клиенту её не показывай и не объясняй) строго в формате:',
    '  [[ORDER]] model=ТОЧНОЕ_НАЗВАНИЕ_ИЗ_КАТАЛОГА; color=цвет; size=НОРМА или БАТАЛ; qty=число',
    '• НЕ добавляй строку [[ORDER]], если модели нет в каталоге, данные неполные или клиент не подтвердил.',
    '',
    'ПРАВИЛА:',
    'Используй ТОЛЬКО факты и ассортимент ниже. Цену, минимальную партию, доставку, оплату и наличие не выдумывай — скажи коротко, что это уточнит менеджер.',
    '• Город/регион клиента НЕ влияет на ассортимент. НЕ подбирай «по климату».',
    '• Зимних/утеплённых вещей НЕТ — это костюмные пиджаки и брюки (демисезон).',
    '• Если модели нет в ассортименте — коротко скажи, что её нет, и предложи похожую из списка.',
    '',
    'ФАКТЫ:',
    '• Размеры (пачки/ростовки): НОРМА — 50–58, БАТАЛ — 58–66. В модели можно взять отдельно НОРМА и БАТАЛ. У части моделей в наличии только НОРМА — ориентируйся на поле «размеры».',
    '• Как заказать: выбрать модель и цвет → указать количество пачек → «В корзину» → отправить заказ на расчёт в WhatsApp / Telegram / MAX. Каталог: https://vanvion.github.io',
    '• Цены — по запросу (через расчёт заказа у менеджера).',
    '• Телефоны: +7 916 259 1643, +7 926 136 5535, +7 903 538 8887.',
    '• Адреса: Москва, ТЦ «Садовод» — корпус Б, 1 этаж, линия В, пав. 50–52; и 16 линия, пав. 72.',
    '',
    'АССОРТИМЕНТ (модель — число цветов, состав, размеры, силуэт):',
    catalog || '(каталог временно недоступен — предложи написать менеджеру)',
  ].join('\n');
}
