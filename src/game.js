// ================= Deckuest (formerly Typing Quest) · turn-based deckbuilder roguelike =================
// The old real-time typing version is kept as index_realtime_backup.html next to this file.
// Saves live under "tq2-profiles" (the old "tq-profiles" save is left untouched).

// ---------- helpers ----------
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const rand = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const weightedIdx = ws => { let r = Math.random() * ws.reduce((a, b) => a + b, 0); const i = ws.findIndex(w => (r -= w) < 0); return i < 0 ? ws.length - 1 : i; };
const pc = x => Math.round(x * 100);
const fmtN = n => n >= 1e9 ? (n / 1e9).toFixed(1) + "B" : n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e4 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n * 100) / 100);
let uidSeq = 0;
const newUid = () => Date.now().toString(36) + (uidSeq++).toString(36);

let ui = "th";
try { ui = localStorage.getItem("tq-ui") || "th"; } catch {}
const t = (k, ...a) => { const v = I18N[ui][k]; return typeof v === "function" ? v(...a) : v ?? k; };
const tr = x => x && typeof x === "object" && !Array.isArray(x) ? x[ui] : Array.isArray(x) ? x[ui === "th" ? 0 : 1] : x;
const L = (th, en) => ui === "th" ? th : en;

// old UI strings whose meaning changed with the new game
Object.assign(I18N.th, {
  oneHand: "🖐 มือเดียว (ถือสองเล่มได้)", twoHand: "🙌 สองมือ (ปิดอีกมือ)", offhandShare: n => `🤚 อาวุธเล่มที่สอง (ค่าพลัง ${n}%)`,
  tagline: "เกมการ์ด roguelike · สร้างเด็ค ตีมอน เก็บอุปกรณ์ถาวร · ดวลกับเพื่อน",
  mPlayD: "เลือกโหมด: แผนที่ · หอคอยไร้สิ้นสุด · สนามจัดเด็ค · PvP · เนื้อเรื่อง",
  mshopHint: "ทองจากแต่ละ run เข้าคลังตอนจบ run · <kbd>1</kbd>–<kbd>8</kbd> เลือกพ่อค้า · <kbd>Esc</kbd> กลับเมนู",
  invStats: "📊 สถานะตอนเริ่ม run", invPotions: "ยาที่พกเข้า run",
  invNoneForSlot: "ยังไม่มีของช่องนี้ · ซื้อที่ร้านค้า หรือหาจาก elite/บอส",
  homeHint: "<kbd>↑</kbd> <kbd>↓</kbd> เลือก · <kbd>Enter</kbd> ตกลง",
});
Object.assign(I18N.en, {
  oneHand: "🖐 One-handed (can dual wield)", twoHand: "🙌 Two-handed (locks the other hand)", offhandShare: n => `🤚 Second weapon (${n}% stats)`,
  tagline: "A roguelike deckbuilder · build a deck, slay monsters, keep your gear, duel your friends",
  mPlayD: "Choose a mode: Map · Endless Tower · Deck Arena · PvP · Story",
  mshopHint: "Gold from a run is banked when it ends · <kbd>1</kbd>–<kbd>8</kbd> pick merchant · <kbd>Esc</kbd> back to menu",
  invStats: "📊 Stats at run start", invPotions: "Potions taken into a run",
  invNoneForSlot: "Nothing for this slot yet · buy it in the Shop or find it on elites/bosses",
});

function applyUi() {
  document.documentElement.lang = ui;
  document.querySelectorAll("[data-t]").forEach(el => el.innerHTML = t(el.dataset.t));
  document.querySelectorAll("[data-tp]").forEach(el => el.placeholder = t(el.dataset.tp));
  $("uiLang").textContent = ui === "th" ? "🌐 EN" : "🌐 ไทย";
}
function toggleUi() {
  ui = ui === "th" ? "en" : "th";
  try { localStorage.setItem("tq-ui", ui); } catch {}
  applyUi();
  rerender();
}
function rerender() {
  if (state === "home") goHome();
  else if (state === "profiles") renderProfiles();
  else if (state === "mshop") renderMShop();
  else if (state === "inv") renderInv();
  else if (state === "story") renderStory();
  else if (state === "run" || state === "combat") renderRun();
  if (pauseOpen) renderPause();
}

// version shown small on the home / profile screens and in the pause menu; bump it with every release
const GAME_VER = "1.2.1";

// ================= cards =================
// type: atk (attack) | skl (skill) | pow (power: stays in play for the fight). r: 0 starter/weapon, 1 common, 2 uncommon, 3 rare.
// effect fields: dmg (per hit), hits, all (every enemy), block, draw, en (energy), vuln / weak / burn (on the target, or every enemy with all),
// str (your Strength: +damage per hit), heal, hpCost, exhaust (once per fight), exec (x2 vs a target under 50% HP), bpt (power: Block every turn),
// dodge (stacks: each one makes an enemy hit miss), combo (+damage per card already played this turn), crit (extra crit chance), dpt (power: draw every turn).
// up = what the upgraded copy changes.
const CARDS = {
  strike: { ic: "⚔️", t: "Strike", type: "atk", r: 0, cost: 1, dmg: 6, up: { dmg: 9 } },
  defend: { ic: "🛡️", t: "Defend", type: "skl", r: 0, cost: 1, block: 5, up: { block: 8 } },
  bash: { ic: "🔨", t: "Bash", type: "atk", r: 0, cost: 2, dmg: 8, vuln: 2, up: { dmg: 10, vuln: 3 } },
  // weapon cards: the worn main weapon adds its card to the starting deck
  w_slash: { ic: "🗡️", t: "Iron Slash", type: "atk", r: 0, cost: 1, dmg: 8, up: { dmg: 11 } },
  w_twin: { ic: "⚔️", t: "Steel Flurry", tag: "duelist", type: "atk", r: 0, cost: 1, dmg: 4, hits: 2, up: { dmg: 6 } },
  w_cleave: { ic: "🪓", t: "Cleave", tag: "berserker", type: "atk", r: 0, cost: 2, dmg: 9, all: 1, up: { dmg: 12 } },
  w_bolt: { ic: "🪄", t: "Arcane Bolt", tag: "sorcerer", type: "atk", r: 0, cost: 1, dmg: 6, burn: 3, draw: 1, up: { dmg: 9, burn: 4 } },
  w_stab: { ic: "🔪", t: "Shadow Stab", tag: "duelist", type: "atk", r: 0, cost: 0, dmg: 4, up: { dmg: 6 } },
  w_flame: { ic: "🔥", t: "Flame Strike", tag: "sorcerer", type: "atk", r: 0, cost: 1, dmg: 6, burn: 3, up: { dmg: 8, burn: 4 } },
  w_fang: { ic: "🐉", t: "Dragon Fang", tag: "berserker", type: "atk", r: 0, cost: 2, dmg: 18, up: { dmg: 24 } },
  w_king: { ic: "👑", t: "Kingly Blow", tag: "cleric", type: "atk", r: 0, cost: 1, dmg: 9, block: 4, up: { dmg: 12, block: 5 } },
  // common
  heavy: { ic: "🪨", t: "Heavy Blow", tag: "berserker", type: "atk", r: 1, cost: 2, dmg: 14, up: { dmg: 19 } },
  twin: { ic: "✌️", t: "Twin Strike", tag: "duelist", type: "atk", r: 1, cost: 1, dmg: 4, hits: 2, up: { dmg: 6 } },
  sbash: { ic: "🛡️", t: "Shield Bash", tag: "guardian", type: "atk", r: 1, cost: 1, dmg: 5, block: 5, up: { dmg: 7, block: 7 } },
  brace: { ic: "🧱", t: "Brace", tag: "guardian", type: "skl", r: 1, cost: 1, block: 8, up: { block: 11 } },
  quick: { ic: "💨", t: "Quick Slash", tag: "duelist", type: "atk", r: 1, cost: 0, dmg: 3, draw: 1, up: { dmg: 5 } },
  expose: { ic: "🎯", t: "Expose", type: "atk", r: 1, cost: 1, dmg: 4, vuln: 2, up: { dmg: 6, vuln: 3 } },
  cripple: { ic: "🥀", t: "Cripple", type: "skl", r: 1, cost: 1, weak: 2, block: 4, up: { weak: 3, block: 6 } },
  sweep: { ic: "🌪️", t: "Sweep", type: "atk", r: 1, cost: 1, dmg: 5, all: 1, up: { dmg: 7 } },
  think: { ic: "💭", t: "Second Thought", tag: "sorcerer", type: "skl", r: 1, cost: 1, draw: 2, up: { draw: 3 } },
  ember: { ic: "🕯️", t: "Ember", tag: "sorcerer", type: "skl", r: 1, cost: 1, burn: 5, up: { burn: 7 } },
  // uncommon
  whirl: { ic: "🌀", t: "Whirlwind", tag: "berserker", type: "atk", r: 2, cost: 2, dmg: 8, all: 1, up: { dmg: 11 } },
  wall: { ic: "🏰", t: "Iron Wall", tag: "guardian", type: "skl", r: 2, cost: 2, block: 15, up: { block: 20 } },
  cry: { ic: "📯", t: "Battle Cry", type: "pow", r: 2, cost: 1, str: 2, up: { str: 3 } },
  adren: { ic: "⚡", t: "Adrenaline", tag: "sorcerer", type: "skl", r: 2, cost: 0, en: 1, draw: 1, exhaust: 1, up: { en: 2 } },
  riposte: { ic: "🤺", t: "Riposte", tag: "guardian", type: "atk", r: 2, cost: 2, dmg: 8, block: 8, up: { dmg: 11, block: 10 } },
  wildfire: { ic: "🔥", t: "Wildfire", tag: "sorcerer", type: "skl", r: 2, cost: 2, burn: 6, all: 1, up: { burn: 8 } },
  blood: { ic: "🩸", t: "Bloodletting", type: "skl", r: 2, cost: 0, hpCost: 3, en: 2, up: { en: 3 } },
  drain: { ic: "🦇", t: "Life Drain", tag: "cleric", type: "atk", r: 2, cost: 2, dmg: 11, heal: 5, up: { dmg: 14, heal: 7 } },
  fort: { ic: "🏯", t: "Fortify", tag: "guardian", type: "pow", r: 2, cost: 1, bpt: 3, up: { bpt: 5 } },
  flurry: { ic: "🌠", t: "Flurry", tag: "duelist", type: "atk", r: 2, cost: 1, dmg: 2, hits: 4, up: { dmg: 3 } },
  // rare
  exec: { ic: "⚰️", t: "Execute", tag: "berserker", type: "atk", r: 3, cost: 2, dmg: 12, exec: 1, up: { dmg: 16 } },
  meteor: { ic: "☄️", t: "Meteor", tag: "berserker", type: "atk", r: 3, cost: 3, dmg: 30, up: { dmg: 40 } },
  bulwark: { ic: "⛰️", t: "Bulwark", tag: "guardian", type: "skl", r: 3, cost: 2, block: 22, up: { block: 30 } },
  berserk: { ic: "😤", t: "Berserk", type: "pow", r: 3, cost: 1, str: 3, hpCost: 5, up: { str: 4 } },
  inferno: { ic: "🌋", t: "Inferno", tag: "sorcerer", type: "atk", r: 3, cost: 2, dmg: 8, all: 1, burn: 4, up: { dmg: 11, burn: 5 } },
  // themed cards: only offered while you wear gear of that theme
  d_double: { ic: "⚔️", t: "Double Strike", tag: "duelist", only: 1, type: "atk", r: 1, cost: 1, dmg: 5, hits: 2, up: { dmg: 7 } },
  d_cross: { ic: "❌", t: "Cross Cut", tag: "duelist", only: 1, type: "atk", r: 2, cost: 1, dmg: 4, hits: 2, weak: 1, up: { dmg: 6 } },
  d_dance: { ic: "💃", t: "Blade Dance", tag: "duelist", only: 1, type: "atk", r: 2, cost: 2, dmg: 3, hits: 5, up: { dmg: 4 } },
  d_fury: { ic: "🌪️", t: "Twin Fury", tag: "duelist", only: 1, type: "atk", r: 3, cost: 2, dmg: 5, hits: 4, up: { dmg: 7 } },
  s_wall: { ic: "🛡️", t: "Shield Wall", tag: "guardian", only: 1, type: "skl", r: 1, cost: 1, block: 7, draw: 1, up: { block: 10 } },
  s_slam: { ic: "💥", t: "Shield Slam", tag: "guardian", only: 1, type: "atk", r: 2, cost: 1, slam: 1, up: { cost: 0 } },
  s_bastion: { ic: "🏰", t: "Bastion", tag: "guardian", only: 1, type: "pow", r: 3, cost: 2, bpt: 6, up: { bpt: 9 } },
  h_over: { ic: "🪓", t: "Overhead Chop", tag: "berserker", only: 1, type: "atk", r: 1, cost: 2, dmg: 18, up: { dmg: 24 } },
  h_crush: { ic: "🔨", t: "Crushing Blow", tag: "berserker", only: 1, type: "atk", r: 2, cost: 3, dmg: 26, vuln: 2, up: { dmg: 34 } },
  h_quake: { ic: "🌋", t: "Earthquake", tag: "berserker", only: 1, type: "atk", r: 3, cost: 3, dmg: 16, all: 1, weak: 2, up: { dmg: 22 } },
  m_insight: { ic: "🔮", t: "Insight", tag: "sorcerer", only: 1, type: "skl", r: 1, cost: 0, draw: 2, exhaust: 1, up: { draw: 3 } },
  m_surge: { ic: "💠", t: "Mana Surge", tag: "sorcerer", only: 1, type: "skl", r: 2, cost: 0, en: 2, exhaust: 1, up: { en: 2, draw: 1 } },
  m_blast: { ic: "✴️", t: "Arcane Blast", tag: "sorcerer", only: 1, type: "atk", r: 3, cost: 2, dmg: 18, draw: 2, up: { dmg: 24 } },
  f_sear: { ic: "♨️", t: "Searing Strike", tag: "sorcerer", only: 1, type: "atk", r: 1, cost: 1, dmg: 6, burn: 4, up: { dmg: 8, burn: 5 } },
  f_ball: { ic: "☄️", t: "Fireball", tag: "sorcerer", only: 1, type: "atk", r: 2, cost: 2, dmg: 10, all: 1, burn: 3, up: { dmg: 13, burn: 4 } },
  f_phoenix: { ic: "🦅", t: "Phoenix Flame", tag: "sorcerer", only: 1, type: "atk", r: 3, cost: 2, dmg: 14, burn: 8, heal: 4, up: { dmg: 18, burn: 10 } },
  o_smite: { ic: "🌟", t: "Holy Smite", tag: "cleric", only: 1, type: "atk", r: 1, cost: 1, dmg: 8, heal: 3, up: { dmg: 11, heal: 4 } },
  o_bless: { ic: "🙏", t: "Blessing", tag: "cleric", only: 1, type: "skl", r: 2, cost: 1, block: 8, heal: 4, up: { block: 11, heal: 6 } },
  o_light: { ic: "☀️", t: "Divine Light", tag: "cleric", only: 1, type: "atk", r: 3, cost: 2, dmg: 12, all: 1, heal: 8, exhaust: 1, up: { dmg: 16 } },
  // weapon cards of the class weapons (r: 0, never offered as rewards)
  w_hammer: { ic: "🔨", t: "Skullcrack", tag: "berserker", type: "atk", r: 0, cost: 2, dmg: 13, weak: 1, up: { dmg: 17 } },
  w_lunge: { ic: "🤺", t: "Lunge", tag: "duelist", type: "atk", r: 0, cost: 1, dmg: 7, crit: 0.25, up: { dmg: 10 } },
  w_missile: { ic: "✨", t: "Arcane Missiles", tag: "sorcerer", type: "atk", r: 0, cost: 1, dmg: 3, hits: 3, up: { dmg: 4 } },
  w_star: { ic: "🌠", t: "Starfall", tag: "sorcerer", type: "atk", r: 0, cost: 2, dmg: 9, all: 1, burn: 3, draw: 1, up: { dmg: 12 } },
  w_judge: { ic: "⚖️", t: "Judgement", tag: "cleric", type: "atk", r: 0, cost: 1, dmg: 8, heal: 2, up: { dmg: 11, heal: 3 } },
  w_radiance: { ic: "🔆", t: "Radiance", tag: "cleric", type: "atk", r: 0, cost: 2, dmg: 10, all: 1, heal: 5, up: { dmg: 13, heal: 7 } },
  w_oath: { ic: "🎖️", t: "Knight's Oath", tag: "guardian", type: "atk", r: 0, cost: 1, dmg: 6, block: 6, up: { dmg: 8, block: 8 } },
  w_aegis: { ic: "⚜️", t: "Aegis Strike", tag: "guardian", type: "atk", r: 0, cost: 2, dmg: 10, block: 10, up: { dmg: 13, block: 13 } },
  w_hunt: { ic: "🏹", t: "Hunter's Shot", tag: "ranger", type: "atk", r: 0, cost: 1, dmg: 10, up: { dmg: 13 } },
  w_long: { ic: "🎯", t: "Long Shot", tag: "ranger", type: "atk", r: 0, cost: 2, dmg: 15, vuln: 1, up: { dmg: 20 } },
  w_comp: { ic: "🏹", t: "Twin Arrows", tag: "ranger", type: "atk", r: 0, cost: 1, dmg: 5, hits: 2, up: { dmg: 7 } },
  w_gale: { ic: "🌬️", t: "Gale Arrow", tag: "ranger", type: "atk", r: 0, cost: 1, dmg: 6, all: 1, dodge: 1, up: { dmg: 8 } },
  sh_parry: { ic: "🤺", t: "Parry", tag: "guardian", type: "skl", r: 0, cost: 1, block: 7, weak: 1, up: { block: 10 } },
  sh_fort: { ic: "🏯", t: "Fortress Stance", tag: "guardian", type: "skl", r: 0, cost: 2, block: 14, draw: 1, up: { block: 19 } },
  r_prayer: { ic: "🪬", t: "Prayer", tag: "cleric", type: "skl", r: 0, cost: 1, heal: 5, block: 5, up: { heal: 7, block: 7 } },
  // Ranger (bows)
  r_aim: { ic: "🎯", t: "Aimed Shot", tag: "ranger", only: 1, type: "atk", r: 1, cost: 1, dmg: 9, vuln: 1, up: { dmg: 12 } },
  r_volley: { ic: "🏹", t: "Arrow Volley", tag: "ranger", only: 1, type: "atk", r: 1, cost: 1, dmg: 4, all: 1, up: { dmg: 6 } },
  r_roll: { ic: "🌀", t: "Evasive Roll", tag: "ranger", only: 1, type: "skl", r: 1, cost: 1, block: 4, dodge: 1, up: { block: 7 } },
  r_pin: { ic: "📌", t: "Pinning Shot", tag: "ranger", only: 1, type: "atk", r: 2, cost: 1, dmg: 6, weak: 2, up: { dmg: 9 } },
  r_rain: { ic: "🌧️", t: "Arrow Rain", tag: "ranger", only: 1, type: "atk", r: 2, cost: 2, dmg: 5, hits: 2, all: 1, up: { dmg: 7 } },
  r_wind: { ic: "🍃", t: "Wind Step", tag: "ranger", only: 1, type: "skl", r: 3, cost: 1, dodge: 2, draw: 2, exhaust: 1, up: { dodge: 3 } },
  r_heart: { ic: "💘", t: "Heartseeker", tag: "ranger", only: 1, type: "atk", r: 3, cost: 2, dmg: 18, exec: 1, up: { dmg: 24 } },
  // Martial (empty hands): combo = +damage per card already played this turn
  m_palm: { ic: "✋", t: "Palm Strike", tag: "martial", type: "atk", r: 0, cost: 0, dmg: 4, combo: 1, up: { dmg: 6 } },
  m_guard: { ic: "🙌", t: "Flowing Guard", tag: "martial", type: "skl", r: 0, cost: 1, block: 6, draw: 1, up: { block: 9 } },
  m_jab: { ic: "👊", t: "Jab", tag: "martial", only: 1, type: "atk", r: 1, cost: 0, dmg: 3, up: { dmg: 5 } },
  m_kick: { ic: "🦵", t: "Roundhouse", tag: "martial", only: 1, type: "atk", r: 1, cost: 1, dmg: 6, all: 1, up: { dmg: 8 } },
  m_fists: { ic: "🤜", t: "Hundred Fists", tag: "martial", only: 1, type: "atk", r: 2, cost: 1, dmg: 2, hits: 3, combo: 1, up: { dmg: 3 } },
  m_focus: { ic: "🧘", t: "Inner Focus", tag: "martial", only: 1, type: "skl", r: 2, cost: 0, en: 1, str: 1, exhaust: 1, up: { str: 2 } },
  m_counter: { ic: "🥋", t: "Counter Stance", tag: "martial", only: 1, type: "skl", r: 2, cost: 1, block: 7, dodge: 1, up: { block: 10 } },
  m_dragon: { ic: "🐲", t: "Dragon Palm", tag: "martial", only: 1, type: "atk", r: 3, cost: 2, dmg: 12, combo: 3, up: { dmg: 16 } },
  m_zen: { ic: "☯️", t: "Zen Mind", tag: "martial", only: 1, type: "pow", r: 3, cost: 1, dpt: 1, up: { cost: 0 } },
  mend: { ic: "💚", t: "Second Wind", tag: "cleric", type: "skl", r: 3, cost: 1, heal: 12, exhaust: 1, up: { heal: 18 } },
  // kept hand: grow = stronger each turn the card stays in hand · onDisc = fires when discarded from hand
  patient: { ic: "⏳", t: "Patient Strike", type: "atk", r: 1, cost: 1, dmg: 5, grow: 3, up: { dmg: 7, grow: 4 } },
  steady: { ic: "🪵", t: "Steady Guard", tag: "guardian", type: "skl", r: 1, cost: 1, block: 5, grow: 3, up: { block: 7, grow: 4 } },
  shuffle: { ic: "🔄", t: "Tactical Shuffle", type: "skl", r: 1, cost: 0, refresh: 1, up: { draw: 1 } },
  decoy: { ic: "🎭", t: "Decoy", type: "skl", r: 2, cost: 1, block: 6, onDisc: { block: 8 }, up: { block: 9, onDisc: { block: 11 } } },
  hoard: { ic: "🎒", t: "Hoard", type: "pow", r: 3, cost: 1, handUp: 1, draw: 1, up: { cost: 0 } },
  d_knife: { ic: "🔪", t: "Throwing Knife", tag: "duelist", only: 1, type: "atk", r: 1, cost: 1, dmg: 6, onDisc: { dmg: 8 }, up: { dmg: 8, onDisc: { dmg: 11 } } },
  r_smoke: { ic: "💨", t: "Smoke Bomb", tag: "ranger", only: 1, type: "skl", r: 2, cost: 1, block: 5, dodge: 1, onDisc: { dodge: 1 }, up: { block: 8 } },
  m_charge: { ic: "🔋", t: "Charged Bolt", tag: "sorcerer", only: 1, type: "atk", r: 2, cost: 2, dmg: 10, grow: 6, up: { dmg: 14, grow: 7 } },
  h_rage: { ic: "😠", t: "Building Rage", tag: "berserker", only: 1, type: "atk", r: 2, cost: 2, dmg: 12, grow: 6, up: { dmg: 16, grow: 8 } },
  m_coil: { ic: "🌀", t: "Coiled Fist", tag: "martial", only: 1, type: "atk", r: 2, cost: 0, dmg: 3, grow: 3, up: { dmg: 5, grow: 4 } },
  // Gambler: lone = +% damage per EMPTY hand slot when the card is played (fewer cards in hand = more damage)
  g_ace: { ic: "🂡", t: "Ace Strike", tag: "gambler", type: "atk", r: 0, cost: 1, dmg: 8, lone: 0.25, up: { dmg: 11, lone: 0.3 } },
  g_dice: { ic: "🎲", t: "Loaded Throw", tag: "gambler", type: "atk", r: 0, cost: 1, dmg: 8, lone: 0.25, up: { dmg: 11, lone: 0.3 } },
  g_razor: { ic: "🎴", t: "Razor Card", tag: "gambler", type: "atk", r: 0, cost: 1, dmg: 5, hits: 2, lone: 0.2, up: { dmg: 7, lone: 0.25 } },
  g_royal: { ic: "♠️", t: "Royal Flush", tag: "gambler", type: "atk", r: 0, cost: 2, dmg: 16, lone: 0.3, up: { dmg: 22, lone: 0.35 } },
  g_snake: { ic: "🐍", t: "Snake Eyes", tag: "gambler", only: 1, type: "atk", r: 1, cost: 0, dmg: 4, lone: 0.3, up: { dmg: 6, lone: 0.35 } },
  g_fold: { ic: "🏳️", t: "Fold", tag: "gambler", only: 1, type: "skl", r: 1, cost: 0, dump: 1, draw: 2, up: { draw: 3 } },
  g_bluff: { ic: "🎭", t: "Bluff", tag: "gambler", only: 1, type: "skl", r: 1, cost: 1, block: 6, onDisc: { dmg: 5 }, up: { block: 9, onDisc: { dmg: 7 } } },
  g_pitch: { ic: "🃏", t: "Pitch the Hand", tag: "gambler", only: 1, type: "atk", r: 2, cost: 1, dump: 1, dumpDmg: 5, up: { dumpDmg: 7 } },
  g_allin: { ic: "💰", t: "All In", tag: "gambler", only: 1, type: "atk", r: 2, cost: 1, dmg: 8, lone: 0.5, up: { dmg: 11, lone: 0.6 } },
  g_ante: { ic: "🪙", t: "Ante Up", tag: "gambler", only: 1, type: "pow", r: 2, cost: 1, loneAll: 0.1, up: { cost: 0 } },
  g_jackpot: { ic: "🎰", t: "Jackpot", tag: "gambler", only: 1, type: "atk", r: 3, cost: 2, dmg: 12, lone: 0.6, up: { dmg: 16, lone: 0.75 } },
  o_vigil: { ic: "🕯️", t: "Vigil", tag: "cleric", only: 1, type: "skl", r: 2, cost: 1, block: 4, heal: 3, grow: 2, up: { block: 6, heal: 4, grow: 3 } },
};
const CARD_RC = ["#b8b8c8", "#b8b8c8", "#4da3ff", "#ffb020"];
const CARD_RN = ["Starter", "Common", "Uncommon", "Rare"];
const cardOf = c => { const d = CARDS[c.id]; return c.up ? { ...d, ...d.up, upgraded: true } : d; };
const cardName = c => CARDS[c.id].t + (c.up ? "+" : "");
const POOL = r => Object.keys(CARDS).filter(id => CARDS[id].r === r && !CARDS[id].only); // cards anyone can find
// classes: weapons and off-hand items carry one; held classes make their cards show up more often (and unlock their "only" cards)
const THEMES = {
  berserker: { ic: "🪓", n: ["Berserker", "Berserker"], d: ["ตีแรง · Vulnerable", "big hits · Vulnerable"] },
  duelist: { ic: "⚔️", n: ["Duelist", "Duelist"], d: ["ตีหลายครั้ง · Crit", "multi-hit · crit"] },
  sorcerer: { ic: "🔮", n: ["Sorcerer", "Sorcerer"], d: ["Burn · จั่ว/⚡", "Burn · draw/⚡"] },
  cleric: { ic: "✨", n: ["Cleric", "Cleric"], d: ["ฟื้น HP", "healing"] },
  guardian: { ic: "🛡️", n: ["Guardian", "Guardian"], d: ["Block", "Block"] },
  ranger: { ic: "🏹", n: ["Ranger", "Ranger"], d: ["ยิงทุกตัว · หลบ", "volleys · dodge"] },
  gambler: { ic: "🎲", n: ["Gambler", "Gambler"], d: ["ไพ่ในมือน้อย = ดาเมจทวี", "fewer cards in hand = more damage"] },
  martial: { ic: "🥋", n: ["มือเปล่า", "Martial Artist"], d: ["Combo · 0⚡", "combo · 0⚡"] },
};
const themeChip = (tag, n) => `<span class="lchip theme">${THEMES[tag].ic} ${tr(THEMES[tag].n)}${n > 1 ? " ×" + n : ""} <small>· ${tr(THEMES[tag].d)}</small></span>`;
const TYPE_N = { atk: ["โจมตี", "Attack"], skl: ["สกิล", "Skill"], pow: ["พลัง", "Power"] };

// one card's effect text; fx = live numbers (damage after Strength, gear and the target's state) while in a fight
function cardDesc(d, fx) {
  const p = [], all = d.all ? L(" ทุกตัว", " to ALL") : "";
  if (d.dmg) {
    const v = fx ? fx.dmg : d.dmg, cls = fx && v > d.dmg ? "up" : fx && v < d.dmg ? "down" : "";
    p.push(L("ดาเมจ ", "Deal ") + `<b class="${cls}">${v}</b>` + (d.hits > 1 ? "×" + d.hits : "") + all);
  }
  if (d.slam) p.push(L("ดาเมจเท่ากับ Block ที่มี", "Deal damage equal to your Block") + (fx ? ` (<b class="${fx.dmg ? "up" : "down"}">${fx.dmg}</b>)` : ""));
  if (d.block) { const v = fx ? fx.block : d.block; p.push(L("Block ", "Block ") + `<b class="${fx && v > d.block ? "up" : ""}">${v}</b>`); }
  if (d.vuln) p.push(`💢 Vulnerable ${d.vuln}` + (d.dmg ? "" : all));
  if (d.weak) p.push(`🥀 Weak ${d.weak}` + (d.dmg ? "" : all));
  if (d.burn) p.push(`🔥 Burn ${d.burn}` + (d.dmg && d.all ? "" : d.all ? all : ""));
  if (d.combo) p.push(L(`+${d.combo} ต่อการ์ดที่เล่นก่อนหน้าในเทิร์น`, `+${d.combo} per card played earlier this turn`));
  if (d.crit) p.push(`Crit +${pc(d.crit)}%`);
  if (d.dodge) p.push(`🌬️ ${L("หลบ", "Dodge")} ${d.dodge}`);
  if (d.exec) p.push(L("x2 ถ้าเป้า HP < 50%", "x2 vs targets under 50% HP"));
  if (d.grow) p.push(L(`⏳ สะสม +${d.grow} ทุกเทิร์นที่ถือไว้`, `⏳ +${d.grow} each turn you keep it`) + (fx && fx.held ? ` <b class="up">(+${d.grow * fx.held})</b>` : ""));
  if (d.lone) p.push(L(`🎲 ดาเมจ +${Math.round(d.lone * 100)}% ต่อช่องว่างในมือ`, `🎲 +${Math.round(d.lone * 100)}% damage per empty hand slot`));
  if (d.loneAll) p.push(L(`🪙 การ์ดโจมตีทุกใบ +${Math.round(d.loneAll * 100)}% ต่อช่องว่างในมือ (ไฟต์นี้)`, `🪙 all attacks +${Math.round(d.loneAll * 100)}% per empty hand slot (this fight)`));
  if (d.dump) p.push(L("ทิ้งการ์ดที่เหลือในมือทั้งหมด", "Discard your whole hand") + (d.dumpDmg ? L(` · ใบละ ${d.dumpDmg} ดาเมจใส่ศัตรูสุ่ม`, ` · ${d.dumpDmg} damage to a random enemy per card`) : ""));
  if (d.onDisc) { const o = d.onDisc; p.push(L("🗑️ ถ้าถูกทิ้ง: ", "🗑️ If discarded: ") + [o.dmg && L(`ดาเมจ ${o.dmg} ใส่ศัตรูสุ่ม`, `${o.dmg} damage to a random enemy`), o.block && `Block ${o.block}`, o.dodge && `🌬️ ${L("หลบ", "Dodge")} ${o.dodge}`].filter(Boolean).join(" · ")); }
  if (d.refresh) p.push(L("ทิ้งการ์ดที่เหลือในมือ แล้วจั่วเท่าจำนวนนั้น", "Discard the rest of your hand, draw that many"));
  if (d.handUp) p.push(L(`ถือการ์ดได้ +${d.handUp} ใบ (ไฟต์นี้)`, `Hand limit +${d.handUp} (this fight)`));
  if (d.draw) p.push(L(`จั่ว ${d.draw}`, `Draw ${d.draw}`));
  if (d.en) p.push(`+${d.en} ⚡`);
  if (d.str) p.push(`+${d.str} 💪 Strength`);
  if (d.heal) p.push(L(`ฟื้น ${d.heal} HP`, `Heal ${d.heal} HP`));
  if (d.hpCost) p.push(L(`เสีย ${d.hpCost} HP`, `Lose ${d.hpCost} HP`));
  if (d.bpt) p.push(L(`ทุกเทิร์น: Block ${d.bpt}`, `Every turn: ${d.bpt} Block`));
  if (d.dpt) p.push(L(`ทุกเทิร์น: จั่ว +${d.dpt}`, `Every turn: draw +${d.dpt}`));
  if (d.exhaust) p.push(`<i>Exhaust</i>`);
  return p.join(" · ");
}
// a card face. extra: { cls, attrs, fx, key, price }
function cardHtml(c, x = {}) {
  const d = cardFx(c, x.st !== undefined ? x.st : run && run.st);
  const syn = d.tag && run && run.st && run.st.tags && run.st.tags[d.tag];
  return `<div class="hc ${d.type}${x.cls ? " " + x.cls : ""}${c.up ? " upg" : ""}${syn ? " syn" : ""}" style="--rc:${CARD_RC[d.r]}"${x.attrs || ""}>` +
    `<div class="cc">${x.cost ?? d.cost}</div><div class="ci">${d.ic}</div><div class="cn">${esc(cardName(c))}</div>` +
    `<div class="ct">${tr(TYPE_N[d.type])} · ${CARD_RN[d.r]}${d.tag ? " · " + THEMES[d.tag].ic : ""}${d.lv > 1 ? ` · <b class="clv">Lv${d.lv}</b>` : ""}</div><div class="cd">${cardDesc(d, x.fx)}</div>` +
    (syn ? `<div class="synb" title="${esc(tr(THEMES[d.tag].n))}">🔗</div>` : "") +
    (x.price != null ? `<div class="cp">💰 ${x.price}</div>` : "") + (x.key ? `<kbd class="k">${x.key}</kbd>` : "") + (x.badge || "") + `</div>`;
}

// ================= gear (permanent, kept across runs) =================
// stat fields: atk = +damage %, crit = crit chance, critMult = crit damage, hp = max HP, def = +Block %, leech = HP per attack card,
// heavy = +damage % on cards costing 2+, combo = +damage % per earlier attack card this turn, luck = better card rewards,
// goldMult = +gold %, startBlock = Block at the start of every fight, drawFirst = extra cards on turn 1,
// killHeal = share of max HP healed after each won fight.
// req = minimum stats, e.g. { str: 16, vit: 8 }: below it the item gives less (down to REQ_FLOOR) and its class cards weaken.
// sc = scaling grades (S..D): how a weapon turns stats into power for its class cards and Strike/Defend.
// tag = class. card = the card it adds to the starting deck. hands: 1 = one-handed (two of them = dual wield), 2 = both hands.
const WEAPONS = [
  // starters: free, one per class (Martial has none), never sold
  { id: "st_axe", starter: true, tag: "berserker", req: { str: 8 }, sc: { str: "B" }, ic: "🪓", t: "Woodcutter's Axe", price: 0, hands: 2, atk: 0.08, card: "h_over" },
  { id: "st_knives", starter: true, tag: "duelist", req: { dex: 8 }, sc: { dex: "B" }, ic: "🔪", t: "Twin Knives", price: 0, hands: 1, crit: 0.04, card: "d_double" },
  { id: "st_wand", starter: true, tag: "sorcerer", req: { int: 8 }, sc: { int: "B" }, ic: "🪄", t: "Apprentice Wand", price: 0, hands: 1, atk: 0.04, card: "w_bolt" },
  { id: "st_pilgrim", starter: true, tag: "cleric", req: { fai: 8 }, sc: { fai: "B" }, ic: "🦯", t: "Pilgrim's Staff", price: 0, hands: 2, hp: 8, atk: 0.05, card: "o_smite" },
  { id: "st_sword", starter: true, tag: "guardian", req: { vit: 8 }, sc: { vit: "B" }, ic: "🗡️", t: "Militia Sword", price: 0, hands: 1, card: "s_wall" },
  { id: "st_bow", starter: true, tag: "ranger", req: { agi: 8 }, sc: { agi: "B" }, ic: "🏹", t: "Hunting Bow", price: 0, hands: 2, atk: 0.05, crit: 0.06, card: "w_hunt" },
  // Berserker · STR
  { id: "greatsword", tag: "berserker", req: { str: 12 }, sc: { str: "B" }, ic: "🗡", t: "Greatsword", price: 450, hands: 2, atk: 0.15, crit: 0.02, card: "w_cleave" },
  { id: "hammer", tag: "berserker", req: { str: 16, vit: 8 }, sc: { str: "B", vit: "D" }, ic: "🔨", t: "War Hammer", price: 1200, hands: 2, atk: 0.3, hp: 10, card: "w_hammer" },
  { id: "dragon", tag: "berserker", req: { str: 22, agi: 10 }, sc: { str: "A", agi: "D" }, ic: "🐉", t: "Dragon Slayer", price: 3000, hands: 2, atk: 0.5, crit: 0.06, card: "w_fang" },
  // Duelist · DEX
  { id: "steel", tag: "duelist", req: { dex: 10, agi: 6 }, sc: { dex: "B", agi: "D" }, ic: "⚔️", t: "Steel Blade", price: 400, hands: 1, atk: 0.1, crit: 0.02, card: "w_twin" },
  { id: "rapier", tag: "duelist", req: { dex: 14, agi: 10 }, sc: { dex: "A", agi: "D" }, ic: "🤺", t: "Rapier", price: 1100, hands: 1, atk: 0.15, crit: 0.06, card: "w_lunge" },
  { id: "daggers", tag: "duelist", req: { dex: 20, agi: 14 }, sc: { dex: "A", agi: "C" }, ic: "🔪", t: "Shadow Dagger", price: 2600, hands: 1, crit: 0.12, critMult: 2.5, card: "w_stab" },
  // Sorcerer · INT
  { id: "staff", tag: "sorcerer", req: { int: 12 }, sc: { int: "B" }, ic: "🪄", t: "Arcane Staff", price: 450, hands: 2, atk: 0.12, heavy: 0.2, card: "w_missile" },
  { id: "flame", tag: "sorcerer", req: { int: 14, str: 6 }, sc: { int: "B", str: "D" }, ic: "🔥", t: "Ember Rod", price: 1200, hands: 1, atk: 0.2, crit: 0.03, card: "w_flame" },
  { id: "archstaff", tag: "sorcerer", req: { int: 20, fai: 8 }, sc: { int: "A", fai: "D" }, ic: "🌟", t: "Archmage Staff", price: 2800, hands: 2, atk: 0.35, heavy: 0.3, card: "w_star" },
  // Cleric · FAI
  { id: "mace", tag: "cleric", req: { fai: 10, str: 8 }, sc: { fai: "B", str: "D" }, ic: "⚒️", t: "Blessed Mace", price: 450, hands: 1, atk: 0.1, hp: 10, card: "w_judge" },
  { id: "q_anvil", story: true, tag: "cleric", req: { fai: 12, str: 10 }, sc: { fai: "B", str: "C" }, ic: "🗡️", t: "Sword of the Anvil", price: 800, hands: 1, atk: 0.25, crit: 0.04, card: "w_king", lore: { th: "ดาบที่อาเธอร์ดึงออกจากทั่งและหินอ่อน", en: "The sword Arthur drew from the anvil and the marble stone" } },
  { id: "scepter", tag: "cleric", req: { fai: 20, int: 8 }, sc: { fai: "A", int: "D" }, ic: "🔆", t: "Holy Scepter", price: 2700, hands: 1, atk: 0.25, killHeal: 0.05, card: "w_radiance" },
  // Guardian · VIT
  { id: "iron", tag: "guardian", req: { vit: 10, str: 6 }, sc: { vit: "B", str: "D" }, ic: "🗡️", t: "Iron Sword", price: 400, hands: 1, atk: 0.08, hp: 10, card: "w_slash" },
  { id: "knight", tag: "guardian", req: { vit: 14, str: 10 }, sc: { vit: "B", str: "C" }, ic: "🎖️", t: "Knight's Sword", price: 1100, hands: 1, atk: 0.15, def: 0.05, card: "w_oath" },
  { id: "paladin", tag: "guardian", req: { vit: 18, fai: 10 }, sc: { vit: "A", fai: "D" }, ic: "⚜️", t: "Paladin Blade", price: 2700, hands: 1, atk: 0.25, def: 0.08, hp: 20, card: "w_aegis" },
  // Ranger · AGI
  { id: "longbow", tag: "ranger", req: { agi: 10, dex: 6 }, sc: { agi: "B", dex: "D" }, ic: "🏹", t: "Longbow", price: 450, hands: 2, atk: 0.12, crit: 0.03, card: "w_long" },
  { id: "compbow", tag: "ranger", req: { agi: 14, str: 8 }, sc: { agi: "B", str: "D" }, ic: "🏹", t: "Composite Bow", price: 1200, hands: 2, atk: 0.25, crit: 0.04, card: "w_comp" },
  { id: "windbow", tag: "ranger", req: { agi: 20, dex: 12 }, sc: { agi: "A", dex: "C" }, ic: "🌬️", t: "Windstring", price: 2800, hands: 2, atk: 0.35, crit: 0.08, card: "w_gale" },
  // Gambler · DEX
  { id: "st_deck", starter: true, tag: "gambler", req: { dex: 8 }, sc: { dex: "B" }, ic: "🃏", t: "Marked Deck", price: 0, hands: 1, crit: 0.02, card: "g_ace" },
  { id: "dice", tag: "gambler", req: { dex: 10 }, sc: { dex: "B" }, ic: "🎲", t: "Loaded Dice", price: 420, hands: 1, atk: 0.1, crit: 0.02, card: "g_dice" },
  { id: "razor", tag: "gambler", req: { dex: 14, agi: 8 }, sc: { dex: "A", agi: "D" }, ic: "🎴", t: "Razor Deck", price: 1150, hands: 1, atk: 0.12, crit: 0.06, card: "g_razor" },
  { id: "royal", tag: "gambler", req: { dex: 20, int: 8 }, sc: { dex: "A", int: "D" }, ic: "♠️", t: "Royal Deck", price: 2750, hands: 1, atk: 0.25, crit: 0.08, card: "g_royal" },
  // old saves only (no class, not sold)
  { id: "wood", legacy: true, ic: "🪵", t: "Wooden Sword", price: 0, hands: 1, card: "bash" },
];
// off-hand items: go in either hand next to a one-handed weapon
const OFFHANDS = [
  { id: "o_buckler", type: "offhand", tag: "guardian", req: { vit: 6 }, ic: "🪵", t: "Wooden Buckler", price: 220, def: 0.04, startBlock: 3, card: "sbash" },
  { id: "o_kite", type: "offhand", tag: "guardian", req: { vit: 10, str: 8 }, ic: "🛡️", t: "Kite Shield", price: 750, hp: 20, def: 0.07, startBlock: 7, card: "sh_parry" },
  { id: "o_tower", type: "offhand", tag: "guardian", req: { vit: 16, str: 12 }, ic: "🧱", t: "Tower Shield", price: 1800, hp: 30, def: 0.1, startBlock: 10, card: "sh_fort" },
  { id: "o_tome", type: "offhand", tag: "sorcerer", req: { int: 10 }, ic: "📕", t: "Spell Tome", price: 900, atk: 0.05, heavy: 0.15, card: "m_insight" },
  { id: "o_relic", type: "offhand", tag: "cleric", req: { fai: 10 }, ic: "🪬", t: "Holy Relic", price: 750, hp: 10, killHeal: 0.04, card: "r_prayer" },
];
// armor and accessories have no class, but can need stats
const ARMORS = [
  { id: "cloth", ic: "👕", t: "Cloth Tunic", price: 0 },
  { id: "leather", req: { agi: 6 }, ic: "🧥", t: "Leather Armor", price: 220, hp: 15, def: 0.03 },
  { id: "chain", req: { vit: 8 }, ic: "⛓️", t: "Chainmail", price: 600, hp: 25, def: 0.06 },
  { id: "warlord", req: { str: 12, vit: 8 }, ic: "🦾", t: "Warlord Mail", price: 1050, hp: 30, def: 0.1, killHeal: 0.1 },
  { id: "holy", req: { fai: 10 }, ic: "✨", t: "Holy Vestment", price: 1050, hp: 10, def: 0.05, leech: 1 },
  { id: "plate", req: { vit: 12, str: 8 }, ic: "🛡️", t: "Plate Armor", price: 1350, hp: 40, def: 0.1 },
  { id: "dscale", req: { vit: 16, str: 10 }, ic: "🐲", t: "Dragon Scale", price: 3000, hp: 60, def: 0.15 },
  { id: "q_cloak", story: true, ic: "🧥", t: "Arthur's Cloak", price: 500, hp: 20, def: 0.05, lore: { th: "ผ้าคลุมที่อาเธอร์ใช้ห่อดาบ", en: "The cloak Arthur wrapped the sword in" } },
  { id: "q_mantle", story: true, req: { fai: 8 }, ic: "🔴", t: "Scarlet Mantle", price: 700, hp: 30, def: 0.08, killHeal: 0.05, lore: { th: "ผ้าคลุมสีแดงสดที่ห่อทารกอาเธอร์", en: "The scarlet mantle the infant Arthur was wrapped in" } },
];
const ACC_SLOTS = [
  { type: "helmet", n: 1, ic: "🪖" }, { type: "necklace", n: 1, ic: "📿" },
  { type: "earring", n: 2, ic: "💎" }, { type: "ring", n: 2, ic: "💍" },
  { type: "gloves", n: 1, ic: "🧤" }, { type: "pants", n: 1, ic: "👖" }, { type: "shoes", n: 1, ic: "👢" },
];
const ACCESSORIES = [
  { id: "h_cap", type: "helmet", ic: "🧢", t: "Leather Cap", price: 220, hp: 10 },
  { id: "h_iron", type: "helmet", req: { vit: 8 }, ic: "🪖", t: "Iron Helm", price: 600, hp: 20, def: 0.05 },
  { id: "h_wizard", type: "helmet", req: { int: 10 }, ic: "🎩", t: "Wizard Hat", price: 750, heavy: 0.15, luck: 0.1 },
  { id: "h_crown", type: "helmet", req: { fai: 10, int: 8 }, ic: "👑", t: "Golden Crown", price: 2250, atk: 0.1, goldMult: 0.3, luck: 0.2 },
  { id: "n_life", type: "necklace", req: { fai: 10 }, ic: "📿", t: "Life Amulet", price: 750, hp: 30, killHeal: 0.05 },
  { id: "n_chrono", type: "necklace", req: { int: 8, agi: 6 }, ic: "⏳", t: "Chrono Pendant", price: 750, drawFirst: 1, startBlock: 3 },
  { id: "n_war", type: "necklace", req: { str: 10 }, ic: "🔱", t: "War Amulet", price: 900, atk: 0.12, crit: 0.03 },
  { id: "e_focus", type: "earring", req: { dex: 8 }, ic: "💎", t: "Focus Earring", price: 380, combo: 0.03 },
  { id: "e_sage", type: "earring", req: { int: 8 }, ic: "🔷", t: "Sage Earring", price: 450, luck: 0.15 },
  { id: "e_guard", type: "earring", req: { vit: 8 }, ic: "🔶", t: "Guard Earring", price: 450, def: 0.04 },
  { id: "e_blood", type: "earring", req: { fai: 8 }, ic: "🩸", t: "Blood Earring", price: 680, leech: 1 },
  { id: "r_power", type: "ring", req: { str: 6 }, ic: "💍", t: "Ring of Power", price: 380, atk: 0.08 },
  { id: "r_eagle", type: "ring", req: { dex: 8 }, ic: "🎯", t: "Eagle Ring", price: 450, crit: 0.06 },
  { id: "r_vital", type: "ring", ic: "💚", t: "Ring of Vitality", price: 380, hp: 20 },
  { id: "r_greed", type: "ring", req: { agi: 8 }, ic: "🪙", t: "Ring of Greed", price: 600, goldMult: 0.25 },
  { id: "q_signet", story: true, type: "ring", ic: "💍", t: "Uther's Signet Ring", price: 400, atk: 0.06, luck: 0.1, lore: { th: "แหวนตราประทับของอูเธอร์ เพนดรากอน ที่เมอร์ลินใช้สั่งการ", en: "Uther Pendragon's signet ring, which Merlin commanded by" } },
  { id: "g_leather", type: "gloves", ic: "🧤", t: "Leather Gloves", price: 220, crit: 0.03 },
  { id: "g_power", type: "gloves", req: { str: 10 }, ic: "🥊", t: "Power Gauntlets", price: 750, atk: 0.1 },
  { id: "g_thief", type: "gloves", req: { dex: 8, agi: 6 }, ic: "🫳", t: "Thief Gloves", price: 680, goldMult: 0.2 },
  { id: "p_leather", type: "pants", ic: "👖", t: "Leather Pants", price: 220, hp: 10, def: 0.02 },
  { id: "p_chain", type: "pants", req: { vit: 8 }, ic: "⛓️", t: "Chain Leggings", price: 600, hp: 20, def: 0.04 },
  { id: "p_swift", type: "pants", req: { agi: 8, dex: 6 }, ic: "🩳", t: "Swift Trousers", price: 750, combo: 0.02, drawFirst: 1 },
  { id: "s_boots", type: "shoes", ic: "👢", t: "Leather Boots", price: 220, hp: 10 },
  { id: "s_iron", type: "shoes", req: { vit: 8 }, ic: "🥾", t: "Iron Greaves", price: 600, hp: 15, def: 0.04 },
  { id: "s_wind", type: "shoes", req: { agi: 10 }, ic: "👟", t: "Wind Boots", price: 680, drawFirst: 1, combo: 0.02 },
];
const MITEMS = [
  { id: "potion", ic: "🧪", t: "Potion", price: 45, d: { th: "พกเข้า run สูงสุด 3 ขวด (ขวดที่ไม่ได้ใช้คืนคลังตอนจบ) · ตอนสู้แตะ 🧪 เพื่อฟื้น 30% HP", en: "Up to 3 go into each run (unused ones come back) · tap 🧪 in a fight to heal 30% HP" } },
];

const RARITY = [
  { n: "Common", c: "#b8b8c8", m: 1 }, { n: "Uncommon", c: "#5bd16b", m: 1.25 }, { n: "Rare", c: "#4da3ff", m: 1.5 },
  { n: "Epic", c: "#b06bff", m: 1.8 }, { n: "Legendary", c: "#ffb020", m: 2.2 },
];
const ENH_MAX = 10, ENH_STEP = 0.1, ENH_CHANCE = [1, 1, 1, 0.85, 0.7, 0.55, 0.45, 0.35, 0.25, 0.15];
const enhCost = it => Math.round(Math.max(100, defOf(it.id).price || 0) * RARITY[it.r].m * 0.3 * ((it.e || 0) + 1));
const MERGE_COUNT = 3;
const SCALED = ["atk", "crit", "def", "hp", "leech", "heavy", "combo", "luck", "goldMult", "startBlock", "killHeal"];
const INT_STATS = ["hp", "leech", "startBlock"];
const CATALOG = [...WEAPONS, ...OFFHANDS, ...ARMORS, ...ACCESSORIES];
const defOf = id => CATALOG.find(x => x.id === id);
const isWeaponId = id => WEAPONS.some(w => w.id === id);
const isHandId = id => isWeaponId(id) || OFFHANDS.some(o => o.id === id);
const kindOf = id => isHandId(id) ? "hand" : ARMORS.some(x => x.id === id) ? "armor" : "acc";
const itemBy = (pr, u) => u && pr.items.find(x => x.u === u);
function addItem(pr, id, r = 0) { const it = { u: newUid(), id, r }; pr.items.push(it); return it; }
// catalog entry with its positive stats scaled by rarity and enhance level
function view(it) {
  const d = defOf(it.id), m = RARITY[it.r].m * (1 + ENH_STEP * (it.e || 0)), v = { ...d, u: it.u, r: it.r, e: it.e || 0 };
  for (const k of SCALED) if (d[k] > 0) v[k] = INT_STATS.includes(k) ? Math.round(d[k] * m) : +(d[k] * m).toFixed(3);
  return v;
}
// ---- the two hands: pr.hands = [left uid, right uid]; a two-handed item sits in hands[0] and locks hands[1] ----
const HAND_N = [["มือซ้าย", "Left hand"], ["มือขวา", "Right hand"]];
const equippedUids = pr => new Set([...pr.hands, pr.armor, ...Object.values(pr.acc).flat()].filter(Boolean));
const handIt = (pr, i) => itemBy(pr, pr.hands[i]);
const twoHanded = pr => { const it = handIt(pr, 0); return !!it && defOf(it.id).hands === 2; };
function equipHand(pr, u, i) {
  const d = defOf(itemBy(pr, u).id);
  if (d.hands === 2) { pr.hands = [u, null]; return; }
  if (twoHanded(pr)) pr.hands = [null, null];
  const at = pr.hands.indexOf(u);
  if (at >= 0 && at !== i) pr.hands[at] = pr.hands[i]; // already in the other hand: the two swap
  pr.hands[i] = u;
}
function unequipHand(pr, i) { if (twoHanded(pr)) pr.hands = [null, null]; else pr.hands[i] = null; }
// a second weapon (in the right hand, next to another weapon) gives a share of its stats
const OFFHAND_WEAPON_SHARE = 0.5;
const offShareOf = pr => pr.passEquip.includes("dualmaster") ? PF.dualmaster(passLvOf(pr, "dualmaster") || 1) : OFFHAND_WEAPON_SHARE;
function offhandView(v, share) {
  v = { ...v };
  for (const k of SCALED) if (v[k] > 0) v[k] = INT_STATS.includes(k) ? Math.round(v[k] * share) : +(v[k] * share).toFixed(3);
  v.offhandWeapon = true; v.offShare = share;
  return v;
}
function handViews(pr) {
  const its = pr.hands.map(u => itemBy(pr, u)), weps = its.filter(it => it && isWeaponId(it.id)).length;
  return its.map((it, i) => !it ? null : isWeaponId(it.id) && weps === 2 && i === 1 ? offhandView(view(it), offShareOf(pr)) : view(it)).filter(Boolean);
}
const armorView = pr => view(itemBy(pr, pr.armor) || { id: "cloth", r: 0 });
const accOf = pr => ACC_SLOTS.flatMap(s => pr.acc[s.type]).map(u => itemBy(pr, u)).filter(Boolean).map(view);
function toggleAcc(pr, u) {
  const it = itemBy(pr, u), type = defOf(it.id).type, slots = pr.acc[type], at = slots.indexOf(u);
  if (at >= 0) { slots[at] = null; return; }
  const free = slots.indexOf(null);
  if (free >= 0) slots[free] = u; else { slots.shift(); slots.push(u); }
}
function mergeItems(pr, id, r) {
  const eq = equippedUids(pr);
  const pool = pr.items.filter(x => x.id === id && x.r === r).sort((a, b) => eq.has(a.u) - eq.has(b.u) || (a.e || 0) - (b.e || 0));
  if (pool.length < MERGE_COUNT || r >= RARITY.length - 1) return null;
  const fee = mergeFee(id, r);
  if (pr.gold < fee) return null;
  pr.gold -= fee;
  const used = pool.slice(0, MERGE_COUNT), usedU = used.map(x => x.u), res = addItem(pr, id, r + 1);
  let placed = false;
  const swap = u => { if (!usedU.includes(u)) return u; if (placed) return null; placed = true; return res.u; };
  pr.hands = pr.hands.map(u => u && swap(u)); pr.armor = swap(pr.armor) || pr.armor;
  for (const type in pr.acc) pr.acc[type] = pr.acc[type].map(u => u && swap(u));
  pr.items = pr.items.filter(x => !used.includes(x));
  return res;
}
function quickMerge(pr) {
  let n = 0;
  for (let r = 0; r < RARITY.length - 1; r++) for (const d of CATALOG)
    while (pr.items.filter(x => x.id === d.id && x.r === r).length >= MERGE_COUNT) { if (!mergeItems(pr, d.id, r)) break; n++; }
  return n;
}
const SELL_RATE = 0.4;
const mergeFee = (id, r) => Math.round(Math.max(20, (defOf(id).price || 0) * 0.2) * MERGE_COUNT ** r);
const sellValue = (id, r) => Math.round((defOf(id).price || 0) * SELL_RATE * MERGE_COUNT ** r);
function sellItems(pr, id, r, all) {
  const eq = equippedUids(pr), spare = pr.items.filter(x => x.id === id && x.r === r && !eq.has(x.u) && !x.e);
  const out = all ? spare : spare.slice(0, 1), gain = sellValue(id, r) * out.length;
  pr.items = pr.items.filter(x => !out.includes(x)); pr.gold += gain;
  return gain;
}
function enhanceItem(pr, u) {
  const it = itemBy(pr, u), e = it.e || 0;
  if (e >= ENH_MAX) return null;
  const cost = enhCost(it);
  if (pr.gold < cost) return "gold";
  pr.gold -= cost;
  if (Math.random() < ENH_CHANCE[e]) { it.e = e + 1; return "ok"; }
  return "fail";
}
// compact: shop / item lists (the class is in the section header, hands become an icon)
function gearDesc(g, who, compact) {
  const parts = [], pr = who === undefined ? prof() : who;
  if (g.req) {
    const f = pr ? reqFactor(pr, g) : 1;
    parts.push("📋 " + Object.entries(g.req).map(([k, n]) => { const cur = pr ? statOf(pr, k) : 99; return `<span class="${cur >= n ? "reqok" : "reqbad"}">${k.toUpperCase()} ${n}${cur >= n ? "" : ` (${cur})`}</span>`; }).join(" ") +
      (f < 1 && !compact ? ` <span class="reqbad">· ${L("พลังเหลือ", "power")} ${pc(f)}%</span>` : ""));
  }
  if (g.sc) parts.push("📈 " + Object.entries(g.sc).map(([k, gr]) => `${k.toUpperCase()} <b class="grade g${gr}">${gr}</b>`).join(" "));
  if (g.tag && !compact) parts.push(`${THEMES[g.tag].ic} ${tr(THEMES[g.tag].n)}`);
  if (g.offhandWeapon) parts.push(t("offhandShare", Math.round(g.offShare * 100)));
  else if (g.type === "offhand") parts.push(compact ? `<span title="${L("มือรอง", "Off-hand")}">🤚</span>` : L("🤚 มือรอง", "🤚 Off-hand"));
  else if (g.hands) parts.push(compact ? `<span title="${esc(t(g.hands === 2 ? "twoHand" : "oneHand"))}">${g.hands === 2 ? "🙌" : "🖐"}</span>` : t(g.hands === 2 ? "twoHand" : "oneHand"));
  if (g.card) parts.push(`🃏 <b>${CARDS[g.card].t}</b>`);
  if (g.atk) parts.push(L(`ดาเมจ +${pc(g.atk)}%`, `Damage +${pc(g.atk)}%`));
  if (g.crit) parts.push(`Crit +${pc(g.crit)}%`);
  if (g.critMult) parts.push(L(`Crit แรง x${g.critMult}`, `Crits deal x${g.critMult}`));
  if (g.hp) parts.push(`Max HP ${g.hp > 0 ? "+" : ""}${g.hp}`);
  if (g.def) parts.push(`Block +${pc(g.def)}%`);
  if (g.startBlock) parts.push(L(`เริ่มไฟต์ด้วย Block ${g.startBlock}`, `Start fights with ${g.startBlock} Block`));
  if (g.drawFirst) parts.push(L(`เทิร์นแรกจั่ว +${g.drawFirst}`, `Turn 1: draw +${g.drawFirst}`));
  if (g.heavy) parts.push(L(`การ์ด 2+⚡ ดาเมจ +${pc(g.heavy)}%`, `2+⚡ cards +${pc(g.heavy)}% damage`));
  if (g.combo) parts.push(L(`Combo +${pc(g.combo)}% ต่อการ์ดโจมตีใบก่อนหน้าในเทิร์น`, `Combo +${pc(g.combo)}% per earlier attack this turn`));
  if (g.leech) parts.push(L(`ดูดเลือด ${g.leech} HP ต่อการ์ดโจมตี`, `Leech ${g.leech} HP per attack card`));
  if (g.killHeal) parts.push(L(`ชนะไฟต์ฟื้น ${pc(g.killHeal)}% HP`, `Heal ${pc(g.killHeal)}% HP after each win`));
  if (g.luck) parts.push(L(`โชคการ์ด +${pc(g.luck)}%`, `Card luck +${pc(g.luck)}%`));
  if (g.goldMult) parts.push(L(`ทอง +${pc(g.goldMult)}%`, `+${pc(g.goldMult)}% gold`));
  return parts.length ? parts.join(" · ") : t("starter");
}

// ================= passive skills (permanent, rolled in the Skill shop) =================
const PASSIVE_SLOTS = 3, PASS_MAX = 5, PASS_ROLL = 220, PASS_BULK = 205;
const rollCost = (n, single, bulk) => n * (n >= 10 ? bulk : single);
const maxRolls = (gold, single, bulk) => Math.max(0, Math.min(500, gold >= 10 * bulk ? Math.floor(gold / bulk) : Math.floor(gold / single)));
const rollQty = { proll: 25 };
const PASS_TIERS = [
  { n: "Common", c: "#b8b8c8", w: 50 }, { n: "Rare", c: "#4da3ff", w: 30 },
  { n: "Epic", c: "#b06bff", w: 15 }, { n: "Legendary", c: "#ffb020", w: 5 },
];
const PF = { // one formula per effect, shared by the shop text and the combat code
  fortify: lv => 2 + 2 * lv,           // Block at the start of every fight
  keen: lv => lv,                      // +damage per attack hit
  thrifty: lv => 0.08 * lv,            // +gold
  alch: lv => 0.08 * lv,               // potions heal more (share of max HP)
  mend: lv => 2 + 2 * lv,              // HP healed after each won fight
  quick: lv => 0.05 * lv,              // chance to draw +1 each turn (turn 1 always +1)
  momentum: lv => 0.03 * lv,           // combo per earlier attack card
  thorns: lv => 1 + lv,                // damage back to an enemy that hits you
  laststand: lv => 0.2 + 0.1 * lv,     // damage bonus under 30% HP
  dualmaster: lv => 1 + 0.1 * (lv - 1),// right-hand weapon share (normally 0.5)
  scholar: lv => 0.1 * lv,             // card luck
  overflow: lv => 0.06 + 0.04 * lv,    // chance of +1 energy each turn
  recycle: lv => 2 + lv,               // damage to a random enemy per card discarded from hand
  patience: lv => lv,                  // Block per card kept in hand at the end of your turn
  pockets: lv => lv >= 5 ? 3 : lv >= 3 ? 2 : 1, // hand limit +
};
const PASSIVES = [
  { id: "fortify", ic: "🧱", t: "Iron Will", tier: 0, d: lv => ({ th: `เริ่มทุกไฟต์ด้วย Block ${PF.fortify(lv)}`, en: `Start every fight with ${PF.fortify(lv)} Block` }) },
  { id: "keen", ic: "🗡️", t: "Keen Edge", tier: 0, d: lv => ({ th: `การ์ดโจมตีดาเมจ +${PF.keen(lv)} ต่อครั้ง`, en: `Attacks deal +${PF.keen(lv)} damage per hit` }) },
  { id: "thrifty", ic: "🪙", t: "Thrifty", tier: 0, d: lv => ({ th: `ทองที่ได้ใน run +${pc(PF.thrifty(lv))}%`, en: `+${pc(PF.thrifty(lv))}% gold in runs` }) },
  { id: "recycle", ic: "♻️", t: "Scrap Toss", tier: 0, d: lv => ({ th: `ทุกใบที่ทิ้งจากมือ: ดาเมจ ${PF.recycle(lv)} ใส่ศัตรูสุ่ม`, en: `Each card discarded from hand deals ${PF.recycle(lv)} damage to a random enemy` }) },
  { id: "alch", ic: "⚗️", t: "Alchemist", tier: 0, d: lv => ({ th: `ยาฟื้นเพิ่ม +${pc(PF.alch(lv))}% HP`, en: `Potions heal +${pc(PF.alch(lv))}% more HP` }) },
  { id: "mend", ic: "🌬️", t: "Second Wind", tier: 1, d: lv => ({ th: `ชนะไฟต์ฟื้น ${PF.mend(lv)} HP`, en: `Heal ${PF.mend(lv)} HP after each won fight` }) },
  { id: "quick", ic: "🤲", t: "Quick Hands", tier: 1, d: lv => ({ th: `เทิร์นแรกจั่ว +1 · เทิร์นอื่นมีโอกาส ${pc(PF.quick(lv))}% จั่ว +1`, en: `Turn 1: draw +1 · later turns ${pc(PF.quick(lv))}% chance to draw +1` }) },
  { id: "momentum", ic: "🔥", t: "Momentum", tier: 1, d: lv => ({ th: `Combo +${pc(PF.momentum(lv))}% ต่อการ์ดโจมตีใบก่อนหน้าในเทิร์น`, en: `Combo +${pc(PF.momentum(lv))}% per earlier attack this turn` }) },
  { id: "thorns", ic: "🌵", t: "Thorns", tier: 1, d: lv => ({ th: `โดนตีแล้วสะท้อนดาเมจ ${PF.thorns(lv)}`, en: `Deal ${PF.thorns(lv)} damage back when hit` }) },
  { id: "patience", ic: "⏳", t: "Patience", tier: 1, d: lv => ({ th: `จบเทิร์น: Block ${PF.patience(lv)} ต่อการ์ดที่ถือไว้ในมือ`, en: `End of turn: ${PF.patience(lv)} Block per card kept in hand` }) },
  { id: "laststand", ic: "🩸", t: "Last Stand", tier: 2, d: lv => ({ th: `HP ต่ำกว่า 30% ดาเมจ +${pc(PF.laststand(lv))}%`, en: `+${pc(PF.laststand(lv))}% damage below 30% HP` }) },
  { id: "dualmaster", ic: "⚔️", t: "Dual Wield Mastery", tier: 2, d: lv => ({ th: `มือขวาถืออาวุธได้ค่าพลัง ${pc(PF.dualmaster(lv))}% (ปกติ 50%)`, en: `Right-hand weapon gives ${pc(PF.dualmaster(lv))}% of its stats (normally 50%)` }) },
  { id: "scholar", ic: "📚", t: "Scholar", tier: 2, d: lv => ({ th: `โชคการ์ด +${pc(PF.scholar(lv))}% (เจอการ์ดหายากบ่อยขึ้น)`, en: `Card luck +${pc(PF.scholar(lv))}% (rarer card rewards)` }) },
  { id: "pockets", ic: "🎒", t: "Deep Pockets", tier: 2, d: lv => ({ th: `ถือการ์ดได้ +${PF.pockets(lv)} ใบ (ปกติ ${HAND})`, en: `Hand limit +${PF.pockets(lv)} (normally ${HAND})` }) },
  { id: "overflow", ic: "⚡", t: "Overflow", tier: 3, d: lv => ({ th: `ทุกเทิร์นมีโอกาส ${pc(PF.overflow(lv))}% ได้ +1 ⚡`, en: `${pc(PF.overflow(lv))}% chance of +1 ⚡ each turn` }) },
];
const passWeight = ps => PASS_TIERS[ps.tier].w / PASSIVES.filter(x => x.tier === ps.tier).length;
const passLvOf = (pr, id) => (pr.passLv && pr.passLv[id]) || 0;
const passPool = pr => PASSIVES.filter(ps => passLvOf(pr, ps.id) < PASS_MAX);
let lastPassRoll = [];
function rollPassives(pr, n) {
  const cost = rollCost(n, PASS_ROLL, PASS_BULK);
  if (pr.gold < cost || !passPool(pr).length) return false;
  pr.gold -= cost; lastPassRoll = [];
  for (let i = 0; i < n; i++) {
    const pool = passPool(pr);
    if (!pool.length) { pr.gold += Math.round(cost / n) * (n - i); break; }
    let r = Math.random() * pool.reduce((s, ps) => s + passWeight(ps), 0);
    const ps = pool.find(x => (r -= passWeight(x)) < 0) || pool[pool.length - 1];
    const lv = passLvOf(pr, ps.id) + 1;
    pr.passLv[ps.id] = lv;
    if (lv === 1 && pr.passEquip.includes(null)) togglePassive(pr, ps.id);
    lastPassRoll.push({ id: ps.id, lv, isNew: lv === 1 });
  }
  return true;
}
function togglePassive(pr, id) {
  const s = pr.passEquip, at = s.indexOf(id);
  if (at >= 0) { s[at] = null; return; }
  const free = s.indexOf(null);
  if (free >= 0) s[free] = id; else { s.shift(); s.push(id); }
}

// the build a run starts with: worn gear + worn passives
const BASE_HP = 75;
function statsOf(pr) {
  const s = { hp: BASE_HP, atk: 0, crit: 0.05, critMult: 1.5, def: 0, leech: 0, heavy: 0, combo: 0, luck: 0, goldMult: 0, startBlock: 0, drawFirst: 0, killHeal: 0 };
  const hands = handViews(pr), gear = [...hands, armorView(pr), ...accOf(pr)], S = k => statOf(pr, k);
  s.pen = {}; // requirement not met: the item gives less, and a weapon's class cards weaken
  for (const g of gear) {
    const f = reqFactor(pr, g);
    for (const k of ["hp", "atk", "crit", "def", "leech", "heavy", "combo", "luck", "goldMult", "startBlock", "drawFirst", "killHeal"]) { const v = g[k] || 0; s[k] += v > 0 ? v * f : v; }
    s.critMult = Math.max(s.critMult, g.critMult || 0);
    if (f < 1) { const k = g.tag || "_gear"; s.pen[k] = Math.min(s.pen[k] || 1, f); }
  }
  // each stat's own effect (tuned to about +1% power per point)
  s.atk += SX.str * (S("str") - STAT_BASE);
  s.crit += Math.min(0.6, 0.01 * (S("dex") - STAT_BASE));
  s.enChance = +Math.min(SX.intCap, SX.int * (S("int") - STAT_BASE)).toFixed(3);
  s.killHeal += 0.005 * (S("fai") - STAT_BASE);
  s.regen = Math.floor((S("fai") - STAT_BASE) / SX.faiRegen);
  s.hp *= 1 + SX.vit * (S("vit") - STAT_BASE);
  s.dodge = +Math.min(SX.agiCap, SX.agi * (S("agi") - STAT_BASE)).toFixed(3);
  // class card power: the best held weapon of that class (its scaling grades x requirement), otherwise a little from the class stat
  const weps = hands.filter(v => isWeaponId(v.id)), top = Math.max(...STATS.map(sd => S(sd.id)));
  s.unarmed = !weps.length;
  s.tm = {};
  for (const cls in THEMES) {
    if (cls === "martial") s.tm[cls] = +(s.unarmed ? 1 + 0.03 * (top - STAT_BASE) + 0.01 * (pr.lvl - 1) : 1 + 0.01 * (top - STAT_BASE)).toFixed(3);
    else { const held = weps.filter(w => w.tag === cls); s.tm[cls] = held.length ? Math.max(...held.map(w => weaponMult(pr, w))) : +(1 + 0.01 * (S(THEME_STAT[cls]) - STAT_BASE)).toFixed(3); }
  }
  s.tm._atk = s.tm._blk = s.unarmed ? s.tm.martial : Math.max(...weps.map(w => weaponMult(pr, w))); // Strike / Defend
  s.cardLv = { ...(pr.cardLv || {}) };
  s.perkT = {}; s.perkG = {};
  for (const tg in PERKS) for (const pk of PERKS[tg]) if (pr.perks && pr.perks[pk.id]) {
    if (pk.card) { const o = s.perkT[tg] = s.perkT[tg] || {}; for (const k in pk.card) o[k] = (o[k] || 0) + pk.card[k]; }
    if (pk.g) for (const k in pk.g) s.perkG[k] = (s.perkG[k] || 0) + pk.g[k];
  }
  s.startBlock += s.perkG.startBlock || 0; s.drawFirst += s.perkG.drawFirst || 0;
  s.hp = Math.max(20, Math.round(s.hp));
  // starting-deck cards: one per held item; empty hands fight with martial arts
  s.cards = [...(s.unarmed ? ["m_palm", "m_guard"] : []), ...hands.map(v => v.card).filter(Boolean)];
  s.card = s.cards[0];
  s.tags = {};
  for (const v of hands) if (v.tag) s.tags[v.tag] = (s.tags[v.tag] || 0) + 1;
  if (s.unarmed) s.tags.martial = (s.tags.martial || 0) + 2;
  if (weps.length === 2) s.tags.duelist = (s.tags.duelist || 0) + 1; // two weapons = dual wielding
  s.pass = {};
  for (const id of pr.passEquip) if (id && passLvOf(pr, id)) s.pass[id] = passLvOf(pr, id);
  s.gear = gear.map(g => g.ic).join(" ");
  return s;
}

// ================= character level, stats and theme mastery (permanent) =================
// what one point of each stat gives on top of weapon scaling (tuned so a focused stat is worth about the same in every class)
const SX = { str: 0.005, vit: 0.01, int: 0.02, intCap: 0.6, agi: 0.01, agiCap: 0.2, faiRegen: 6 };
const STATS = [
  { id: "str", ic: "💪", n: "STR", d: ["ดาเมจทุกการ์ด +0.5% · อาวุธ Berserker", "All damage +0.5% · Berserker weapons"] },
  { id: "dex", ic: "🎯", n: "DEX", d: ["Crit +1% (สูงสุด 60%) · อาวุธ Duelist", "Crit +1% (max 60%) · Duelist weapons"] },
  { id: "int", ic: "🔮", n: "INT", d: ["โอกาส +1⚡ ต้นเทิร์น +2% (สูงสุด 60%) · อาวุธ Sorcerer", "+2% chance of +1⚡ each turn (max 60%) · Sorcerer weapons"] },
  { id: "fai", ic: "✨", n: "FAI", d: ["ชนะไฟต์ฟื้น HP +0.5% · ทุก 6 แต้ม ฟื้น 1 HP ต้นเทิร์น · อาวุธ Cleric", "+0.5% HP healed per win · every 6 points heal 1 HP each turn · Cleric weapons"] },
  { id: "vit", ic: "❤️", n: "VIT", d: ["Max HP +1% · อาวุธ Guardian", "Max HP +1% · Guardian weapons"] },
  { id: "agi", ic: "🌬️", n: "AGI", d: ["หลบการโจมตี +1% (สูงสุด 20%) · อาวุธ Ranger", "Dodge +1% (max 20%) · Ranger weapons"] },
];
const STAT_BASE = 5, STAT_STEP = 0.03, PTS_PER_LV = 4, LV_MAX = 60, REQ_FLOOR = 0.4;
const THEME_STAT = { berserker: "str", duelist: "dex", sorcerer: "int", cleric: "fai", guardian: "vit", ranger: "agi", gambler: "dex", martial: null };
const GRADE = { S: 0.05, A: 0.04, B: 0.03, C: 0.02, D: 0.01 }; // power per stat point above 5
// what a stat value gives (its own effect only)
const statFx = (id, v) => {
  const x = v - STAT_BASE;
  return id === "str" ? L(`ดาเมจ +${+(SX.str * 100 * x).toFixed(1)}%`, `damage +${+(SX.str * 100 * x).toFixed(1)}%`) : id === "dex" ? `Crit +${Math.min(60, x)}%` : id === "int" ? `+1⚡ ${+Math.min(SX.intCap * 100, SX.int * 100 * x).toFixed(1)}%`
    : id === "fai" ? L(`ชนะฟื้น ${+(0.5 * x).toFixed(1)}%`, `win heal ${+(0.5 * x).toFixed(1)}%`) + (Math.floor(x / SX.faiRegen) > 0 ? ` · 💚${Math.floor(x / SX.faiRegen)}/${L("เทิร์น", "turn")}` : "") : id === "vit" ? `HP +${+(SX.vit * 100 * x).toFixed(1)}%` : L(`หลบ ${+Math.min(SX.agiCap * 100, SX.agi * 100 * x).toFixed(1)}%`, `dodge ${+Math.min(SX.agiCap * 100, SX.agi * 100 * x).toFixed(1)}%`);
};
const charNeed = lv => Math.round(30 * Math.pow(lv, 1.5));
const statOf = (pr, k) => (pr.stat && pr.stat[k]) || STAT_BASE;
const statResetCost = pr => 50 * pr.lvl;
// share of an item's power you get: 1 when every stat requirement is met, down to REQ_FLOOR (the worst stat decides)
const reqFactor = (pr, g) => { if (!g.req) return 1; let f = 1; for (const k in g.req) f = Math.min(f, statOf(pr, k) / g.req[k]); return Math.max(REQ_FLOOR, Math.min(1, f)); };
// a weapon's multiplier for its class cards and Strike/Defend
const weaponMult = (pr, w) => +((1 + Object.entries(w.sc || {}).reduce((a, [k, g]) => a + GRADE[g] * (statOf(pr, k) - STAT_BASE), 0)) * reqFactor(pr, w)).toFixed(3);
// mastery: playing a class's cards levels that class; each level = 1 point for card levels (Lv1-5) and perks
const MAST_MAX = 30, mastNeed = lv => 10 + 6 * lv, LV_STEP = 0.12, CARD_LV_MAX = 5;
const PERKS = {
  berserker: [
    { id: "brs1", lv: 2, cost: 2, ic: "🪨", t: ["แขนเหล็ก", "Iron Arms"], d: ["การ์ด Berserker ดาเมจ +4", "Berserker cards +4 damage"], card: { dmg: 4 } },
    { id: "brs2", lv: 5, cost: 2, ic: "💢", t: ["ทุบแตก", "Shatter"], d: ["การ์ดโจมตี Berserker ติด Vulnerable +1", "Berserker attacks apply +1 Vulnerable"], card: { vuln: 1 } },
    { id: "brs3", lv: 8, cost: 3, ic: "🌋", t: ["พลังทำลาย", "Devastate"], d: ["การ์ด Berserker ดาเมจ +25%", "Berserker cards +25% damage"], card: { mult: 0.25 } },
  ],
  duelist: [
    { id: "dlt1", lv: 2, cost: 2, ic: "🎯", t: ["คมดาบ", "Keen Edges"], d: ["การ์ด Duelist Crit +8%", "Duelist cards +8% crit"], card: { crit: 0.08 } },
    { id: "dlt2", lv: 5, cost: 2, ic: "🗡️", t: ["ฟันซ้ำ", "Follow-up"], d: ["การ์ด Duelist ดาเมจ +2 ต่อครั้ง", "Duelist cards +2 damage per hit"], card: { dmg: 2 } },
    { id: "dlt3", lv: 8, cost: 3, ic: "🔁", t: ["เสียงสะท้อนคู่", "Twin Echo"], d: ["การ์ดโจมตี Duelist มีโอกาส 15% ตีซ้ำอีกครั้ง", "Duelist attacks have a 15% chance to hit once more"], card: { echo: 0.15 } },
  ],
  sorcerer: [
    { id: "sor1", lv: 2, cost: 2, ic: "🪵", t: ["เชื้อเพลิง", "Kindling"], d: ["การ์ด Sorcerer Burn +2", "Sorcerer cards +2 Burn"], card: { burn: 2 } },
    { id: "sor2", lv: 5, cost: 2, ic: "📖", t: ["เตรียมคาถา", "Prepared"], d: ["เทิร์นแรกจั่ว +1", "Turn 1: draw +1"], g: { drawFirst: 1 } },
    { id: "sor3", lv: 8, cost: 3, ic: "⚡", t: ["ล้นมานา", "Mana Font"], d: ["เทิร์นแรก +1 ⚡", "Turn 1: +1 ⚡"], g: { enFirst: 1 } },
  ],
  cleric: [
    { id: "clr1", lv: 2, cost: 2, ic: "💚", t: ["พรศักดิ์สิทธิ์", "Blessed"], d: ["การ์ด Cleric ฟื้น HP +2", "Cleric cards heal +2"], card: { heal: 2 } },
    { id: "clr2", lv: 5, cost: 2, ic: "🙏", t: ["สวดขอบคุณ", "Thanksgiving"], d: ["ชนะไฟต์ฟื้น +5 HP", "Heal 5 HP after each win"], g: { winHeal: 5 } },
    { id: "clr3", lv: 8, cost: 3, ic: "🌟", t: ["รัศมีคุ้มครอง", "Halo"], d: ["ฟื้น HP เกินหลอด กลายเป็น Block", "Overhealing turns into Block"], g: { healToBlock: 1 } },
  ],
  guardian: [
    { id: "grd1", lv: 2, cost: 2, ic: "🧱", t: ["ตั้งการ์ด", "Guard Up"], d: ["เริ่มไฟต์ Block +5", "Start fights with +5 Block"], g: { startBlock: 5 } },
    { id: "grd2", lv: 5, cost: 2, ic: "🛡️", t: ["โล่หนา", "Thick Shield"], d: ["การ์ด Guardian Block +3", "Guardian cards +3 Block"], card: { block: 3 } },
    { id: "grd3", lv: 8, cost: 3, ic: "🏰", t: ["ป้อมปราการ", "Fortress"], d: ["Block ที่เหลือเก็บไว้ครึ่งหนึ่งข้ามเทิร์น", "Keep half your Block between turns"], g: { keepBlock: 1 } },
  ],
  ranger: [
    { id: "rng1", lv: 2, cost: 2, ic: "🍃", t: ["เท้าเบา", "Light Feet"], d: ["เริ่มไฟต์ด้วยหลบ 1", "Start fights with 1 Dodge"], g: { startDodge: 1 } },
    { id: "rng2", lv: 5, cost: 2, ic: "🎯", t: ["ตราล่า", "Hunter's Mark"], d: ["การ์ดโจมตี Ranger ติด Vulnerable +1", "Ranger attacks apply +1 Vulnerable"], card: { vuln: 1 } },
    { id: "rng3", lv: 8, cost: 3, ic: "🏹", t: ["นักแม่นธนู", "Marksman"], d: ["การ์ด Ranger ดาเมจ +3", "Ranger cards +3 damage"], card: { dmg: 3 } },
  ],
  gambler: [
    { id: "gmb1", lv: 2, cost: 2, ic: "🎲", t: ["ลูกเต๋าถ่วง", "Weighted Dice"], d: ["การ์ด Gambler โบนัสไพ่น้อย +5% ต่อช่อง", "Gambler cards +5% per empty slot"], card: { lone: 0.05 } },
    { id: "gmb2", lv: 5, cost: 2, ic: "💰", t: ["กินเรียบ", "Cash In"], d: ["การ์ด Gambler ดาเมจ +3", "Gambler cards +3 damage"], card: { dmg: 3 } },
    { id: "gmb3", lv: 8, cost: 3, ic: "🏦", t: ["เจ้ามือ", "The House"], d: ["การ์ดโจมตีทุกใบได้โบนัสไพ่น้อย +5% ต่อช่อง", "All attacks get +5% per empty hand slot"], g: { loneAll: 0.05 } },
  ],
  martial: [
    { id: "mrt1", lv: 2, cost: 2, ic: "👊", t: ["หมัดเหล็ก", "Iron Fist"], d: ["การ์ดมือเปล่า ดาเมจ +2", "Martial cards +2 damage"], card: { dmg: 2 } },
    { id: "mrt2", lv: 4, cost: 2, ic: "🌊", t: ["กระแสต่อเนื่อง", "Flow"], d: ["การ์ดโจมตีมือเปล่า Combo +1", "Martial attacks +1 combo"], card: { combo: 1 } },
    { id: "mrt3", lv: 6, cost: 2, ic: "💨", t: ["หลบหลีก", "Evasion"], d: ["เริ่มไฟต์ด้วยหลบ 1", "Start fights with 1 Dodge"], g: { startDodge: 1 } },
    { id: "mrt4", lv: 8, cost: 3, ic: "⚡", t: ["ลมปราณ", "Ki Surge"], d: ["เทิร์นแรก +1 ⚡", "Turn 1: +1 ⚡"], g: { enFirst: 1 } },
    { id: "mrt5", lv: 10, cost: 3, ic: "🤜", t: ["พันฝ่ามือ", "Thousand Palms"], d: ["การ์ดมือเปล่าที่ตีหลายครั้ง ตีเพิ่ม 1 ครั้ง", "Multi-hit martial cards hit 1 more time"], card: { hit: 1 } },
  ],
};
const themeCards = tag => Object.keys(CARDS).filter(id => CARDS[id].tag === tag).sort((a, b) => CARDS[a].r - CARDS[b].r || (CARDS[a].only || 0) - (CARDS[b].only || 0));
// a card with permanent card levels and theme perks applied (st = a run's stats, or statsOf(profile))
function cardFx(c, st) {
  const d = cardOf(c);
  if (!st) return d;
  const lv = (st.cardLv && st.cardLv[c.id]) || 1, pk = (d.tag && st.perkT && st.perkT[d.tag]) || {}, m = 1 + LV_STEP * (lv - 1);
  const e = { ...d, lv };
  if (d.dmg) e.dmg = Math.round(d.dmg * m) + (pk.dmg || 0);
  if (d.block) e.block = Math.round(d.block * m) + (pk.block || 0);
  else if (pk.blockOnPlay) e.block = pk.blockOnPlay;
  if (d.burn) e.burn = Math.round(d.burn * m) + (pk.burn || 0);
  if (d.heal) e.heal = Math.round(d.heal * m) + (pk.heal || 0);
  if (d.bpt) e.bpt = Math.round(d.bpt * m);
  if (d.hits > 1 && pk.hit) e.hits = d.hits + pk.hit;
  if (pk.lone && d.lone) e.lone = d.lone + pk.lone;
  if (pk.vuln && d.type === "atk") e.vuln = (d.vuln || 0) + pk.vuln;
  if (pk.combo && d.type === "atk") e.combo = (d.combo || 0) + pk.combo;
  if (lv >= CARD_LV_MAX) e.cost = Math.max(0, d.cost - 1);
  e.critPlus = (pk.crit || 0) + (d.crit || 0); e.mult = pk.mult || 0; e.echo = pk.echo || 0;
  return e;
}
const tmul = (d, plain) => { const tm = run && run.st && run.st.tm; return tm ? (d && d.tag ? tm[d.tag] : tm[plain]) || 1 : 1; };
const PG = () => (run && run.st && run.st.perkG) || {};
function gainCharXp(n) {
  const pr = prof();
  pr.xp += n; run.xpGain = (run.xpGain || 0) + n;
  while (pr.lvl < LV_MAX && pr.xp >= charNeed(pr.lvl)) {
    pr.xp -= charNeed(pr.lvl); pr.lvl++; pr.pts += PTS_PER_LV; run.lvUps = (run.lvUps || 0) + 1;
    floatAt($("pava"), `⭐ LEVEL ${pr.lvl}!`, "crit");
  }
}
function gainMastery(tag, n) {
  const m = prof().mast[tag];
  if (!m) return;
  m.xp += n;
  while (m.lv < MAST_MAX && m.xp >= mastNeed(m.lv)) { m.xp -= mastNeed(m.lv); m.lv++; m.pts++; floatAt($("pava"), `${THEMES[tag].ic} Mastery Lv${m.lv}!`, "heal"); }
}
const xpOf = f => Math.round((4 + run.depth * 1.2) * (f.boss ? 6 : f.elite ? 2.5 : 1));

// ================= enemies =================
// moves: a = damage per hit, h = hits, b = Block, s = Strength, heal, w / v / burn = Weak / Vulnerable / Burn on you.
// Moves play in order (normal enemies start at a random one). Every number grows with the run's depth.
const FOES = {
  // tier 1
  snail: { e: "🐌", n: "Slime Snail", hp: 16, moves: [{ a: 5 }, { b: 5, a: 3 }] },
  rat: { e: "🐀", n: "Sewer Rat", hp: 12, moves: [{ a: 3, h: 2 }, { a: 6 }] },
  bat: { e: "🦇", n: "Cave Bat", hp: 13, moves: [{ a: 4 }, { w: 1, a: 3 }] },
  viper: { e: "🐍", n: "Viper", hp: 15, moves: [{ a: 4, burn: 2 }, { a: 6 }] },
  spider: { e: "🕷️", n: "Giant Spider", hp: 18, moves: [{ w: 2 }, { a: 7 }, { a: 5 }] },
  // tier 2
  wolf: { e: "🐺", n: "Dire Wolf", hp: 30, moves: [{ a: 5, h: 2 }, { s: 2 }, { a: 9 }] },
  zombie: { e: "🧟", n: "Zombie", hp: 38, moves: [{ a: 8 }, { a: 8 }, { heal: 8, b: 6 }] },
  ghost: { e: "👻", n: "Ghost", hp: 26, moves: [{ v: 2 }, { a: 10 }, { b: 10 }] },
  scorpion: { e: "🦂", n: "Scorpion", hp: 30, moves: [{ a: 6, burn: 3 }, { a: 4, h: 2 }] },
  boar: { e: "🐗", n: "Wild Boar", hp: 34, moves: [{ a: 12 }, { b: 8 }, { a: 6 }] },
  // tier 3
  oni: { e: "👹", n: "Oni", hp: 55, moves: [{ a: 14 }, { s: 3 }, { a: 7, h: 2 }] },
  troll: { e: "🧌", n: "Troll", hp: 70, moves: [{ a: 12 }, { heal: 12 }, { a: 16 }] },
  kraken: { e: "🦑", n: "Kraken", hp: 60, moves: [{ a: 4, h: 4 }, { w: 2, b: 10 }] },
  golem: { e: "🤖", n: "Golem", hp: 80, moves: [{ b: 15 }, { a: 18 }, { a: 10 }] },
  voidw: { e: "👽", n: "Void Walker", hp: 50, moves: [{ v: 2, w: 2 }, { a: 15 }, { a: 8, burn: 4 }] },
  // bosses
  lich: { e: "💀", n: "Lich King", hp: 90, boss: 1, moves: [{ a: 10 }, { s: 2, b: 12 }, { a: 4, h: 3 }, { w: 2, v: 2 }] },
  demon: { e: "😈", n: "Demon Prince", hp: 150, boss: 1, moves: [{ a: 8, h: 2 }, { burn: 6 }, { s: 3, b: 15 }, { a: 22 }] },
  dragon: { e: "🐲", n: "Dragon Lord", hp: 210, boss: 1, moves: [{ a: 12, burn: 4 }, { s: 3 }, { a: 6, h: 4 }, { b: 25 }, { a: 30 }] },
  wyrm: { e: "🐉", n: "Elder Wyrm", hp: 180, boss: 1, moves: [{ a: 9, h: 2 }, { b: 20, s: 2 }, { a: 25 }, { w: 2, burn: 5 }] },
  vamp: { e: "🧛", n: "Vampire Count", hp: 160, boss: 1, moves: [{ a: 12 }, { heal: 20, w: 1 }, { a: 5, h: 3 }, { s: 2, v: 2 }] },
  // story · Chapter First: the tournament at London Town
  s_knight: { e: "🤺", n: "Tourney Knight", hp: 20, moves: [{ a: 6 }, { b: 6, a: 3 }] },
  s_rider: { e: "🏇", n: "Jousting Rider", hp: 18, moves: [{ a: 9 }, { w: 1 }] },
  s_squire: { e: "🥊", n: "Brawling Squire", hp: 15, moves: [{ a: 3, h: 2 }, { s: 1 }] },
  s_champ: { e: "🏆", n: "Champion of the Lists", hp: 80, boss: 1, moves: [{ a: 8 }, { b: 10, s: 1 }, { a: 5, h: 2 }] },
  // Chapter Second: the miracle of the sword
  s_blade: { e: "🗡️", n: "Living Blade", hp: 20, moves: [{ a: 4, h: 2 }, { a: 8 }] },
  s_stone: { e: "🪨", n: "Marble Sentinel", hp: 28, moves: [{ b: 8 }, { a: 9 }] },
  s_doubt: { e: "🌫️", n: "Shade of Doubt", hp: 18, moves: [{ w: 2, v: 1 }, { a: 7 }] },
  s_anvil: { e: "⚒️", n: "Spirit of the Anvil", hp: 110, boss: 1, moves: [{ b: 12 }, { a: 12 }, { a: 4, h: 3 }, { s: 2 }] },
  // Chapter Third: the kings and dukes make the assay
  s_guard: { e: "💂", n: "Royal Guard", hp: 24, moves: [{ a: 7 }, { b: 7 }] },
  s_archer: { e: "🏹", n: "Ducal Archer", hp: 16, moves: [{ a: 3, h: 3 }, { v: 1 }] },
  s_urien: { e: "🤴", n: "King Urien", hp: 50, moves: [{ a: 9 }, { s: 2 }, { b: 10 }] },
  s_lot: { e: "👑", n: "King Lot of Orkney", hp: 150, boss: 1, moves: [{ a: 10 }, { s: 2, b: 12 }, { a: 6, h: 3 }, { w: 2 }] },
};
const TIERS = { 1: ["snail", "rat", "bat", "viper", "spider"], 2: ["wolf", "zombie", "ghost", "scorpion", "boar"], 3: ["oni", "troll", "kraken", "golem", "voidw"] };
const ACT_BOSS = ["lich", "demon", "dragon"], ENDLESS_BOSS = ["lich", "demon", "vamp", "wyrm", "dragon"];

function mkFoe(id, depth, f = {}) {
  const d = FOES[id], deep = Math.pow(1.04, Math.max(0, depth - 36)); // past a full map run, enemies compound
  const hpS = (1 + 0.035 * depth) * deep * (f.elite ? 1.7 : 1) * (f.pair ? 0.65 : 1);
  const hp = Math.round(d.hp * hpS * (d.boss ? 1 : 0.92 + Math.random() * 0.16));
  const foe = { id, hp, maxHp: hp, block: 0, st: { str: f.elite ? 1 : 0, weak: 0, vuln: 0, burn: 0 }, dmgS: +((1 + 0.03 * depth) * deep * (f.elite ? 1.25 : 1)).toFixed(3), elite: !!f.elite, boss: !!d.boss, mi: d.boss ? -1 : Math.floor(Math.random() * d.moves.length) - 1, dead: false };
  nextIntent(foe);
  return foe;
}
const foeDef = f => f.pvp ? PVP_DEF : FOES[f.id];
const foeName = f => f.pvp ? esc(f.name) : (f.elite ? "Elite " : "") + foeDef(f).n;
function nextIntent(f) { f.mi = (f.mi + 1) % foeDef(f).moves.length; }
const intentOf = f => foeDef(f).moves[f.mi];
const foeHit = (f, m) => Math.max(0, Math.floor((Math.round(m.a * f.dmgS) + f.st.str) * (f.st.weak ? 0.75 : 1) * (run && run.combat && run.combat.st.vuln ? 1.5 : 1)));
function intentHtml(f) {
  if (f.pvp) return `<div class="intent">${busy ? "⏳ " + L("ตาของเขา", "their turn") : "🎯 " + L("ตาคุณ", "your turn")}</div>`;
  const m = intentOf(f), p = [];
  if (m.a) p.push(`<span class="ia">⚔️ ${foeHit(f, m)}${m.h > 1 ? "×" + m.h : ""}</span>`);
  if (m.b) p.push(`🛡️ ${Math.round(m.b * f.dmgS)}`);
  if (m.s) p.push(`💪+${m.s}`);
  if (m.heal) p.push(`💚 ${Math.round(m.heal * f.dmgS)}`);
  if (m.w || m.v || m.burn) p.push("🌀" + [m.w && "🥀" + m.w, m.v && "💢" + m.v, m.burn && "🔥" + m.burn].filter(Boolean).join(""));
  return `<div class="intent${m.a ? " atk" : ""}">${p.join(" ")}</div>`;
}
const stsHtml = (st, block) => (block ? `<span class="blk">🛡️ ${block}</span>` : "") + (st.dodge ? `<span class="blk" title="Dodge">🌬️ ${st.dodge}</span>` : "") +
  (st.str ? `<span>💪 ${st.str}</span>` : "") + (st.weak ? `<span title="Weak">🥀 ${st.weak}</span>` : "") +
  (st.vuln ? `<span title="Vulnerable">💢 ${st.vuln}</span>` : "") + (st.burn ? `<span title="Burn">🔥 ${st.burn}</span>` : "");

// ================= profiles (localStorage) =================
const SAVE_KEY = "tq2-profiles", RUN_V = 2, PTS_PER_LV_START = 0, STARTER_STAT = 3, MARTIAL_FREE = 3; // the class gives its stat +3 (Martial: 3 free points to place anywhere)
const AVATARS = ["🧑", "👩", "🧔", "🧒", "👵", "🧝", "🥷", "🧙", "🐱", "🐶", "🦊", "🐼", "🐸", "🤖", "👾", "🦖"];
// what each class starts with
const CLASS_START = { berserker: ["st_axe"], duelist: ["st_knives", "st_knives"], sorcerer: ["st_wand"], cleric: ["st_pilgrim"], guardian: ["st_sword", "o_buckler"], ranger: ["st_bow"], gambler: ["st_deck"], martial: [] };
const CLASS_D = {
  berserker: ["อาวุธสองมือ ตีแรงที่สุด · การ์ดใช้ ⚡ เยอะ", "Two-handed, the hardest hits · costly cards"],
  duelist: ["ถือมีดสองเล่ม ตีหลายครั้งต่อการ์ด · Crit สูง", "Two knives, many hits per card · high crit"],
  sorcerer: ["ไม้กายสิทธิ์ · Burn ศัตรู จั่วการ์ด เร่ง ⚡", "A wand · Burn, card draw, extra ⚡"],
  cleric: ["ไม้เท้าศักดิ์สิทธิ์ · ตีแล้วฟื้น HP", "A holy staff · hits that heal"],
  guardian: ["ดาบ + โล่ไม้ · Block หนา", "Sword + wooden buckler · heavy Block"],
  ranger: ["ธนูสองมือ · ยิงศัตรูทุกตัว และหลบการโจมตี", "A two-handed bow · volleys and dodging"],
  gambler: ["สำรับไพ่ · ยิ่งไพ่ในมือเหลือน้อย ดาเมจยิ่งทวี · ทิ้งไพ่ได้ประโยชน์", "A deck of cards · the fewer cards in your hand, the more damage · discarding pays off"],
  martial: ["ไม่ถืออาวุธ · การ์ด 0⚡ ต่อ Combo · สเกลกับ stat ที่สูงที่สุด · แต้มอิสระ 3 แต้ม · การ์ดแรงขึ้น +1% ต่อเลเวลตัวละคร", "No weapon · 0⚡ combo cards · scales with your highest stat · 3 free points · +1% card power per character level"],
};
const CLASS_IDS = Object.keys(CLASS_START);
let newAvatar = 0, newStep = 1, newName = "", newCls = "berserker", newFree = null; // profile being created
const freeLeft = () => MARTIAL_FREE - Object.values(newFree || {}).reduce((a, b) => a + b, 0);
// class grid for the class step: 3 per row, short cards
function classGridHtml(sel) {
  return `<div class="clsgrid">` + CLASS_IDS.map(cls => {
    const th = THEMES[cls], k = THEME_STAT[cls], items = [...new Set(CLASS_START[cls])].map(defOf);
    return `<div class="clscard${cls === sel ? " sel" : ""}" data-sw="${cls}"><div class="cci">${th.ic}</div><b>${tr(th.n)}</b>` +
      `<small class="statk">${k ? k.toUpperCase() : L("stat สูงสุด", "top stat")}</small><div class="ccg">${items.length ? items.map(d => d.ic).join(" ") : "✋"}</div></div>`;
  }).join("") + `</div>`;
}
function classHtml(sel, attr, only) {
  return `<div class="starters${only ? " one" : ""}">` + (only ? [only] : CLASS_IDS).map(cls => {
    const th = THEMES[cls], k = THEME_STAT[cls], items = CLASS_START[cls].map(defOf), cards = cls === "martial" ? ["m_palm", "m_guard"] : [...new Set(items.map(d => d.card))];
    return `<div class="item starter${cls === sel ? " sel" : ""}" ${attr}="${cls}"><span class="ic">${th.ic}</span>` +
      `<div class="info"><b>${tr(th.n)}</b> <small>${k ? k.toUpperCase() : L("stat สูงสุด", "top stat")}</small><div class="d">${tr(CLASS_D[cls])}</div>` +
      (items.length ? `<div class="d">🎒 ${[...new Set(items.map(d => d.id))].map(id => { const d = defOf(id), n = items.filter(x => x.id === id).length; return `${d.ic} ${d.t}${n > 1 ? " ×" + n : ""}`; }).join(" · ")}</div>` : "") +
      cards.map(id => `<div class="d">🃏 <b>${CARDS[id].t}</b> · ${cardDesc(CARDS[id])}</div>`).join("") +
      `<div class="d">📈 ${k ? `<b class="statk">${k.toUpperCase()} +${STARTER_STAT}</b>` : `<b class="statk">${L("แต้มอิสระ", "free points")} ${MARTIAL_FREE}</b>`}</div></div></div>`;
  }).join("") + `</div>`;
}
const newStartStats = () => { const k = THEME_STAT[newCls], st = {}; for (const sd of STATS) st[sd.id] = STAT_BASE + (sd.id === k ? STARTER_STAT : 0) + ((newFree && newFree[sd.id]) || 0); return st; };
function classDetailHtml(cls) {
  const th = THEMES[cls], k = THEME_STAT[cls], ids = CLASS_START[cls], who = { stat: newStartStats() };
  const cards = cls === "martial" ? ["m_palm", "m_guard"] : [...new Set(ids.map(id => defOf(id).card))];
  const special = themeCards(cls).filter(id => CARDS[id].only);
  return `<div class="clsdet"><div class="cdh"><span class="cci">${th.ic}</span><div><div class="big">${tr(th.n)}</div>` +
    `<div class="sub" style="margin:0">📈 ${k ? k.toUpperCase() : L("stat สูงสุด", "top stat")} · ${tr(th.d)}</div></div></div>` +
    `<p class="cdd">${tr(CLASS_D[cls])}</p>` +
    (ids.length ? `<h4>🎒 ${L("ของเริ่มต้น", "Starting gear")}</h4>` + [...new Set(ids)].map(id => {
      const d = view({ id, r: 0 }), n = ids.filter(x => x === id).length;
      return `<div class="item"><span class="ic">${d.ic}</span><div class="info"><b>${d.t}${n > 1 ? " ×" + n : ""}</b><div class="d">${gearDesc(d, who)}</div></div></div>`;
    }).join("") : `<h4>✋ ${L("ไม่ถืออาวุธ", "No weapon")}</h4><div class="sub" style="margin:0">${L("การ์ดสเกลกับ stat ที่สูงที่สุด +3% ต่อแต้ม และ +1% ต่อเลเวลตัวละคร · ถืออาวุธเมื่อไหร่ก็กลายเป็นคลาสของอาวุธนั้น", "Cards scale with your highest stat (+3% per point) and +1% per character level · holding a weapon switches to that weapon's class")}</div>`) +
    `<h4>🃏 ${L("การ์ดเริ่มต้น (+ Strike ×5 · Defend ×4)", "Starting cards (+ Strike ×5 · Defend ×4)")}</h4><div class="cardrow small">${cards.map(id => cardHtml({ id, up: 0 }, { st: null })).join("")}</div>` +
    `<h4>✨ ${L("การ์ดพิเศษของคลาสที่จะเจอใน run", "Class-only cards you can find in runs")}</h4><div class="chips">${special.map(id => `<span class="lchip" title="${esc(cardDesc(CARDS[id]).replace(/<[^>]+>/g, ""))}">${CARDS[id].ic} ${CARDS[id].t}</span>`).join("")}</div></div>`;
}
// stats preview on the class step (Martial places its free points here)
function newStatHtml() {
  const k = THEME_STAT[newCls], val = id => STAT_BASE + (id === k ? STARTER_STAT : 0) + ((newFree && newFree[id]) || 0);
  const box = sd => `<div class="nsrow${sd.id === k ? " rec" : ""}"><span class="nsi">${sd.ic}</span>` +
    `<div class="nsinfo"><b>${sd.n}</b>${sd.id === k ? ` <small class="nsup">+${STARTER_STAT} ${L("จากคลาส", "from class")}</small>` : ""}<div class="nsd">${tr(sd.d)}</div></div>` +
    `<div class="nsval"><b class="nsv">${val(sd.id)}</b><em class="nsfx">${val(sd.id) > STAT_BASE ? statFx(sd.id, val(sd.id)) : "–"}</em></div>` +
    (k ? "" : `<div class="nsbtn"><button class="ghost" data-ns="${sd.id}|-1"${newFree[sd.id] ? "" : " disabled"}>−</button><button class="ghost" data-ns="${sd.id}|1"${freeLeft() > 0 ? "" : " disabled"}>+</button></div>`) + `</div>`;
  return `<div class="newstat"><div class="sub" style="margin:0 0 6px">📈 ${L("Stat เริ่มต้น", "Starting stats")} · ${THEMES[newCls].ic} ${tr(THEMES[newCls].n)}` +
    (k ? "" : ` · ${L("แต้มว่าง", "points left")} <b style="color:var(--gold)">${freeLeft()}</b> <small>(${L("เหลือไว้แจกทีหลังได้", "leftovers can be placed later")})</small>`) + `</div>` +
    `<div class="nslist">${STATS.map(box).join("")}</div>` +
    `<div class="sub" style="margin:6px 0 0">❤️ HP ${Math.round((BASE_HP + (newCls === "cleric" ? 8 : 0)) * (1 + SX.vit * (val("vit") - STAT_BASE)))} · ${L("เลเวลอัปได้ 4 แต้มไว้แจกเองที่หน้าตัวละคร", "each level gives 4 points to place on the Character screen")}</div></div>`;
}
// give and wear a class's starting gear and stats (once per profile)
function giveStarter(pr, cls, free) {
  let hand = 0;
  for (const id of CLASS_START[cls]) {
    const it = addItem(pr, id), d = defOf(id);
    if (d.hands === 2) { equipHand(pr, it.u, 0); hand = 2; } else if (hand < 2) equipHand(pr, it.u, hand++);
  }
  const k = THEME_STAT[cls];
  if (k) pr.stat[k] = statOf(pr, k) + STARTER_STAT;
  else if (free) { for (const id in free) pr.stat[id] = statOf(pr, id) + free[id]; pr.pts += MARTIAL_FREE - Object.values(free).reduce((a, b) => a + b, 0); }
  else pr.pts += MARTIAL_FREE;
  pr.cls = cls; pr.starter = cls; pr.sb = 1;
}
function loadStore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch {}
  if (!s || !Array.isArray(s.profiles)) return { profiles: [], current: null };
  s.profiles.forEach(ensureProfile);
  return s;
}
function ensureProfile(pr) {
  pr.gold ??= 0; pr.inv ??= {}; pr.acc ??= {}; pr.story ??= { done: 0 };
  pr.passLv ??= {}; pr.passEquip ??= Array(PASSIVE_SLOTS).fill(null);
  // fixed number of worn passives (saves from when there were 5 slots keep the first ones worn)
  pr.passEquip = [...pr.passEquip.filter(Boolean), ...Array(PASSIVE_SLOTS).fill(null)].slice(0, PASSIVE_SLOTS);
  pr.stats ??= { runs: 0, wins: 0, kills: 0, best: {} };
  pr.lvl ??= 1; pr.xp ??= 0; pr.pts ??= PTS_PER_LV_START;
  pr.stat ??= {}; for (const sd of STATS) pr.stat[sd.id] ??= STAT_BASE;
  pr.cardLv ??= {}; pr.perks ??= {};
  if (!pr.items) { pr.items = []; pr.armor = addItem(pr, "cloth").u; pr.hands = [null, null]; pr.cv = 2; }
  if (!pr.hands) pr.hands = [pr.weapon || null, (pr.acc.offhand && pr.acc.offhand[0]) || null]; // before hand slots: main weapon + right-hand item
  delete pr.weapon; delete pr.acc.offhand;
  if ((pr.cv || 1) < 2) migrateClasses(pr);
  pr.mast ??= {}; for (const tg in THEMES) pr.mast[tg] ??= { lv: 1, xp: 0, pts: 0 };
  for (const s of ACC_SLOTS) { const a = pr.acc[s.type] || []; pr.acc[s.type] = Array.from({ length: s.n }, (_, i) => a[i] ?? null); }
  pr.hands = pr.hands.map(u => u && itemBy(pr, u) && isHandId(itemBy(pr, u).id) ? u : null);
  if (twoHanded(pr)) pr.hands[1] = null;
  if (pr.run && pr.run.v !== RUN_V) { pr.gold += pr.run.gold || 0; pr.inv.potion = (pr.inv.potion || 0) + (pr.run.potions || 0); pr.run = null; } // an older run can't be resumed: bank it
  return pr;
}
// saves from before classes: re-map items and mastery, refund every stat point for a free re-spec
function migrateClasses(pr) {
  const RENAME = { st_mace: "st_sword", st_torch: "st_wand" };
  for (const it of pr.items) if (RENAME[it.id]) it.id = RENAME[it.id];
  pr.items = pr.items.filter(it => defOf(it.id));
  pr.hands = pr.hands.map(u => u && itemBy(pr, u) ? u : null);
  const h1 = itemBy(pr, pr.hands[1]);
  if (h1 && defOf(h1.id).hands === 2) pr.hands = [pr.hands[1], null];
  const OLD_CLS = { st_knives: "duelist", st_mace: "guardian", st_axe: "berserker", st_wand: "sorcerer", st_torch: "sorcerer", st_pilgrim: "cleric", wood: "guardian" };
  pr.cls = pr.starter ? OLD_CLS[pr.starter] || "guardian" : null;
  let back = 0;
  for (const k of ["str", "dex", "int", "fai", "vit"]) { back += Math.max(0, (pr.stat[k] || STAT_BASE) - STAT_BASE); pr.stat[k] = STAT_BASE; }
  pr.stat.agi = STAT_BASE;
  if (pr.sb) back -= 3; // the old starter bonus is given again below
  pr.pts = Math.max(0, (pr.pts || 0) + back) + (pr.lvl - 1); // levels now give 4 points instead of 3
  if (pr.cls && THEME_STAT[pr.cls]) pr.stat[THEME_STAT[pr.cls]] += STARTER_STAT;
  const OLD_T = { dual: "duelist", shield: "guardian", heavy: "berserker", magic: "sorcerer", fire: "sorcerer", holy: "cleric" }, nm = {};
  for (const ot in OLD_T) {
    const m = (pr.mast || {})[ot];
    if (!m) continue;
    const nt = OLD_T[ot], cur = nm[nt] || (nm[nt] = { lv: 1, xp: 0, pts: 0 });
    const refund = Object.keys(pr.perks || {}).filter(id => id.startsWith(ot)).reduce((a, id) => a + (id.endsWith("3") ? 3 : 2), 0);
    if (m.lv > cur.lv || (m.lv === cur.lv && m.xp > cur.xp)) { cur.lv = m.lv; cur.xp = m.xp; }
    cur.pts += (m.pts || 0) + refund;
  }
  pr.mast = nm; pr.perks = {};
  if (pr.cls === "duelist") { // Twin Knives are one-handed now: a pair
    const ks = pr.items.filter(i => i.id === "st_knives");
    if (ks.length === 1) { const k2 = addItem(pr, "st_knives"); if (pr.hands[0] === ks[0].u && !pr.hands[1]) pr.hands[1] = k2.u; }
  }
  if (pr.cls === "guardian" && !pr.items.some(i => i.id === "st_sword")) { const sw = addItem(pr, "st_sword"); if (!pr.hands[0] || itemBy(pr, pr.hands[0]).id === "wood") pr.hands[0] = sw.u; }
  pr.cv = 2;
}
let store = loadStore();
function saveStore() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch {} }
const prof = () => store.profiles.find(x => x.id === store.current);

function createProfile() {
  const name = newName || $("pname").value.trim();
  if (!name) { newStep = 1; renderProfiles(); return $("pname").focus(); }
  const pr = { id: Date.now().toString(36), name, avatar: AVATARS[newAvatar] };
  store.profiles.push(ensureProfile(pr));
  giveStarter(pr, newCls, newCls === "martial" ? (newFree || {}) : null);
  $("pname").value = ""; newName = ""; newStep = 1; newFree = null;
  selectProfile(pr.id);
}
function profNext() {
  const name = $("pname").value.trim();
  if (!name) return $("pname").focus();
  newName = name; newStep = 2; renderProfiles();
}
function selectProfile(id) { store.current = id; saveStore(); goHome(); }
function deleteProfile(id) {
  const pr = store.profiles.find(x => x.id === id);
  if (!pr || !confirm(t("delConfirm", pr.name))) return;
  store.profiles = store.profiles.filter(x => x.id !== id);
  if (store.current === id) store.current = null;
  saveStore(); renderProfiles();
}
const profLine = x => `💰 ${x.gold} · ${L(`${x.stats.runs} run · ชนะ ${x.stats.wins}`, `${x.stats.runs} run${x.stats.runs === 1 ? "" : "s"} · ${x.stats.wins} won`)}`;
function renderProfiles() {
  $("profBack").classList.toggle("hidden", !prof());
  $("plist").innerHTML = store.profiles.length ? store.profiles.map(x =>
    `<div class="item${x.id === store.current ? " sel" : ""}" data-id="${x.id}"><span class="ic">${x.avatar}</span><div class="info"><b>${esc(x.name)}</b><div class="d">${profLine(x)}</div></div><button class="del" data-del="${x.id}" title="${t("del")}">🗑️</button></div>`
  ).join("") : `<div class="sub center">${t("noProfiles")}</div>`;
  $("np1").classList.toggle("hidden", newStep !== 1);
  $("np2").classList.toggle("hidden", newStep < 2);
  document.querySelector(".newp").classList.toggle("wide", newStep >= 2);
  $("profiles").classList.toggle("creating", newStep >= 2);
  $("avatars").innerHTML = AVATARS.map((a, i) => `<span data-i="${i}" class="${i === newAvatar ? "sel" : ""}">${a}</span>`).join("");
  $("nextBtn").textContent = L("ถัดไป ▶", "Next ▶");
  if (newStep >= 2) {
    const head = `<span style="font-size:32px">${AVATARS[newAvatar]}</span> <b>${esc(newName)}</b>`;
    $("createBtn").classList.toggle("hidden", newStep !== 3);
    if (newStep === 3 && newCls === "martial") newFree ??= {};
    $("npHead").innerHTML = head + `<div class="sub" style="margin:4px 0 0">${newStep === 2 ? L("เลือกคลาส (ผสมอาวุธคลาสอื่นทีหลังได้อิสระ)", "Pick a class (you can mix in other classes' gear later)") : L("ตรวจคลาสและ stat เริ่มต้น แล้วกดยืนยัน · กดคลาสอื่นเพื่อสลับได้", "Check the class and starting stats, then confirm · tap another class to switch")}</div>`;
    // wide screens: grid on the left, details on the right; phones: grid (step 2), then details (step 3)
    $("starterPick").innerHTML = `<div class="clsflow${newStep === 3 ? " picked" : ""}"><div class="clsleft">${classGridHtml(newStep === 3 ? newCls : "")}</div>` +
      `<div class="clsright">${newStep === 3 ? classDetailHtml(newCls) + newStatHtml() : `<div class="clsph">👈 ${L("เลือกคลาสเพื่อดูรายละเอียดและ stat", "Pick a class to see its details and stats")}</div>`}</div></div>`;
    $("npBack").textContent = newStep === 2 ? L("◀ แก้ชื่อ", "◀ Back") : L("◀ เปลี่ยนคลาส", "◀ Change class");
    $("createBtn").textContent = L("✔ ยืนยัน สร้างโปรไฟล์", "✔ Confirm and create");
  }
}

// ================= screens =================
let state = "profiles";
function show(id) {
  ["home", "profiles", "mshop", "inv", "tree", "story", "run", "play"].forEach(s => $(s).classList.toggle("hidden", s !== id));
  $("ov").classList.add("hidden");
  $("uiLang").classList.toggle("hidden", id === "home" || id === "play" || id === "run");
  if ($("ver")) $("ver").classList.toggle("hidden", id !== "home" && id !== "profiles");
}
function openProfiles() { state = "profiles"; show("profiles"); renderProfiles(); if (!store.profiles.length) $("pname").focus(); }

const MODES = [
  { id: "map", ic: "🗺️", t: ["แผนที่อาณาจักร", "Kingdom Map"], d: ["3 Act · เลือกเส้นทางบนแผนที่แตกสาย · บอสท้าย Act", "3 acts · pick your path on a branching map · a boss ends each act"] },
  { id: "rooms", hidden: true, ic: "🚪", t: ["ห้องใต้ดิน", "Dungeon Rooms"], d: ["18 ห้อง · เลือกประตู 1 บาน ทุกห้อง · run สั้น", "18 rooms · pick one door each room · a short run"] },
  { id: "endless", ic: "♾️", t: ["หอคอยไร้สิ้นสุด", "Endless Tower"], d: ["ขึ้นไปเรื่อยๆ บอสทุก 5 ชั้น · แข่งสถิติชั้นสูงสุด", "Climb forever, a boss every 5 floors · chase your best floor"] },
  { id: "arena", ic: "🃏", t: ["สนามจัดเด็ค", "Deck Arena"], d: ["เลือกการ์ดเข้าเด็คเองก่อนลุย เหมือนเลือกเมล็ดพืช · 18 ห้อง", "Hand-pick your deck before the run, seed-packet style · 18 rooms"] },
  { id: "pvp", ic: "⚔️", t: ["PvP ออนไลน์", "Online PvP"], d: ["ดวลกับเพื่อนผ่านอินเทอร์เน็ต ผลัดกันเล่นทีละเทิร์น · ตั้งกติกาได้ (ตัวจริง / จัดเด็ค / stat เท่ากัน)", "Duel a friend online, a turn each · rules: real builds / deck arena / equal stats"] },
  { id: "story", ic: "📖", t: ["เนื้อเรื่อง", "Story"], d: ["The Winning of Kinghood · อ่านแล้วสู้ทีละบท", "The Winning of Kinghood · read, then fight chapter by chapter"] },
];
const modeOf = id => MODES.find(m => m.id === id);
let menuSel = 0, menuView = "main";
function setMenuView(v) { menuView = v; menuSel = 0; renderMenu(); }
function homeMenu() {
  const pr = prof();
  if (menuView === "play") return [
    ...MODES.filter(md => !md.hidden).map(md => ({ ic: md.ic, t: tr(md.t), d: tr(md.d) + bestText(pr, md.id), go: () => chooseMode(md.id) })),
    { ic: "↩️", t: t("mBack"), d: t("mBackD"), go: () => setMenuView("main") },
  ];
  const r = pr.run;
  return [
    ...(r ? [{ ic: "▶️", t: L("เล่น run ต่อ", "Continue run"), d: `${modeOf(r.mode).ic} ${tr(modeOf(r.mode).t)} · ❤️ ${r.hp}/${r.maxHp} · 💰 ${r.gold}`, go: openRun }] : []),
    { ic: "🎮", t: t("mPlay"), d: t("mPlayD"), go: () => setMenuView("play") },
    { ic: "🏪", t: t("mShop"), d: t("mShopD"), go: openMShop },
    { ic: "🎒", t: t("mInv") + (pr.pts ? " ⭐" : ""), d: t("mInvD") + (pr.pts ? L(` · มีแต้ม stat ว่าง ${pr.pts}`, ` · ${pr.pts} stat points to spend`) : ""), go: openInv },
    { ic: "🌳", t: L("ความชำนาญอาวุธ", "Weapon Mastery") + (Object.values(pr.mast).some(m => m.pts) ? " ⭐" : ""), d: L("อัปเลเวลการ์ดถาวรและ perk ของแต่ละแนวอาวุธ", "Permanently level up each theme's cards and perks"), go: openTree },
    { ic: "💾", t: L("สำรอง / โหลดเซฟ", "Backup / Restore save"), d: L("คัดลอกรหัสเซฟเก็บไว้ หรือวางรหัสเพื่อย้ายเซฟมาเครื่องนี้", "Copy a save code to keep, or paste one to move a save here"), go: openBackup },
    { ic: "🌐", t: t("mLang"), d: t("mLangD"), go: toggleUi },
  ];
}
// ---------- save backup: the whole save as one text code ----------
const saveCode = () => btoa(unescape(encodeURIComponent(JSON.stringify(store))));
function closeBackup() { $("ov").classList.add("hidden"); $("ov").innerHTML = ""; if (!prof()) openProfiles(); else goHome(); }
function openBackup() {
  const el = $("ov"); el.classList.remove("hidden");
  el.innerHTML = `<div class="ovbox" style="max-width:600px"><div class="big">💾 ${L("สำรอง / โหลดเซฟ", "Backup / Restore save")}</div>` +
    `<div class="sub">${L("1) รหัสเซฟของเครื่องนี้ (กดคัดลอกแล้วเก็บไว้)", "1) This device's save code (copy it and keep it)")}</div>` +
    `<textarea id="bkOut" readonly rows="3" style="width:100%;font-size:11px">${saveCode()}</textarea>` +
    `<div class="row" style="justify-content:center"><button id="bkCopy">📋 ${L("คัดลอก", "Copy")}</button></div>` +
    `<div class="sub" style="margin-top:12px">${L("2) วางรหัสเซฟเพื่อโหลด (จะแทนที่เซฟในเครื่องนี้)", "2) Paste a save code to load it (replaces this device's save)")}</div>` +
    `<textarea id="bkIn" rows="3" style="width:100%;font-size:11px"></textarea><div class="sub" id="bkMsg" style="min-height:1.4em"></div>` +
    `<div class="row" style="justify-content:center"><button id="bkLoad">📥 ${L("โหลดเซฟ", "Load save")}</button><button class="ghost" id="bkClose">${L("ปิด", "Close")}</button></div></div>`;
  $("bkClose").onclick = closeBackup;
  $("bkCopy").onclick = async () => {
    const ta = $("bkOut"); ta.select();
    try { await navigator.clipboard.writeText(ta.value); } catch { try { document.execCommand("copy"); } catch {} }
    $("bkMsg").textContent = L("คัดลอกแล้ว ✔", "Copied ✔");
  };
  $("bkLoad").onclick = () => {
    let sv; try { sv = JSON.parse(decodeURIComponent(escape(atob($("bkIn").value.trim())))); } catch {}
    if (!sv || !Array.isArray(sv.profiles) || !sv.profiles.length) { $("bkMsg").textContent = L("รหัสไม่ถูกต้อง", "That code is not valid"); return; }
    if (!confirm(L(`โหลดเซฟ ${sv.profiles.length} โปรไฟล์ แทนที่เซฟในเครื่องนี้?`, `Load ${sv.profiles.length} profile(s) and replace this device's save?`))) return;
    sv.profiles.forEach(ensureProfile);
    if (!sv.profiles.some(x => x.id === sv.current)) sv.current = sv.profiles[0].id;
    store = sv; saveStore(); closeBackup();
  };
}
function bestText(pr, id) {
  if (id === "pvp") return pr.pvp ? ` · 🏆 ${pr.pvp.w} · 💀 ${pr.pvp.l}` : "";
  const b = pr.stats.best[id];
  if (id === "story") return ` · ${L("ผ่านแล้ว", "cleared")} ${pr.story.done}/${EPISODE.chapters.length}`;
  if (!b) return "";
  return id === "endless" ? L(` · สถิติ ชั้น ${b}`, ` · best floor ${b}`) : b === "win" ? L(" · เคยชนะแล้ว 🏆", " · cleared 🏆") : L(` · ไกลสุด Act ${b.act} ชั้น ${b.floor}`, ` · best Act ${b.act} floor ${b.floor}`);
}
function renderMenuList(listId, descId, items, sel) {
  $(listId).innerHTML = items.map((it, i) =>
    `<li class="mi${i === sel ? " sel" : ""}${it.lock ? " lock" : ""}" data-i="${i}"><span class="arrow">▶</span>${it.ic} ${it.t}</li>`).join("");
  $(descId).textContent = items[sel] ? items[sel].d : "";
}
const renderMenu = () => renderMenuList("menu", "menuDesc", homeMenu(), menuSel);
function moveMenu(d) { const n = homeMenu().length; menuSel = (menuSel + d + n) % n; renderMenu(); }
function goHome() {
  const pr = prof();
  if (!pr) return openProfiles();
  state = "home"; show("home"); closePause();
  run = pr.run || null;
  if (!pr.starter) {
    $("ov").classList.remove("hidden");
    $("ov").innerHTML = `<div class="ovbox"><div style="font-size:44px">⚔️</div><div class="big">${L("เลือกคลาส", "Pick a class")}</div>` +
      `<div class="sub">${L("ได้ของเริ่มต้นฟรี (ครั้งเดียว) · Martial ได้แต้มอิสระ 3 แต้มไปแจกที่หน้าตัวละคร", "Free starting gear (once) · Martial gets 3 free points to place on the Character screen")}</div>` + classHtml("", "data-pick-starter") + `</div>`;
  }
  $("profileChip").innerHTML = `<span class="av">${pr.avatar}</span><b>${esc(pr.name)}</b><small>${profLine(pr)} · ${t("change")}</small>`;
  menuSel = Math.min(menuSel, homeMenu().length - 1);
  renderMenu();
}
function chooseMode(id) {
  if (id === "pvp") return pvpOpen();
  const pr = prof();
  if (pr.run && !confirm(L("มี run ที่ยังเล่นไม่จบ · ยอมแพ้ run นั้นแล้วเริ่มใหม่? (ทองที่เก็บได้เข้าคลัง)", "You have a run in progress · give it up and start a new one? (its gold is banked)"))) return;
  if (pr.run) endRun(false, true);
  if (id === "story") return openStory();
  if (id === "arena") return openArena();
  newRun(id);
}

// ---------- Deck Arena: choose the deck before the run (slots + a point budget, like picking seed packets) ----------
const ARENA_SLOTS = 12, ARENA_MIN = 12, ARENA_PTS = 26, ARENA_COST = [1, 2, 3, 5], ARENA_COPY = [4, 3, 2, 1];
let arena = null;
function arenaPool() {
  const pr = prof(), tags = statsOf(pr).tags, own = new Set(pr.items.map(i => defOf(i.id)).filter(Boolean).map(d => d.card));
  return Object.keys(CARDS).filter(id => { const d = CARDS[id]; if (d.only) return !!tags[d.tag]; if (d.r === 0 && d.tag) return own.has(id) || !!tags[d.tag]; return true; })
    .sort((a, b) => CARDS[a].r - CARDS[b].r || CARDS[a].cost - CARDS[b].cost || CARDS[a].t.localeCompare(CARDS[b].t));
}
const arenaFree = id => CARDS[id].cost === 0 && CARDS[id].type === "atk";
// ---- price by power: a card's rough worth per play (in damage), minus what its energy would do with Strikes ----
// AW = how much one point of each effect is worth (tuned with bot duels in Deck Arena PvP); ARENA_ADJ = per-card corrections
const AW = { block: 1.2, burn: 1.8, heal: 1.1, bpt: 3, dodge: 16, draw: 4, en: 5, vuln: 6, weak: 4, str: 10, combo: 3, lone: 1.8, free: 2, energy: 6 };
// what the auto-pick thinks cards are really worth (kept apart from the prices above)
const AV = { block: 1.2, burn: 2.2, heal: 1, bpt: 3, dodge: 8, draw: 4, en: 6, vuln: 5, weak: 4, str: 10, combo: 4, lone: 3, free: 3, energy: 6 };
const ARENA_ADJ = { twin: -1 };
// worth split by what scales it: hits/block/heal grow with weapon scaling, Burn with half of it, utility with the deck's overall power
function cardParts(id, W = AW) {
  const d = CARDS[id], hit = (d.dmg || 0) * (d.hits || 1);
  const dmg = hit * (1 + 0.05 * ((d.hits || 1) - 1)) * (d.all ? 1.2 : 1) * (d.exec ? 1.35 : 1) + (d.slam ? 10 : 0) + (d.combo || 0) * W.combo * (d.hits || 1) + (d.lone ? hit * d.lone * W.lone : 0) + (d.grow || 0) * 1.5 + (d.dumpDmg || 0) * 2.5 + (d.onDisc ? (d.onDisc.dmg || 0) * 0.8 : 0);
  const def = (d.block || 0) * W.block + (d.heal || 0) * W.heal + (d.bpt || 0) * W.bpt + (d.onDisc ? (d.onDisc.block || 0) * 0.5 : 0);
  const burn = (d.burn || 0) * W.burn * (d.all ? 1.2 : 1);
  const util = (d.draw || 0) * W.draw + (d.en || 0) * W.en + (d.vuln || 0) * W.vuln + (d.weak || 0) * W.weak + (d.dodge || 0) * W.dodge + (d.onDisc ? (d.onDisc.dodge || 0) * 4 : 0) + (d.crit || 0) * 20
    + (d.str || 0) * W.str + (d.dpt || 0) * 20 + (d.handUp ? 10 : 0) + (d.loneAll || 0) * 120 + (d.refresh ? 2 : 0) - (d.hpCost || 0) * 0.5 + (d.cost === 0 && d.type === "atk" ? W.free : 0);
  const k = d.exhaust && d.type !== "pow" ? 0.85 : 1;
  return { dmg: dmg * k, def: def * k, burn: burn * k, util: util * k, cost: d.cost || 0 };
}
// net worth of one play: (parts at the given scaling) minus what the energy would do with Strikes at deck scaling
function cardWorth(id, mult = 1, deck = 1, W = AW) {
  const p = cardParts(id, W);
  return (p.dmg + p.def) * mult + p.burn * (1 + (mult - 1) / 2) + p.util * deck - p.cost * W.energy * deck;
}
const arenaCost = id => clamp(1 + Math.round(cardWorth(id) / 3) + (ARENA_ADJ[id] || 0), 1, 9);
const arenaCopy = id => Math.min(ARENA_COPY[CARDS[id].r], arenaFree(id) || (CARDS[id].r === 0 && CARDS[id].tag) ? 2 : 9); // free attacks and weapon cards: 2 at most
function arenaUsed() { let n = 0, p = 0; for (const id in arena.sel) { n += arena.sel[id]; p += arena.sel[id] * arenaCost(id); } return { n, p }; }
function arenaCan(id) { const u = arenaUsed(); return u.n < ARENA_SLOTS && (arena.sel[id] || 0) < arenaCopy(id) && u.p + arenaCost(id) <= ARENA_PTS; }
function arenaAdd(id) { if (!arena || !CARDS[id] || !arenaCan(id)) return; arena.sel[id] = (arena.sel[id] || 0) + 1; renderArena(); }
function arenaRemove(id) { if (!arena || !arena.sel[id]) return; if (--arena.sel[id] <= 0) delete arena.sel[id]; renderArena(); }
// auto pick: the best total worth for exactly ARENA_SLOTS cards within the budget (a small knapsack), with a little randomness for variety
function arenaAuto(quiet) {
  const st = arena && arena.pvp && pv ? statsOf(pvpClone(prof(), "B")) : statsOf(prof()), tm = st.tm || {};
  const mult = id => { const d = CARDS[id]; return d.tag ? tm[d.tag] || 1 : tm._atk || 1; };
  const items = [];
  // net worth at your scaling: energy is worth what a scaled Strike would do; 2⚡+ cards lose a little (a deck of only 2⚡ cards wastes energy)
  for (const id of arenaPool()) { const w = cardWorth(id, mult(id), tm._atk || 1, AV) + (CARDS[id].tag && st.tags[CARDS[id].tag] ? 4 : 0) - Math.max(0, (CARDS[id].cost || 0) - 1) * 3 + Math.random() * 3; for (let k = 0; k < arenaCopy(id); k++) items.push([id, w, arenaCost(id)]); }
  const S = ARENA_SLOTS, P = ARENA_PTS, NEG = -1e9;
  // layers[i][n][p] = best worth using the first i items, n cards, p points
  const layers = [Array.from({ length: S + 1 }, () => Array(P + 1).fill(NEG))]; layers[0][0][0] = 0;
  items.forEach(([, w, c], i) => { const a = layers[i], b = a.map(r => r.slice()); for (let n = 0; n < S; n++) for (let p = 0; p + c <= P; p++) if (a[n][p] > NEG && a[n][p] + w > b[n + 1][p + c]) b[n + 1][p + c] = a[n][p] + w; layers.push(b); });
  const last = layers[items.length][S];
  let bp = -1, best = NEG; for (let p = 0; p <= P; p++) if (last[p] > best) { best = last[p]; bp = p; }
  arena.sel = {};
  if (bp < 0) { if (!quiet) renderArena(); return; }
  let n = S, p = bp;
  for (let i = items.length - 1; i >= 0 && n > 0; i--) { const [id, w, c] = items[i]; if (layers[i + 1][n][p] !== layers[i][n][p] && p - c >= 0 && layers[i][n - 1][p - c] > NEG && Math.abs(layers[i][n - 1][p - c] + w - layers[i + 1][n][p]) < 1e-6) { arena.sel[id] = (arena.sel[id] || 0) + 1; n--; p -= c; } }
  if (!quiet) renderArena();
}
function openArena(pvp) {
  const pr = prof(), pool = arenaPool(), sv = (pvp && pv && pv.sel) || pr.arenaDeck || {};
  arena = { sel: {}, tab: "cls", pvp: !!pvp };
  for (const id in sv) if (pool.includes(id)) for (let i = 0; i < sv[id]; i++) if (arenaCan(id)) arena.sel[id] = (arena.sel[id] || 0) + 1;
  if (!arenaUsed().n) return arenaAuto();
  renderArena();
}
function closeArena() { const back = arena && arena.pvp && pv; arena = null; if (back) return renderPv(); $("ov").classList.add("hidden"); $("ov").innerHTML = ""; if (!prof()) openProfiles(); else goHome(); }
function renderArena() {
  const pool = arenaPool(), u = arenaUsed(), el = $("ov");
  el.classList.remove("hidden");
  const tabs = [["cls", "🔗 " + L("คลาส", "Class")], ["atk", "⚔️ " + L("โจมตี", "Attack")], ["skl", "🛡️ " + L("สกิล", "Skill")], ["pow", "✨ " + L("พลัง", "Power")]];
  const tgs = statsOf(prof()).tags, mine = id => !!(CARDS[id].tag && tgs[CARDS[id].tag]); // cards of the classes you hold get their own tab
  const inTab = id => arena.tab === "cls" ? mine(id) : !mine(id) && CARDS[id].type === arena.tab;
  const chips = Object.keys(arena.sel).sort((a, b) => CARDS[b].r - CARDS[a].r || CARDS[a].t.localeCompare(CARDS[b].t)).map(id => {
    const d = CARDS[id]; return `<span class="archip" style="--rc:${CARD_RC[d.r]}" data-a="arm|${id}" title="${L("กดเพื่อเอาออก 1 ใบ", "Click to remove one")}">${d.ic} ${esc(d.t)}${arena.sel[id] > 1 ? " ×" + arena.sel[id] : ""} <small>◆${arenaCost(id)}</small></span>`;
  }).join("") || `<span class="sub" style="margin:0">${L("ยังไม่ได้เลือกการ์ด", "No cards picked yet")}</span>`;
  const grid = pool.filter(inTab).map(id => {
    const n = arena.sel[id] || 0, ok = arenaCan(id);
    return cardHtml({ id, up: 0 }, { cls: (n ? "picked" : "") + (ok ? "" : " no"), attrs: ` data-a="apick|${id}"`, badge: `<div class="abdg">${n ? "×" + n + " · " : ""}◆${arenaCost(id)}</div>` });
  }).join("") || `<div class="sub" style="margin:auto">${L("ไม่มีการ์ดในหมวดนี้", "No cards in this tab")}</div>`;
  el.innerHTML = `<div class="ovbox arenabox"><div class="arhead"><div><div class="big" style="margin:0">🃏 ${L("สนามจัดเด็ค", "Deck Arena")}</div>` +
    `<div class="sub arsub" style="margin:2px 0 0">${L("เลือกการ์ดเข้าเด็ค · การ์ดเริ่มต้นจากอาวุธใส่ให้ฟรี", "Pick your deck · your weapon's starting cards are added free")}</div></div>` +
    `<div class="arcount"><span class="${u.n >= ARENA_MIN ? "" : "bad"}">🃏 ${u.n}/${ARENA_SLOTS}</span><span class="${u.p >= ARENA_PTS ? "full" : ""}">◆ ${u.p}/${ARENA_PTS}</span></div>` +
    `<div class="row" style="gap:8px"><button class="ghost" data-a="aauto">🎲 ${L("สุ่มให้", "Auto")}</button><button class="ghost" data-a="aclr">🗑️ ${L("ล้าง", "Clear")}</button><button class="ghost" data-a="aexit">${L("ยกเลิก", "Cancel")}</button>` +
    `<button data-a="astart"${u.n < ARENA_MIN ? " disabled" : ""}>${arena.pvp ? "✔ " + L("ใช้เด็คนี้", "Use this deck") : "▶ " + L("ลุยเลย", "Start")}</button></div></div>` +
    `<div class="arsel">${chips}</div>` +
    `<div class="artabs">${tabs.map(([k, t]) => `<button class="${arena.tab === k ? "" : "ghost"}" data-a="atab|${k}">${t}</button>`).join("")}</div>` +
    `<div class="argrid"><div class="cardrow mini">${grid}</div></div>` +
    `<div class="sub arfoot" style="margin:4px 0 0">${L("◆ = แต้มการ์ด คิดตามความแรงของการ์ด (1–9) · ต้องเลือกครบ 12 ใบ · การ์ดโจมตี 0⚡ ใส่ได้ไม่เกิน 2 ใบ · Backspace เอาออก 1 ใบ", "◆ = card points, priced by how strong the card is (1–9) · fill all 12 slots · at most 2 copies of a 0⚡ attack · Backspace removes one")}</div></div>`;
}

// ================= PvP: two players, one duel, a turn each, over PeerJS =================
// Each side runs its own combat against a "proxy" of the other player (the proxy foe mirrors their HP / Block / statuses).
// You play your whole turn locally; the damage you dealt goes over the wire when the turn ends, and the other side applies it to itself.
const PV_MODES = [
  { id: "A", ic: "🎒", t: ["ตัวจริง", "Real builds"], d: ["ใช้ stat เกียร์ และ passive ของตัวละครจริง · คนที่อัปมากกว่าได้เปรียบ", "Your real stats, gear and passives · more progress is an edge"] },
  { id: "B", ic: "🃏", t: ["สนามจัดเด็ค", "Deck Arena"], d: ["stat เท่ากัน ไม่มีเกียร์เสริม · ต่างคนต่างจัดเด็ค 12 ใบ งบ 26 แต้ม", "Equal stats, no extra gear · each side builds a 12-card, 26-point deck"] },
  { id: "C", ic: "⚖️", t: ["stat เท่ากัน", "Equal stats"], d: ["แต้ม stat เท่ากันทั้งสองฝั่ง · แต่ยังใช้เกียร์ การ์ด และความชำนาญของตัวเอง", "The same stat budget for both · but your own gear, cards and mastery"] },
];
const PV_HP = [1, 1.5, 2], NORM_PTS = 40, NORM_LV = 12, PV_FATIGUE = 8;
const PVP_DEF = { e: "🧑", n: "Opponent", hp: 1, moves: [{}] };
let pv = null; // the room: { role, phase: menu|wait|join|lobby|duel|over, code, cfg, ready, oready, opub, opp, build, sel, msg }
const pvNum = (x, lo = 0, hi = 9999) => { x = +x; return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; };
const pvpWho = () => { const pr = prof(); return { name: pr.name, avatar: pr.avatar, cls: pr.cls }; };
const pvpWhoIn = w => ({ name: String((w && w.name) || "?").slice(0, 20), avatar: AVATARS.includes(w && w.avatar) ? w.avatar : "🧑", cls: CLASS_IDS.includes(w && w.cls) ? w.cls : null });
const pvpCode = () => Array.from({ length: 5 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

// ---- transport (PeerJS, loaded only when you open PvP; tests swap these four methods) ----
const PEER_URLS = ["https://cdnjs.cloudflare.com/ajax/libs/peerjs/1.5.4/peerjs.min.js", "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js", "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js"];
const NET = {
  peer: null, conn: null,
  lib() {
    return window.Peer ? Promise.resolve() : new Promise((ok, no) => {
      let i = 0;
      const next = () => { if (i >= PEER_URLS.length) return no(new Error("peerjs")); const s = document.createElement("script"); s.src = PEER_URLS[i++]; s.onload = ok; s.onerror = () => { s.remove(); next(); }; document.head.appendChild(s); };
      next();
    });
  },
  attach(c, h) { this.conn = c; c.on("open", () => h.conn()); c.on("data", d => h.msg(d)); c.on("close", () => h.close()); c.on("error", () => h.close()); },
  async host(code, h) {
    await this.lib();
    const p = this.peer = new Peer("tqpvp-" + code);
    p.on("open", () => h.open());
    p.on("connection", c => { if (this.conn && this.conn.open) return c.close(); this.attach(c, h); });
    p.on("error", e => h.err(e));
  },
  async join(code, h) {
    await this.lib();
    const p = this.peer = new Peer();
    p.on("open", () => this.attach(p.connect("tqpvp-" + code, { reliable: true }), h));
    p.on("error", e => h.err(e));
  },
  send(o) { try { if (this.conn && this.conn.open) this.conn.send(o); } catch {} },
  close() { try { this.conn && this.conn.close(); } catch {} try { this.peer && this.peer.destroy(); } catch {} this.peer = this.conn = null; },
};

// ---- room flow ----
function pvpOpen() {
  if (pv) NET.close();
  pv = { role: null, phase: "menu", code: "", cfg: { mode: "A", hp: 1.5 }, ready: false, oready: false, opub: null, opp: null, build: null, sel: null, msg: "", gone: false };
  renderPv();
}
function pvpExit() {
  NET.close(); pv = null; busy = false; run = null;
  $("ov").classList.add("hidden"); $("ov").innerHTML = ""; goHome();
}
function pvpNetErr(e) {
  if (!pv) return;
  NET.close(); pv.phase = "menu"; pv.role = null;
  pv.msg = L("เชื่อมต่อไม่ได้ · ตรวจรหัสห้องและอินเทอร์เน็ต", "Could not connect · check the room code and your internet") + (e && e.type ? ` (${e.type})` : "");
  renderPv();
}
function pvpHost(retry = 0) {
  pv.role = "host"; pv.phase = "wait"; pv.code = pvpCode(); pv.msg = ""; renderPv();
  NET.host(pv.code, {
    open() { renderPv(); }, conn() {}, msg: pvpMsg, close: pvpClosed,
    err(e) { if (e && e.type === "unavailable-id" && retry < 4) { NET.close(); return pvpHost(retry + 1); } pvpNetErr(e); },
  }).catch(pvpNetErr);
}
function pvpJoin() {
  const code = ($("pvCode") ? $("pvCode").value : "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length < 4) { pv.msg = L("ใส่รหัสห้องก่อน", "Enter the room code first"); return renderPv(); }
  pv.role = "guest"; pv.phase = "join"; pv.code = code; pv.msg = ""; renderPv();
  const tm = setTimeout(() => { if (pv && pv.phase === "join") pvpNetErr({ type: "timeout" }); }, 15000);
  NET.join(code, { open() {}, conn() { clearTimeout(tm); NET.send({ t: "hi", who: pvpWho(), ver: GAME_VER }); }, msg: pvpMsg, close: pvpClosed, err: e => { clearTimeout(tm); pvpNetErr(e); } }).catch(pvpNetErr);
}
function pvpClosed() {
  if (!pv) return;
  if (pv.phase === "duel") return pvpEnd(true, "left");
  if (pv.phase === "over") { pv.gone = true; return; }
  pv.oready = false; pv.opub = null; pv.opp = null; pv.ready = false; pv.build = null;
  if (pv.role === "host" && pv.phase !== "menu") { pv.phase = "wait"; pv.msg = L("เพื่อนออกจากห้องแล้ว", "Your friend left the room"); }
  else { NET.close(); pv.phase = "menu"; pv.role = null; pv.msg = L("ห้องถูกปิดแล้ว", "The room was closed"); }
  renderPv();
}
function pvpCfg(p) { // host changes a room setting: everybody has to ready up again
  if (!pv || pv.role !== "host") return;
  const was = JSON.stringify(pv.cfg);
  Object.assign(pv.cfg, p);
  if (JSON.stringify(pv.cfg) === was) return;
  pv.ready = false; pv.oready = false; pv.opub = null; pv.build = null;
  if (pv.cfg.mode === "B") pvpEnsureDeck();
  NET.send({ t: "cfg", cfg: pv.cfg, who: pvpWho(), ver: GAME_VER });
  renderPv();
}
// Deck Arena deck of this room: your last loadout if it still fits, else an auto-built one
function pvpEnsureDeck() {
  if (pv.sel && Object.keys(pv.sel).length) return;
  const keep = arena; arena = { sel: {}, tab: "cls", pvp: true };
  const pool = arenaPool(), sv = prof().arenaDeck || {};
  for (const id in sv) if (pool.includes(id)) for (let i = 0; i < sv[id]; i++) if (arenaCan(id)) arena.sel[id] = (arena.sel[id] || 0) + 1;
  if (arenaUsed().n < ARENA_MIN) arenaAuto(true);
  pv.sel = { ...arena.sel }; arena = keep;
}
const pvpDeckInfo = () => { const keep = arena; arena = { sel: pv.sel || {} }; const u = arenaUsed(); arena = keep; return u; };
function pvpDeckDone() { // back from the deck picker
  pv.sel = { ...arena.sel }; prof().arenaDeck = { ...arena.sel }; saveStore();
  arena = null;
  if (pv.ready) { pv.ready = false; pv.build = null; NET.send({ t: "ready", on: false }); }
  renderPv();
}
function pvpReady() {
  if (!pv || pv.phase !== "lobby") return;
  if (pv.ready) { pv.ready = false; pv.build = null; NET.send({ t: "ready", on: false }); return renderPv(); }
  if (pv.cfg.mode === "B") { pvpEnsureDeck(); if (pvpDeckInfo().n < ARENA_MIN) return; }
  pv.build = pvpMake(); pv.ready = true;
  NET.send({ t: "ready", on: true, pub: pvpPub(pv.build) });
  renderPv(); pvpTryGo();
}
function pvpTryGo() {
  if (pv && pv.role === "host" && pv.phase === "lobby" && pv.ready && pv.oready && pv.build && pv.opub) { NET.send({ t: "go" }); pvpStart(true); }
}

// ---- builds: real / equal stats / arena deck ----
// stat spread used when both sides get "equal stats": meet the worn gear's requirements, then VIT and the weapon's scaling stats
function normStat(q) {
  const st = {}; for (const s of STATS) st[s.id] = STAT_BASE;
  const hands = handViews(q), gear = [...hands, armorView(q), ...accOf(q)];
  let pts = NORM_PTS;
  const need = {};
  for (const g of gear) for (const k in (g.req || {})) need[k] = Math.max(need[k] || 0, g.req[k]);
  for (const k of Object.keys(need).sort((a, b) => need[b] - need[a])) { if (!(k in st)) continue; const add = Math.min(pts, Math.max(0, need[k] - STAT_BASE)); st[k] += add; pts -= add; }
  const sc = {};
  for (const g of hands) if (isWeaponId(g.id)) for (const k in (g.sc || {})) sc[k] = (sc[k] || 0) + (GRADE[g.sc[k]] || 0);
  const keys = Object.keys(sc).filter(k => k in st).sort((a, b) => sc[b] - sc[a]), tgt = keys.length ? keys : ["str"];
  const vit = Math.floor(pts * 0.15); st.vit += vit; pts -= vit;
  tgt.forEach((k, i) => { const add = i === tgt.length - 1 ? pts : Math.floor(pts * 0.6); st[k] += add; pts -= add; });
  return st;
}
function pvpClone(pr, mode) {
  if (mode === "A") return pr;
  const q = { ...pr, lvl: NORM_LV };
  if (mode === "B") { // only the weapons you hold (at base quality): no armor, accessories, passives, perks or card levels
    const hs = new Set(pr.hands.filter(Boolean));
    q.items = pr.items.map(it => hs.has(it.u) ? { ...it, r: 0, e: 0 } : it);
    q.armor = null; q.acc = Object.fromEntries(ACC_SLOTS.map(s => [s.type, Array(s.n).fill(null)]));
    q.passEquip = Array(PASSIVE_SLOTS).fill(null); q.perks = {}; q.cardLv = {};
  }
  q.stat = normStat(q);
  return q;
}
function pvpMake() {
  const pr = prof(), cfg = pv.cfg, st = statsOf(pvpClone(pr, cfg.mode));
  let ids;
  if (cfg.mode === "B") { pvpEnsureDeck(); ids = [...st.cards]; for (const id in pv.sel) for (let i = 0; i < pv.sel[id]; i++) ids.push(id); }
  else ids = [...Array(5).fill("strike"), ...Array(4).fill("defend"), ...st.cards];
  const hp = Math.max(20, Math.round(st.hp * cfg.hp * (cfg.mode === "B" ? 2 : 1))); // an arena deck has no filler cards: more HP so a duel lasts a few turns
  const block = (st.startBlock || 0) + (st.pass && st.pass.fortify ? PF.fortify(st.pass.fortify) : 0), dodge = (st.perkG && st.perkG.startDodge) || 0;
  return { st, ids, hp, block, dodge };
}
const pvpPub = b => ({ hp: b.hp, block: b.block, dodge: b.dodge, gear: b.st.gear, n: b.ids.length });

// ---- messages ----
function pvpMsg(m) {
  if (!pv || !m || typeof m !== "object") return;
  if (m.t === "hi" && pv.role === "host") {
    pv.opp = pvpWhoIn(m.who); pv.over = String(m.ver || "?").slice(0, 12); pv.phase = "lobby"; pv.ready = false; pv.oready = false; pv.opub = null; pv.build = null;
    if (pv.cfg.mode === "B") pvpEnsureDeck();
    NET.send({ t: "cfg", cfg: pv.cfg, who: pvpWho(), ver: GAME_VER }); renderPv();
  } else if (m.t === "cfg" && pv.role === "guest" && m.cfg) {
    const cfg = { mode: PV_MODES.some(x => x.id === m.cfg.mode) ? m.cfg.mode : "A", hp: PV_HP.includes(+m.cfg.hp) ? +m.cfg.hp : 1.5 };
    const changed = cfg.mode !== pv.cfg.mode || cfg.hp !== pv.cfg.hp;
    pv.cfg = cfg; pv.opp = pvpWhoIn(m.who); pv.over = String(m.ver || "?").slice(0, 12);
    if (pv.phase === "join" || pv.phase === "wait") pv.phase = "lobby";
    if (changed) { pv.ready = false; pv.build = null; pv.oready = false; pv.opub = null; }
    if (cfg.mode === "B") pvpEnsureDeck();
    if (pv.phase === "lobby") renderPv();
  } else if (m.t === "ready") {
    const p = m.pub || {};
    pv.oready = !!m.on; pv.opub = m.on ? { hp: pvNum(p.hp, 1, 999), block: pvNum(p.block, 0, 999), dodge: pvNum(p.dodge, 0, 5), gear: String(p.gear || "").slice(0, 40), n: pvNum(p.n, 0, 99) } : null;
    if (pv.phase === "lobby") renderPv();
    pvpTryGo();
  } else if (m.t === "go") {
    if (pv.role === "guest" && pv.phase === "lobby" && pv.ready && pv.build && pv.opub) pvpStart(false);
  } else if (m.t === "turn") pvpGotTurn(m);
  else if (m.t === "lost") { if (pv.phase === "duel") pvpEnd(true, m.ff ? "ff" : ""); }
}

// ---- the duel ----
function pvpStart(first) {
  const b = pv.build, op = pv.opub, who = pv.opp || { name: "?", avatar: "🧑" };
  pv.phase = "duel"; closePause();
  run = { v: RUN_V, mode: "pvp", st: b.st, hp: b.hp, maxHp: b.hp, gold: 0, deck: b.ids.map(id => ({ id, up: 0, u: newUid() })), potions: 0, act: 1, floor: 0, depth: 0, kills: 0, found: [], gained: 0,
    map: null, pos: null, path: [], doors: null, combat: null, ov: null, node: null, ch: null, step: 0, rmCost: 0 }; // never stored in the profile
  const foe = { id: "_pvp", pvp: true, name: who.name, av: who.avatar, hp: op.hp, maxHp: op.hp, block: op.block, st: { str: 0, weak: 0, vuln: 0, burn: 0, dodge: op.dodge }, dmgS: 1, elite: false, boss: false, mi: 0, dead: false };
  run.combat = { kind: "pvp", foes: [foe], draw: shuffle(run.deck.map(c => ({ ...c }))), hand: [], disc: [], exh: [], en: 0, turn: 0, block: b.block, st: { str: 0, weak: 0, vuln: 0, burn: 0, dodge: b.dodge }, bpt: 0, dpt: 0, atks: 0, played: 0, tgt: 0, hits: [], base: null };
  layFor = null; hcur = null;
  busy = !first; // the second player waits for the first one's turn
  if (first) { pvpTurnStart(true); run.combat.en = Math.max(1, run.combat.en - 1); } // going first: one less energy on turn 1
  renderRun();
}
function pvpTurnStart(first) {
  const c = run.combat;
  startTurn(first);
  if (!pv || pv.phase !== "duel") return;
  if (c.turn > PV_FATIGUE) { hurtPlayer((c.turn - PV_FATIGUE) * 3, true); if (run.hp <= 0) return pvpLose(); } // fatigue: long stalls cost HP
  const f = c.foes[0]; c.base = { weak: f.st.weak, vuln: f.st.vuln, burn: f.st.burn }; c.hits = [];
}
const pvpSnap = c => ({ hp: run.hp, maxHp: run.maxHp, block: c.block, st: { str: c.st.str, weak: c.st.weak, vuln: c.st.vuln, burn: c.st.burn, dodge: c.st.dodge || 0 } });
function pvpSyncFoe(f, s) {
  const st = s.st || {};
  f.maxHp = pvNum(s.maxHp, 1, 999); f.hp = pvNum(s.hp, 0, f.maxHp); f.block = pvNum(s.block, 0, 999);
  f.st = { str: pvNum(st.str, 0, 99), weak: pvNum(st.weak, 0, 99), vuln: pvNum(st.vuln, 0, 99), burn: pvNum(st.burn, 0, 99), dodge: pvNum(st.dodge, 0, 9) };
  f.dead = f.hp <= 0;
}
// end of my turn: send what I dealt, then wait for theirs
async function pvpPhase(c) {
  busy = true;
  for (const ci of c.hand) ci.held = (ci.held || 0) + 1;
  if (pLv("patience") && c.hand.length) { const b = c.hand.length * PF.patience(pLv("patience")); c.block += b; floatAt($("pava"), `⏳🛡️+${b}`, "blk"); }
  if (c.st.weak) c.st.weak--;
  if (c.st.vuln) c.st.vuln--;
  const f = c.foes[0], b0 = c.base || { weak: 0, vuln: 0, burn: 0 };
  const deb = { w: Math.max(0, f.st.weak - b0.weak), v: Math.max(0, f.st.vuln - b0.vuln), b: Math.max(0, f.st.burn - b0.burn) };
  NET.send({ t: "turn", hits: c.hits, deb, snap: pvpSnap(c) });
  c.hits = [];
  renderCombat();
}
// their turn arrived: take their hits, then it is mine
async function pvpGotTurn(m) {
  const c = run && run.combat;
  if (!c || !pv || pv.phase !== "duel") return;
  busy = true;
  pvpSyncFoe(c.foes[0], m.snap || {});
  const hits = Array.isArray(m.hits) ? m.hits.slice(0, 60).map(h => pvNum(h, 0, 999)) : [], d = m.deb || {};
  renderCombat();
  for (const h of hits) {
    await wait(320);
    if (!run || run.combat !== c || pv.phase !== "duel") return;
    if (c.st.dodge > 0) { c.st.dodge--; floatAt($("pava"), "🌬️ " + L("หลบ!", "Dodge!"), "blk"); renderCombat(); continue; }
    if (Math.random() < (run.st.dodge || 0)) { floatAt($("pava"), "💨 Miss", "blk"); continue; }
    hurtPlayer(h); renderCombat();
    if (run.hp <= 0) break;
  }
  c.st.weak += pvNum(d.w, 0, 9); c.st.vuln += pvNum(d.v, 0, 9); c.st.burn += pvNum(d.b, 0, 99);
  if (run.hp <= 0) return pvpLose();
  await wait(250);
  if (!run || run.combat !== c || pv.phase !== "duel") return;
  busy = false;
  const firstGo = c.turn === 0;
  pvpTurnStart(false);
  if (!pv || pv.phase !== "duel") return;
  if (firstGo) { drawCards(1); c.block += 3; floatAt($("pava"), "🃏+1 🛡️+3", "heal"); } // going second: +1 card and 3 Block on the first turn
  saveStore(); renderCombat();
}
function pvpLose() { if (pv && pv.phase === "duel") { NET.send({ t: "lost" }); pvpEnd(false, ""); } }
function pvpForfeit() {
  if (!pv || pv.phase !== "duel" || !confirm(L("ยอมแพ้ดวลนี้?", "Forfeit this duel?"))) return;
  closePause(); NET.send({ t: "lost", ff: true }); pvpEnd(false, "me");
}
function pvpEnd(won, note) {
  if (!pv || pv.phase === "over") return;
  pv.phase = "over"; busy = true; closePause();
  const pr = prof();
  if (note !== "left") { pr.pvp ??= { w: 0, l: 0 }; if (won) pr.pvp.w++; else pr.pvp.l++; saveStore(); }
  pv.ready = false; pv.oready = false; pv.opub = null; pv.build = null; pv.won = won;
  const msg = note === "left" ? L("คู่ต่อสู้หลุดจากการเชื่อมต่อ (ไม่นับสถิติ)", "Your opponent disconnected (not counted)") : note === "ff" ? L("คู่ต่อสู้ยอมแพ้", "Your opponent forfeited") : note === "me" ? L("คุณยอมแพ้", "You forfeited") : "";
  const rec = pr.pvp ? `🏆 ${pr.pvp.w} · 💀 ${pr.pvp.l}` : "";
  const el = $("ov"); el.classList.remove("hidden");
  el.innerHTML = `<div class="ovbox pvbox"><div style="font-size:56px">${won ? "🏆" : "💀"}</div><div class="big">${won ? L("ชนะ!", "Victory!") : L("พ่ายแพ้", "Defeat")}</div>` +
    `<div class="sub" style="margin:2px 0">${msg}</div><div class="sub" style="margin:2px 0 10px">${pv.opp ? esc(pv.opp.name) + " · " : ""}${rec}</div>` +
    `<div class="row" style="justify-content:center">${pv.gone || note === "left" ? "" : `<button data-a="pvagain">🔁 ${L("แมตช์ใหม่ (กลับห้อง)", "Rematch (back to the room)")}</button>`}<button class="ghost" data-a="pvexit">🏠 ${t("mainMenu")}</button></div></div>`;
}
function pvpAgain() {
  if (!pv || pv.gone) return pvpExit();
  busy = false; run = null; goHome(); pv.phase = "lobby"; renderPv();
}
function pvpEsc() { if (pv && pv.phase === "duel") return; pvpExit(); }

// ---- screens ----
function pvCfgHtml(edit) {
  const dis = edit ? "" : " disabled";
  return `<div class="pvrow">${PV_MODES.map(m => `<button class="pvopt${pv.cfg.mode === m.id ? "" : " ghost"}" data-a="pvm|${m.id}"${dis}><b>${m.ic} ${tr(m.t)}</b><small>${tr(m.d)}</small></button>`).join("")}</div>` +
    `<div class="row" style="justify-content:center;gap:8px;align-items:center"><span class="sub" style="margin:0">❤️ ${L("เลือดสูงสุด", "Max HP")}</span>${PV_HP.map(h => `<button class="${pv.cfg.hp === h ? "" : "ghost"}" data-a="pvh|${h}"${dis}>×${h}</button>`).join("")}</div>`;
}
function renderPv() {
  if (!pv) return;
  const el = $("ov"); el.classList.remove("hidden");
  let h = `<div class="big">⚔️ PvP</div>`;
  if (pv.phase === "menu") {
    h += `<div class="sub">${L("ดวลกับเพื่อนผ่านอินเทอร์เน็ต ผลัดกันเล่นทีละเทิร์น · คนหนึ่งสร้างห้อง อีกคนใส่รหัส", "Duel a friend online, one turn each · one of you creates a room, the other types its code")}</div>` +
      `<div class="row" style="justify-content:center"><button data-a="pvhost">🏠 ${L("สร้างห้อง", "Create a room")}</button></div>` +
      `<div class="sub" style="margin:10px 0 4px">${L("หรือใส่รหัสห้องของเพื่อน", "or enter your friend's room code")}</div>` +
      `<div class="row" style="justify-content:center"><input id="pvCode" maxlength="5" autocomplete="off" placeholder="ABCDE" style="width:140px;text-align:center;font-size:22px;letter-spacing:4px;text-transform:uppercase"><button data-a="pvjoin">🔑 ${L("เข้าห้อง", "Join")}</button></div>` +
      `<div class="sub bad" style="min-height:1.4em">${pv.msg || ""}</div><div class="row" style="justify-content:center"><button class="ghost" data-a="pvexit">↩️ ${t("mBack")}</button></div>`;
  } else if (pv.phase === "wait") {
    h += `<div class="sub">${L("ส่งรหัสนี้ให้เพื่อน แล้วรอเพื่อนเข้าห้อง", "Send this code to your friend and wait for them to join")}</div><div class="pvcode">${pv.code}</div>` +
      `<div class="row" style="justify-content:center"><button id="pvCopy" class="ghost" data-a="pvcopy">📋 ${L("คัดลอกรหัส", "Copy code")}</button></div>` +
      `<div class="sub" style="margin-top:8px">⏳ ${L("รอเพื่อน…", "Waiting for a friend…")}${pv.msg ? `<br><span class="bad">${pv.msg}</span>` : ""}</div>` +
      pvCfgHtml(true) + `<div class="row" style="justify-content:center"><button class="ghost" data-a="pvexit">🚪 ${L("ปิดห้อง", "Close the room")}</button></div>`;
  } else if (pv.phase === "join") {
    h += `<div class="pvcode">${pv.code}</div><div class="sub">⏳ ${L("กำลังเข้าห้อง…", "Joining the room…")}</div><div class="row" style="justify-content:center"><button class="ghost" data-a="pvexit">↩️ ${L("ยกเลิก", "Cancel")}</button></div>`;
  } else if (pv.phase === "lobby") {
    const me = pvpWho(), op = pv.opp || {}, host = pv.role === "host", b = pv.build, ci = c => c && THEMES[c] ? THEMES[c].ic + " " + c : "";
    const card = (w, rdy, pub) => `<div class="pvp${rdy ? " ok" : ""}"><div class="pva">${w.avatar || "🧑"}</div><b>${esc(w.name || "?")}</b><div class="sub" style="margin:0">${ci(w.cls)}</div>` +
      `<div class="sub" style="margin:2px 0 0">${rdy && pub ? `❤️ ${pub.hp}${pub.gear ? " · " + esc(pub.gear) : ""} · 🃏 ${pub.n}` : ""}</div><div class="pvrd">${rdy ? "✔ " + L("พร้อม", "Ready") : "… " + L("ยังไม่พร้อม", "Not ready")}</div></div>`;
    const u = pv.cfg.mode === "B" ? pvpDeckInfo() : null;
    h += `<div class="sub">${host ? L("คุณเป็นเจ้าของห้อง · เลือกกติกา แล้วกดพร้อมทั้งสองฝั่ง", "You own the room · pick the rules, then both of you press Ready") : L("กติกาตั้งโดยเจ้าของห้อง", "The room owner sets the rules")} · ${L("รหัส", "Code")} <b>${pv.code}</b></div>` +
      pvCfgHtml(host) + `<div class="pvpl">${card(me, pv.ready, b && pvpPub(b))}<div class="pvvs">VS</div>${card(op, pv.oready, pv.opub)}</div>` +
      `<div class="row" style="justify-content:center">${u ? `<button class="ghost" data-a="pvdeck">🃏 ${L("จัดเด็ค", "Edit deck")} (${u.n}/${ARENA_SLOTS} · ◆${u.p}/${ARENA_PTS})</button>` : ""}` +
      `<button data-a="pvready"${u && u.n < ARENA_MIN ? " disabled" : ""}>${pv.ready ? "✖ " + L("ยกเลิกพร้อม", "Not ready") : "✔ " + L("พร้อม", "Ready")}</button><button class="ghost" data-a="pvexit">🚪 ${L("ออกจากห้อง", "Leave")}</button></div>` +
      `<div class="sub" style="margin-top:6px">${tr(PV_MODES.find(x => x.id === pv.cfg.mode).d)}</div>` +
      (pv.over && pv.over !== GAME_VER ? `<div class="sub bad">⚠️ ${L(`เวอร์ชันไม่ตรงกัน (คุณ v${GAME_VER} · เพื่อน v${esc(pv.over)}) · ควรใช้ไฟล์เดียวกัน`, `Version mismatch (you v${GAME_VER} · friend v${esc(pv.over)}) · use the same file`)}</div>` : "");
  }
  el.innerHTML = `<div class="ovbox pvbox">${h}</div>`;
}

// ================= runs =================
let run = null;
const STORY_PATH = ["fight", "fight", "rest", "fight", "boss"];
const NODE = {
  fight: { ic: "⚔️", t: ["ต่อสู้", "Fight"], d: ["มอนสเตอร์ธรรมดา · ได้ทองและการ์ด", "Regular monsters · gold and a card"] },
  elite: { ic: "👹", t: ["Elite", "Elite"], d: ["ศัตรูแกร่ง · รางวัลดีขึ้น มีโอกาสได้อุปกรณ์", "A tough foe · better rewards, a chance of gear"] },
  event: { ic: "❓", t: ["เหตุการณ์", "Event"], d: ["เรื่องไม่คาดฝัน มีให้เลือกทาง", "Something unexpected, with choices"] },
  shop: { ic: "🛒", t: ["พ่อค้าเร่", "Merchant"], d: ["ซื้อการ์ด ยา หรือลบการ์ด ด้วยทองใน run", "Buy cards, potions or card removal with run gold"] },
  rest: { ic: "🔥", t: ["กองไฟ", "Campfire"], d: ["พักฟื้น HP หรืออัปเกรดการ์ด", "Rest to heal or upgrade a card"] },
  treasure: { ic: "💎", t: ["หีบสมบัติ", "Treasure"], d: ["ทอง และอาจได้ยาหรืออุปกรณ์", "Gold, maybe a potion or gear"] },
  boss: { ic: "👑", t: ["บอส", "Boss"], d: ["ศัตรูท้าย Act · ได้อุปกรณ์แน่นอน", "The act's boss · always drops gear"] },
};
const MAP_ROWS = 11, LANES = 5, ROOMS_PER_ACT = 6, ACTS = 3;

function newRun(mode, ch, deckIds) {
  const pr = prof(), st = statsOf(pr);
  const potions = Math.min(3, pr.inv.potion || 0);
  pr.inv.potion = (pr.inv.potion || 0) - potions;
  const deck = (deckIds ? [...st.cards, ...deckIds] : [...Array(5).fill("strike"), ...Array(4).fill("defend"), ...st.cards]).map(id => ({ id, up: 0, u: newUid() }));
  run = pr.run = { v: RUN_V, mode, st, hp: st.hp, maxHp: st.hp, gold: 0, deck, potions, act: 1, floor: 0, depth: 0, kills: 0, found: [], gained: 0,
    map: null, pos: null, path: [], doors: null, combat: null, ov: null, node: null, ch: ch ?? null, step: 0, rmCost: 75 };
  pr.stats.runs++;
  if (mode === "map") run.map = genMap();
  else if (mode !== "story") run.doors = genDoors();
  saveStore();
  openRun();
}

// --- branching map: a few walkers climb the rows, drifting one lane at a time; the boss sits above the last row ---
function genMap() {
  const nodes = {}, edges = [];
  for (let w = 0; w < 4; w++) {
    let l = w === 0 ? 1 : w === 1 ? 3 : Math.floor(Math.random() * LANES);
    for (let r = 0; r < MAP_ROWS; r++) {
      nodes[r + "," + l] = { r, l };
      if (r < MAP_ROWS - 1) {
        const nl = clamp(l + rand([-1, 0, 1]), 0, LANES - 1), e = `${r},${l}>${r + 1},${nl}`;
        if (!edges.includes(e)) edges.push(e);
        l = nl;
      }
    }
  }
  for (const k in nodes) {
    const n = nodes[k], r = n.r;
    n.type = r === 0 ? "fight" : r === 5 ? "treasure" : r === MAP_ROWS - 1 ? "rest"
      : ["fight", "event", "elite", "shop", "rest"][weightedIdx([50, 22, r >= 3 ? 14 : 0, 12, r >= 4 && r !== MAP_ROWS - 2 ? 10 : 0])];
  }
  const bk = MAP_ROWS + ",2";
  nodes[bk] = { r: MAP_ROWS, l: 2, type: "boss" };
  for (const k in nodes) if (nodes[k].r === MAP_ROWS - 1) edges.push(`${k}>${bk}`);
  return { nodes, edges };
}
const mapNext = () => {
  const M = run.map;
  if (!run.pos) return Object.keys(M.nodes).filter(k => M.nodes[k].r === 0);
  return M.edges.filter(e => e.startsWith(run.pos + ">")).map(e => e.split(">")[1]);
};
// --- doors (Dungeon Rooms / Endless Tower) ---
function genDoors() {
  const n = run.floor + 1;
  if (run.mode === "rooms" || run.mode === "arena") {
    const inAct = (n - 1) % ROOMS_PER_ACT + 1;
    if (inAct === ROOMS_PER_ACT) return ["boss"];
    if (inAct === 1) return ["fight", "fight"];
    if (inAct === ROOMS_PER_ACT - 1) return uniqDoors(["rest"], 3);
    return uniqDoors([], rand([2, 3]), inAct >= 3);
  }
  if (n % 5 === 0) return ["boss"];
  if (n % 5 === 4) return uniqDoors(["rest"], 3);
  return uniqDoors([], rand([2, 3]), n > 2);
}
function uniqDoors(start, count, elite = true) {
  const out = [...start];
  for (let tries = 0; out.length < count && tries < 40; tries++) {
    const ty = ["fight", "event", "elite", "shop", "treasure", "rest"][weightedIdx([46, 22, elite ? 14 : 0, 10, 6, 6])];
    if (!out.includes(ty) || (ty === "fight" && out.filter(x => x === "fight").length < 2)) out.push(ty);
  }
  return out;
}
const runAct = () => run.mode === "endless" ? Math.min(3, 1 + Math.floor(run.floor / 10)) : run.mode === "story" ? 1 + run.ch : run.act;

function enterNode(type) {
  run.depth++; run.node = type;
  if (type === "fight" || type === "elite" || type === "boss") return startCombat(type);
  if (type === "rest") run.ov = { k: "rest" };
  else if (type === "shop") run.ov = genShop();
  else if (type === "event") run.ov = { k: "event", id: rand(EVENTS).id, res: null };
  else if (type === "treasure") run.ov = treasure();
  saveStore(); renderRun();
}
// a non-fight node is done (or a fight's rewards were collected): back to the path
function nodeDone() {
  const wasBoss = run.node === "boss";
  run.ov = null; run.node = null; run.combat = null;
  if (run.mode === "story") {
    run.step++;
    if (run.step >= STORY_PATH.length) return storyClear();
  } else if (wasBoss && run.mode !== "endless") {
    run.act++;
    if (run.act > ACTS) return endRun(true);
    run.hp = Math.min(run.maxHp, run.hp + Math.round((run.maxHp - run.hp) * 0.5)); // between acts: heal half of what's missing
    if (run.mode === "map") { run.map = genMap(); run.pos = null; run.path = []; run.floor = 0; }
  }
  if (run.mode === "rooms" || run.mode === "arena" || run.mode === "endless") run.doors = genDoors();
  saveStore(); renderRun();
}

// ---------- rewards ----------
const goldMult = () => 1 + run.st.goldMult + (run.st.pass.thrifty ? PF.thrifty(run.st.pass.thrifty) : 0);
const gainGold = g => { g = Math.round(g * goldMult()); run.gold += g; return g; };
const luck = () => run.st.luck + (run.st.pass.scholar ? PF.scholar(run.st.pass.scholar) : 0);
// weight of a card in rolls: each worn piece of a theme adds SYN_W to that theme's cards; "only" cards need the theme worn
const SYN_W = 1.5;
function cardWeight(id) {
  const d = CARDS[id], n = (d.tag && run.st.tags && run.st.tags[d.tag]) || 0;
  if (d.only) return n ? SYN_W * n : 0;
  return 1 + SYN_W * n;
}
function rollCards(n, w) { // w = weights for common / uncommon / rare
  const lk = luck(), ws = [w[0], w[1] * (1 + lk), w[2] * (1 + 2 * lk)], out = [];
  for (let tries = 0; out.length < n && tries < 60; tries++) {
    const ids = Object.keys(CARDS).filter(id => CARDS[id].r === 1 + weightedIdx(ws)), cw = ids.map(cardWeight), k = weightedIdx(cw);
    if (cw[k] > 0 && !out.includes(ids[k])) out.push(ids[k]);
  }
  return out;
}
function dropGear() {
  const pr = prof(), pool = CATALOG.filter(g => g.price && !g.story);
  let r = Math.random() * pool.reduce((s, g) => s + 1000 / g.price, 0);
  const g = pool.find(x => (r -= 1000 / x.price) < 0) || pool[pool.length - 1];
  addItem(pr, g.id); run.found.push(g.id);
  return g;
}
function treasure() {
  const act = runAct(), gold = gainGold(35 + Math.floor(Math.random() * 30) + 15 * (act - 1)), loot = [`💰 +${gold}`];
  if (Math.random() < 0.35) { const g = dropGear(); loot.push(`${g.ic} ${g.t}`); }
  else if (run.potions < 3) { run.potions++; loot.push("🧪 Potion"); }
  return { k: "loot", title: [NODE.treasure.ic + " " + NODE.treasure.t[0], NODE.treasure.ic + " " + NODE.treasure.t[1]], loot };
}
function genShop() {
  const act = runAct(), m = 1 + 0.1 * (act - 1);
  const ids = [...rollCards(3, [100, 0, 0]), ...rollCards(1, [0, 100, 0]), ...rollCards(1, [0, 0, 100])];
  const base = [0, 50, 75, 150];
  return { k: "shop", stock: [...new Set(ids)].map(id => ({ id, price: Math.round(base[CARDS[id].r] * m * (0.9 + Math.random() * 0.2)), sold: false })), potion: { price: 50, sold: false }, rmDone: false };
}
const healRun = share => { const h = Math.max(1, Math.round(run.maxHp * share)); const before = run.hp; run.hp = Math.min(run.maxHp, run.hp + h); return run.hp - before; };
function upgradeRandom(n) {
  const can = shuffle(run.deck.filter(c => !c.up)).slice(0, n);
  can.forEach(c => c.up = 1);
  return can.map(c => cardName(c)).join(", ");
}

// ---------- events ----------
// go() applies a choice and returns the result text [th, en], or "pick:<mode>" to open the card picker, or "fight".
const EVENTS = [
  { id: "shrine", ic: "⛩️", t: ["ศาลเจ้าเงียบสงบ", "A Quiet Shrine"], d: ["ศาลเจ้าเล็กๆ ริมทาง ควันธูปยังลอยอยู่", "A small roadside shrine. Incense still drifts in the air."], ch: [
    { t: ["🙏 อธิษฐาน: ฟื้น 25% HP", "🙏 Pray: heal 25% HP"], go: () => { const h = healRun(0.25); return [`ฟื้น ${h} HP`, `Healed ${h} HP`]; } },
    { t: ["🪙 ถวาย 30 ทอง: อัปเกรดการ์ดสุ่ม 2 ใบ", "🪙 Offer 30 gold: upgrade 2 random cards"], ok: () => run.gold >= 30 && run.deck.some(c => !c.up), go: () => { run.gold -= 30; const n = upgradeRandom(2); return [`อัปเกรด: ${n}`, `Upgraded: ${n}`]; } },
  ] },
  { id: "forge", ic: "⚒️", t: ["โรงตีเหล็กร้าง", "Abandoned Forge"], d: ["ทั่งยังอุ่นอยู่ เหมือนช่างเพิ่งออกไป", "The anvil is still warm, as if the smith just left."], ch: [
    { t: ["🔨 ตีการ์ด: เลือกอัปเกรด 1 ใบ", "🔨 Smith: upgrade a card of your choice"], ok: () => run.deck.some(c => !c.up), go: () => "pick:up" },
    { t: ["🧺 เก็บเศษเหล็กไปขาย: +35 ทอง", "🧺 Take scrap to sell: +35 gold"], go: () => { const g = gainGold(35); return [`+${g} ทอง`, `+${g} gold`]; } },
  ] },
  { id: "goblin", ic: "🎲", t: ["ก็อบลินนักพนัน", "The Dice Goblin"], d: ["“ทอยเต๋ากันไหม? ชนะได้สองเท่า แพ้ก็... หมดตัว!”", "“Fancy a roll? Win and it's doubled, lose and... it's mine!”"], ch: [
    { t: ["🎲 เดิมพันทองครึ่งหนึ่ง (โอกาส 50%)", "🎲 Bet half your gold (50% chance)"], ok: () => run.gold >= 10, go: () => { const b = Math.floor(run.gold / 2); if (Math.random() < 0.5) { run.gold += b; return [`ชนะ! +${b} ทอง`, `You win! +${b} gold`]; } run.gold -= b; return [`แพ้... -${b} ทอง`, `You lose... -${b} gold`]; } },
  ] },
  { id: "well", ic: "🪣", t: ["บ่อน้ำอธิษฐาน", "The Wishing Well"], d: ["เสียงสะท้อนจากก้นบ่อเหมือนกระซิบเรียก", "Echoes from the bottom sound like a whisper."], ch: [
    { t: ["🪙 โยน 25 ทอง: ลบการ์ด 1 ใบออกจากเด็ค", "🪙 Toss 25 gold: remove a card from your deck"], ok: () => run.gold >= 25 && run.deck.length > 5, go: () => { run.gold -= 25; return "pick:rm"; } },
    { t: ["💧 ดื่มน้ำ: ฟื้น 12 HP", "💧 Drink: heal 12 HP"], go: () => { const before = run.hp; run.hp = Math.min(run.maxHp, run.hp + 12); return [`ฟื้น ${run.hp - before} HP`, `Healed ${run.hp - before} HP`]; } },
  ] },
  { id: "chest", ic: "🧰", t: ["หีบแปลกประหลาด", "A Strange Chest"], d: ["หีบเหล็กสลักลวดลายแปลกตา มีเสียงหายใจดังออกมา...", "An iron chest with odd carvings. Something inside is breathing..."], ch: [
    { t: ["🗝️ เปิด: 50% ได้อุปกรณ์ · 50% สู้ Elite", "🗝️ Open it: 50% gear · 50% an Elite fight"], go: () => { if (Math.random() < 0.5) { const g = dropGear(); return [`ได้ ${g.ic} ${g.t}! (เข้าคลังถาวร)`, `Found ${g.ic} ${g.t}! (kept forever)`]; } return "fight"; } },
  ] },
  { id: "library", ic: "📚", t: ["ห้องสมุดเก่า", "The Old Library"], d: ["ตำราเก่าฝุ่นจับ บางเล่มยังอ่านออก", "Dusty old tomes. Some are still readable."], ch: [
    { t: ["📖 ศึกษา: เลือกการ์ด 1 ใน 3 (Uncommon ขึ้นไป)", "📖 Study: choose 1 of 3 cards (Uncommon+)"], go: () => "cards:study" },
    { t: ["😴 งีบหลับ: ฟื้น 15% HP", "😴 Nap: heal 15% HP"], go: () => { const h = healRun(0.15); return [`ฟื้น ${h} HP`, `Healed ${h} HP`]; } },
  ] },
  { id: "altar", ic: "🩸", t: ["แท่นบูชาเลือด", "The Blood Altar"], d: ["แท่นหินสีแดงเข้ม รอเครื่องเซ่น", "A dark red stone altar, waiting for an offering."], ch: [
    { t: ["🩸 เสีย 8 HP: ได้การ์ด Rare 1 ใบ", "🩸 Lose 8 HP: gain a Rare card"], ok: () => run.hp > 8, go: () => { run.hp -= 8; const id = rand(POOL(3)); run.deck.push({ id, up: 0, u: newUid() }); return [`ได้การ์ด ${CARDS[id].ic} ${CARDS[id].t}`, `Gained ${CARDS[id].ic} ${CARDS[id].t}`]; } },
  ] },
];
const LEAVE = { t: ["🚶 เดินผ่านไป", "🚶 Walk away"], go: () => ["ไม่มีอะไรเกิดขึ้น", "Nothing happens."] };

// ================= combat =================
// run.combat: { kind, foes, draw, hand, disc, exh, en, turn, block, st (your statuses), bpt, atks (attack cards this turn), tgt }
const BASE_EN = 3, HAND = 5, HAND_MAX = 10;
const pLv = id => run.st.pass[id] || 0;
// cards you may keep at the end of a turn; the start of a turn refills the hand up to it
const handLim = () => HAND + ((run.combat && run.combat.handUp) || 0) + (pLv("pockets") ? PF.pockets(pLv("pockets")) : 0);
function startCombat(kind) {
  const act = runAct(), d = run.depth;
  let ids;
  if (run.mode === "story") {
    const S = STORY_FOES[run.ch];
    ids = kind === "boss" ? [S.boss] : run.step === 0 ? [rand(S.foes)] : [rand(S.foes), rand(S.foes)];
  } else if (kind === "boss") ids = [run.mode === "endless" ? ENDLESS_BOSS[(run.floor / 5 - 1) % ENDLESS_BOSS.length] : ACT_BOSS[run.act - 1]];
  else if (kind === "elite") ids = [rand(TIERS[act])];
  else ids = run.floor > 2 && Math.random() < 0.45 ? [rand(TIERS[act]), rand(TIERS[act])] : [rand(TIERS[act])];
  const pair = ids.length > 1, depth = run.mode === "story" ? run.ch * 5 + run.step : d;
  const foes = ids.map(id => mkFoe(id, depth, { elite: kind === "elite", pair }));
  if (PG().startBurn) foes.forEach(f => f.st.burn += PG().startBurn);
  const draw = shuffle(run.deck.map(c => ({ ...c })));
  run.combat = { kind, foes, draw, hand: [], disc: [], exh: [], en: 0, turn: 0, block: run.st.startBlock + (pLv("fortify") ? PF.fortify(pLv("fortify")) : 0), st: { str: 0, weak: 0, vuln: 0, burn: 0, dodge: PG().startDodge || 0 }, bpt: 0, dpt: 0, atks: 0, played: 0, tgt: 0 };
  run.ov = null;
  startTurn(true);
  saveStore();
  renderRun();
}
function drawCards(n) {
  const c = run.combat;
  for (let i = 0; i < n; i++) {
    if (!c.draw.length) { if (!c.disc.length) return; c.draw = shuffle(c.disc); c.disc = []; }
    if (c.hand.length >= HAND_MAX) return;
    c.hand.push(c.draw.pop());
  }
}
function startTurn(first) {
  const c = run.combat;
  c.turn++; c.atks = 0; c.played = 0;
  if (!first) c.block = PG().keepBlock ? Math.floor(c.block / 2) : 0; // start-of-fight Block only lasts the first turn
  if (c.bpt) c.block += blockAmt(c.bpt);
  if (c.st.burn) {
    hurtPlayer(c.st.burn, true); c.st.burn -= burnDecay(c.st.burn);
    if (run.hp <= 0) return loseFight();
  }
  if (run.st.regen > 0 && run.hp < run.maxHp) { const h = Math.min(run.st.regen, run.maxHp - run.hp); run.hp += h; floatAt($("pava"), "💚+" + h, "heal"); }
  c.en = BASE_EN + (pLv("overflow") && Math.random() < PF.overflow(pLv("overflow")) ? 1 : 0) + (c.turn === 1 ? PG().enFirst || 0 : 0) + (Math.random() < (run.st.enChance || 0) ? 1 : 0);
  let n = Math.max(0, handLim() - c.hand.length) + (c.dpt || 0);
  if (c.turn === 1) n += run.st.drawFirst + (pLv("quick") ? 1 : 0);
  else if (pLv("quick") && Math.random() < PF.quick(pLv("quick"))) n++;
  layFor = null; hcur = null;
  drawCards(n);
  fixTarget();
}
// Burn fades by a third each tick (at least 1), so a big stack is strong but not unbounded
const DODGE_MAX = 3; // Dodge stacks you can hold
const burnDecay = n => Math.max(1, Math.ceil(n / 3));
const aliveFoes = () => run.combat.foes.filter(f => !f.dead);
function fixTarget() {
  const c = run.combat;
  if (!c.foes[c.tgt] || c.foes[c.tgt].dead) c.tgt = Math.max(0, c.foes.findIndex(f => !f.dead));
}
const blockAmt = (b, d) => Math.round(b * (1 + run.st.def) * (d ? tmul(d, "_blk") : 1));
// damage of one hit of card d against foe f (before crits)
function hitDmg(d, f, inHand) { // inHand: the card is still in the hand (a preview), so count its slot as empty
  const c = run.combat, s = run.st;
  let base = (d.slam ? c.block : d.dmg) + (d.combo || 0) * (c.played || 0) + c.st.str + (pLv("keen") || 0), mult = (1 + s.atk) * tmul(d, "_atk") * (1 + (d.mult || 0));
  if (d.cost >= 2) mult *= 1 + s.heavy;
  mult *= 1 + (s.combo + (pLv("momentum") ? PF.momentum(pLv("momentum")) : 0)) * c.atks;
  if (pLv("laststand") && run.hp < run.maxHp * 0.3) mult *= 1 + PF.laststand(pLv("laststand"));
  const ln = (d.lone || 0) + (d.type === "atk" ? (c.loneAll || 0) + (PG().loneAll || 0) : 0);
  if (ln) mult *= 1 + ln * Math.max(0, handLim() - c.hand.length + (inHand ? 1 : 0));
  if (c.st.weak) mult *= 0.75;
  if (f) { if (f.st.vuln) mult *= 1.5; if (d.exec && f.hp < f.maxHp / 2) mult *= 2; }
  return Math.max(0, Math.round(base * mult)); // round, not floor: small bonuses should not vanish below a whole point
}
// live card numbers: level/perks, plus what it grew while kept in hand
const eff = ci => {
  const d = cardFx(ci, run.st), g = d.grow && ci.held ? d.grow * ci.held : 0;
  if (!g) return d;
  const e = { ...d };
  if (d.dmg) e.dmg += g; if (d.block) e.block += g; if (d.heal) e.heal += g;
  return e;
};
function canPlay(ci) { const d = eff(ci), c = run.combat; return d.cost <= c.en && (!d.hpCost || run.hp > d.hpCost); }
function playCard(hi) {
  const c = run.combat;
  if (!c || busy || pauseOpen || run.ov || c.dsel) return;
  const ci = c.hand[hi];
  if (!ci) return;
  const d = eff(ci);
  if (!canPlay(ci)) { const el = document.querySelector(`[data-a="play|${hi}"]`); if (el) { el.classList.remove("shake1"); void el.offsetWidth; el.classList.add("shake1"); } floatAt($("energy"), L("⚡ ไม่พอ", "⚡ not enough"), "bad"); return; }
  flyOut(ci);
  c.en -= d.cost; c.hand.splice(hi, 1); delete ci.held;
  if (d.hpCost) hurtPlayer(d.hpCost, true);
  fixTarget();
  const tgt = c.foes[c.tgt], targets = d.all ? aliveFoes() : tgt && !tgt.dead ? [tgt] : [];
  if (d.dmg || d.slam) {
    let hits = d.hits || 1;
    if (d.echo && Math.random() < d.echo) { hits++; floatAt($("pava"), "🔁 ECHO", "crit"); }
    for (let h = 0; h < hits; h++) for (const f of targets) {
      if (f.dead) continue;
      const crit = Math.random() < Math.min(0.9, run.st.crit + (d.critPlus || 0));
      damageFoe(f, Math.floor(hitDmg(d, f) * (crit ? run.st.critMult : 1)), crit);
    }
  }
  if (d.vuln) for (const f of targets) if (!f.dead) f.st.vuln += d.vuln;
  if (d.weak) for (const f of targets) if (!f.dead) f.st.weak += d.weak;
  if (d.burn) for (const f of targets) if (!f.dead) f.st.burn += Math.round(d.burn * (1 + (tmul(d, "_atk") - 1) * 0.5)); // Burn ticks many times: it gets half the weapon scaling
  if (d.block) { const b = blockAmt(d.block, d); c.block += b; floatAt($("pava"), `🛡️+${b}`, "blk"); }
  if (d.str) c.st.str += d.str;
  if (d.bpt) c.bpt += Math.round(d.bpt * tmul(d, "_blk"));
  if (d.dpt) c.dpt = (c.dpt || 0) + d.dpt;
  if (d.dodge) c.st.dodge = Math.min(DODGE_MAX, (c.st.dodge || 0) + d.dodge);
  if (d.en) c.en += d.en;
  if (d.heal) {
    const amt = Math.round(d.heal * tmul(d, "_blk")), h = Math.min(amt, run.maxHp - run.hp);
    run.hp += h; if (h) floatAt($("pava"), "+" + h, "heal");
    if (PG().healToBlock && amt > h) c.block += amt - h;
  }
  if (d.tag && run.mode !== "pvp") gainMastery(d.tag, 1);
  if (d.type === "atk") {
    c.atks++;
    if (run.st.leech && run.hp < run.maxHp) { const h = Math.min(run.st.leech, run.maxHp - run.hp); run.hp += h; floatAt($("pava"), "+" + h, "heal"); }
  }
  if (d.handUp) c.handUp = (c.handUp || 0) + d.handUp;
  if (d.refresh) { const rest = c.hand.splice(0); rest.forEach(discardCard); drawCards(rest.length); }
  if (d.loneAll) c.loneAll = (c.loneAll || 0) + d.loneAll;
  if (d.dump) { const rest = c.hand.splice(0); rest.forEach(discardCard); if (d.dumpDmg) for (let i = 0; i < rest.length; i++) hitRandom(Math.round(d.dumpDmg * (1 + run.st.atk) * tmul(d, "_atk"))); }
  if (d.draw) drawCards(d.draw);
  c.played = (c.played || 0) + 1;
  (d.exhaust || d.type === "pow" ? c.exh : c.disc).push(ci);
  if (run.hp <= 0) return loseFight();
  if (!aliveFoes().length) return winFight();
  fixTarget();
  saveStore(); renderCombat();
  autoEnd(c);
}
// nothing left to play (out of ⚡ and no 0-cost card): end the turn by itself after a short beat
function autoEnd(c) {
  if (c.hand.some(canPlay)) return;
  setTimeout(() => { if (run && run.combat === c && !busy && !pauseOpen && !run.ov && !c.dsel && !c.hand.some(canPlay)) endTurn(); }, 700);
}
// a card leaves the hand for the discard pile: its "if discarded" effect and Scrap Toss fire
const hitRandom = n => { const al = aliveFoes(); if (al.length && n > 0) damageFoe(rand(al), n, false); };
function discardCard(ci) {
  const c = run.combat, o = cardOf(ci).onDisc;
  flyOut(ci, $("piles").lastElementChild);
  delete ci.held; c.disc.push(ci);
  if (o) {
    if (o.dmg) hitRandom(Math.round(o.dmg * (1 + run.st.atk) * tmul(cardOf(ci), "_atk")));
    if (o.block) { const b = blockAmt(o.block); c.block += b; floatAt($("pava"), `🛡️+${b}`, "blk"); }
    if (o.dodge) c.st.dodge = Math.min(DODGE_MAX, (c.st.dodge || 0) + o.dodge);
  }
  if (pLv("recycle")) hitRandom(PF.recycle(pLv("recycle")));
}
// discard mode: tap cards to throw away, then confirm (ends the turn)
const discardNeed = c => Math.max(0, c.hand.length - handLim());
function discardMode() { const c = run && run.combat; if (!c || busy || pauseOpen || run.ov || c.dsel) return; c.dsel = []; renderCombat(); }
function discardToggle(i) { const c = run.combat; if (!c || !c.dsel || !c.hand[i]) return; const k = c.dsel.indexOf(i); if (k >= 0) c.dsel.splice(k, 1); else c.dsel.push(i); renderCombat(); }
function discardCancel() { const c = run.combat; if (!c || !c.dsel) return; c.dsel = null; renderCombat(); autoEnd(c); }
function discardOk() {
  const c = run.combat;
  if (!c || !c.dsel || busy || c.dsel.length < discardNeed(c)) return;
  const pick = new Set(c.dsel), out = c.hand.filter((_, i) => pick.has(i));
  c.dsel = null; c.hand = c.hand.filter((_, i) => !pick.has(i));
  out.forEach(discardCard);
  if (!aliveFoes().length) return winFight();
  return foePhase(c);
}
function damageFoe(f, dmg, crit) {
  if (f.pvp) run.combat.hits.push(dmg); // PvP: what I deal goes to the other player when my turn ends
  const absorbed = Math.min(f.block, dmg);
  f.block -= absorbed; f.hp = Math.max(0, f.hp - (dmg - absorbed));
  const el = foeEl(f);
  floatAt(el, (crit ? "CRIT " : "") + (dmg - absorbed ? fmtN(dmg - absorbed) : "🛡️"), crit ? "crit" : "");
  animFoe(f, "hit");
  if (f.hp <= 0 && !f.dead) { f.dead = true; animFoe(f, "die"); if (!f.pvp) { run.kills++; const xp = xpOf(f); run.combat.xpGot = (run.combat.xpGot || 0) + xp; gainCharXp(xp); } }
}
function hurtPlayer(dmg, pierce) {
  const c = run.combat;
  let rest = dmg;
  if (!pierce) { const a = Math.min(c.block, rest); c.block -= a; rest -= a; }
  run.hp = Math.max(0, run.hp - rest);
  floatAt($("pava"), rest ? "-" + rest : "🛡️", rest ? "bad" : "blk");
  if (rest) { const g = $("game"); g.classList.remove("shake"); void g.offsetWidth; g.classList.add("shake"); $("flash").style.opacity = .3; setTimeout(() => $("flash").style.opacity = 0, 120); }
}
let busy = false;
const wait = ms => new Promise(r => setTimeout(r, ms));
async function endTurn() {
  const c = run && run.combat;
  if (!c || busy || pauseOpen || run.ov) return;
  if (c.dsel) return discardOk();
  if (c.hand.length > handLim()) { c.dsel = []; saveStore(); renderCombat(); return; } // too many cards: pick which to throw away
  return foePhase(c);
}
// the cards left in hand stay for next turn; then the enemies act
async function foePhase(c) {
  if (run.mode === "pvp") return pvpPhase(c);
  busy = true;
  for (const ci of c.hand) ci.held = (ci.held || 0) + 1;
  if (pLv("patience") && c.hand.length) { const b = c.hand.length * PF.patience(pLv("patience")); c.block += b; floatAt($("pava"), `⏳🛡️+${b}`, "blk"); }
  if (c.st.weak) c.st.weak--;
  if (c.st.vuln) c.st.vuln--;
  renderCombat();
  for (const f of c.foes) {
    if (f.dead) continue;
    await wait(380);
    if (run.combat !== c) { busy = false; return; } // the fight was left meanwhile
    f.block = 0;
    if (f.st.burn) {
      damageFoe(f, f.st.burn + (PG().burnTick || 0), false); f.st.burn -= burnDecay(f.st.burn);
      if (f.dead) { renderCombat(); continue; }
    }
    const m = intentOf(f), el = foeEl(f);
    if (m.b) f.block += Math.round(m.b * f.dmgS);
    if (m.s) f.st.str += m.s;
    if (m.heal) { const h = Math.min(Math.round(m.heal * f.dmgS), f.maxHp - f.hp); f.hp += h; if (h) floatAt(el, "+" + h, "heal"); }
    if (m.w) c.st.weak += m.w;
    if (m.v) c.st.vuln += m.v;
    if (m.burn) c.st.burn += m.burn;
    if (m.a) {
      animFoe(f, "lunge");
      for (let h = 0; h < (m.h || 1); h++) {
        if (c.st.dodge > 0) { c.st.dodge--; floatAt($("pava"), "🌬️ " + L("หลบ!", "Dodge!"), "blk"); continue; }
        if (Math.random() < (run.st.dodge || 0)) { floatAt($("pava"), "💨 Miss", "blk"); continue; }
        hurtPlayer(foeHit(f, m));
        if (pLv("thorns") && !f.dead) damageFoe(f, PF.thorns(pLv("thorns")), false);
        if (run.hp <= 0) break;
      }
    }
    if (f.st.weak) f.st.weak--;
    if (f.st.vuln) f.st.vuln--;
    nextIntent(f);
    renderCombat();
    if (run.hp <= 0) { busy = false; return loseFight(); }
  }
  await wait(250);
  busy = false;
  if (run.combat !== c) return;
  if (!aliveFoes().length) return winFight();
  startTurn(false);
  if (!run || run.combat !== c) return; // burn ended the run
  saveStore(); renderCombat();
}
function winFight() {
  if (run.mode === "pvp") { busy = false; return pvpPhase(run.combat); } // the proxy fell: end the turn and let the other side confirm
  const c = run.combat, kind = c.kind, act = runAct();
  const pr = prof();
  const base = kind === "boss" ? 90 : kind === "elite" ? 32 + Math.random() * 10 : 14 + Math.random() * 6;
  const scale = run.mode === "endless" ? 1 + 0.03 * run.floor : 1 + 0.2 * (act - 1);
  const gold = gainGold(base * scale), loot = [`💰 +${gold}`, `⭐ +${c.xpGot || 0} XP`];
  let heal = Math.round(run.maxHp * run.st.killHeal) + (pLv("mend") ? PF.mend(pLv("mend")) : 0) + (PG().winHeal || 0);
  heal = Math.min(heal, run.maxHp - run.hp);
  if (heal > 0) { run.hp += heal; loot.push(`❤️ +${heal}`); }
  const gearCh = kind === "boss" ? 1 : kind === "elite" ? 0.3 : 0.04;
  if (Math.random() < gearCh) { const g = dropGear(); loot.push(`${g.ic} ${g.t} <small>(${L("เข้าคลังถาวร", "kept forever")})</small>`); }
  const potCh = kind === "elite" ? 0.4 : kind === "fight" ? 0.15 : 0;
  if (run.potions < 3 && Math.random() < potCh) { run.potions++; loot.push("🧪 Potion"); }
  const w = kind === "boss" ? [0, 40, 60] : kind === "elite" ? [45, 42, 13] : [70, 27, 3];
  run.combat = null;
  run.ov = { k: "reward", title: kind === "boss" ? ["👑 ล้มบอสได้!", "👑 Boss defeated!"] : ["✔ ชนะ!", "✔ Victory!"], loot, cards: rollCards(3, w) };
  saveStore(); renderRun();
}
function loseFight() {
  busy = false;
  if (run.mode === "pvp") return pvpLose();
  if (run.mode === "story") { run.combat = null; run.ov = { k: "storyfail" }; saveStore(); return renderRun(); }
  endRun(false);
}
function usePotion() {
  if (!run || !run.potions || busy || run.hp >= run.maxHp) return;
  run.potions--;
  const h = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * (0.3 + (pLv("alch") ? PF.alch(pLv("alch")) : 0))));
  run.hp += h;
  floatAt(state === "combat" ? $("pava") : $("rhead"), "🧪 +" + h, "heal");
  saveStore(); renderRun();
}

// ---------- end of a run ----------
// won: cleared the last act. quiet: given up from the menu (no summary screen)
function endRun(won, quiet) {
  const pr = prof(), r = pr.run;
  if (!r) return;
  pr.gold += r.gold;
  pr.inv.potion = (pr.inv.potion || 0) + r.potions;
  pr.stats.kills = (pr.stats.kills || 0) + r.kills;
  if (won) pr.stats.wins++;
  const b = pr.stats.best;
  if (r.mode === "endless") b.endless = Math.max(b.endless || 0, r.floor);
  else if (r.mode === "map" || r.mode === "rooms" || r.mode === "arena") {
    if (won) b[r.mode] = "win";
    else if (b[r.mode] !== "win" && rankOf(r) >= rankOf(b[r.mode] || {})) b[r.mode] = { act: r.act, floor: r.floor };
  }
  pr.run = null;
  saveStore();
  if (quiet) { run = null; return; }
  busy = false;
  state = "run";
  $("ov").classList.remove("hidden");
  const md = modeOf(r.mode);
  $("ov").innerHTML = `<div class="ovbox"><div style="font-size:56px">${won ? "🏆" : "💀"}</div><div class="big">${won ? L("ชนะ run!", "Run cleared!") : "Game Over"}</div>` +
    `<div class="sub" style="margin:4px 0 0">${md.ic} ${tr(md.t)}</div><div class="result" style="justify-content:center">` +
    `<span>${L("ไปถึง", "Reached")}</span><b>${r.mode === "endless" ? L("ชั้น ", "Floor ") + r.floor : `Act ${Math.min(r.act, ACTS)} · ${L("ชั้น", "floor")} ${r.floor}`}</b>` +
    `<span>${L("มอนที่ล้ม", "Monsters slain")}</span><b>${r.kills}</b>` +
    `<span>XP</span><b>+${r.xpGain || 0}${r.lvUps ? ` · ⭐ +${r.lvUps} Lv (Lv ${pr.lvl})` : ""}</b>` +
    `<span>${t("banked")}</span><b>+${r.gold} 💰 (${pr.gold})</b>` +
    `<span>${L("อุปกรณ์ที่ได้", "Gear found")}</span><b>${r.found.length ? r.found.map(id => defOf(id).ic).join(" ") : "—"}</b>` +
    `<span>${L("เด็ค", "Deck")}</span><b>${r.deck.length} ${L("ใบ", "cards")}</b></div>` +
    `<div class="row" style="justify-content:center">${md.hidden ? "" : `<button data-a="again|${r.mode}">${L("เล่นอีกครั้ง", "Play again")}</button>`}<button class="ghost" data-a="home">${t("mainMenu")}</button></div></div>`;
  run = null;
}
const rankOf = x => (x.act || 0) * 100 + (x.floor || 0);

// ================= rendering: run screens =================
function openRun() {
  const pr = prof();
  run = pr.run;
  if (!run) return goHome();
  busy = false;
  if (!run.st.tm) { const n = statsOf(pr); for (const k of ["tm", "pen", "cardLv", "perkT", "perkG"]) run.st[k] = n[k]; } // a run started before stats existed
  renderRun();
}
function headHtml() {
  if (run.mode === "pvp") return `<span>⚔️ <b>PvP · ${esc(pv && pv.opp ? pv.opp.name : "")}</b></span><span>❤️ <b>${run.hp}/${run.maxHp}</b></span><span class="sp"></span><button class="ghost" data-a="deck">🃏 ${run.deck.length}</button><button class="ghost" data-a="pause">⏸</button>`;
  const md = modeOf(run.mode);
  const where = run.mode === "story" ? EPISODE.chapters[run.ch].n : run.mode === "endless" ? L("ชั้น ", "Floor ") + run.floor
    : run.mode === "rooms" || run.mode === "arena" ? `Act ${run.act} · ${L("ห้อง", "Room")} ${run.floor}/${ROOMS_PER_ACT * ACTS}` : `Act ${run.act} · ${L("ชั้น", "Floor")} ${run.floor}`;
  return `<span>${md.ic} <b>${where}</b></span><span>❤️ <b>${run.hp}/${run.maxHp}</b></span><span>💰 <b>${run.gold}</b></span>` +
    `<button class="ghost pot${run.potions ? "" : " no"}" data-a="potion" title="Potion">🧪 ${run.potions}</button><span class="sp"></span>` +
    `<button class="ghost" data-a="deck">🃏 ${run.deck.length}</button><button class="ghost" data-a="pause">⏸</button>`;
}
function renderRun() {
  if (!run) return goHome();
  if (run.combat) { state = "combat"; show("play"); renderCombat(); }
  else {
    state = "run"; show("run");
    $("rhead").innerHTML = headHtml();
    $("rbody").innerHTML = run.mode === "map" ? mapHtml() : run.mode === "story" ? storyPathHtml() : doorsHtml();
    if (run.mode === "map") scrollMap();
  }
  renderOv();
}
function mapHtml() {
  const rows = MAP_ROWS + 1, room = ($("rbody") && $("rbody").clientHeight) || 760;
  const M = run.map, H = Math.max(46, Math.min(84, Math.floor((room - 96) / rows))), total = rows * H + 30, can = new Set(mapNext());
  const y = r => total - (r * H + 36), x = l => (l + 0.5) / LANES * 100;
  const walked = new Set(run.path.slice(1).map((k, i) => run.path[i] + ">" + k));
  const lines = M.edges.map(e => { const [a, b] = e.split(">").map(k => M.nodes[k]); return `<line x1="${x(a.l)}" y1="${y(a.r)}" x2="${x(b.l)}" y2="${y(b.r)}" class="${walked.has(e) ? "done" : ""}"/>`; }).join("");
  const nodes = Object.entries(M.nodes).map(([k, n]) => {
    const cls = [can.has(k) && "can", run.path.includes(k) && "done", run.pos === k && "here", n.type === "boss" && "boss"].filter(Boolean).join(" ");
    return `<div class="mnode ${cls}" style="left:${x(n.l)}%;top:${y(n.r)}px"${can.has(k) ? ` data-a="node|${k}"` : ""} title="${esc(tr(NODE[n.type].t))}">${NODE[n.type].ic}</div>`;
  }).join("");
  const legend = Object.entries(NODE).map(([, n]) => `<span>${n.ic} ${tr(n.t)}</span>`).join("");
  return `<div class="sub" style="margin:0 0 6px">${L("แตะช่องที่กระพริบเพื่อเดินต่อ", "Tap a glowing node to move on")}</div><div class="legend">${legend}</div>` +
    `<div class="mapwrap" id="mapwrap" style="height:${total}px"><svg viewBox="0 0 100 ${total}" preserveAspectRatio="none">${lines}</svg>${nodes}</div>`;
}
function scrollMap() {
  const body = $("rbody"), here = document.querySelector(".mnode.can") || document.querySelector(".mnode.here");
  if (here) body.scrollTop = Math.max(0, here.offsetTop + $("mapwrap").offsetTop - body.clientHeight + 120);
}
function doorsHtml() {
  const bossNext = run.doors.length === 1 && run.doors[0] === "boss";
  return `<div class="big" style="margin-top:16px">${bossNext ? L("👑 ประตูบอส", "👑 The boss door") : L("เลือกประตู", "Choose a door")}</div>` +
    `<div class="doors">${run.doors.map((ty, i) => `<div class="door${ty === "boss" ? " boss" : ""}" data-a="door|${i}"><div class="di">🚪</div><div class="dt">${NODE[ty].ic} ${tr(NODE[ty].t)}</div><div class="d">${tr(NODE[ty].d)}</div><kbd>${i + 1}</kbd></div>`).join("")}</div>`;
}
function storyPathHtml() {
  const ch = EPISODE.chapters[run.ch], ty = STORY_PATH[run.step];
  return `<div class="stHead">${EPISODE.part} · ${EPISODE.title} — ${ch.n}</div><div class="quote">“${esc(storyQuote(run.ch, run.step))}”</div>` +
    `<div class="spath">${STORY_PATH.map((s, i) => `<div class="mnode inline${i < run.step ? " done" : ""}${i === run.step ? " can" : ""}${s === "boss" ? " boss" : ""}">${NODE[s].ic}</div>`).join("<span class=\"sdash\">—</span>")}</div>` +
    `<button data-a="snode" style="font-size:18px;padding:12px 30px">${NODE[ty].ic} ${tr(NODE[ty].t)} ▶</button>`;
}

// ---------- combat screen ----------
const foeEl = f => document.querySelector(`.foe[data-f="${run.combat.foes.indexOf(f)}"]`);
let hcur = null; // keyboard cursor on a hand slot (arrow keys)
function moveHcur(d) {
  const occ = handLay.map((x, i) => x ? i : -1).filter(i => i >= 0); if (!occ.length) return;
  const at = occ.indexOf(hcur);
  hcur = at < 0 ? (d > 0 ? occ[0] : occ[occ.length - 1]) : occ[(at + d + occ.length) % occ.length];
  renderCombat();
}
let handLay = [], layFor = null, handEls = new Map();
const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function handRects() { const m = new Map(); for (const [ci, el] of handEls) if (el.isConnected) { const r = el.getBoundingClientRect(); if (r.width) m.set(ci, r); } return m; }
function handFlip(old) {
  const cards = handLay.filter(Boolean), els = $("hand").querySelectorAll(".hc:not(.slot0):not(.slotsp)");
  handEls = new Map();
  const pile = $("piles").firstElementChild, pr = pile && pile.getBoundingClientRect();
  let k = 0;
  els.forEach((el, i) => {
    const ci = cards[i]; if (!ci) return;
    handEls.set(ci, el);
    if (calm()) return;
    const r = el.getBoundingClientRect(), o = old.get(ci);
    if (o) { const dx = o.left - r.left, dy = o.top - r.top; if (Math.abs(dx) + Math.abs(dy) > 2) el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.8,.2,1)" }); }
    else if (pr && pr.width) el.animate([{ transform: `translate(${pr.left - r.left}px,${pr.top - r.top}px) scale(.35) rotate(-12deg)`, opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 360, delay: 70 * k++, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
  });
}
// a copy of the card flies away: up (played) or into a pile
function flyOut(ci, to) {
  const el = handEls.get(ci);
  if (!el || !el.isConnected || calm()) return;
  const r = el.getBoundingClientRect(), g = el.cloneNode(true);
  g.removeAttribute("data-a"); g.classList.remove("no", "dsel");
  Object.assign(g.style, { position: "fixed", left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", margin: 0, zIndex: 60, pointerEvents: "none" });
  document.body.appendChild(g);
  let t = "translate(0,-150px) scale(1.12)";
  if (to) { const q = to.getBoundingClientRect(); t = `translate(${q.left + q.width / 2 - r.left - r.width / 2}px,${q.top - r.top - r.height / 3}px) scale(.3) rotate(10deg)`; }
  g.animate([{ transform: "none", opacity: 1 }, { transform: t, opacity: 0 }], { duration: to ? 420 : 360, easing: "ease-in" }).onfinish = () => g.remove();
}
function layHand(c) {
  if (layFor !== c) { layFor = c; handLay = []; }
  handLay = handLay.map(x => x && c.hand.includes(x) ? x : null);
  for (const ci of c.hand) if (!handLay.includes(ci)) { const k = handLay.indexOf(null); if (k >= 0) handLay[k] = ci; else handLay.push(ci); }
  while (handLay.length < handLim()) handLay.push(null); // empty frames up to the hand limit
  return handLay;
}
const slotToHand = n => { const c = run.combat, ci = c && handLay[n]; return layFor !== c ? n : ci ? c.hand.indexOf(ci) : -1; };
function renderCombat() {
  const c = run.combat;
  if (!c) return;
  const need = discardNeed(c);
  $("phead").innerHTML = headHtml();
  $("foes").innerHTML = c.foes.map((f, i) =>
    `<div class="foe${f.dead ? " dead" : ""}${i === c.tgt && aliveFoes().length > 1 ? " sel" : ""}${f.boss ? " boss" : ""}${f.elite ? " elite" : ""}" data-f="${i}" data-a="tgt|${i}">` +
    (f.dead ? "" : intentHtml(f)) + `<div class="fe">${f.pvp ? f.av : foeDef(f).e}</div><div class="fn">${f.boss ? "👑 " : ""}${foeName(f)}</div>` +
    `<div class="bar fhp"><i style="width:${f.hp / f.maxHp * 100}%"></i><span>${fmtN(f.hp)} / ${fmtN(f.maxHp)}</span></div><div class="sts">${stsHtml(f.st, f.block)}</div></div>`).join("");
  const pr = prof();
  $("pbar").innerHTML = `<div class="pava" id="pava">${pr.avatar}</div>` +
    `<div><div class="bar php"><i style="width:${run.hp / run.maxHp * 100}%"></i><span>❤️ ${run.hp} / ${run.maxHp}</span></div><div class="sts" style="justify-content:flex-start">${stsHtml(c.st, c.block)}${c.bpt ? `<span>🏯 +${c.bpt}/${L("เทิร์น", "turn")}</span>` : ""}</div></div>` +
    `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="energy${c.en ? "" : " zero"}" id="energy">${c.en}</div>` + (c.dsel
      ? `<button id="endBtn" class="dok" data-a="dok"${c.dsel.length < need ? " disabled" : ""}>🗑️ ${L("ทิ้ง", "Discard")} ${c.dsel.length}${need ? "/" + need : ""} · ${L("จบเทิร์น", "End turn")} <kbd>E</kbd></button><button class="ghost" data-a="dx" title="${L("ยกเลิก", "Cancel")}">✕</button>`
      : `<button class="ghost dbtn" data-a="dmode"${busy ? " disabled" : ""} title="${L("เลือกทิ้งการ์ดแล้วจบเทิร์น", "Discard cards, then end the turn")}">🗑️ <kbd>D</kbd></button><button id="endBtn" data-a="end"${busy ? " disabled" : ""}>${L("จบเทิร์น", "End turn")} <kbd>E</kbd></button>`) + `</div>`;
  const tf = c.foes[c.tgt];
  $("hand").classList.toggle("dmode", !!c.dsel);
  // cards past the limit stick out to the right; matching hidden spacers on the left keep the other slots in place
  const spacers = `<div class="hc slotsp"></div>`.repeat(Math.max(0, layHand(c).length - handLim()));
  const oldRects = handRects();
  $("hand").innerHTML = spacers + handLay.map((ci, slot) => {
    if (!ci) return `<div class="hc slot0"><span>${slot < 9 ? slot + 1 : slot === 9 ? 0 : ""}</span></div>`;
    const i = c.hand.indexOf(ci), d = eff(ci), fx = { dmg: d.dmg || d.slam ? hitDmg(d, d.all ? null : tf, true) : 0, block: d.block ? blockAmt(d.block, d) : 0, held: ci.held || 0 };
    const badge = ci.held ? `<div class="heldb" title="${L("ถือไว้", "kept")} ${ci.held} ${L("เทิร์น", "turn(s)")}">⏳${ci.held}</div>` : "";
    const key = slot < 9 ? slot + 1 : slot === 9 ? 0 : "";
    if (c.dsel) return cardHtml(ci, { cls: c.dsel.includes(i) ? "dsel" : "", attrs: ` data-a="dsel|${i}"`, fx, key, badge });
    return cardHtml(ci, { cls: canPlay(ci) && !busy ? "" : "no", attrs: ` data-a="play|${i}"`, fx, key, badge });
  }).join("") || `<div class="sub" style="margin:auto">${L("ไม่มีการ์ดในมือ", "No cards in hand")}</div>`;
  if (spacers && $("hand").scrollWidth > $("hand").clientWidth) $("hand").querySelectorAll(".slotsp").forEach(e => e.remove()); // no room: drop them
  handFlip(oldRects);
  if (hcur != null) { // keep the arrow-key cursor on a card (a played card leaves its slot: move to the next one)
    if (!handLay[hcur]) { let k = handLay.findIndex((x, j) => j > hcur && x); if (k < 0) k = handLay.findLastIndex(x => x); hcur = k < 0 ? null : k; }
    const el = hcur != null && [...$("hand").children].filter(x => !x.classList.contains("slotsp"))[hcur];
    if (el) { el.classList.add("kbf"); el.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  }
  for (const [i, cls] of animQ) { const fe = document.querySelector(`.foe[data-f="${i}"] .fe`); if (fe) anim(fe, cls); }
  animQ = [];
  $("piles").innerHTML = `<span>📚 ${L("กองจั่ว", "Draw")} ${c.draw.length}</span>` + (c.dsel
      ? `<span class="dhint">🗑️ ${need ? L(`การ์ดเกิน ถือได้ ${handLim()} ใบ · เลือกทิ้งอย่างน้อย ${need} ใบ`, `Over the limit (${handLim()}) · pick at least ${need} to discard`) : L("แตะการ์ดที่จะทิ้ง แล้วกดจบเทิร์น", "Tap cards to discard, then end the turn")}</span>`
      : `<span>✋ ${c.hand.length}/${handLim()} · ${L("เทิร์น", "Turn")} ${c.turn}${aliveFoes().length > 1 ? " · " + L("แตะศัตรูเพื่อเลือกเป้า", "tap an enemy to target it") : ""}</span>`) + `<span>♻️ ${L("ทิ้ง", "Discard")} ${c.disc.length}${c.exh.length ? ` · ✖ ${c.exh.length}` : ""}</span>`;
}
let animQ = [];
const animFoe = (f, cls) => animQ.push([run.combat.foes.indexOf(f), cls]);
function anim(el, cls) { if (!el) return; el.classList.remove("hit", "lunge", "die"); void el.offsetWidth; el.classList.add(cls); }
function floatAt(el, txt, cls) {
  if (!el) return;
  const r = el.getBoundingClientRect(), g = $("game").getBoundingClientRect(), f = document.createElement("div");
  f.className = "float " + (cls || ""); f.innerHTML = txt;
  f.style.left = (r.left - g.left + r.width / 2 - 20 + Math.random() * 20) + "px";
  f.style.top = (r.top - g.top + r.height * 0.25) + "px";
  $("game").appendChild(f);
  setTimeout(() => f.remove(), 900);
}

// ---------- overlays inside a run (saved in run.ov, so they survive a reload) ----------
function renderOv() {
  const o = run && run.ov, el = $("ov");
  if (!o) { el.classList.add("hidden"); return; }
  el.classList.remove("hidden");
  let h = "";
  if (o.k === "reward") {
    h = `<div class="big">${tr(o.title)}</div><div class="loot">${o.loot.map(x => `<span class="lchip">${x}</span>`).join("")}</div>` +
      (o.cards ? `<div class="sub" style="margin:14px 0 0">${L("เลือกการ์ด 1 ใบเข้าเด็ค", "Add a card to your deck")}</div><div class="cardrow">${o.cards.map((id, i) => cardHtml({ id, up: 0 }, { attrs: ` data-a="take|${i}"`, key: i + 1 })).join("")}</div>` : "") +
      `<button class="ghost" data-a="${o.cards ? "skip" : "next"}">${o.cards ? L("ข้าม", "Skip") : L("ไปต่อ ▶", "Continue ▶")}</button>`;
  } else if (o.k === "loot") {
    h = `<div class="big">${tr(o.title)}</div><div class="loot">${o.loot.map(x => `<span class="lchip">${x}</span>`).join("")}</div><button data-a="next">${L("ไปต่อ ▶", "Continue ▶")}</button>`;
  } else if (o.k === "rest") {
    const heal = Math.min(run.maxHp - run.hp, Math.round(run.maxHp * 0.3));
    h = `<div style="font-size:52px">🔥</div><div class="big">${tr(NODE.rest.t)}</div><div class="sub">❤️ ${run.hp}/${run.maxHp}</div>` +
      `<button class="choice" data-a="rest"${heal ? "" : " disabled"}><kbd>1</kbd>😴 ${L(`พักผ่อน: ฟื้น ${heal} HP (30%)`, `Rest: heal ${heal} HP (30%)`)}</button>` +
      `<button class="choice" data-a="smith"${run.deck.some(c => !c.up) ? "" : " disabled"}><kbd>2</kbd>🔨 ${L("ฝึกฝน: อัปเกรดการ์ด 1 ใบ", "Train: upgrade a card")}</button>`;
  } else if (o.k === "shop") {
    let kn = 0;
    h = `<div style="font-size:44px">🛒</div><div class="big">${tr(NODE.shop.t)}</div><div class="sub">💰 <b style="color:var(--gold)">${run.gold}</b></div>` +
      `<div class="cardrow">${o.stock.map((s, i) => s.sold ? `<div class="hc sold"><div class="ci">✔</div></div>` : cardHtml({ id: s.id, up: 0 }, { cls: run.gold >= s.price ? "" : "no", attrs: ` data-a="buy|${i}"`, price: s.price, key: ++kn })).join("")}</div>` +
      `<div class="row" style="justify-content:center">` +
      `<button class="ghost" data-a="buypot"${o.potion.sold || run.gold < o.potion.price || run.potions >= 3 ? " disabled" : ""}><kbd>${++kn}</kbd>🧪 Potion · 💰 ${o.potion.price}</button>` +
      `<button class="ghost" data-a="buyrm"${o.rmDone || run.gold < run.rmCost || run.deck.length <= 5 ? " disabled" : ""}><kbd>${++kn}</kbd>✂️ ${L("ลบการ์ด", "Remove a card")} · 💰 ${run.rmCost}</button>` +
      `<button data-a="next"><kbd>${++kn}</kbd>${L("ออกจากร้าน ▶", "Leave ▶")}</button></div>`;
  } else if (o.k === "event") {
    const ev = EVENTS.find(e => e.id === o.id);
    h = `<div style="font-size:52px">${ev.ic}</div><div class="big">${tr(ev.t)}</div><p class="quote">${tr(ev.d)}</p>` +
      (o.res ? `<p class="evres">${tr(o.res)}</p><button data-a="next">${L("ไปต่อ ▶", "Continue ▶")}</button>`
        : [...ev.ch, LEAVE].map((c, i) => `<button class="choice${c === LEAVE ? " ghost" : ""}" data-a="evc|${i}"${c.ok && !c.ok() ? " disabled" : ""}><kbd>${i + 1}</kbd>${tr(c.t)}</button>`).join(""));
  } else if (o.k === "pick") {
    const list = run.deck.map((c, i) => [c, i]).filter(([c]) => o.mode === "rm" || !c.up);
    h = `<div class="big">${o.mode === "rm" ? L("✂️ เลือกการ์ดที่จะลบ", "✂️ Choose a card to remove") : L("🔨 เลือกการ์ดที่จะอัปเกรด", "🔨 Choose a card to upgrade")}</div>` +
      `<div class="cardrow">${sortedDeck(list).map(([c, i]) => cardHtml(o.mode === "up" ? { ...c, up: 1 } : c, { attrs: ` data-a="pickc|${i}"` })).join("")}</div>` +
      (o.cancel ? `<button class="ghost" data-a="pickx">${L("ยกเลิก", "Cancel")}</button>` : "");
  } else if (o.k === "cards") {
    h = `<div class="big">${L("📖 เลือกการ์ด 1 ใบ", "📖 Choose a card")}</div><div class="cardrow">${o.cards.map((id, i) => cardHtml({ id, up: 0 }, { attrs: ` data-a="take|${i}"`, key: i + 1 })).join("")}</div><button class="ghost" data-a="skip">${L("ข้าม", "Skip")}</button>`;
  } else if (o.k === "storyfail") {
    h = `<div style="font-size:56px">💀</div><div class="big">${L("พ่ายแพ้...", "Defeated...")}</div><div class="sub">${EPISODE.chapters[run.ch].n} · ${L("ทองที่เก็บได้เข้าคลังแล้ว", "the gold you found is banked")}</div>` +
      `<div class="row" style="justify-content:center"><button data-a="sretry">${L("🔄 เริ่มบทนี้ใหม่", "🔄 Retry the chapter")}</button><button class="ghost" data-a="squit">${L("📖 กลับไปรายการบท", "📖 Back to chapters")}</button></div>`;
  }
  el.innerHTML = `<div class="ovbox">${h}</div>`;
}
const sortedDeck = list => list.sort((a, b) => CARDS[a[0].id].r - CARDS[b[0].id].r || a[0].id.localeCompare(b[0].id));

// ---------- pause menu and deck viewer (not saved) ----------
let pauseOpen = null; // "menu" | "deck"
function openPause(kind) { pauseOpen = kind; renderPause(); }
function closePause() { pauseOpen = null; $("pov").classList.add("hidden"); }
function renderPause() {
  const el = $("pov");
  el.classList.remove("hidden");
  if (pauseOpen === "deck") {
    const c = run.combat, list = sortedDeck(run.deck.map((x, i) => [x, i]));
    el.innerHTML = `<div class="ovbox"><div class="big">🃏 ${L("เด็ค", "Deck")} (${run.deck.length})</div>` +
      (c ? `<div class="sub" style="margin:4px 0 0">📚 ${c.draw.length} · ✋ ${c.hand.length} · ♻️ ${c.disc.length} · ✖ ${c.exh.length}</div>` : "") +
      `<div class="cardrow">${list.map(([x]) => cardHtml(x)).join("")}</div><button data-a="unpause">${L("ปิด", "Close")}</button></div>`;
    return;
  }
  const s = run.st;
  el.innerHTML = `<div class="ovbox"><div class="big">${t("paused")}</div>` +
    `<div class="pmenu2"><button data-a="unpause">▶️ ${t("pResume")}</button>` +
    `<button class="ghost" data-a="deck">🃏 ${L("ดูเด็ค", "View deck")}</button>` +
    (run.mode === "pvp" ? "" : `<button class="ghost" data-a="tohome">🏠 ${L("กลับเมนู (เก็บ run ไว้เล่นต่อ)", "Menu (the run is saved)")}</button>`) +
    `<button class="ghost danger" data-a="giveup">🏳️ ${run.mode === "pvp" ? L("ยอมแพ้ดวลนี้", "Forfeit this duel") : L("ยอมแพ้ run นี้ (ทองเข้าคลัง)", "Give up this run (gold is banked)")}</button></div>` +
    `<div class="sec"><h3>📊 ${L("ค่าพลังใน run นี้", "This run's stats")}</h3><div class="statgrid">` +
    [["⚔️ " + L("ดาเมจ", "Damage"), "+" + pc(s.atk) + "%"], ["🛡️ Block", "+" + pc(s.def) + "%"], ["🎯 Crit", pc(s.crit) + "% · x" + s.critMult],
     ["🔥 Combo", "+" + pc(s.combo + (pLv("momentum") ? PF.momentum(pLv("momentum")) : 0)) + "%"], ["🍀 " + L("โชคการ์ด", "Card luck"), "+" + pc(luck()) + "%"], ["🪙 " + L("ทอง", "Gold"), "+" + pc(goldMult() - 1) + "%"]]
      .map(([a, b]) => `<div class="stat">${a}<b>${b}</b></div>`).join("") + `</div>` +
    (s.tags && Object.keys(s.tags).length ? `<div class="chips" style="justify-content:center;margin-top:8px">${Object.entries(s.tags).map(([tg, n]) => themeChip(tg, n)).join("")}</div>` : "") +
    `<div class="sub" style="margin:8px 0 0">${s.gear}${Object.keys(s.pass).length ? " · ✨ " + Object.entries(s.pass).map(([id, lv]) => { const ps = PASSIVES.find(x => x.id === id); return ps ? `${ps.ic} ${ps.t} Lv${lv}` : ""; }).join(", ") : ""}</div></div><div class="sub" style="margin:6px 0 0;opacity:.45;font-size:11px">Deckuest v${GAME_VER}</div></div>`;
}

// ================= story (Adventure of the book) =================
// source: Howard Pyle, The Story of King Arthur and His Knights (1903, public domain)
const STORY_FOES = [
  { foes: ["s_knight", "s_rider", "s_squire"], boss: "s_champ" },
  { foes: ["s_blade", "s_stone", "s_doubt"], boss: "s_anvil" },
  { foes: ["s_guard", "s_archer", "s_urien"], boss: "s_lot" },
];
const STORY_REWARDS = [[{ id: "q_anvil", r: 0 }, { id: "q_cloak", r: 0 }], [{ id: "q_signet", r: 0 }, { id: "q_mantle", r: 0 }], [{ id: "q_anvil", r: 2 }]];
let storyCh = 0, storyView = "cover", storyPage = 0, storyGain = 0, storyLoot = [];
// a passage from the chapter, walking through it as the chapter's path goes on
function storyQuote(ch, step) {
  const paras = KINGHOOD[EPISODE.chapters[ch].key].paras.filter(p => p.length > 80);
  const p = paras[Math.min(paras.length - 1, Math.floor(step / STORY_PATH.length * paras.length))] || "";
  return p.length > 420 ? p.slice(0, p.lastIndexOf(" ", 420)) + " …" : p;
}
function storyPages(i) {
  const paras = (i === 0 ? KINGHOOD.intro.paras : []).concat(KINGHOOD[EPISODE.chapters[i].key].paras), pages = [];
  let cur = [], len = 0;
  for (const para of paras) {
    if (cur.length && len + para.length > 700) { pages.push(cur); cur = []; len = 0; }
    cur.push(para); len += para.length;
  }
  if (cur.length) pages.push(cur);
  return pages;
}
function openStory() { state = "story"; storyView = "cover"; show("story"); renderStory(); }
function renderStory() {
  const E = EPISODE, done = prof().story.done, n = E.chapters.length, body = $("storyBody");
  if (storyView === "cover") {
    body.innerHTML = `<div class="stBook">📖</div><div class="stBookT">${E.book}</div><div class="stPart">${E.part} · ${E.title}</div>` +
      `<div class="shop stList">` + E.chapters.map((c, i) => {
        const ok = i <= done;
        return `<div class="item${ok ? "" : " no"}" data-st="${ok ? "ch|" + i : "x"}"><span class="ic">${i < done ? "✅" : ok ? "📜" : "🔒"}</span><div class="info"><b>${c.n}</b><div class="d">${esc(KINGHOOD[c.key].sub)}</div></div></div>`;
      }).join("") + `</div>` + (done >= n ? `<p class="sub">${t("stEnd")}</p>` : `<button data-st="ch|${done}">${t("stBegin")}</button>`) +
      `<p class="sub" style="margin-top:14px">${L("แต่ละบท: อ่านเนื้อเรื่อง แล้วสู้ 4 ไฟต์ + บอส · ผ่านครั้งแรกได้อุปกรณ์พิเศษ · แพ้แล้วเริ่มบทใหม่ได้", "Each chapter: read it, then 4 fights and a boss · the first clear gives special gear · lose and you can retry")}</p>`;
  } else if (storyView === "read") {
    const c = E.chapters[storyCh], pages = storyPages(storyCh), last = storyPage >= pages.length - 1;
    body.innerHTML = `<div class="stHead">${E.part} · ${E.title} — ${c.n}</div>` + (storyPage === 0 ? `<div class="stSub">${esc(KINGHOOD[c.key].sub)}</div>` : "") +
      `<div class="stText">${pages[storyPage].map(x => `<p>${esc(x)}</p>`).join("")}</div>` +
      `<div class="row stNav"><button class="ghost" data-st="prev"${storyPage ? "" : " disabled"}>${t("stPrev")}</button><span class="sub" style="margin:0">${t("stPage", storyPage + 1, pages.length)}</span>` +
      (last ? `<button data-st="fight">${t("stFight")}</button>` : `<button data-st="next">${t("stNext")}</button>`) +
      (last ? "" : `<button class="ghost" data-st="fight">${L("⚔️ ข้ามไปสู้", "⚔️ Skip to the fight")}</button>`) + `</div>`;
  } else {
    const more = storyCh + 1 < n;
    body.innerHTML = `<div class="stBook">🏆</div><div class="stBookT">${t("stClear")}</div><div class="stPart">${E.chapters[storyCh].n}</div>` +
      `<p class="sub">${t("stGold", storyGain)}</p>` +
      storyLoot.map(it => { const v = view(it); return `<div class="item rrow" style="--rc:${RARITY[it.r].c};max-width:560px;margin:6px auto;text-align:left"><span class="ic">${v.ic}</span><div class="info">🎁 ${rName(v)}<div class="d">${esc(tr(v.lore || ""))}</div><div class="d">${gearDesc(v)}</div></div><button class="mergeBtn" style="--rc:${RARITY[it.r].c}" data-st="eq|${it.u}">${equippedUids(prof()).has(it.u) ? "✔ " + t("worn") : t("equip")}</button></div>`; }).join("") +
      `<div class="row" style="justify-content:center;gap:12px;margin-top:12px"><button class="ghost" data-st="list">${t("stList")}</button>` +
      (more ? `<button data-st="nextch">${t("stNextCh")}</button>` : "") + `</div>` + (more ? "" : `<p class="sub" style="margin-top:14px">${t("stEnd")}</p>`);
  }
}
function storyAct(a) {
  const [k, v] = a.split("|");
  if (k === "ch") { storyCh = +v; storyPage = 0; storyView = "read"; }
  else if (k === "prev") storyPage = Math.max(0, storyPage - 1);
  else if (k === "next") storyPage = Math.min(storyPages(storyCh).length - 1, storyPage + 1);
  else if (k === "fight") return newRun("story", storyCh);
  else if (k === "eq") {
    const pr = prof(), it = itemBy(pr, v);
    if (!it) return;
    const kind = kindOf(it.id);
    if (kind === "hand") equipHand(pr, it.u, defOf(it.id).hands === 2 || !pr.hands[0] || twoHanded(pr) ? 0 : 1); else if (kind === "armor") pr.armor = it.u; else if (!equippedUids(pr).has(it.u)) toggleAcc(pr, it.u);
    saveStore();
  }
  else if (k === "list") storyView = "cover";
  else if (k === "nextch") { storyCh++; storyPage = 0; storyView = "read"; }
  else return;
  renderStory();
  if (k === "next" || k === "prev") $("storyBody").scrollTop = 0;
}
function storyBack() {
  if (storyView === "cover") return goHome();
  storyView = "cover"; renderStory();
}
function storyClear() {
  const pr = prof(), ch = run.ch;
  storyGain = run.gold;
  pr.gold += run.gold; pr.inv.potion = (pr.inv.potion || 0) + run.potions; pr.stats.kills = (pr.stats.kills || 0) + run.kills;
  storyLoot = ch >= pr.story.done ? STORY_REWARDS[ch].map(g => addItem(pr, g.id, g.r)) : []; // first clear only
  pr.story.done = Math.max(pr.story.done, ch + 1);
  pr.run = null; run = null;
  saveStore();
  storyCh = ch; state = "story"; storyView = "clear"; show("story"); renderStory();
}

// ================= main shop (permanent, paid with banked gold) =================
const MTABS = [
  { id: "items", ic: "🧪", key: "tabItems" }, { id: "weapons", ic: "⚔️", key: "tabWeapons" },
  { id: "armor", ic: "🛡️", key: "tabArmor" }, { id: "acc", ic: "💍", key: "tabAcc" },
  { id: "passive", ic: "✨", key: "tabPassive" },
  { id: "merge", ic: "🔨", key: "tabMerge" }, { id: "sell", ic: "💰", key: "tabSell" }, { id: "enhance", ic: "⚒️", key: "tabEnhance" },
];
const MERCHANTS = [
  { id: "weapon", ic: "⚔️", tabs: ["weapons"], name: { th: "เกรย์ ช่างตีดาบ", en: "Gray the Weaponsmith" }, role: { th: "ร้านอาวุธ", en: "Weapons" }, line: { th: "อาวุธแต่ละเล่มมีการ์ดประจำตัว เข้าเด็คทุก run", en: "Every weapon brings its own card into your deck" } },
  { id: "armor", ic: "🛡️", tabs: ["armor"], name: { th: "บรูน่า ช่างเกราะ", en: "Bruna the Armorer" }, role: { th: "ร้านอุปกรณ์ป้องกัน", en: "Armor" }, line: { th: "เกราะดีช่วยให้รอดถึงบอส", en: "Good armor gets you to the boss" } },
  { id: "jewel", ic: "💍", tabs: ["acc"], name: { th: "ลูมิ ช่างอัญมณี", en: "Lumi the Jeweler" }, role: { th: "ร้านเครื่องประดับ", en: "Accessories" }, line: { th: "เพชรเม็ดเล็ก พลังไม่เล็กนะ", en: "Small gems, big effects" } },
  { id: "potion", ic: "🧪", tabs: ["items"], name: { th: "มิร่า นักเล่นแร่แปรธาตุ", en: "Mira the Alchemist" }, role: { th: "ร้านยา", en: "Potions" }, line: { th: "พกยาไปด้วย ตายแล้วซื้อไม่ทันนะ", en: "Bring potions, the dead can't shop" } },
  { id: "skill", ic: "📚", tabs: ["passive"], name: { th: "ปราชญ์โอริน", en: "Sage Orin" }, role: { th: "ร้าน Passive Skill", en: "Passive Skills" }, line: { th: "ความรู้ซื้อได้ แต่ต้องดวงดีด้วย", en: "Knowledge can be bought, with a little luck" } },
  { id: "smith", ic: "🔨", tabs: ["merge"], name: { th: "ลุงค้อน ช่างรวมของ", en: "Old Hammer" }, role: { th: "ร้านรวมอุปกรณ์", en: "Merge" }, line: { th: "สามชิ้นเหมือนกัน เอามา ข้าหลอมให้", en: "Bring three alike, I'll forge one better" } },
  { id: "pawn", ic: "💰", tabs: ["sell"], name: { th: "ป้าเหรียญ พ่อค้ารับซื้อ", en: "Penny the Pawnbroker" }, role: { th: "ร้านรับซื้ออุปกรณ์", en: "Sell" }, line: { th: "ของเหลือใช้ เปลี่ยนเป็นทองได้", en: "Spare gear turns into gold" } },
  { id: "enhance", ic: "⚒️", tabs: ["enhance"], name: { th: "ฮาร์ดี้ ช่างตีบวก", en: "Hardy the Forgemaster" }, role: { th: "ร้านตีบวกอุปกรณ์", en: "Enhance" }, line: { th: "ตีพลาดเสียแค่ทอง ระดับไม่ลด", en: "A miss costs gold, never levels" } },
];
let mMerch = null, mtab = 0, mergeNote = "", shopFlash = null;
const merchant = () => MERCHANTS.find(x => x.id === mMerch);
function openMShop() { state = "mshop"; show("mshop"); mMerch = MERCHANTS[0].id; mergeNote = ""; lastPassRoll = []; renderMShop(); }
const merchantList = () => MERCHANTS.map((mc, i) =>
  `<div class="mitem${mc.id === mMerch ? " sel" : ""}" data-merchant="${mc.id}"><span class="mic">${mc.ic}</span><div><b>${tr(mc.role)}</b><small>${tr(mc.name)}</small></div><kbd>${i + 1}</kbd></div>`).join("");
const rName = v => `<b style="color:${RARITY[v.r].c}">${v.t}${v.e ? " +" + v.e : ""}</b> <small style="color:${RARITY[v.r].c}">${RARITY[v.r].n}</small>`;
const sec = (title, body) => `<div class="sec"><h3>${title}</h3><div class="shop" style="margin:0">${body}</div></div>`;
function shopGearRow(pr, g) {
  const n = pr.items.filter(x => x.id === g.id).length;
  const right = g.price ? `<span class="price">💰 ${g.price}</span>` : `<span class="price">${t("starter")}</span>`;
  return `<div class="item${!g.price || pr.gold >= g.price ? "" : " no"}${shopFlash === g.id ? " flash" : ""}"${g.price ? ` data-buy-gear="${g.id}"` : ""}>` +
    `<span class="ic">${g.ic}</span><div class="info"><b>${g.t}</b>${n ? ` <small>${t("owned", n)}</small>` : ""}<div class="d">${gearDesc(g, undefined, true)}</div></div>${right}</div>`;
}
const mergeRow = (pr, b) => {
  const v = view({ id: b.id, r: b.r }), n = b.all.length, ok = n >= MERGE_COUNT;
  return `<div class="item rrow${ok ? "" : " no"}" style="--rc:${RARITY[b.r].c}"><span class="ic">${v.ic}</span><div class="info">${rName(v)} <small>×${n}${b.worn.length ? " · " + t("equipped") : ""}</small><div class="d">${gearDesc(v)}</div></div>` +
    (ok ? `<button class="mergeBtn" data-merge="${b.id}|${b.r}" style="--rc:${RARITY[b.r + 1].c}">${t("mergeBtn", MERGE_COUNT, RARITY[b.r + 1].n, mergeFee(b.id, b.r))}</button>` : `<span class="price">${n}/${MERGE_COUNT}</span>`) + `</div>`;
};
const sellRow = (pr, b) => {
  const v = view({ id: b.id, r: b.r }), val = sellValue(b.id, b.r), spare = b.all.filter(u => !b.worn.includes(u) && !itemBy(pr, u).e).length;
  return `<div class="item rrow${spare ? "" : " no"}" style="--rc:${RARITY[b.r].c}"><span class="ic">${v.ic}</span><div class="info">${rName(v)} <small>×${b.all.length}${b.worn.length ? " · " + t("equipped") : ""}</small><div class="d">${gearDesc(v)}</div></div>` +
    (spare ? `<button class="mergeBtn" data-sell="${b.id}|${b.r}|1">${t("sell1", val)}</button>` +
      (spare > 1 ? `<button class="mergeBtn" data-sell="${b.id}|${b.r}|all">${t("sellAll", spare, val * spare)}</button>` : "")
      : `<span class="price">${t("equipped")}</span>`) + `</div>`;
};
const passRow = (pr, ps, shop) => {
  const lv = passLvOf(pr, ps.id), eq = pr.passEquip.includes(ps.id), tier = PASS_TIERS[ps.tier], max = lv >= PASS_MAX;
  const poolW = passPool(pr).reduce((s, x) => s + passWeight(x), 0);
  const odds = max ? "MAX" : (passWeight(ps) / poolW * 100).toFixed(1) + "%";
  const st = eq ? `✔ ${t("worn")}` : lv ? t("wear") : "";
  const right = shop ? `<span class="price${eq ? " ok" : ""}">${st}${st ? "<br>" : ""}<small>🎲 ${odds}</small></span>` : `<span class="price${eq ? " ok" : ""}">${st}</span>`;
  return `<div class="item rrow${eq ? " sel" : ""}${lv ? "" : " no"}"${lv ? ` data-pass="${ps.id}"` : ""} style="--rc:${tier.c}">` +
    `<span class="ic">${ps.ic}</span><div class="info"><b style="color:${tier.c}">${ps.t}</b> <small style="color:${tier.c}">${tier.n}</small> ` +
    `<small>${lv ? `Lv${lv}${max ? " MAX" : ""}` : t("notOwned")}</small><div class="d">${tr(ps.d(lv || 1))}</div>` +
    (shop && lv && !max ? `<div class="d nextlv">⬆ Lv${lv + 1}: ${tr(ps.d(lv + 1))}</div>` : "") + `</div>${right}</div>`;
};
const passiveSlotsHtml = pr => `<div class="pslots">` + pr.passEquip.map(id => {
  const ps = PASSIVES.find(x => x.id === id), lv = ps ? passLvOf(pr, id) : 0;
  return `<div class="pslot${ps ? "" : " empty"}"${ps ? ` data-pass="${ps.id}" title="${esc(tr(ps.d(lv)))}" style="--rc:${PASS_TIERS[ps.tier].c}"` : ""}><span>${ps ? ps.ic : "✨"}</span><small>${ps ? `${ps.t} Lv${lv}` : t("empty")}</small></div>`;
}).join("") + `</div>`;
function rollBar(kind, single, bulk, poolLen, gold) {
  const btn = n => `<button data-${kind}="${n}"${poolLen && gold >= rollCost(n, single, bulk) ? "" : " disabled"}>${t("rollN", n)} · 💰 ${rollCost(n, single, bulk)}</button>`;
  const mx = maxRolls(gold, single, bulk);
  return `<div class="rollbar">${[1, 10, 50].map(btn).join("")}</div>` +
    `<div class="rollbar"><label class="qtylbl">${t("rollQty")} <input type="number" class="qty" id="qty-${kind}" min="1" max="500" value="${rollQty[kind]}"></label>` +
    `<button data-${kind}="custom"${poolLen ? "" : " disabled"}>${t("rollBuy")}</button>` +
    `<button data-${kind}="max"${poolLen && mx ? "" : " disabled"}>${t("rollMax", mx, rollCost(mx, single, bulk))}</button></div>` +
    `<div class="sub" style="margin:0">${t("rollPrice", single, bulk)}</div>`;
}
function rollAmount(kind, v, gold, single, bulk) {
  let n;
  if (v === "custom") { n = Math.floor(+$("qty-" + kind).value); rollQty[kind] = Math.max(1, Math.min(500, n || 1)); }
  else if (v === "max") n = maxRolls(gold, single, bulk);
  else n = +v;
  n = Math.min(500, n);
  return n >= 1 && gold >= rollCost(n, single, bulk) ? n : 0;
}
function renderMShop() {
  const pr = prof();
  $("bankGold").textContent = pr.gold;
  if (!mMerch) mMerch = MERCHANTS[0].id;
  $("mlist").innerHTML = merchantList();
  const mc = merchant(), idxs = mc.tabs.map(id => MTABS.findIndex(x => x.id === id));
  if (!idxs.includes(mtab)) mtab = idxs[0];
  const tab = MTABS[mtab].id;
  $("mshopTabs").innerHTML = "";
  const npc = `<div class="npc"><span class="npcic">${mc.ic}</span><div><b>${tr(mc.name)}</b><div class="d">“${tr(mc.line)}”</div></div></div>`;
  const note = mergeNote ? `<div id="rollResult">${mergeNote}</div>` : "";
  let html;
  if (tab === "merge") {
    const rows = bucketsOf(pr, () => true).filter(b => b.r < RARITY.length - 1);
    html = `<div class="sub" style="margin:0 0 10px">${t("mergeShopHint", MERGE_COUNT)}</div>` +
      `<div class="rollbar"><button data-qmerge="1"${rows.some(b => b.all.length >= MERGE_COUNT) ? "" : " disabled"}>${t("qmerge")}</button></div>` + note +
      `<div class="shop">` + (rows.map(b => mergeRow(pr, b)).join("") || `<div class="sub">${t("mergeNone")}</div>`) + `</div>`;
  } else if (tab === "enhance") {
    const eq = equippedUids(pr);
    const rows = pr.items.filter(x => defOf(x.id)).sort((a, b) => b.r - a.r || (b.e || 0) - (a.e || 0) || CATALOG.findIndex(x => x.id === a.id) - CATALOG.findIndex(x => x.id === b.id));
    html = `<div class="sub" style="margin:0 0 10px">${t("enhHint", Math.round(ENH_STEP * 100), ENH_MAX)}</div>` + note +
      `<div class="shop">` + (rows.map(it => {
        const v = view(it), e = it.e || 0, max = e >= ENH_MAX, cost = max ? 0 : enhCost(it);
        return `<div class="item rrow${max || pr.gold < cost ? " no" : ""}" style="--rc:${RARITY[it.r].c}"><span class="ic">${v.ic}</span><div class="info">${rName(v)}${eq.has(it.u) ? " <small>· " + t("equipped") + "</small>" : ""}<div class="d">${gearDesc(v)}</div></div>` +
          (max ? `<span class="price">MAX</span>` : `<button class="mergeBtn" data-enh="${it.u}" style="--rc:${RARITY[it.r].c}">${t("enhBtn", e + 1, Math.round(ENH_CHANCE[e] * 100), cost)}</button>`) + `</div>`;
      }).join("") || `<div class="sub">${t("sellNone")}</div>`) + `</div>`;
  } else if (tab === "sell") {
    const rows = bucketsOf(pr, d => d.price > 0);
    html = `<div class="sub" style="margin:0 0 10px">${t("sellHint", Math.round(SELL_RATE * 100))}</div>` + note +
      `<div class="shop">` + (rows.map(b => sellRow(pr, b)).join("") || `<div class="sub">${t("sellNone")}</div>`) + `</div>`;
  } else if (tab === "items") {
    html = `<div class="shop">` + MITEMS.map(it =>
      `<div class="item${pr.gold >= it.price ? "" : " no"}" data-buy="${it.id}"><span class="ic">${it.ic}</span><div class="info"><b>${it.t}</b> <small>${t("owned", pr.inv[it.id] || 0)}</small><div class="d">${tr(it.d)}</div></div><span class="price">💰 ${it.price}</span></div>`
    ).join("") + `</div>`;
  } else if (tab === "weapons") {
    html = `<div class="sub buyhint" style="margin:0 0 10px">${t("buyCopiesHint", MERGE_COUNT)}</div>` +
      `<div class="secgrid">` + CLASS_IDS.filter(cls => cls !== "martial").map(cls => sec(`${THEMES[cls].ic} ${tr(THEMES[cls].n)} <small style="color:var(--dim)">· ${THEME_STAT[cls].toUpperCase()} · ${tr(THEMES[cls].d)}</small>`,
        [...WEAPONS, ...OFFHANDS].filter(g => g.tag === cls && !g.story && !g.starter && !g.legacy).sort((a, b) => (a.type === "offhand") - (b.type === "offhand") || a.price - b.price).map(g => shopGearRow(pr, g)).join(""))).join("") + `</div>`;
  } else if (tab === "armor") {
    html = `<div class="sub buyhint" style="margin:0 0 10px">${t("buyCopiesHint", MERGE_COUNT)}</div><div class="shop two">` +
      ARMORS.filter(g => !g.story).map(g => shopGearRow(pr, g)).join("") + `</div>`;
  } else if (tab === "passive") {
    const pool = passPool(pr), agg = new Map();
    lastPassRoll.forEach(r => { const a = agg.get(r.id) || { n: 0, isNew: false }; a.n++; a.lv = r.lv; a.isNew = a.isNew || r.isNew; agg.set(r.id, a); });
    const result = !pool.length ? t("passAllMax") : lastPassRoll.length
      ? `${t("rollGot")} ` + [...agg].map(([id, a]) => { const ps = PASSIVES.find(x => x.id === id); return `<b style="color:${PASS_TIERS[ps.tier].c}">${ps.ic} ${ps.t}${a.n > 1 ? " ×" + a.n : ""} ${a.isNew ? "🆕 " : ""}→ Lv${a.lv}</b>`; }).join(" · ") : "";
    html = `<div class="sub" style="margin:0">${t("passiveDesc", PASSIVE_SLOTS, PASS_MAX)}</div>` +
      `<div class="sub" style="margin:4px 0 0">${PASS_TIERS.map(x => `<span style="color:${x.c}">${x.n} ${x.w}%</span>`).join(" · ")}</div>` +
      passiveSlotsHtml(pr) + rollBar("proll", PASS_ROLL, PASS_BULK, pool.length, pr.gold) + `<div id="rollResult">${result}</div>` +
      `<div class="shop two">` + PASSIVES.map(ps => passRow(pr, ps, true)).join("") + `</div>`;
  } else {
    html = `<div class="sub buyhint" style="margin:0">${t("buyCopiesHint", MERGE_COUNT)}</div>` +
      `<div class="secgrid">` + ACC_SLOTS.map(s => sec(`${s.ic} ${t("slot_" + s.type)} <small style="color:var(--dim)">· ${t("slots", s.n)}</small>`,
        ACCESSORIES.filter(a => a.type === s.type && !a.story).map(a => shopGearRow(pr, a)).join(""))).join("") + `</div>`;
  }
  $("mshopBody").innerHTML = npc + html;
}
function mshopClick(e) {
  const pr = prof();
  const merchEl = e.target.closest("[data-merchant]"), buyEl = e.target.closest("[data-buy]"), gearEl = e.target.closest("[data-buy-gear]");
  if (merchEl) { mMerch = merchEl.dataset.merchant; mergeNote = ""; lastPassRoll = []; return renderMShop(); }
  if (buyEl) {
    const it = MITEMS.find(x => x.id === buyEl.dataset.buy);
    if (pr.gold < it.price) return;
    pr.gold -= it.price; pr.inv[it.id] = (pr.inv[it.id] || 0) + 1;
  } else if (gearEl) {
    const g = defOf(gearEl.dataset.buyGear);
    if (!g.price || pr.gold < g.price) return;
    const first = !pr.items.some(x => x.id === g.id);
    pr.gold -= g.price;
    const it = addItem(pr, g.id);
    if (first && g.type && pr.acc[g.type].includes(null)) toggleAcc(pr, it.u);
    shopFlash = g.id;
  } else if (e.target.closest("[data-proll]")) {
    const n = rollAmount("proll", e.target.closest("[data-proll]").dataset.proll, pr.gold, PASS_ROLL, PASS_BULK);
    if (!n || !rollPassives(pr, n)) return;
  } else if (e.target.closest("[data-pass]")) {
    const ps = PASSIVES.find(x => x.id === e.target.closest("[data-pass]").dataset.pass);
    if (!passLvOf(pr, ps.id)) return;
    togglePassive(pr, ps.id);
  } else if (e.target.closest("[data-enh]")) {
    const u = e.target.closest("[data-enh]").dataset.enh, it = itemBy(pr, u), res = it && enhanceItem(pr, u);
    mergeNote = res === "ok" ? `⚒️ ${view(it).ic} ${view(it).t} → +${it.e}` : res === "fail" ? t("enhFail") : res === "gold" ? t("noGold") : "";
  } else if (e.target.closest("[data-sell]")) {
    const [id, r, how] = e.target.closest("[data-sell]").dataset.sell.split("|"), gain = sellItems(pr, id, +r, how === "all");
    if (gain) mergeNote = t("sold", gain);
  } else if (e.target.closest("[data-qmerge]")) {
    const g0 = pr.gold, n = quickMerge(pr);
    mergeNote = n ? t("qmergeDone", n) + ` · 💰 -${g0 - pr.gold}` : t("qmergeNone");
  } else if (e.target.closest("[data-merge]")) {
    const [id, r] = e.target.closest("[data-merge]").dataset.merge.split("|"), res = mergeItems(pr, id, +r);
    mergeNote = res ? `🔨 ${view(res).ic} ${view(res).t} → ${RARITY[res.r].n}` : t("noGold");
  } else return;
  saveStore(); renderMShop();
}

// ================= character screen =================
const DOLL = { left: ["helmet:0", "armor", "pants:0", "shoes:0"], right: ["hand:0", "hand:1", "gloves:0", "necklace:0"], bottom: ["ring:0", "ring:1", "earring:0", "earring:1"] };
let invSlot = "hand:0", mergeMsg = "";
function openInv() { state = "inv"; show("inv"); renderInv(); }
function slotInfo(pr, key) {
  if (key === "armor") return { label: t("slot_armor"), ph: "👕", item: armorView(pr) };
  const [type, i] = key.split(":");
  if (type === "hand") { const it = handIt(pr, +i); return { type, i: +i, label: tr(HAND_N[+i]), ph: "✋", item: it ? handViews(pr).find(v => v.u === it.u) : null }; }
  const sl = ACC_SLOTS.find(s => s.type === type);
  return { type, i: +i, label: t("slot_" + type) + (sl.n > 1 ? " " + (+i + 1) : ""), ph: sl.ic, item: (it => it ? view(it) : null)(itemBy(pr, pr.acc[type][+i])) };
}
function renderDoll(pr) {
  const box = key => {
    const s = slotInfo(pr, key), it = s.item;
    if (key === "hand:1" && twoHanded(pr)) {
      const w = view(handIt(pr, 0));
      return `<div class="slotbox locked${key === invSlot ? " sel" : ""}" data-pick="${key}" title="${esc(L("อาวุธสองมือใช้ทั้งสองมือ", "A two-handed weapon uses both hands"))}"><span class="si">${w.ic}</span><small>🔒 ${s.label}</small></div>`;
    }
    return `<div class="slotbox${it ? "" : " empty"}${key === invSlot ? " sel" : ""}" data-pick="${key}"${it ? ` style="--rc:${RARITY[it.r].c}"` : ""} title="${it ? esc(`${it.t} (${RARITY[it.r].n})`) : s.label}">` +
      `<span class="si">${it ? it.ic : s.ph}</span><small>${s.label}</small></div>`;
  };
  return `<div class="doll"><div class="dcol">${DOLL.left.map(box).join("")}</div>` +
    `<div class="figure"><div class="fhead">${pr.avatar}</div><svg viewBox="0 0 120 170" class="fbody" aria-hidden="true">` +
    `<rect x="42" y="4" width="36" height="78" rx="12"/><path d="M40 14 L16 66 M80 14 L104 66 M50 82 L40 160 M70 82 L80 160"/></svg><b>${esc(pr.name)}</b></div>` +
    `<div class="dcol">${DOLL.right.map(box).join("")}</div><div class="drow">${DOLL.bottom.map(box).join("")}</div></div>`;
}
function bucketsOf(pr, test) {
  const eq = equippedUids(pr), map = new Map();
  for (const it of pr.items) {
    if (!defOf(it.id) || !test(defOf(it.id))) continue;
    const k = it.id + "|" + it.r;
    if (!map.has(k)) map.set(k, { id: it.id, r: it.r, all: [], worn: [] });
    map.get(k).all.push(it.u);
    if (eq.has(it.u)) map.get(k).worn.push(it.u);
  }
  return [...map.values()].sort((a, b) => b.r - a.r || CATALOG.findIndex(x => x.id === a.id) - CATALOG.findIndex(x => x.id === b.id));
}
function slotLabelOf(pr, u) {
  const h = pr.hands.indexOf(u);
  if (h >= 0) return defOf(itemBy(pr, u).id).hands === 2 ? L("สองมือ", "Both hands") : tr(HAND_N[h]);
  if (u === pr.armor) return t("slot_armor");
  for (const sl of ACC_SLOTS) { const i = pr.acc[sl.type].indexOf(u); if (i >= 0) return t("slot_" + sl.type) + (sl.n > 1 ? " " + (i + 1) : ""); }
  return "";
}
// which hand a click puts a hand item into: the selected hand slot, else the first free one
function handTarget(pr, d) {
  if (d.hands === 2) return 0;
  if (invSlot.startsWith("hand:")) return +invSlot.split(":")[1];
  if (twoHanded(pr) || !pr.hands[0]) return 0;
  return pr.hands[1] ? 0 : 1;
}
function bucketRow(pr, b, kind) {
  const v = view({ id: b.id, r: b.r }), c = RARITY[b.r].c;
  const where = b.worn.map(u => slotLabelOf(pr, u)).join(", ");
  const right = b.worn.length ? `✔ ${where}${kind !== "armor" ? " · ✕" : ""}` : kind === "hand" ? `${L("ใส่", "Wear")} ${tr(HAND_N[handTarget(pr, v)])}` : t(kind === "acc" ? "wear" : "equip");
  const merge = b.all.length >= MERGE_COUNT && b.r < RARITY.length - 1
    ? `<button class="mergeBtn" data-merge="${b.id}|${b.r}" style="--rc:${RARITY[b.r + 1].c}">${t("mergeBtn", MERGE_COUNT, RARITY[b.r + 1].n, mergeFee(b.id, b.r))}</button>` : "";
  return `<div class="item rrow${b.worn.length ? " sel" : ""}" data-bucket="${kind}|${b.id}|${b.r}" style="--rc:${c}">` +
    `<span class="ic">${v.ic}</span><div class="info">${rName(v)} <small>×${b.all.length}</small><div class="d">${gearDesc(v, undefined, true)}</div>${merge}</div>` +
    `<span class="price${b.worn.length ? " ok" : ""}">${right}</span></div>`;
}
function useBucket(pr, kind, id, r) {
  const eq = equippedUids(pr), copies = pr.items.filter(x => x.id === id && x.r === r);
  if (kind === "hand") {
    const d = defOf(id), tgt = handTarget(pr, d), inHand = copies.filter(c => pr.hands.includes(c.u)), spare = copies.find(c => !eq.has(c.u));
    if (inHand.some(c => pr.hands[tgt] === c.u) || (d.hands === 2 && inHand.length)) { unequipHand(pr, pr.hands.indexOf(inHand[0].u)); return; }
    const use = spare || inHand[0];
    if (!use) return;
    equipHand(pr, use.u, tgt); invSlot = "hand:" + tgt;
    return;
  }
  if (kind === "armor") { if (!copies.some(c => c.u === pr.armor)) pr.armor = copies[0].u; return; }
  const type = defOf(id).type, worn = copies.find(c => eq.has(c.u)), spare = copies.find(c => !eq.has(c.u));
  const s = invSlot.includes(":") && !invSlot.startsWith("hand:") ? slotInfo(pr, invSlot) : null;
  if (s && s.type === type) {
    const cur = pr.acc[type][s.i];
    if (copies.some(c => c.u === cur)) { pr.acc[type][s.i] = null; return; }
    wearAt(pr, type, s.i, (spare || worn).u); return;
  }
  if (worn && !spare) { toggleAcc(pr, worn.u); return; }
  if (worn && spare && pr.acc[type].includes(null)) { toggleAcc(pr, spare.u); return; }
  if (worn) { toggleAcc(pr, worn.u); return; }
  toggleAcc(pr, copies[0].u);
  const at = pr.acc[type].indexOf(copies[0].u);
  if (at >= 0) invSlot = `${type}:${at}`;
}
function wearAt(pr, type, i, u) { const slots = pr.acc[type], other = slots.indexOf(u); if (other >= 0 && other !== i) slots[other] = slots[i]; slots[i] = u; }
function renderAllItems(pr) {
  const selType = invSlot === "armor" ? "armor" : invSlot.split(":")[0];
  const group = (type, ic, label, rows, showIt) => !showIt ? "" :
    `<div class="sec igrp${type === selType ? " focus" : ""}" id="grp-${type}"><h3>${ic ? ic + " " : ""}${label}</h3><div class="shop" style="margin:0">` +
    (rows || `<div class="sub" style="margin:0">${t("invNoneForSlot")}</div>`) + `</div></div>`;
  let html = group("hand", "✋", `${L("อาวุธและมือรอง", "Weapons & off-hand")} <small style="color:var(--dim)">· ${L("ไม่ถือเลย = มือเปล่า 🥋", "empty hands = Martial 🥋")}</small>`,
      bucketsOf(pr, d => isHandId(d.id)).map(b => bucketRow(pr, b, "hand")).join(""), true) +
    group("armor", "👕", t("slot_armor"), bucketsOf(pr, d => ARMORS.includes(d)).map(b => bucketRow(pr, b, "armor")).join(""), true);
  for (const sl of ACC_SLOTS) {
    const bs = bucketsOf(pr, d => d.type === sl.type);
    html += group(sl.type, sl.ic, `${t("slot_" + sl.type)} <small style="color:var(--dim)">· ${t("slots", sl.n)}</small>`, bs.map(b => bucketRow(pr, b, "acc")).join(""), bs.length || sl.type === selType);
  }
  const ownPass = PASSIVES.filter(ps => passLvOf(pr, ps.id) > 0);
  html += group("passive", "", t("invPassive"), ownPass.map(ps => passRow(pr, ps, false)).join(""), ownPass.length > 0);
  html += group("items", "", t("invItems"), MITEMS.map(it => `<div class="item"><span class="ic">${it.ic}</span><div class="info"><b>${it.t}</b><div class="d">${tr(it.d)}</div></div><span class="price">x${pr.inv[it.id] || 0}</span></div>`).join(""), true);
  return html;
}
function renderInv() {
  const pr = prof(), s = statsOf(pr);
  const stat = (label, val) => `<div class="stat">${label}<b>${val}</b></div>`;
  const perks = [
    s.startBlock && L(`เริ่มไฟต์ Block ${s.startBlock}`, `${s.startBlock} Block at fight start`),
    s.drawFirst && L(`เทิร์นแรกจั่ว +${s.drawFirst}`, `Turn 1 draw +${s.drawFirst}`),
    s.heavy && L(`การ์ด 2+⚡ +${pc(s.heavy)}%`, `2+⚡ cards +${pc(s.heavy)}%`),
    s.combo && `Combo +${pc(s.combo)}%`, s.leech && L(`ดูดเลือด ${s.leech}`, `Leech ${s.leech}`),
    s.killHeal && L(`ชนะฟื้น ${pc(s.killHeal)}%`, `Win heal ${pc(s.killHeal)}%`),
    s.luck && L(`โชคการ์ด +${pc(s.luck)}%`, `Card luck +${pc(s.luck)}%`), s.goldMult && t("pGold", pc(s.goldMult)),
  ].filter(Boolean);
  $("invHead").innerHTML = `<div class="sub" style="margin:0">${profLine(pr)}${pr.run ? " · " + L("⚠️ การเปลี่ยนของจะมีผลกับ run ถัดไป", "⚠️ changes apply from your next run") : ""}` +
    (mergeMsg ? ` · <b class="mergeMsg">${mergeMsg}</b>` : "") + `</div>`;
  mergeMsg = "";
  const right = $("invRight") && $("invRight").scrollTop;
  const startDeck = [{ id: "strike", up: 0 }, { id: "defend", up: 0 }, ...s.cards.map(id => ({ id, up: 0 }))];
  const need = charNeed(pr.lvl), spent = STATS.some(sd => statOf(pr, sd.id) > STAT_BASE);
  const statSec = sec(`📈 Lv ${pr.lvl} · ${L("แต้มว่าง", "Free points")} <b style="color:var(--gold)">${pr.pts}</b>`,
    `<div class="bar xpbar"><i style="width:${Math.min(100, pr.xp / need * 100)}%"></i><span>${pr.xp} / ${need} XP</span></div>` +
    STATS.map(sd => {
      const v = statOf(pr, sd.id), uses = [...handViews(pr), armorView(pr), ...accOf(pr)].filter(g => (g.req && g.req[sd.id]) || (g.sc && g.sc[sd.id])).map(g => {
        const n = g.req && g.req[sd.id];
        return `<span class="${!n || v >= n ? "reqok" : "reqbad"}">${g.ic} ${g.t}${n ? ` ${n}${v >= n ? "✔" : "✖"}` : ""}${g.sc && g.sc[sd.id] ? ` <b class="grade g${g.sc[sd.id]}">${g.sc[sd.id]}</b>` : ""}</span>`;
      }).join(" · ");
      return `<div class="item statrow"><span class="ic">${sd.ic}</span><div class="info"><b>${sd.n} ${v}</b> <small class="sfx">${L("ตอนนี้", "now")} ${v > STAT_BASE ? statFx(sd.id, v) : "–"} → <b>+1</b> ${statFx(sd.id, v + 1)}</small>` +
        `<div class="d">${tr(sd.d)}</div>${uses ? `<div class="d">🎒 ${uses}</div>` : ""}</div>` +
      `<button class="mergeBtn" data-stat="${sd.id}" style="--rc:var(--gold)"${pr.pts ? "" : " disabled"}>+1</button>${pr.pts >= 5 ? `<button class="mergeBtn" data-stat="${sd.id}|5" style="--rc:var(--gold)">+5</button>` : ""}</div>`;
    }).join("") +
    `<div class="sub" style="margin:4px 0 0">${L("ได้ XP จากการล้มมอนใน run (ตายก็ไม่หาย) · เลเวลละ 4 แต้ม · stat ไม่ถึงที่ของต้องการ = ของชิ้นนั้นอ่อนลง (อาวุธ: การ์ดคลาสนั้นด้วย)", "Earn XP by slaying monsters (kept on death) · 4 points per level · below an item's requirement it gets weaker (weapons: their class cards too)")}</div>` +
    `<div class="chips" style="margin-top:6px"><span class="sub" style="margin:0;width:100%">${L("พลังการ์ดตอนนี้:", "Card power now:")}</span><span class="lchip">🃏 Strike/Defend ×${s.tm._atk}</span>${Object.keys(THEMES).map(tg => `<span class="lchip${s.pen[tg] ? " bad" : ""}${s.tags[tg] ? " theme" : ""}">${THEMES[tg].ic} ${tr(THEMES[tg].n)} ×${s.tm[tg]}</span>`).join("")}</div>` +
    `<button class="ghost" data-statreset="1" style="margin-top:8px;font-size:13px;padding:4px 10px"${spent ? "" : " disabled"}>↺ ${L("คืนแต้ม stat ทั้งหมด", "Refund all stat points")} · 💰 ${statResetCost(pr)}</button>`);
  $("invBody").innerHTML = `<div class="invcols"><div class="invcol" id="invLeft"><div class="invsplit"><div class="invA">` + statSec + `</div><div class="invB">` +
    sec(t("invGear"), renderDoll(pr)) +
    sec(t("invStats"), `<div class="statgrid">${stat("❤️ HP", s.hp)}${stat("⚔️ " + L("ดาเมจ", "Damage"), "+" + pc(s.atk) + "%")}${stat("🛡️ Block", "+" + pc(s.def) + "%")}` +
      `${stat("🎯 Crit", pc(s.crit) + "%")}${stat("💥 Crit DMG", "x" + s.critMult)}${stat("🌬️ " + L("หลบ", "Dodge"), pc(s.dodge) + "%")}` +
      `${stat("⚡ " + L("โอกาส +1⚡", "+1⚡ chance"), pc(s.enChance) + "%")}${stat("🧪 " + t("invPotions"), Math.min(3, pr.inv.potion || 0))}${stat("🥋 " + L("สถานะ", "Stance"), s.unarmed ? L("มือเปล่า", "Unarmed") : L("ถืออาวุธ", "Armed"))}</div>` +
      (perks.length ? `<div class="sub" style="margin:0">✨ ${t("invPerks")}: ${perks.join(" · ")}</div>` : "")) +
    `</div><div class="invC">` +
    sec(L("🃏 เด็คเริ่มต้น: Strike ×5 · Defend ×4 · การ์ดจากของในมือ", "🃏 Starting deck: Strike ×5 · Defend ×4 · cards from what you hold"), `<div class="cardrow mini" style="margin:6px 0">${startDeck.map(c => cardHtml(c, { st: s })).join("")}</div>`) +
    sec(L("🔗 คลาสจากของในมือ", "🔗 Classes from what you hold"), `<div class="sub" style="margin:0 0 6px">${L("ถืออาวุธ/มือรองคลาสไหน จะเจอการ์ดคลาสนั้นบ่อยขึ้นและปลดล็อกการ์ดพิเศษ · ไม่ถืออาวุธ = มือเปล่า", "Held weapons/off-hands make their class's cards show up more and unlock its special cards · no weapon = Martial")}</div>` +
      `<div class="chips">${Object.entries(s.tags).map(([tg, n]) => themeChip(tg, n)).join("")}</div>`) +
    sec(t("invPassive"), passiveSlotsHtml(pr)) +
    `</div></div></div><div class="invcol" id="invRight"><div class="sec" style="margin-top:0"><h3>${t("invAll")}</h3></div>${renderAllItems(pr)}</div></div>`;
  if (right) $("invRight").scrollTop = right;
}

// ================= weapon mastery screen =================
let treeTag = "berserker", treeNote = "";
function openTree() { state = "tree"; show("tree"); treeNote = ""; renderTree(); }
function renderTree() {
  const pr = prof(), m = pr.mast[treeTag], st = statsOf(pr), max = m.lv >= MAST_MAX, need = mastNeed(m.lv);
  const tabs = Object.keys(THEMES).map(tg => `<button class="ghost${tg === treeTag ? " on" : ""}" data-tree="${tg}">${THEMES[tg].ic} ${tr(THEMES[tg].n)} <small>Lv${pr.mast[tg].lv}${pr.mast[tg].pts ? " · ⭐" + pr.mast[tg].pts : ""}</small></button>`).join("");
  const perks = PERKS[treeTag].map(pk => {
    const has = pr.perks[pk.id], lock = m.lv < pk.lv;
    const right = has ? `<span class="price ok">✔ ${L("เรียนแล้ว", "Learned")}</span>` : lock ? `<span class="price">🔒 Lv${pk.lv}</span>`
      : `<button class="mergeBtn" data-perk="${pk.id}" style="--rc:var(--gold)"${m.pts >= pk.cost ? "" : " disabled"}>${L("เรียน", "Learn")} · ⭐${pk.cost}</button>`;
    return `<div class="item${has ? " sel" : ""}${lock ? " no" : ""}"><span class="ic">${pk.ic}</span><div class="info"><b>${tr(pk.t)}</b> <small>Mastery Lv${pk.lv}</small><div class="d">${tr(pk.d)}</div></div>${right}</div>`;
  }).join("");
  const cards = themeCards(treeTag).map(id => {
    const lv = pr.cardLv[id] || 1, top = lv >= CARD_LV_MAX;
    return `<div class="tcard">${cardHtml({ id, up: 0 }, { st })}` +
      (top ? `<span class="price">MAX</span>` : `<button class="mergeBtn" data-clv="${id}" style="--rc:var(--gold)"${m.pts ? "" : " disabled"}>⬆ Lv${lv + 1}${lv + 1 === CARD_LV_MAX ? " · −1⚡" : ""} · ⭐1</button>`) +
      (CARDS[id].only ? `<small class="sub">${L("การ์ดพิเศษของแนว", "theme-only")}</small>` : "") + `</div>`;
  }).join("");
  $("treeBody").innerHTML = `<div style="font-size:44px">🌳</div><div class="big">${L("ความชำนาญอาวุธ", "Weapon Mastery")}</div>` +
    `<div class="tabs" style="margin-top:10px">${tabs}</div>` +
    `<div class="sec" style="max-width:760px"><h3>${THEMES[treeTag].ic} ${tr(THEMES[treeTag].n)} · Lv ${m.lv}${max ? " MAX" : ""} · ${L("แต้ม", "Points")} <span style="color:var(--gold)">⭐ ${m.pts}</span></h3>` +
    `<div class="bar xpbar"><i style="width:${max ? 100 : Math.min(100, m.xp / need * 100)}%"></i><span>${max ? "MAX" : `${m.xp} / ${need} XP`}</span></div>` +
    `<div class="sub" style="margin:6px 0 0">${L(`ได้ XP เมื่อเล่นการ์ดแนวนี้ใน run (1 ใบ = 1 XP) · เลเวลละ 1 แต้ม · การ์ดคลาสนี้สเกลกับ ${THEME_STAT[treeTag] ? THEME_STAT[treeTag].toUpperCase() : "stat สูงสุด"} (ตอนนี้ ×${st.tm[treeTag]})`, `Gain XP by playing this class's cards in runs (1 card = 1 XP) · 1 point per level · these cards scale with ${THEME_STAT[treeTag] ? THEME_STAT[treeTag].toUpperCase() : "your top stat"} (now ×${st.tm[treeTag]})`)}</div>` +
    (treeNote ? `<div id="rollResult">${treeNote}</div>` : "") + `</div>` +
    `<div class="treecols"><div>` + sec(L("✨ Perk ของแนว", "✨ Theme perks"), perks) + `</div>` +
    `<div class="sec treecards"><h3>🃏 ${L("เลเวลการ์ด (ถาวร ทุกใบในทุก run) · เลเวลละ +12% · Lv5 ลด 1 ⚡", "Card levels (permanent, every copy in every run) · +12% per level · Lv5 costs 1 ⚡ less")}</h3><div class="cardrow mini">${cards}</div></div></div>` +
    `<button class="ghost" data-treset="1" style="font-size:13px;padding:4px 10px">↺ ${L("คืนแต้มแนวนี้ทั้งหมด", "Refund this theme's points")} · 💰 100</button>`;
}
function treeClick(e) {
  const pr = prof(), m = pr.mast[treeTag], el = e.target.closest("[data-tree],[data-perk],[data-clv],[data-treset]");
  if (!el || el.disabled) return;
  treeNote = "";
  if (el.dataset.tree) treeTag = el.dataset.tree;
  else if (el.dataset.perk) {
    const pk = PERKS[treeTag].find(x => x.id === el.dataset.perk);
    if (!pk || pr.perks[pk.id] || m.lv < pk.lv || m.pts < pk.cost) return;
    m.pts -= pk.cost; pr.perks[pk.id] = true; treeNote = `${pk.ic} ${tr(pk.t)} ✔`;
  } else if (el.dataset.clv) {
    const id = el.dataset.clv, lv = pr.cardLv[id] || 1;
    if (lv >= CARD_LV_MAX || m.pts < 1) return;
    m.pts--; pr.cardLv[id] = lv + 1; treeNote = `${CARDS[id].ic} ${CARDS[id].t} → Lv${lv + 1}`;
  } else if (el.dataset.treset) {
    if (pr.gold < 100) { treeNote = t("noGold"); return renderTree(); }
    let back = 0;
    for (const pk of PERKS[treeTag]) if (pr.perks[pk.id]) { back += pk.cost; delete pr.perks[pk.id]; }
    for (const id of themeCards(treeTag)) if (pr.cardLv[id] > 1) { back += pr.cardLv[id] - 1; delete pr.cardLv[id]; }
    if (!back) return;
    pr.gold -= 100; m.pts += back; treeNote = L(`คืน ⭐${back}`, `Refunded ⭐${back}`);
  }
  saveStore(); renderTree();
}

// ================= input =================
const ACTIONS = {
  home: () => goHome(),
  pvhost: () => pvpHost(),
  pvjoin: () => pvpJoin(),
  pvexit: () => pvpExit(),
  pvm: id => pvpCfg({ mode: id }),
  pvh: h => pvpCfg({ hp: +h }),
  pvdeck: () => openArena(true),
  pvready: () => pvpReady(),
  pvagain: () => pvpAgain(),
  pvcopy: async () => { try { await navigator.clipboard.writeText(pv.code); const b = $("pvCopy"); if (b) b.textContent = "✔ " + L("คัดลอกแล้ว", "Copied"); } catch {} },
  again: m => { if (m === "story") return openStory(); if (m === "arena") return openArena(); newRun(m); },
  apick: id => arenaAdd(id),
  arm: id => arenaRemove(id),
  atab: t => { arena.tab = t; renderArena(); },
  aauto: () => arenaAuto(),
  aclr: () => { arena.sel = {}; renderArena(); },
  aexit: () => closeArena(),
  astart: () => {
    const u = arenaUsed(); if (u.n < ARENA_MIN) return;
    if (arena.pvp) return pvpDeckDone();
    const ids = []; for (const id in arena.sel) for (let i = 0; i < arena.sel[id]; i++) ids.push(id);
    prof().arenaDeck = { ...arena.sel }; arena = null; $("ov").classList.add("hidden"); $("ov").innerHTML = "";
    newRun("arena", null, ids);
  },
  node: k => { if (!mapNext().includes(k)) return; run.path.push(k); run.pos = k; run.floor = run.map.nodes[k].r + 1; enterNode(run.map.nodes[k].type); },
  door: i => { const ty = run.doors[+i]; if (!ty) return; run.floor++; enterNode(ty); },
  snode: () => enterNode(STORY_PATH[run.step]),
  tgt: i => { const c = run.combat; if (c && c.foes[+i] && !c.foes[+i].dead) { c.tgt = +i; renderCombat(); } },
  play: i => playCard(+i),
  end: () => endTurn(),
  dmode: () => discardMode(),
  dsel: i => discardToggle(+i),
  dok: () => discardOk(),
  dx: () => discardCancel(),
  potion: () => usePotion(),
  deck: () => openPause("deck"),
  pause: () => openPause("menu"),
  unpause: () => { closePause(); renderRun(); },
  tohome: () => { closePause(); goHome(); },
  giveup: () => { if (run.mode === "pvp") return pvpForfeit(); if (!confirm(L("ยอมแพ้ run นี้?", "Give up this run?"))) return; closePause(); if (run.mode === "story") { endRun(false, true); return openStory(); } endRun(false); },
  take: i => { const o = run.ov; run.deck.push({ id: o.cards[+i], up: 0, u: newUid() }); afterCards(); },
  skip: () => afterCards(),
  next: () => nodeDone(),
  rest: () => { healRun(0.3); nodeDone(); },
  smith: () => { run.ov = { k: "pick", mode: "up", back: run.ov, cancel: true }; saveStore(); renderOv(); },
  pickc: i => {
    const o = run.ov, c = run.deck[+i];
    if (!c) return;
    let res;
    if (o.mode === "up") { c.up = 1; res = [`อัปเกรด ${cardName(c)}`, `Upgraded ${cardName(c)}`]; }
    else { run.deck.splice(+i, 1); res = [`ลบ ${cardName(c)} แล้ว`, `Removed ${cardName(c)}`]; }
    const back = o.back;
    if (!back || back.k === "rest") return nodeDone();
    if (back.k === "shop") { back.rmDone = true; run.ov = back; }
    else { back.res = res; run.ov = back; }
    saveStore(); renderRun();
  },
  pickx: () => { run.ov = run.ov.back; saveStore(); renderOv(); },
  buy: i => { const o = run.ov, s = o.stock[+i]; if (!s || s.sold || run.gold < s.price) return; run.gold -= s.price; s.sold = true; run.deck.push({ id: s.id, up: 0, u: newUid() }); saveStore(); renderRun(); },
  buypot: () => { const o = run.ov; if (o.potion.sold || run.gold < o.potion.price || run.potions >= 3) return; run.gold -= o.potion.price; o.potion.sold = true; run.potions++; saveStore(); renderRun(); },
  buyrm: () => { const o = run.ov; if (o.rmDone || run.gold < run.rmCost) return; run.gold -= run.rmCost; run.rmCost += 25; run.ov = { k: "pick", mode: "rm", back: o }; saveStore(); renderOv(); },
  evc: i => {
    const o = run.ov, ev = EVENTS.find(e => e.id === o.id), ch = [...ev.ch, LEAVE][+i];
    if (!ch || (ch.ok && !ch.ok())) return;
    const r = ch.go();
    if (r === "fight") { run.node = "elite"; return startCombat("elite"); }
    if (typeof r === "string" && r.startsWith("pick:")) { run.ov = { k: "pick", mode: r.slice(5), back: o }; }
    else if (r === "cards:study") { run.ov = { k: "cards", cards: rollCards(3, [0, 75, 25]), back: o }; }
    else o.res = r;
    saveStore(); renderRun();
  },
  sretry: () => { const ch = run.ch; endStoryRun(); newRun("story", ch); },
  squit: () => { endStoryRun(); openStory(); },
};
// after taking or skipping a card: back to the event that offered it, or on along the path
function afterCards() {
  const o = run.ov;
  if (o.k === "cards" && o.back) { o.back.res = ["ได้ความรู้ใหม่", "You learned something new."]; run.ov = o.back; saveStore(); return renderRun(); }
  nodeDone();
}
function endStoryRun() { endRun(false, true); }

// ---------- keyboard cursor ----------
let kbOn = false, kbEl = null, kbLK = "", kbPt = { x: 0, y: 0 }, kbRaf = 0;
const kbHint = document.createElement("div"); kbHint.id = "kbhint"; kbHint.className = "hidden"; document.body.appendChild(kbHint);
function kbLayer() { // the part of the screen that keys steer right now (null = the screen has its own keys)
  if (!$("pov").classList.contains("hidden")) return $("pov");
  if (!$("ov").classList.contains("hidden")) return $("ov");
  if (state === "home" || state === "combat") return null;
  return $(state);
}
const kbLayerKey = () => state + "|" + pauseOpen + "|" + (run && run.ov ? run.ov.k + (run.ov.res ? 1 : 0) : "") + "|" + storyView + "|" + (newStep || "");
const KB_SKIP = new Set(["data-t", "data-tp", "data-f"]);
function kbList(root) {
  return [...root.querySelectorAll("*")].filter(el => {
    if (!(el.matches("button,input") || [...el.attributes].some(a => a.name.startsWith("data-") && !KB_SKIP.has(a.name)))) return false;
    if (el.disabled || el.dataset.st === "x" || (el.type === "hidden")) return false;
    const a = el.dataset.a;
    if (a && a.startsWith("node|") && !mapNext().includes(a.slice(5))) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
}
const kbCenter = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const kbSig = el => el.tagName + "|" + el.id + "|" + [...el.attributes].filter(a => a.name.startsWith("data-")).map(a => a.name + "=" + a.value).join(";") + "|" + el.textContent.slice(0, 24);
function kbCur(list) {
  if (kbEl && list.includes(kbEl)) return kbEl;
  const sig = kbEl && kbSig(kbEl), same = sig && list.find(el => kbSig(el) === sig);
  if (same) return same;
  let best = null, bd = 1e12;
  for (const el of list) { const c = kbCenter(el), d = (c.x - kbPt.x) ** 2 + (c.y - kbPt.y) ** 2; if (d < bd) { bd = d; best = el; } }
  return best;
}
function kbSet(el) {
  document.querySelectorAll(".kbf").forEach(x => x !== el && x.classList.remove("kbf"));
  const first = !kbOn || el !== kbEl;
  el.classList.add("kbf"); kbOn = true; kbEl = el; kbLK = kbLayerKey();
  if (first) { el.scrollIntoView({ block: "nearest", inline: "nearest" }); }
  kbPt = kbCenter(el);
  kbHint.innerHTML = L("<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> <kbd>Tab</kbd> เลือก · <kbd>Enter</kbd> ตกลง · <kbd>Esc</kbd> ย้อน", "<kbd>←</kbd><kbd>↑</kbd><kbd>↓</kbd><kbd>→</kbd> <kbd>Tab</kbd> move · <kbd>Enter</kbd> select · <kbd>Esc</kbd> back");
  kbHint.classList.remove("hidden");
}
function kbOff() { document.querySelectorAll(".kbf").forEach(x => x.classList.remove("kbf")); kbOn = false; kbEl = null; kbHint.classList.add("hidden"); }
function kbSpatial(list, cur, dir) {
  const c0 = kbCenter(cur); let best = null, bs = 1e12;
  for (const el of list) {
    if (el === cur) continue;
    const c = kbCenter(el), dx = c.x - c0.x, dy = c.y - c0.y;
    const main = dir === "right" ? dx : dir === "left" ? -dx : dir === "down" ? dy : -dy, off = Math.abs(dir === "left" || dir === "right" ? dy : dx);
    if (main < 4) continue;
    const sc = main + off * 2.5; if (sc < bs) { bs = sc; best = el; }
  }
  return best;
}
function kbStep(root, dir) {
  const list = kbList(root); if (!list.length) return;
  const cur = kbOn ? kbCur(list) : null; let nx;
  if (!cur) { const main = list.filter(el => !el.closest(".rhead,.backBtn")), l2 = main.length ? main : list; nx = dir === "prev" || dir === "up" ? l2[l2.length - 1] : l2[0]; }
  else if (dir === "next" || dir === "prev") nx = list[(list.indexOf(cur) + (dir === "next" ? 1 : list.length - 1)) % list.length];
  else nx = kbSpatial(list, cur, dir) || cur;
  kbSet(nx);
}
function kbFromInput(inp, back) { // leave a text box with the arrow keys
  inp.blur(); const root = kbLayer(); if (!root) return;
  kbSet(inp); kbStep(root, back ? "up" : "down");
}
function kbHandle(e) {
  if (e.ctrlKey || e.altKey || e.metaKey) return false;
  const root = kbLayer(); if (!root) { if (kbOn) kbOff(); return false; }
  if (kbOn && kbLayerKey() !== kbLK) kbOff();
  const k = e.key, dirs = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
  if (dirs[k] || k === "Tab") {
    if (!kbOn && state === "story" && storyView === "read" && (k === "ArrowLeft" || k === "ArrowRight")) return false; // page turning
    e.preventDefault(); kbStep(root, k === "Tab" ? (e.shiftKey ? "prev" : "next") : dirs[k]); return true;
  }
  if (kbOn && (k === "Enter" || e.code === "Space")) {
    e.preventDefault();
    const el = kbCur(kbList(root)); if (!el) return true;
    kbSet(el); el.matches("input") ? el.focus() : el.click(); return true;
  }
  return false;
}
function kbRefresh() { // the screen was redrawn: keep the cursor on the same thing
  const root = kbLayer(); if (!root || kbLayerKey() !== kbLK) return kbOff();
  const cur = kbCur(kbList(root)); if (!cur) return kbOff();
  if (cur !== kbEl || !cur.classList.contains("kbf")) kbSet(cur);
}
new MutationObserver(() => { if (kbOn && !kbRaf) kbRaf = requestAnimationFrame(() => { kbRaf = 0; kbRefresh(); }); })
  .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
document.addEventListener("mousedown", () => { if (kbOn) kbOff(); if (hcur != null) { hcur = null; document.querySelectorAll("#hand .kbf").forEach(x => x.classList.remove("kbf")); } });

document.addEventListener("click", e => {
  const a = e.target.closest("[data-a]");
  if (!a || a.disabled) return;
  const [k, v] = a.dataset.a.split("|");
  if (ACTIONS[k]) ACTIONS[k](v);
});
document.addEventListener("keydown", e => {
  const ae0 = document.activeElement;
  if (ae0 && (ae0 === $("pname") || ae0.id === "pvCode" || ae0.classList.contains("qty")) && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Tab")) { e.preventDefault(); return kbFromInput(ae0, e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey)); }
  if (ae0 && ae0.id === "pvCode") { if (e.key === "Enter") { e.preventDefault(); return pvpJoin(); } if (e.key !== "Escape") return; }
  if (ae0 && ae0.tagName === "TEXTAREA" && e.key !== "Escape") return;
  if (document.activeElement === $("pname")) { if (e.key === "Enter") profNext(); return; }
  if (document.activeElement && document.activeElement.classList.contains("qty")) {
    if (e.key === "Enter") { e.preventDefault(); const b = document.querySelector(`[data-proll="custom"]`); if (b) b.click(); }
    if (e.key !== "Escape") return;
  }
  const n = /^(Digit|Numpad)\d$/.test(e.code) ? +e.code.slice(-1) : -1;
  if (e.key === "Escape") {
    if ($("ov").querySelector("#bkOut")) return closeBackup();
    if (pv && $("ov").querySelector(".pvbox")) return pvpEsc();
    if (arena) return closeArena();
    if (pauseOpen) { closePause(); return renderRun(); }
    if (state === "story") return storyBack();
    if (state === "home" && menuView === "play") return setMenuView("main");
    if (state === "combat" && run && run.combat && run.combat.dsel) return discardCancel();
    if (state === "run" || state === "combat") { if (run && run.ov && run.ov.k === "pick" && run.ov.cancel) return ACTIONS.pickx(); if (run) return openPause("menu"); return goHome(); }
    if (state === "mshop" || state === "inv" || state === "tree" || (state === "profiles" && prof())) return goHome();
    return;
  }
  if (e.code === "KeyL" && !e.ctrlKey && !e.altKey && !e.metaKey && !$("uiLang").classList.contains("hidden")) return toggleUi();
  if (arena && (e.key === "Backspace" || e.key === "Delete")) { const a = kbOn && kbEl && kbEl.dataset.a; if (a && (a.startsWith("apick|") || a.startsWith("arm|"))) { e.preventDefault(); return arenaRemove(a.split("|")[1]); } }
  if (kbHandle(e)) return;
  if (pauseOpen) return;
  if (state === "home") {
    if (!prof().starter || !$("ov").classList.contains("hidden")) return; // the starter picker or another overlay is open
    const items = homeMenu();
    if (n >= 1 && n <= items.length) { e.preventDefault(); menuSel = n - 1; renderMenu(); return items[n - 1].go(); }
    if (e.code === "ArrowUp" || e.code === "KeyW") { e.preventDefault(); return moveMenu(-1); }
    if (e.code === "ArrowDown" || e.code === "KeyS") { e.preventDefault(); return moveMenu(1); }
    if (e.key === "Enter" || e.code === "Space") { e.preventDefault(); return items[menuSel].go(); }
    if (e.code === "KeyP") return openProfiles();
    return;
  }
  if (state === "mshop") { if (n >= 1 && n <= MERCHANTS.length) { e.preventDefault(); mMerch = MERCHANTS[n - 1].id; mergeNote = ""; lastPassRoll = []; renderMShop(); } return; }
  if (state === "story") {
    if (storyView === "read") {
      if (e.code === "ArrowRight" || e.code === "Space" || e.key === "Enter") { e.preventDefault(); storyAct(storyPage >= storyPages(storyCh).length - 1 ? "fight" : "next"); }
      else if (e.code === "ArrowLeft") storyAct("prev");
    }
    return;
  }
  if (!run) return;
  const o = run.ov;
  if (o) {
    if ((o.k === "reward" || o.k === "cards") && o.cards && n >= 1 && n <= o.cards.length) return ACTIONS.take(n - 1);
    if (e.key === "Enter" && (o.k === "loot" || (o.k === "event" && o.res))) return ACTIONS.next();
    if (n >= 1 && (o.k === "rest" || o.k === "shop" || o.k === "storyfail" || (o.k === "event" && !o.res))) {
      const el = [...$("ov").querySelectorAll("[data-a]")][n - 1]; e.preventDefault(); if (el && !el.disabled) el.click();
    }
    return;
  }
  if (state === "combat") {
    if (n >= 0) { e.preventDefault(); const i = slotToHand(n === 0 ? 9 : n - 1); return run.combat && run.combat.dsel ? discardToggle(i) : playCard(i); }
    if (e.code === "KeyD") return run.combat && run.combat.dsel ? discardCancel() : discardMode();
    if ((e.key === "Enter" || e.code === "Space") && hcur != null && layFor === run.combat && handLay[hcur]) { e.preventDefault(); const i = run.combat.hand.indexOf(handLay[hcur]); return run.combat.dsel ? discardToggle(i) : playCard(i); }
    if (e.code === "ArrowLeft" || e.code === "ArrowRight") { e.preventDefault(); return moveHcur(e.code === "ArrowLeft" ? -1 : 1); }
    if (e.code === "KeyE" || e.key === "Enter") { e.preventDefault(); return endTurn(); }
    if (e.code === "KeyQ") return usePotion();
    if (e.code === "KeyV") return ACTIONS.deck();
    if (e.code === "KeyP") return openPause("menu");
    if (e.code === "Tab" || e.code === "ArrowUp" || e.code === "ArrowDown") {
      e.preventDefault();
      const c = run.combat, al = c.foes.map((f, i) => f.dead ? -1 : i).filter(i => i >= 0), at = al.indexOf(c.tgt);
      c.tgt = al[(at + (e.code === "ArrowUp" || (e.code === "Tab" && e.shiftKey) ? al.length - 1 : 1)) % al.length]; return renderCombat();
    }
    return;
  }
  if (state === "run" && e.code === "KeyV") return ACTIONS.deck();
  if (state === "run" && e.code === "KeyP") return openPause("menu");
  if (state === "run" && run.doors && n >= 1 && n <= run.doors.length) return ACTIONS.door(n - 1);
  if (state === "run" && run.mode === "story" && e.key === "Enter") return ACTIONS.snode();
});
$("profileChip").onclick = openProfiles;
$("mshop").addEventListener("click", mshopClick);
$("mshopBack").onclick = goHome;
$("invBack").onclick = goHome;
$("treeBack").onclick = goHome;
$("tree").addEventListener("click", treeClick);
$("inv").addEventListener("click", e => {
  const pr = prof(), a = e.target.closest("[data-stat]"), r = e.target.closest("[data-statreset]");
  if (a && !a.disabled) {
    const [k, n] = a.dataset.stat.split("|"), add = Math.min(+(n || 1), pr.pts);
    if (add > 0) { pr.stat[k] = statOf(pr, k) + add; pr.pts -= add; saveStore(); renderInv(); }
  } else if (r && !r.disabled) {
    const cost = statResetCost(pr);
    if (pr.gold < cost) { mergeMsg = t("noGold"); return renderInv(); }
    if (!confirm(L(`คืนแต้ม stat ทั้งหมด (💰 ${cost})?`, `Refund all stat points (💰 ${cost})?`))) return;
    for (const sd of STATS) { pr.pts += statOf(pr, sd.id) - STAT_BASE; pr.stat[sd.id] = STAT_BASE; }
    pr.gold -= cost; saveStore(); renderInv();
  }
});
$("invBody").addEventListener("click", e => {
  const pr = prof(), pickEl = e.target.closest("[data-pick]");
  if (pickEl) {
    invSlot = pickEl.dataset.pick; renderInv();
    const grp = document.getElementById("grp-" + (invSlot.includes(":") ? invSlot.split(":")[0] : invSlot));
    if (grp) $("invRight").scrollTo({ top: grp.offsetTop - $("invRight").offsetTop - 8, behavior: "smooth" });
    return;
  }
  const mergeEl = e.target.closest("[data-merge]");
  if (mergeEl) { const [id, r] = mergeEl.dataset.merge.split("|"), res = mergeItems(pr, id, +r); if (res) { const v = view(res); mergeMsg = `🔨 ${v.ic} ${v.t} → ${RARITY[v.r].n}`; } saveStore(); return renderInv(); }
  const bucketEl = e.target.closest("[data-bucket]");
  if (bucketEl) { const [kind, id, r] = bucketEl.dataset.bucket.split("|"); useBucket(pr, kind, id, +r); saveStore(); return renderInv(); }
  const passEl = e.target.closest("[data-pass]");
  if (passEl) { togglePassive(pr, passEl.dataset.pass); saveStore(); return renderInv(); }
});
$("menu").addEventListener("click", e => { const li = e.target.closest(".mi"); if (li) { menuSel = +li.dataset.i; homeMenu()[menuSel].go(); } });
$("menu").addEventListener("mouseover", e => { const li = e.target.closest(".mi"); if (li && +li.dataset.i !== menuSel) { menuSel = +li.dataset.i; renderMenu(); } });
$("plist").addEventListener("click", e => {
  const d = e.target.closest("[data-del]");
  if (d) return deleteProfile(d.dataset.del);
  const it = e.target.closest(".item"); if (it) selectProfile(it.dataset.id);
});
$("avatars").addEventListener("click", e => { const a = e.target.closest("[data-i]"); if (a) { newAvatar = +a.dataset.i; renderProfiles(); } });
$("starterPick").addEventListener("click", e => {
  const a = e.target.closest("[data-sw]"), b = e.target.closest("[data-ns]");
  if (a) { newCls = a.dataset.sw; newFree = newCls === "martial" ? {} : null; newStep = 3; renderProfiles(); if (innerWidth <= 860) $("profiles").scrollTop = $("np2").offsetTop - 20; }
  else if (b && !b.disabled && newFree) {
    const [k, d] = b.dataset.ns.split("|");
    if (+d > 0 ? freeLeft() > 0 : (newFree[k] || 0) > 0) { newFree[k] = (newFree[k] || 0) + +d; renderProfiles(); }
  }
});
$("nextBtn").onclick = profNext;
$("npBack").onclick = () => { newStep--; renderProfiles(); if (newStep === 1) $("pname").value = newName; };
$("ov").addEventListener("click", e => {
  const a = e.target.closest("[data-pick-starter]"), pr = prof();
  if (!a || !pr || pr.starter) return;
  giveStarter(pr, a.dataset.pickStarter, null); saveStore(); goHome();
});
$("createBtn").onclick = createProfile;
$("profBack").onclick = goHome;
$("uiLang").onclick = toggleUi;
$("story").addEventListener("click", e => { const b = e.target.closest("[data-st]"); if (b && !b.disabled) storyAct(b.dataset.st); });
$("storyBack").onclick = storyBack;
{ const v = document.createElement("div"); v.id = "ver"; v.textContent = "v" + GAME_VER; document.body.appendChild(v); }
applyUi();
if (prof()) goHome(); else openProfiles();
