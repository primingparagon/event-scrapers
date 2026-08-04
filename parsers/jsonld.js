/**
 * jsonld.js — S3. Extracts schema.org Event objects from any HTML page.
 *
 * This is the universal fallback: sites with no API at all still very often
 * embed JSON-LD because it is what Google requires for rich results.
 *
 * It is also the single best CANCELLATION signal available without a browser:
 * schema.org eventStatus carries EventCancelled / EventPostponed /
 * EventRescheduled explicitly. That feeds S7 and closes ledger risk R10.
 */

const { get } = require('../lib/http');
const { normalizeAll } = require('../lib/normalize');

const EVENT_TYPES = new Set([
  'Event', 'MusicEvent', 'TheaterEvent', 'SportsEvent', 'ComedyEvent',
  'Festival', 'ExhibitionEvent', 'ScreeningEvent', 'SocialEvent',
  'BusinessEvent', 'EducationEvent', 'FoodEvent', 'ChildrensEvent',
  'DanceEvent', 'LiteraryEvent', 'PublicationEvent', 'CourseInstance'
]);

const SCRIPT_RE = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function typesOf(node) {
  const t = node && node['@type'];
  if (!t) return [];
  return Array.isArray(t) ? t.map(String) : [String(t)];
}

function isEvent(node) {
  return typesOf(node).some((t) => EVENT_TYPES.has(t));
}

/** Walk arbitrary JSON-LD (arrays, @graph, nested subEvent) collecting Events. */
function collectEvents(node, out = [], depth = 0) {
  if (!node || depth > 6) return out;

  if (Array.isArray(node)) {
    for (const n of node) collectEvents(n, out, depth + 1);
    return out;
  }
  if (typeof node !== 'object') return out;

  if (Array.isArray(node['@graph'])) collectEvents(node['@graph'], out, depth + 1);
  if (isEvent(node)) out.push(node);
  if (node.subEvent) collectEvents(node.subEvent, out, depth + 1);
  if (node.event) collectEvents(node.event, out, depth + 1);

  return out;
}

function pickLocation(loc) {
  const l = Array.isArray(loc) ? loc[0] : loc;
  if (!l || typeof l !== 'object') {
    return { venueName: typeof l === 'string' ? l : '', address: '', lat: NaN, lng: NaN };
  }
  const a = l.address;
  let address = '';
  if (typeof a === 'string') address = a;
  else if (a && typeof a === 'object') {
    address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
      .filter(Boolean).join(', ');
  }
  const geo = l.geo || {};
  return {
    venueName: l.name || '',
    address,
    lat: geo.latitude,
    lng: geo.longitude
  };
}

function mapEvent(e, pageUrl) {
  const loc = pickLocation(e.location);
  return {
    id: e['@id'] || e.url || `${pageUrl}#${e.name}-${e.startDate}`,
    name: e.name,
    url: e.url || pageUrl,
    start: e.startDate,
    end: e.endDate,
    // "https://schema.org/EventCancelled" -> normalize.mapStatus matches on text
    status: e.eventStatus || '',
    category: typesOf(e)[0] || '',
    description: typeof e.description === 'string' ? e.description : '',
    venueName: loc.venueName,
    address: loc.address,
    lat: loc.lat,
    lng: loc.lng
  };
}

/** parseHtml — pure function, unit-testable without network. */
function parseHtml(html, pageUrl = '') {
  const found = [];
  let m;
  SCRIPT_RE.lastIndex = 0;
  while ((m = SCRIPT_RE.exec(html)) !== null) {
    const raw = m[1].trim().replace(/^<!--/, '').replace(/-->$/, '');
    if (!raw) continue;
    let data;
    try { data = JSON.parse(raw); } catch { continue; } // malformed block, skip
    collectEvents(data, found);
  }
  return found.map((e) => mapEvent(e, pageUrl));
}

async function fetchJsonLd(pageUrl, { venueHint = '', source = 'venue' } = {}) {
  const res = await get(pageUrl, { accept: 'text/html' });
  if (!res.ok) return { ok: false, events: [], dropped: 0, error: res.error };

  const raws = parseHtml(res.body, pageUrl);
  if (!raws.length) return { ok: true, events: [], dropped: 0, error: 'no JSON-LD events' };

  const { events, dropped } = normalizeAll(raws, {
    source,
    sourceFeed: 'jsonld',
    feedUrl: pageUrl,
    venueHint
  });
  return { ok: true, events, dropped, error: '' };
}

async function probe(pageUrl) {
  const res = await get(pageUrl, { accept: 'text/html', retries: 1 });
  if (!res.ok) return false;
  return parseHtml(res.body, pageUrl).length > 0;
}

module.exports = { fetchJsonLd, parseHtml, probe, collectEvents };
