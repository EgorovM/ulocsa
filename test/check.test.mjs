// Same cases as the service's Go validators (internal/msgfmt, internal/sakha).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check } from '../plugins/ulocsa/skills/ulocsa/scripts/check.mjs';

const codes = (src, dst, opt) => check(src, dst, opt).map(p => p.code).sort().join(',');

const cases = [
  ['clean', 'Время вышло', 'Болдьох бүттэ', {}, ''],
  ['clean placeholder', 'Подождите {seconds} с.', '{seconds} с. кэтэһиҥ.', {}, ''],
  ['empty', 'Корзина', '  ', {}, 'empty'],
  ['latin h', 'Подождите', 'Кэтэhиҥ', {}, 'latin_mixed'],
  ['kazakh ng', 'Подождите', 'Кэтэһиң', {}, 'wrong_letter'],
  ['digit letter', 'Ребёнок', 'О5о', {}, 'digit_letter'],
  ['number with unit', '{n} мин', '{n} мүн', {}, ''],
  ['glued dative', 'Едем в {city}', '{city}га айаннаатыбыт', {}, 'glued_suffix'],
  ['glued hyphen', 'Едем в {city}', '{city}-га айаннаатыбыт', {}, 'glued_suffix'],
  ['br is markup', 'волк {m} м{br}глубже', 'бөрө {m} м{br}хойуу', {}, ''],
  ['rephrased', 'Едем в {city}', 'Айан: {city}', {}, ''],
  ['plural kept russian', '{n, plural, one {# минуту} few {# минуты} other {# минут}}', '{n, plural, one {# мүнүүтэ} few {# мүнүүтэ} other {# мүнүүтэ}}', {}, 'plural_categories,plural_categories'],
  ['plural collapsed', '{n, plural, one {# минуту} other {# минут}}', '{n, plural, other {# мүнүүтэ}}', {}, ''],
  ['no other', '{n, plural, one {# минуту} other {# минут}}', '{n, plural, one {# мүнүүтэ}}', {}, 'no_other,plural_categories'],
  ['plural to plain', '{n, plural, one {# минуту} other {# минут}}', '{n} мүнүүтэ', {}, 'arg_type'],
  ['gender select dropped', '{g, select, female {Она} other {Он}}', 'Кини', {}, 'arg_dropped'],
  ['broken icu', '{n, plural, other {# мин}}', '{n, plural, other {# мүн}', {}, 'syntax'],
  ['hash added', '<b>{n}</b> {n, plural, one {вопрос} other {вопросов}}', '<b>{n}</b> {n, plural, other {# ыйытыы}}', {}, 'hash'],
  ['hash dropped', '{n, plural, one {# вопрос} other {# вопросов}}', '{n, plural, other {ыйытыы}}', {}, 'hash'],
  ['i18next', 'Заказ №{{id}} оплачен', '№{{id}} сакаас төлөнүннэ', {}, ''],
  ['i18next lost', 'Заказ №{{id}} оплачен', '№{id} сакаас төлөнүннэ', {}, 'token_missing'],
  ['printf order', '%s оценил на %d', '%d %s', {}, 'token_order'],
  ['positional ok', '%1$s оценил на %2$d', '%2$d %1$s', {}, ''],
  ['ios', 'Позвонить %@', '%@ эрийиҥ', {}, ''],
  ['percent sign', 'лучше 50% игроков', 'оонньооччулар 50% -тан ордук', {}, ''],
  ['tags', 'Вы принимаете <a href="/t">условия</a>', 'Усулуобуйалары ылынаҕыт', {}, 'tags'],
  ['untranslated', 'время вышло', 'время вышло', {}, 'untranslated'],
  ['loanword', 'Такси', 'Такси', {}, 'same_as_source'],
  ['adapted loan', 'Заказ', 'Сакаас', {}, ''],
  ['russian', 'Подтвердите номер телефона', 'Подтвердите номер телефона, пожалуйста', {}, 'russian'],
  ['brand kept', 'Скачайте Drivee', 'Drivee-ни хачайдааҥ', { keep: ['Drivee'] }, ''],
  ['too long', 'Бежать', 'Сүүрүүнү саҕалаа', { maxChars: 8 }, 'too_long'],
  ['edge space', 'Поиск в ', 'Көрдөөһүн', {}, 'edge_space'],
  ['colon', 'Кухня:', 'Ас-үөл', {}, 'punct'],
  ['dropped sentence', 'Платите за токены. Перед запуском — оценка. Бесплатного баланса нет.', 'Токеннар иһин төлүүгүт.', {}, 'sentences,too_short'],
  ['dropped words', 'Перевод сайтов и приложений на якутский язык', 'Саха тыла', {}, 'too_short'],
  ['short label', 'Междугородние поездки', 'Ыраах айан', {}, ''],
  ['button noun', 'Перейти в кабинет', 'Кэбиниэккэ барыы', { role: 'button' }, 'button_noun'],
  ['button verb', 'Перейти в кабинет', 'Кэбиниэккэ киир', { role: 'button' }, ''],
  ['button polite verb', 'Отправить', 'Ыытыҥ', { role: 'button' }, ''],
  ['label may be a noun', 'Поиск', 'Көрдөөһүн', { role: 'label' }, ''],
  ['infinitive source', 'Войти', 'Киирии', {}, 'button_noun'],
  ['noun source stays noun', 'Регистрация', 'Бэлиэтэнии', {}, ''],
  ['plural forms not short', '{n, plural, one {Водитель будет через # минуту} few {Водитель будет через # минуты} other {Водитель будет через # минут}}', '{n, plural, other {Суоппар # мүнүүтэнэн кэлиэҕэ}}', {}, ''],
];

for (const [name, src, dst, opt, want] of cases) {
  test(name, () => assert.equal(codes(src, dst, opt), want, JSON.stringify(check(src, dst, opt))));
}
