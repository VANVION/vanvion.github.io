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
  const reply = await askYandex(env, hist);
  hist.push({ role: 'assistant', text: reply });
  await saveHist(env, key, hist);
  await tgSend(env.TELEGRAM_BOT_TOKEN, chatId, reply, isPrivate ? null : msg.message_id);
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
  const reply = await askYandex(env, hist);
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
      if (!byModel.has(p.model)) byModel.set(p.model, { cat: p.cat, n: 0, comp: p.comp_ru, sizes: p.sizes, sil: p.sil_ru });
      byModel.get(p.model).n++;
    }
    const lines = [];
    for (const [model, v] of byModel) {
      const kind = v.cat === 'bryuki' ? 'БРЮКИ' : 'ПИДЖАК';
      lines.push(`${kind} ${model} — ${v.n} цв., состав: ${v.comp || '—'}, размеры: ${v.sizes || '—'}, силуэт: ${v.sil || '—'}`);
    }
    CATALOG_CACHE = { text: lines.join('\n'), at: Date.now() };
    return CATALOG_CACHE.text;
  } catch (e) {
    return '';
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
    'КАК ОФОРМИТЬ ЗАКАЗ (важно):',
    '• Ты НЕ оформляешь заказ сам и НЕ передаёшь его менеджеру. НИКОГДА не пиши «передам/передал ваш запрос менеджеру» — это неправда.',
    '• Когда клиент готов заказать — коротко скажи: оформить можно в каталоге (модель и цвет → количество пачек → «В корзину» → «Отправить заказ на расчёт»), либо написать менеджеру в WhatsApp +7 916 259 1643. Каталог: https://vanvion.github.io',
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
