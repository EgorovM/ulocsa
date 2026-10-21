# ulocsa

An agent skill that localizes web and mobile apps into **Sakha (Yakut, `sah`)**. It runs in
Claude Code, Codex, Cursor or any agent that reads skills.

The skill does the work in your repository:
* finds user-facing strings, including text glued together in code;
* reuses your i18n library, or sets one up;
* adds a «Саха тыла / Русский» switcher;
* translates;
* checks the result automatically;
* screenshots every screen in both languages to catch text that doesn't fit.

## Free and paid

| | Free (this repo, MIT) | ulocsa API (paid) |
|---|---|---|
| Translation | Your agent's own model, following the Sakha rules in `references/sakha.md` | GigaChat Ultra with your product brief, glossary and translation memory, an automatic fix round and an editor pass |
| Checks | `scripts/check.mjs` | Server-side, plus model review |
| Cost | Your model usage | Per token, with an estimate before every run and a hard cap |
| People | — | Sakha-speaking philologists who test your UI; Yakut letters added to your corporate font |

Sign up and create an API key at **https://ulocsa.michill.ru**. Top-ups, philologists and
fonts: Telegram [@loalkota](https://t.me/loalkota).

## Install

**Claude Code**

```
/plugin marketplace add EgorovM/ulocsa
/plugin install ulocsa@ulocsa
```

Then ask: *"Add the Yakut language to this app"*.

**Codex, Cursor, other agents.** Copy `plugins/ulocsa/skills/ulocsa/` into the folder your
agent loads skills from (or into the repo), and point your `AGENTS.md` at its `SKILL.md`.

**API mode client** (only for the paid mode):

```
go install github.com/EgorovM/ulocsa/cmd/ulocsa@latest
export ULOCSA_TOKEN=skl_…
ulocsa balance
```

## What's inside

```
plugins/ulocsa/skills/ulocsa/
  SKILL.md                 the procedure the agent follows
  references/sakha.md      Sakha rules for UI text: letters, plurals, suffixes, register, terms
  references/translate.md  free mode: how to translate and review
  references/frameworks.md detecting i18n stacks and adding `sah`: web, Android, iOS,
                           Flutter, Django, Rails; dates in browsers; fonts
  scripts/check.mjs        checks a sah file against the ru source (no dependencies)
  scripts/shoot.mjs        screenshots and overflow report per screen and language (Playwright)
  scripts/compare-text.mjs "no visible change" check after moving strings into i18n
cmd/ulocsa/                client for the ulocsa API
```

`check.mjs` on its own:

```
node plugins/ulocsa/skills/ulocsa/scripts/check.mjs src/locales/ru.json src/locales/sah.json
```

It catches:
* lost placeholders, tags and printf order;
* broken ICU, plurals left in Russian form, `#` that would print a number twice;
* Latin `h` for `һ`, Kazakh `ң`/`ғ` for `ҥ`/`ҕ`, digits used as letters;
* case suffixes glued to a variable;
* dropped sentences;
* text left in Russian;
* strings over their `max_chars`.

## Things worth knowing about Sakha in software

* **Plurals:** CLDR has only `other` for `sah`, so the noun stays singular after a number.
* **Suffixes:** they follow vowel harmony, so `{city}га` can't be right for every city.
  Phrase templates so the value stands alone.
* **Chromium:** Chrome, Edge and Android WebView have no `sah` locale data and silently
  format dates in English. Safari and Firefox are fine. See
  `references/frameworks.md` for a fallback.
* **Fonts:** many web fonts ship only the basic Cyrillic subset, without ҕ ҥ ө һ ү. Google
  Fonts serves them in `cyrillic-ext`.
* **Mobile:** neither iOS nor Android offers Sakha as a system language, so apps need an
  in-app switcher.

## Tests

```
node --test test/check.test.mjs
```

MIT licensed.
