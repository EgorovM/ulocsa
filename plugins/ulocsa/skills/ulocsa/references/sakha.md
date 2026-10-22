# Sakha (Yakut) for UI text

Locale `sah` (`sah-RU` where a region is required). Fallback: `sah → ru`.

## Alphabet

Cyrillic: the Russian alphabet plus **Ҕ ҕ, Ҥ ҥ, Ө ө, Һ һ, Ү ү**. The digraphs **дь, нь** count as
letters. Long vowels are doubled (*аа, ыы, үү*); diphthongs are *ыа, иэ, уо, үө*.

Never write these instead (`check.mjs` catches them):

| Wrong | Right |
|---|---|
| Latin `h`, `ö`, `ü`, `ÿ` | `һ`, `ө`, `ү` |
| Kazakh/Tatar `ң` U+04A3, `ғ` U+0493 | `ҥ` U+04A5, `ҕ` U+0495 |
| digits `5`, `8`, `9` inside words | `ҕ`, `ө`, `ҥ` |

Native Sakha words have no **в е ё ж з ф ц ш щ ъ ю я**. A word with one of them is a Russian
word or an unadapted loan. That's fine for established loans and names; a sentence made of
them is untranslated.

## Grammar that breaks UI templates

* **Never attach a suffix to a placeholder.** Sakha suffixes change with the last sound of
  the word (vowel harmony, consonant assimilation): *Дьокуускайга*, *Мирнэйгэ*, *Москубаҕа*.
  Code can't choose the right one. Rephrase so the value stands alone, in the nominative:
  `Куорат: {city}`, `{name} — …`.
* **Plurals: only `other`.** After a numeral the noun stays singular: *3 мүнүүтэ*,
  *5 сакаас*. Collapse `{n, plural, one{…} few{…} many{…} other{…}}` to
  `{n, plural, other{…}}`. Keep `#` exactly where the source has it: if the source prints
  the number outside the plural (`<b>{n}</b> {n, plural, … {вопросов}}`), adding `#` shows
  it twice.
* **No grammatical gender.** Collapse `{g, select, female{…} male{…} other{…}}` to one
  `other` variant, or drop the select if the text no longer depends on it.
* **Word order is SOV**: the verb comes last and modifiers go before the head.
  Placeholders move: `Заказ №{id} принят` → `№{id} сакаас ылылынна`.
* **Sakha runs longer** than Russian, +10–30% on buttons. Respect `max_chars`.

## Register

Each product picks one register and keeps it everywhere:

* **Polite «эһиги»** (default: services, commerce, government): 2nd person plural; the
  imperative takes `-ыҥ/-иҥ/-уҥ/-үҥ`: *Кэтэһиҥ*, *Киириҥ*, *Устуҥ*, *Ыытыҥ*.
* **Familiar «эн»** (games, youth): the bare stem: *Кэтэс*, *Киир*.

**Buttons are verbs.** A button, or any short command (the Russian starts with an
infinitive: «Войти», «Перейти в кабинет», «Отправить код»), is an action. Its Sakha text
is a verb in the imperative: *Кэбиниэккэ киир*, *Ыытыҥ*, *Сабыҥ*. It is never a verbal
noun ending in -ыы/-ии/-уу/-үү or -һын: not *Кэбиниэккэ барыы*, *Ыытыы*, *Сабыы*,
*Көрдөөһүн*. This holds even when the Russian button is a noun («Вход», «Поиск»).
Headings, menu sections and labels may stay nouns («Регистрация» → *Бэлиэтэнии*).
`check.mjs` flags violations as `button_noun`. Keep the form uniform across the product.

## Terminology

Prefer what people actually read in Sakha media and on official sites:

1. a native word in real use (*төлөбүр* «оплата», *атыылаһыы*, *көрдөөһүн* «поиск»);
2. a loan in established Sakha spelling (*сакаас* «заказ», *суоппар* «водитель»);
3. the Russian word unchanged (brands, legal terms, addresses, IT words with no
   established Sakha form).

**Never coin neologisms.** A coined word nobody uses is worse than a loan. When unsure,
choose the clearest option and list it for the native reviewer. The same idea uses the
same word across the whole product: the glossary wins over variety.

Common UI terms in use (these are suggestions; a project glossary overrides them):

| Russian | Sakha |
|---|---|
| заказ | сакаас |
| оплата | төлөбүр |
| доставка | тиэрдии |
| водитель | суоппар |
| цена | сыана |
| поиск | көрдөөһүн |
| объявление | биллэрии |
| регистрация | бэлиэтэнии (кнопка: бэлиэтэниҥ) |
| Якутск | Дьокуускай |

## Punctuation and formatting

* Punctuation is as in Russian: «ёлочки» quotes, sentence case.
* Keep the source's first-letter case, final punctuation (`: ? ! …`) and edge spaces:
  strings may be glued in code.
* Numbers are as in Russian (`1 234 567,5`).
* Dates: CLDR months in the format context are Тохсунньу, Олунньу, Кулун тутар, Муус устар,
  Ыам ыйын, Бэс ыйын, От ыйын, Атырдьых ыйын, Балаҕан ыйын, Алтынньы, Сэтинньи, Ахсынньы,
  with the pattern `{month} {day}`: «Алтынньы 21».
