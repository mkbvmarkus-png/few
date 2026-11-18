'use strict';
/*
  Один опрос канала. Запускается по расписанию в GitHub Actions (бесплатно, без сервера и карты).
  Читает docs/data/state.json, добавляет свежий снимок и записывает обратно.
*/
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'docs', 'data', 'state.json');
const KEY = process.env.YOUTUBE_API_KEY;
const HANDLE = (process.env.CHANNEL_HANDLE || 'Again4k').replace(/^@/, '');
const DAY = 864e5;

async function yt(endpoint, params) {
  const url = new URL('https://www.googleapis.com/youtube/v3/' + endpoint);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  url.searchParams.set('key', KEY);
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error?.message || res.statusText);
    e.reason = json.error?.errors?.[0]?.reason;
    throw e;
  }
  return json;
}

const num = (x) => (x == null ? null : Number(x));
const clean = (s) => String(s || '')
  .replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, '')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const stepFor = (n) => 10 ** Math.max(2, Math.floor(Math.log10(Math.max(n, 1))) - 1);

// Старые точки истории прореживаем: свежие — каждые 10 мин, старше 3 дней — раз в час, старше 30 — раз в сутки.
function thin(h, now) {
  const out = [];
  let last = null;
  for (const p of h) {
    const age = now - p[0];
    if (age > 365 * DAY) continue;
    const bucket = age > 30 * DAY ? 'd' + Math.floor(p[0] / DAY) : age > 3 * DAY ? 'h' + Math.floor(p[0] / 36e5) : null;
    if (bucket === null) { out.push(p); last = null; continue; }
    if (bucket !== last) { out.push(p); last = bucket; }
  }
  return out;
}

(async () => {
  if (!KEY) { console.error('Нет YOUTUBE_API_KEY. Добавь его в Settings → Secrets → Actions.'); process.exit(1); }

  let st = { channel: null, videos: [], comments: [], history: [], events: [], knownVideos: [], live: {}, lastUpdate: null, error: null };
  try { st = { ...st, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}

  const pending = [];
  const addEvent = (type, text, url) => {
    st.events.unshift({ t: Date.now(), type, text, url });
    st.events = st.events.slice(0, 100);
    const { TELEGRAM_BOT_TOKEN: b, TELEGRAM_CHAT_ID: c } = process.env;
    if (b && c) {
      pending.push(fetch(`https://api.telegram.org/bot${b}/sendMessage`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: c, text: 'Again4k: ' + text + (url ? '\n' + url : '') }),
      }).catch(() => {}));
    }
  };

  try {
    const first = !st.channel;
    const chRes = await yt('channels', {
      part: 'snippet,statistics,contentDetails',
      ...(process.env.CHANNEL_ID ? { id: process.env.CHANNEL_ID } : { forHandle: HANDLE }),
    });
    const ch = chRes.items?.[0];
    if (!ch) throw new Error('Канал не найден. Проверь CHANNEL_HANDLE.');

    const prev = st.channel;
    const channel = {
      id: ch.id, title: ch.snippet.title, handle: ch.snippet.customUrl || '@' + HANDLE,
      thumb: ch.snippet.thumbnails?.medium?.url || ch.snippet.thumbnails?.default?.url,
      createdAt: ch.snippet.publishedAt,
      subs: ch.statistics.hiddenSubscriberCount ? null : num(ch.statistics.subscriberCount),
      views: num(ch.statistics.viewCount), videos: num(ch.statistics.videoCount),
    };

    const pl = await yt('playlistItems', {
      part: 'contentDetails', playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: 50,
    });
    const ids = (pl.items || []).map((i) => i.contentDetails.videoId);
    let videos = [];
    if (ids.length) {
      const vr = await yt('videos', { part: 'snippet,statistics,liveStreamingDetails', id: ids.join(',') });
      videos = (vr.items || []).map((v) => ({
        id: v.id, title: v.snippet.title, publishedAt: v.snippet.publishedAt,
        thumb: v.snippet.thumbnails?.medium?.url, live: v.snippet.liveBroadcastContent,
        views: num(v.statistics?.viewCount), likes: num(v.statistics?.likeCount), comments: num(v.statistics?.commentCount),
      })).sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    }

    let comments = [];
    for (const v of videos.filter((x) => x.comments !== 0).slice(0, 5)) {
      try {
        const cr = await yt('commentThreads', { part: 'snippet', videoId: v.id, maxResults: 10, order: 'time' });
        for (const it of cr.items || []) {
          const s = it.snippet.topLevelComment.snippet;
          comments.push({ id: it.id, videoId: v.id, videoTitle: v.title, author: s.authorDisplayName,
            text: clean(s.textDisplay).slice(0, 400), t: s.publishedAt });
        }
      } catch { /* комментарии выключены — пропускаем */ }
    }
    comments.sort((a, b) => new Date(b.t) - new Date(a.t));
    comments = comments.slice(0, 30);

    if (!first) {
      const known = new Set(st.knownVideos);
      for (const v of videos) if (!known.has(v.id)) addEvent('video', `Новое видео: ${v.title}`, 'https://youtu.be/' + v.id);
      for (const v of videos) {
        if (v.live === 'live' && !st.live[v.id]) {
          st.live[v.id] = true;
          addEvent('live', `Идёт трансляция: ${v.title}`, 'https://youtu.be/' + v.id);
        }
      }
      for (const [key, label] of [['subs', 'подписчиков'], ['views', 'просмотров канала']]) {
        const a = prev?.[key], b = channel[key];
        if (a != null && b != null) {
          const step = stepFor(b);
          if (Math.floor(b / step) > Math.floor(a / step)) addEvent('milestone', `Отметка: ${Math.floor(b / step) * step} ${label}`);
        }
      }
    }
    for (const v of videos) if (v.live !== 'live') delete st.live[v.id];
    st.knownVideos = videos.map((v) => v.id);

    const sum = (k) => videos.reduce((a, v) => a + (v[k] || 0), 0);
    const now = Date.now();
    st.history.push([now, channel.subs, channel.views, channel.videos, sum('likes'), sum('comments')]);
    st.history = thin(st.history, now);

    Object.assign(st, { channel, videos, comments, lastUpdate: now, error: null });
    console.log('OK:', channel.title, channel.subs, 'подписчиков,', channel.views, 'просмотров');
  } catch (e) {
    st.error = e.reason === 'quotaExceeded' ? 'Дневная квота API исчерпана, обновление продолжится завтра.' : e.message;
    console.error('Ошибка:', st.error);
  }

  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(st));
  await Promise.all(pending);
})();
