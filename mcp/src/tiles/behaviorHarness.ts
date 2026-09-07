// FILE A — the reusable behavior-execution rig for sealed Vitality tiles.
//
// WHY THIS EXISTS. lintTile proves a tile is SEALED and on-brand (a string check);
// render.dom.test.ts proves it does not THROW on one happy interaction. Neither proves
// the number is RIGHT, that a save round-trips, that midnight rolls the day over, or
// that the 7-day chart draws without NaN. Those are the failures that actually reach a
// paid dashboard. This harness mounts a tile in a real DOM (jsdom), acts as the REAL
// Vitality host (a faithful in-memory store, not a hardcoded `data:[]`), controls the
// clock, and exposes rich introspection so a test can assert the truth of the tile.
//
// HOST-STORE FIDELITY. The store mirrors lib/tiles/useTileHost.ts (the source of truth,
// owned by the dashboard): on 'save' it PERSISTS msg.data (or replies 'save:error' when
// over a configurable cap); on 'load' it replies 'load:result' with the CURRENTLY
// STORED data (never []); on 'report' it pushes msg.stream to a log. Keep this in sync
// with useTileHost.ts the same way reportContract.ts is vendored: if the host changes,
// these tests are the tripwire, not prod.
//
// No new deps: node:test + jsdom (already a devDependency).

import { JSDOM, VirtualConsole } from 'jsdom';

const wait = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
/** Let queued microtasks / postMessage round-trips / rAF callbacks settle. */
export async function settle(n = 8): Promise<void> {
  for (let i = 0; i < n; i++) await wait();
}

export interface MountOptions {
  /** The fake "now" the tile's `new Date()` returns. Defaults to the real now. */
  now?: Date;
  /**
   * A shared store to mount against. Pass the store from a previous handle to model
   * REOPENING the same tile (rehydrate does this for you). Omit for a fresh tile.
   */
  store?: TileStore;
  /**
   * Max serialized bytes the host will accept on a single save before it replies
   * 'save:error' (mirrors useTileHost.ts dropping an over-cap / quota-full write).
   * Omit for no cap. Drives the save-rejected robustness path (finding #7).
   */
  saveCap?: number;
  /**
   * Swallow 'load' requests (never reply load:result), modelling a host whose reply is
   * dropped mid-flight. Drives the bridge's load fallback (a retry at 3s, null at ~6s):
   * the tile must still boot into its honest empty state instead of staying blank.
   */
  dropLoads?: boolean;
}

/** The host's in-memory store for ONE tile, shared across remounts (a rehydrate keeps
 *  it, exactly like the real host keeps a user's tile data across a close/reopen). */
export interface TileStore {
  data: unknown;
  /** true once anything has been saved (the real host returns [] for a never-saved tile;
   *  we return the stored data or undefined, and the tile coerces to []). */
  hasData: boolean;
}

export function createStore(): TileStore {
  return { data: undefined, hasData: false };
}

export interface TileHandle {
  win: any;
  /** The shared host store — pass to a later mount to rehydrate. */
  store: TileStore;
  /** Everything the tile has reported via Vitality.report(), in order. */
  reports: any[];
  /** Every payload the tile has saved via Vitality.save(), in order. */
  saves: unknown[];
  /** save:error replies the host sent back (the tile asked to save over the cap). */
  saveErrors: unknown[];
  /** The id of every 'load' request the tile posted, in order (dropped ones included) -
   *  lets a test see the bridge's retry and answer a request LATE with the real id. */
  loads: string[];
  /** Any error the tile threw at mount or during an interaction. */
  errors: unknown[];

  /** The parsed hero number (#value textContent). Strips a leading currency symbol and
   *  thousands separators; returns NaN for a '-'/empty resting state (use valueText for
   *  the raw string). */
  value(): number;
  /** The raw #value textContent, untouched (e.g. '-', '$50', '1'). */
  valueText(): string;
  /** The #section innerHTML (the chart / grid / empty-state). */
  section(): string;
  /** The status pill's text. */
  pillText(): string;

  /** Click a selector and settle. Throws a readable error if the selector is missing. */
  click(sel: string): Promise<void>;
  /** Set an input's value and fire an input event, then settle. */
  type(sel: string, val: string): Promise<void>;
  /** Let the DOM settle without interacting. */
  settle(): Promise<void>;

  /** Re-point the clock WITHOUT remounting (later renders/rehydrates see the new day). */
  setNow(date: Date): void;

  /**
   * Close and reopen the tile: unmount this window and mount a FRESH one that loads the
   * SAME store under the CURRENT clock. Models the user closing the tile and opening it
   * again (the next day, after a rollover). Returns a new handle.
   */
  rehydrate(): Promise<TileHandle>;

  /** Tear down the jsdom window. */
  close(): void;
}

/**
 * Mount a sealed tile HTML string in jsdom with the Vitality host mirrored in-memory.
 * Returns a rich handle. The clock is shimmed BEFORE the document parses, so the tile's
 * top-level `new Date()` (today(), last7(), streak()) sees opts.now.
 */
export function mountTile(html: string, opts: MountOptions = {}): TileHandle {
  const store = opts.store ?? createStore();
  const saveCap = opts.saveCap;
  // A mutable clock cell the Date shim reads on every construction, so setNow() re-points
  // the whole window's sense of "now" without a remount.
  const clock = { now: opts.now ? new Date(opts.now.getTime()) : new Date() };

  const errors: unknown[] = [];
  const reports: any[] = [];
  const saves: unknown[] = [];
  const saveErrors: unknown[] = [];
  const loads: string[] = [];

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => errors.push(String(e)));

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    // Shim Date before the tile script runs so `new Date()` == the fake clock.
    beforeParse(win: any) {
      const RealDate = win.Date;
      class FakeDate extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) super(clock.now.getTime());
          else super(...(args as []));
        }
        static now() {
          return clock.now.getTime();
        }
      }
      win.Date = FakeDate;
    },
  });

  const win: any = dom.window;
  win.addEventListener('error', (e: any) => errors.push(e.error || e.message));
  win.addEventListener('unhandledrejection', (e: any) => errors.push(e.reason || 'unhandledrejection'));

  // Act as the REAL Vitality host (mirror of lib/tiles/useTileHost.ts):
  //  - save   -> persist msg.data, unless over the cap (then reply save:error)
  //  - load   -> reply with the CURRENTLY STORED data (undefined coerces to [] in-tile)
  //  - report -> log the raw stream
  win.addEventListener('message', (e: any) => {
    const m = e.data;
    if (!m || m.source !== 'vitality-tile') return;
    if (m.type === 'save') {
      if (saveCap !== undefined) {
        let bytes = 0;
        try {
          bytes = JSON.stringify(m.data).length;
        } catch {
          bytes = Infinity;
        }
        if (bytes > saveCap) {
          saveErrors.push({ id: m.id, reason: 'too_large_or_full' });
          win.postMessage(
            { source: 'vitality-host', type: 'save:error', id: m.id, reason: 'too_large_or_full' },
            '*',
          );
          return;
        }
      }
      // Deep-clone so the store is a real persistence boundary, not a live reference the
      // tile keeps mutating (the real host serializes into storage). saves[] gets its own
      // clone too, so it is a faithful snapshot AT SAVE TIME (a later render mutating the
      // tile's live _days array can never retroactively change a recorded save).
      const snapshot = clone(m.data);
      store.data = snapshot;
      store.hasData = true;
      saves.push(snapshot);
      return;
    }
    if (m.type === 'load') {
      loads.push(String(m.id));
      // A dropped reply (opts.dropLoads): stay silent, so the bridge's own retry +
      // ~6s fallback is what boots the tile.
      if (opts.dropLoads) return;
      // Reply with the stored data. A never-saved tile gets undefined; the templates do
      // `Array.isArray(d)?d:[]`, so undefined boots an empty tile — same as the real host
      // returning [] for a fresh tile.
      win.postMessage(
        { source: 'vitality-host', type: 'load:result', id: m.id, data: store.hasData ? clone(store.data) : [] },
        '*',
      );
      return;
    }
    if (m.type === 'report') {
      reports.push(m.stream);
    }
  });

  const q = (sel: string): any => {
    const el = win.document.querySelector(sel);
    if (!el) throw new Error(`selector not found: ${sel}`);
    return el;
  };

  const handle: TileHandle = {
    win,
    store,
    reports,
    saves,
    saveErrors,
    loads,
    errors,
    valueText() {
      const doc = win.document;
      if (!doc) return '';
      const el = doc.getElementById('value');
      return el ? (el.textContent || '').trim() : '';
    },
    value() {
      const raw = handle.valueText();
      // strip a leading currency symbol / any non-numeric prefix, and thousands commas
      const cleaned = raw.replace(/,/g, '').replace(/[^\d.-]/g, (c) => (c === '.' || c === '-' ? c : ''));
      const n = parseFloat(cleaned);
      return Number.isFinite(n) ? n : NaN;
    },
    section() {
      const doc = win.document;
      if (!doc) return '';
      const el = doc.getElementById('section');
      return el ? el.innerHTML : '';
    },
    pillText() {
      const doc = win.document;
      if (!doc) return '';
      const el = doc.getElementById('status');
      return el ? (el.textContent || '').trim() : '';
    },
    async click(sel) {
      q(sel).click();
      await settle();
    },
    async type(sel, val) {
      const el = q(sel);
      el.value = val;
      el.dispatchEvent(new win.Event('input', { bubbles: true }));
      await settle();
    },
    async settle() {
      await settle();
    },
    setNow(date) {
      clock.now = new Date(date.getTime());
    },
    async rehydrate() {
      const nextHtml = html;
      handle.close();
      const next = mountTile(nextHtml, { now: clock.now, store, saveCap });
      await next.settle();
      return next;
    },
    close() {
      try {
        win.close();
      } catch {
        /* ignore */
      }
    },
  };

  return handle;
}

// A structured-clone-ish deep copy that survives across the jsdom boundary. The tile's
// saved data is plain JSON (arrays of {date,value}), so JSON round-trip is faithful and
// avoids holding a live reference into the tile's own array.
function clone<T>(v: T): T {
  if (v === undefined) return v;
  try {
    return JSON.parse(JSON.stringify(v));
  } catch {
    return v;
  }
}

/** Convenience: mount, settle the initial load->render round trip, return the handle. */
export async function mountReady(html: string, opts: MountOptions = {}): Promise<TileHandle> {
  const h = mountTile(html, opts);
  await h.settle();
  return h;
}

/** Build a local YYYY-MM-DD key for a Date, matching the templates' `key()` exactly, so
 *  a test can compute the date a tile will store under a given clock. */
export function localKey(d: Date): string {
  const pad = (n: number) => (n < 10 ? '0' : '') + n;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

/** A Date advanced by whole days from a base (local time), for rollover tests. */
export function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}
