// analytics.js: product analytics with PostHog, kept small on purpose.
// No cookies or storage (each visit is anonymous), no autocapture, no session recording,
// and never anything from the document: only which buttons were used, counts and timings.
// If PostHog is blocked (ad blockers), every call here quietly does nothing.

const KEY = "phc_tUquaffF9JFtNT3LL6esPQyPRVu2pQYCteBgq2nGAHuv";   // project token: public by design
const HOST = "https://us.i.posthog.com";                          // use https://eu.i.posthog.com for an EU project
const LOCAL = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);

if (!LOCAL) {
  // PostHog's standard loader: a small stub that queues calls until the library arrives.
  /* eslint-disable */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  /* eslint-enable */
  window.posthog.init(KEY, {
    api_host: HOST,
    persistence: "memory",            // no cookies, no localStorage
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
}

export function track(event, props = {}) {
  if (LOCAL) { (window.__events ||= []).push([event, props]); return; }   // local runs: kept for tests, never sent
  try { window.posthog && window.posthog.capture(event, props); } catch {}
}
