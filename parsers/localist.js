/**
 * localist.js — S2. Generic parser for Localist calendars.
 * Endpoint: {origin}/api/2/events
 *
 * Localist runs most large university calendars (GSU, Emory, GT and peers)
 * and a number of city/civic sites. University events matter for Falcon:
 * orientation, graduation, move-in and athletics all move real volume.
 */

const { getJson } = require('../lib/http');
const { normalizeAll } = require('../lib/normalize');

function buildUrl(origin, { days = 14, page = 1, perPage = 100 } = {}) {
  const u = new URL('/api/2/events', origin);
  u.searchParams.set('days', String(days));
  u.searchParams.set('pp', String(perPage));
  u.searchParams.set('page', String(page));
  return u.toString();
}

function firstInstance(ev) {
  const inst = Array.isArray(ev.event_instances) ? ev.event_instances : [];
  const first = inst[0] && inst[0].event_instance;
  return first || {};
}

function mapEvent(wrapper) {
  const ev = (wrapper && wrapper.event) || wrapper || {};
  const inst = firstInstance(ev);
  const geo = ev.geo || {};
  const types = (ev.filters && ev.filters.event_types) || [];

  return {
    id: ev.id != null ? `localist-${ev.id}` : '',
    name: ev.title,
    url: ev.localist_url || ev.url,
    start: inst.start,          // ISO with offset — trusted as-is
    end: inst.end,
    status: ev.status || (ev.is_cancelled ? 'cancelled' : ''),
    category: (types[0] && types[0].name) || '',
    description: ev.description_text,
    venueName: ev.location_name || ev.venue_name || ev.location,
    address: geo.street || ev.address || '',
    lat: geo.latitude,
    lng: geo.longitude
  };
}

async function fetchLocalist(origin, { days = 14, maxPages = 4, venueHint = '' } = {}) {
  const all = [];
  let pages = 0;
  let error = '';

  for (let page = 1; page <= maxPages; page++) {
    const res = await getJson(buildUrl(origin, { days, page }));
    if (!res.ok) { if (page === 1) error = res.error; break; }

    const list = Array.isArray(res.data && res.data.events) ? res.data.events : [];
    pages++;
    all.push(...list.map(mapEvent));

    const pg = res.data.page || {};
    if (!list.length || (pg.total && pg.current >= pg.total)) break;
  }

  if (!pages) return { ok: false, events: [], dropped: 0, pages: 0, error: error || 'no feed' };

  const { events, dropped } = normalizeAll(all, {
    source: 'university',
    sourceFeed: 'localist',
    feedUrl: buildUrl(origin),
    venueHint
  });
  return { ok: true, events, dropped, pages, error: '' };
}

async function probe(origin) {
  const res = await getJson(buildUrl(origin, { days: 1, perPage: 1 }));
  return Boolean(res.ok && res.data && Array.isArray(res.data.events));
}

module.exports = { fetchLocalist, probe, buildUrl };
