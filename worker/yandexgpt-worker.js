/*
  VANVION · ИИ-консультант — Cloudflare Worker (мостик к YandexGPT)
  --------------------------------------------------------------
  Переменные окружения (задаются в настройках воркера):
    YANDEX_API_KEY   — секрет: API-ключ сервисного аккаунта Yandex Cloud
    YANDEX_FOLDER_ID  — переменная: ID каталога (folder) в Yandex Cloud
    ALLOW_ORIGIN      — (необязательно) https://vanvion.github.io  (по умолчанию *)

  Сайт шлёт сюда POST { messages: [{role:'user'|'assistant', content:'...'}] }
  Воркер отвечает { reply: '...' }.
*/

const CATALOG_URL = 'https://vanvion.github.io/data/products.json';
let CATALOG_CACHE = { text: '', at: 0 };

export default {
  async fetch(request, env) {
    const origin = env.ALLOW_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') return json({ reply: 'Только POST.' }, cors);

    let body;
    try { body = await request.json(); } catch (e) { return json({ reply: 'Неверный запрос.' }, cors); }
    const incoming = Array.isArray(body.messages) ? body.messages.slice(-10) : [];

    // системный промпт со знаниями о каталоге
    const catalog = await getCatalogSummary();
    const system = buildSystemPrompt(catalog);

    const messages = [{ role: 'system', text: system }];
    for (const m of incoming) {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      const text = String(m.content || '').slice(0, 1000);
      if (text) messages.push({ role, text });
    }
    if (messages.length < 2) return json({ reply: 'Здравствуйте! Чем помочь?' }, cors);

    try {
      const r = await fetch('https://llm.api.cloud.yandex.net/foundationModels/v1/completion', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Api-Key ' + env.YANDEX_API_KEY,
        },
        body: JSON.stringify({
          modelUri: 'gpt://' + env.YANDEX_FOLDER_ID + '/yandexgpt/latest',
          completionOptions: { stream: false, temperature: 0.3, maxTokens: 600 },
          messages,
        }),
      });
      const data = await r.json();
      const reply = data?.result?.alternatives?.[0]?.message?.text
        || 'Извините, не получилось ответить. Напишите менеджеру в WhatsApp / Telegram / MAX.';
      return json({ reply }, cors);
    } catch (e) {
      return json({ reply: 'Сервис временно недоступен. Напишите менеджеру в WhatsApp / Telegram / MAX.' }, cors);
    }
  },
};

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
    'Отвечай по-русски, кратко и по делу, помогай подобрать модель и оформить оптовый заказ.',
    'Используй ТОЛЬКО факты и ассортимент ниже. Если спрашивают цену, минимальную партию, доставку, оплату или наличие — честно скажи, что это уточняется у менеджера (WhatsApp / Telegram / MAX), и не выдумывай цифры.',
    '',
    'ВАЖНЫЕ ПРАВИЛА ПОДБОРА:',
    '• Город/регион клиента (Сургут, Краснодар и т.п.) НЕ влияет на ассортимент — товар одинаковый для всех. НЕ подбирай «по климату» и НЕ советуй модели исходя из погоды или температуры в городе.',
    '• Не называй лён, хлопок или вискозу «тёплыми» или «подходящими для холода». Это лёгкие костюмные ткани. Зимних и утеплённых вещей у нас НЕТ — если клиент прямо просит тёплое/зимнее, честно скажи, что мы продаём костюмные пиджаки и брюки (демисезон), верхней зимней одежды нет.',
    '• Подбирай по тому, что действительно важно: фасон/силуэт, тип ткани, цвет, размерный ряд (НОРМА/БАТАЛ). Если запрос общий — задай 1 короткий уточняющий вопрос (например, какой цвет или ткань предпочтительнее), прежде чем вываливать список.',
    '• Предлагай максимум 3–4 модели за раз, не длинными простынями.',
    '',
    'ФОРМАТ ОТВЕТА (обязательно):',
    '• Пиши короткими абзацами, разделяй смысловые блоки пустой строкой. НЕ пиши сплошной стеной текста.',
    '• Когда перечисляешь модели — каждую с новой строки как пункт списка, начиная с «• ». Коротко: название, 1–2 ключевых факта (ткань/цвет), без длинных описаний (детали клиент увидит на карточке).',
    '• Если в ответе ты называешь конкретные модели, ОБЯЗАТЕЛЬНО добавь в самом конце отдельной последней строкой служебную строку вида: МОДЕЛИ: Название1 | Название2 | Название3 — только точные названия моделей из ассортимента ниже, через вертикальную черту «|». Эта строка нужна сайту, чтобы показать карточки товара. Не упоминай её в обычном тексте и не объясняй её клиенту.',
    '',
    'ФАКТЫ:',
    '• Размеры (пачки/ростовки): НОРМА — 50–58, БАТАЛ — 58–66. В модели можно взять отдельно НОРМА и БАТАЛ. У части моделей в наличии только НОРМА — ориентируйся на поле «размеры» конкретной модели в ассортименте ниже.',
    '• Как заказать: выбрать модель и цвет → указать количество пачек → «В корзину» → в корзине отправить заказ на расчёт в WhatsApp / Telegram / MAX. Можно добавить комментарий.',
    '• Цены — по запросу (через расчёт заказа у менеджера).',
    '• Телефоны: +7 916 259 1643, +7 926 136 5535, +7 903 538 8887.',
    '• Адреса: Москва, ТЦ «Садовод» — корпус Б, 1 этаж, линия В, пав. 50–52; и 16 линия, пав. 72.',
    '• Уведомления о новинках: кнопка «Новинки» → подписаться (на iPhone сначала добавить сайт на экран «Домой»).',
    '',
    'АССОРТИМЕНТ (модель — число цветов, состав, размеры, силуэт):',
    catalog || '(каталог временно недоступен — предложи написать менеджеру)',
  ].join('\n');
}
