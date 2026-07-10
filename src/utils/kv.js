import { parseDevice, parseReferrer } from "./helpers.js";

export async function getLink(env, slug) {
  return await env.KV_BINDING.get(`link:${slug}`, { type: "json" });
}

export async function saveLink(env, slug, target, title = "", existingData = null) {
  const base = existingData || { clicks: 0, history: [], created: Date.now() };
  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
    target,
    title:   title || base.title || "",
    clicks:  base.clicks  || 0,
    history: base.history || [],
    created: base.created || Date.now(),
  }));
}

export async function deleteLink(env, slug) {
  await env.KV_BINDING.delete(`link:${slug}`);
}

export async function recordClick(env, slug, data, request) {
  const ua         = request.headers.get("User-Agent") || "";
  const accept     = request.headers.get("Accept") || "";
  const acceptLang = request.headers.get("Accept-Language") || "";
  const purpose    = request.headers.get("Purpose") || request.headers.get("Sec-Purpose") || "";
  const cf         = request.cf || {};

  if (!ua) return;
  const isBot = /bot|crawler|spider|preview|prefetch|fetch|monitor|check|valid|scan|probe|headless|phantom|puppeteer|playwright|selenium|facebookexternalhit|whatsapp|telegram|twitterbot|slackbot|discordbot|linkedinbot|skypeuripreview|kofi|ko-fi|bitly|bit\.ly|tinyurl|curl|wget|python|ruby|go-http|okhttp|libwww|axios|node-fetch|postman|insomnia|apache-http/i.test(ua);
  if (isBot) return;
  if (purpose === "prefetch" || purpose === "prerender") return;
  if (!acceptLang) return;

  const datacenterASNs = new Set([13335,209242,132892,395747,14789,16509,14618,15169,8075,20940,16625,2906,32934,63949,14061,18450,6939,3257,1239,7922]);
  if (cf.asn && datacenterASNs.has(Number(cf.asn))) return;

  const country = cf.country || "Unknown";
  const city    = cf.city    || "Unknown";
  const device  = parseDevice(ua);
  const ref     = parseReferrer(request.headers.get("Referer") || "");
  const ts      = Date.now();

  const history = data.history || [];
  history.push({ ts, country, city, device, ref });
  if (history.length > 10000) history.splice(0, history.length - 10000);

  await env.KV_BINDING.put(`link:${slug}`, JSON.stringify({
    ...data,
    clicks:  (data.clicks || 0) + 1,
    history,
  }));
}

export async function listLinks(env) {
  const list  = await env.KV_BINDING.list({ prefix: "link:" });
  const links = [];
  for (const key of list.keys) {
    const slug = key.name.replace("link:", "");
    const data = await env.KV_BINDING.get(key.name, { type: "json" });
    if (data) links.push({ slug, ...data });
  }
  links.sort((a, b) => (b.created || 0) - (a.created || 0));
  return links;
}
