/**
 * tribe.js — S1. Generic parser for "The Events Calendar" (WordPress).
 * Endpoint: {origin}/wp-json/tribe/events/v1/events
 *
 * This one plugin runs a large share of independent music venues, breweries,
 * churches and city sites. One parser, many venues.
 */

const { getJson } = require('../lib/http');
const { normalizeAll } = require('../lib/normalize');

const FEED_PATHS = ['/wp-json/tribe/events/v1/events'];

function buildUrl(origin, { startIso, endIso, page = 1, perPage = 50 }) {
  const u = new URL(FEED_PATHS[0], origin);
  u.searchParams.set('per_page', String(perPage));
  u.searchParams.set('page', String(page));
  if (startIso) u.searchParams.set('start_date', startIso);
  if (endIso) u.searchParams.set('end_date', endIso);
  return u.toString();
}

function mapEvent(e) {
  const v = e.venue || {};
  return {
    id: e.id != null ? `tribe-${e.id}` : '',
    name: e.title,
    url: e.url || e.website,
    // utc_start_date is authoritative when present; start_date is naive local.
    start: e.utc_start_date ? `${String(e.utc_start_date).replace(' ', 'T')}Z` : e.start_date,
    end: e.utc_end_date ? `${String(e.utc_end_date).replace(' ', 'T')}Z` : e.end_date,
    status: e.status,
    category: (e.categories && e.categories[0] && e.categories[0].name) || '',
    description: e.excerpt || e.description,
    venueName: v.venue || '',
    address: [v.address, v.city, v.state, v.zip].filter(Boolean).join(', '),
    lat: v.geo_lat,
    lng: v.geo_lng
  };
}

/**
 * fetchTribe — returns { ok, events, dropped, pages, error }
 */
async function fetchTribe(origin, { startIso, endIso, maxPages = 4, venueHint = '' } = {}) {
  const all = [];
  let pages = 0;
  let error = '';

  for (let page = 1; page <= maxPages; page++) {
    const url = buildUrl(origin, { startIso, endIso, page });
    const res = await getJson(url);
    if (!res.ok) { if (page === 1) error = res.error; break; }

    const list = Array.isArray(res.data && res.data.events) ? res.data.events : [];
    pages++;
    all.push(...list.map(mapEvent));

    const total = Number(res.data.total_pages || 0);
    if (!list.length || (total && page >= total)) break;
  }

  if (!pages) return { ok: false, events: [], dropped: 0, pages: 0, error: error || 'no feed' };

  const { events, dropped } = normalizeAll(all, {
    source: 'venue',
    sourceFeed: 'tribe',
    feedUrl: buildUrl(origin, {}),
    venueHint
  });
  return { ok: true, events, dropped, pages, error: '' };
}

/** probe — cheap yes/no used by discover.js */
async function probe(origin) {
  const res = await getJson(buildUrl(origin, { perPage: 1 }));
  return Boolean(res.ok && res.data && Array.isArray(res.data.events));
}

module.exports = { fetchTribe, probe, buildUrl, FEED_PATHS };
