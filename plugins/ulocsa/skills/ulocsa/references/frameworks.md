# Frameworks: detect, reuse, add `sah`

Detect first, then reuse what the project already has. Adopt a new library only
with the user's approval (phase 2 of SKILL.md).

## Detection signals

| Stack | Signals | i18n already present if… |
|---|---|---|
| React (Vite/CRA) | `package.json` deps `react`, `react-dom` | `i18next` + `react-i18next`, `react-intl` (FormatJS), `@lingui/*`, `typesafe-i18n` |
| Next.js | `next` dep, `app/` or `pages/` | `next-intl`, `next-i18next`, `@lingui/*`, `i18n` key in `next.config.*` (pages router) |
| Vue / Nuxt | `vue`, `nuxt` | `vue-i18n`, `@nuxtjs/i18n` |
| Angular | `@angular/core`, `angular.json` | `@angular/localize` (`i18n` attributes, `messages.xlf`), `@ngx-translate/core`, `@jsverse/transloco` |
| Svelte | `svelte`, `@sveltejs/kit` | `svelte-i18n`, `typesafe-i18n`, `@inlang/paraglide-js` |
| React Native / Expo | `react-native`, `expo` | `i18next`, `react-native-localize`, `i18n-js`, `expo-localization` |
| Flutter | `pubspec.yaml` | `flutter_localizations`, `intl`, `l10n.yaml`, `lib/l10n/*.arb`, `easy_localization`, `slang` |
| Android native | `build.gradle(.kts)`, `res/values/strings.xml` | `values-xx/` folders exist; Compose `stringResource(R.string…)` |
| iOS native | `*.xcodeproj`, `Package.swift` | `*.lproj/Localizable.strings`, `Localizable.xcstrings`, `NSLocalizedString`, `String(localized:)` |
| Django | `manage.py`, `settings.py` | `gettext`/`_()`, `{% trans %}`, `locale/*/LC_MESSAGES/*.po`, `LANGUAGES` |
| Rails | `Gemfile` with `rails` | `config/locales/*.yml`, `t('…')` |
| Laravel | `artisan`, `composer.json` | `lang/` or `resources/lang/`, `__('…')`, `@lang` |
| FastAPI / Flask | `fastapi`, `flask` deps | `babel`, `flask-babel`, `gettext` |
| Go | `go.mod` | `golang.org/x/text/message`, `go-i18n` (`nicksnyder/go-i18n`) |
| Plain HTML / server templates | no framework | `data-i18n` attributes, JSON dictionaries |

Count the hardcoded strings too: Cyrillic literals in UI code outside locale files
(`rg -n "[А-Яа-яЁё]" --glob '!**/locales/**' --glob '!**/*.test.*'`). If an i18n library
is present but many strings are hardcoded, the job includes extraction.

Strings that are **not UI** and must not be sent: logs, analytics event names, SQL,
regexes, test fixtures, comments, content coupled to logic (questions scored by a Russian
model, search synonyms, validation word lists). Ask when unsure.

## Recommended library when there is none

| Stack | Recommend | Why |
|---|---|---|
| React / Next / RN | `i18next` + `react-i18next` (Next app router: `next-intl`) | Most common; `npx i18next-cli extract` keeps files in sync; ICU via `i18next-icu` |
| Vue / Nuxt | `vue-i18n` / `@nuxtjs/i18n` | Standard |
| Angular | `@ngx-translate/core` or `transloco` (runtime switch) | `@angular/localize` builds one bundle per locale: switching means a reload to another URL |
| Flutter | `flutter_localizations` + `intl` + ARB (`flutter gen-l10n`) | Standard; needs a custom `sah` delegate (below) |
| Tiny app (≤150 strings, one bundle) | **Minimal dictionary**: `messages/{ru,sah}.json` + a 20-line `t(key, vars)` with `Intl.PluralRules` | No dependency. Offer it only for small apps; say it won't scale |

## Adding `sah` per stack

Always: fallback chain `sah → ru`. Never fall back to English.

### i18next (web, RN)
```js
i18n.init({ supportedLngs: ['ru', 'sah'], fallbackLng: { sah: ['ru'], default: ['ru'] }, … })
```
`sah` has only the plural form `other`. With i18next's own JSON plurals (`key_one`, `key_few`, …)
write only `key_other` for `sah`. i18next uses `Intl.PluralRules('sah')`, which returns `other`.

### react-intl / FormatJS
`locales/sah.json` with ICU messages. If the target runtime lacks `sah` locale data, polyfill:
`@formatjs/intl-pluralrules/locale-data/sah` (and `intl-numberformat`, `intl-datetimeformat`).

### vue-i18n
`messages: { ru, sah }`, `fallbackLocale: 'ru'`. Plurals there are pipe-separated (`a | b | c`).
For `sah` write a single form and add `pluralRules: { sah: () => 0 }`.

### Android
`res/values-b+sah/strings.xml`. Sakha is not a system language, so add an in-app switcher:
* Android 13+: `res/xml/locales_config.xml` listing `ru` and `sah`, `android:localeConfig` in
  the manifest, `AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("sah"))`.
* Below 13: AppCompat 1.6+ does the same with `autoStoreLocales` in the manifest service.
* `<plurals>` for `sah`: only `<item quantity="other">`.

### iOS
Add `sah` to the project's localizations, then `sah.lproj` or the `sah` column in a String
Catalog. iOS has no Sakha system language. For an in-app switch, store the choice and either:
* set `UserDefaults.standard.set(["sah"], forKey: "AppleLanguages")` and ask the user to
  restart the app (simple, officially tolerated); or
* load strings from `Bundle(path: Bundle.main.path(forResource: "sah", ofType: "lproj"))`
  with a wrapper around `NSLocalizedString` (switches without a restart).

SwiftUI `Text("key")` follows `\.locale`; set `.environment(\.locale, Locale(identifier: "sah"))`
at the root. Date and number formatters then use CLDR `sah`.

### Flutter
`lib/l10n/app_sah.arb`. `GlobalMaterialLocalizations` has no `sah`, so add delegates that
reuse `ru` for Material/Cupertino widgets:
```dart
class SahMaterialDelegate extends LocalizationsDelegate<MaterialLocalizations> {
  bool isSupported(Locale l) => l.languageCode == 'sah';
  Future<MaterialLocalizations> load(Locale l) =>
      GlobalMaterialLocalizations.delegate.load(const Locale('ru'));
  bool shouldReload(_) => false;
}
```
Same for `CupertinoLocalizations` and `WidgetsLocalizations`. `intl` may lack `sah` date
symbols: `initializeDateFormatting('sah')` falls back to `ru`.

### Django
`LANGUAGES = [('ru', 'Русский'), ('sah', 'Саха тыла')]`. Django has no `sah` in
`django.conf.locale`. Add `LANG_INFO` with an entry for `sah` (`bidi: False, code: 'sah', name: 'Sakha', name_local: 'Саха тыла'`).
Then `makemessages -l sah` and write `locale/sah/LC_MESSAGES/django.po` with `Plural-Forms: nplurals=1; plural=0;`.

### gettext anywhere
Header `Plural-Forms: nplurals=1; plural=0;` and only `msgstr[0]`.

### Rails
`config/locales/sah.yml`. `config.i18n.available_locales = [:ru, :sah]`,
`config.i18n.fallbacks = { sah: :ru }`. Plurals: `rails-i18n` has no `sah`, so define
`I18n.backend.store_translations(:sah, i18n: { plural: { rule: ->(_) { :other } } })`.

## Dates and numbers in browsers

Measured on 2026-10-21 with Playwright 1.54 engines:

| Engine | `Intl.DateTimeFormat.supportedLocalesOf(['sah'])` | `toLocaleDateString('sah', {day, month: 'long'})` | numbers | `PluralRules('sah')` |
|---|---|---|---|---|
| Chromium (Chrome, Edge, Android WebView, Electron) | `[]` | **"October 21"** (English!) | "1,234,567.5" | `other` ✓ |
| WebKit (Safari, iOS) | `['sah']` | "Алтынньы 21" | "1 234 567,5" | `other` ✓ |
| Firefox | `['sah']` | "Алтынньы 21" | "1 234 567,5" | `other` ✓ |

Most users are on Chromium, so wherever dates or numbers are formatted with `sah`, add a
fallback:

```js
const SAH_INTL = Intl.DateTimeFormat.supportedLocalesOf(['sah']).length > 0;
// CLDR sah, format context ("21 of the month"); CLDR has December lowercase, normalized here.
const SAH_MONTHS = ['Тохсунньу', 'Олунньу', 'Кулун тутар', 'Муус устар', 'Ыам ыйын', 'Бэс ыйын',
  'От ыйын', 'Атырдьых ыйын', 'Балаҕан ыйын', 'Алтынньы', 'Сэтинньи', 'Ахсынньы'];
const numberLocale = lang => (lang === 'sah' && !SAH_INTL ? 'ru-RU' : lang);  // same format as Russian
const dayMonth = (d, lang) => lang === 'sah' && !SAH_INTL
  ? `${SAH_MONTHS[d.getMonth()]} ${d.getDate()}`                            // CLDR pattern: MMMM d
  : d.toLocaleDateString(lang, { day: 'numeric', month: 'long' });
```

With FormatJS, the polyfills (`@formatjs/intl-datetimeformat/locale-data/sah`,
`intl-numberformat`) do the same job. Load them only when `SAH_INTL` is false. Date
libraries (dayjs, date-fns, moment) ship no Sakha locale: give them these month names.

## Fonts

Check every font the UI uses for ҕ ҥ ө һ ү:
* Google Fonts: the `subset=cyrillic` URL param or `unicode-range` of the `cyrillic` subset
  does not include them. They are in `cyrillic-ext`. Self-hosted subsets (`*-cyrillic.woff2`)
  usually lack them too.
* Mobile: a custom font in `assets/fonts` must contain the glyphs. Otherwise the OS falls
  back per glyph, and words come out in mixed fonts.
* Google Fonts css2 URLs already serve a `cyrillic-ext` slice (U+0460–052F), loaded only
  when such letters appear on the page. Cormorant Garamond and IBM Plex Mono have all ten
  letters (checked with fontTools). For any other font, check its cmap for U+0494/0495,
  04A4/04A5, 04AE/04AF, 04BA/04BB, 04E8/04E9.
* Screenshots must wait for `document.fonts.ready` (`shoot.mjs` does). Otherwise the slice
  hasn't loaded yet and the fallback font looks like a bug.
