# API

Базовый путь — `/api`. Интерактивная документация на работающем сервере: `/api/docs` (Swagger)
и `/api/redoc`; машиночитаемая схема — `/api/openapi.json`.
Каждый эндпоинт покрыт e2e-тестами в `backend/tests/e2e/` (имена тестов указаны в разделах).

## Общие правила

### Формат

- JSON в UTF-8, поля в `camelCase`.
- Деньги — число в рублях, не больше двух знаков после запятой: `1250.5`. Максимум — 100 000 000 ₽.
- Даты — `YYYY-MM-DD`, месяц — `YYYY-MM`, время создания/изменения — миллисекунды Unix (`1761085000000`).
- Категории: `food` (продукты), `housing` (жильё), `transport` (транспорт), `kids` (дети), `other` (другое).

### Аутентификация

Создание семьи, вход по приглашению и демо возвращают `token`. Дальше он передаётся в каждом запросе:

```
Authorization: Bearer <token>
```

Токен привязан к участнику и устройству. Он перестаёт работать, если участник вышел из семьи
или устройство не делало запросов 90 дней (`SESSION_TTL_DAYS`). Тогда ответ — `401`, и клиент
возвращает пользователя на экран входа.

Публичные эндпоинты (без токена): `POST /families`, `GET /invites/{code}`, `POST /invites/{code}/join`,
`POST /demo`, `GET /health`, `GET /ready`.

### Идемпотентность

Эндпоинты с пометкой **идемпотентный** принимают заголовок `Idempotency-Key` (16–100 символов, случайный;
фронтенд генерирует `crypto.randomUUID()` на каждую открытую форму).

| Ситуация | Ответ |
|---|---|
| Первый запрос с ключом | Обычная обработка; при успехе ответ запоминается на 24 часа |
| Повтор с тем же ключом и тем же телом | Тот же ответ, без повторного действия |
| Тот же ключ, другое тело | `409 conflict` |
| Первый запрос завершился ошибкой (422, 403…) | Ключ не расходуется — исправленные данные можно отправить с ним же |

Ключи принадлежат участнику: одинаковые ключи разных участников не пересекаются. У анонимных запросов
(создание семьи, вход по коду) ключ привязан к IP клиента.
Для `POST /families` и `POST /invites/{code}/join` повтор возвращает ту же семью и того же участника,
но **новый** токен — токены в открытом виде нигде не хранятся.

Удаления и `POST /payments/{id}/paid` идемпотентны сами по себе: повтор ничего не меняет.

### Ошибки

Тело ошибки всегда одинаковое; `message` готово для показа пользователю, `field` — поле формы
(или `null`):

```json
{"error": {"code": "validation_error", "message": "Сумма должна быть больше нуля", "field": "amount"}}
```

| HTTP | `code` | Когда |
|---|---|---|
| 401 | `unauthorized` | Нет токена, токен неверный или сессия закрыта |
| 403 | `forbidden` | Действие запрещено: чужой расход, переключение участника не в демо |
| 404 | `not_found` | Объекта нет или он принадлежит другой семье |
| 404 | `http_error` | Нет такого пути |
| 405 | `http_error` | Метод не поддерживается |
| 409 | `conflict` | Повтор ключа идемпотентности с другим телом; лимит участников или записей; одновременное изменение |
| 411 | `length_required` | Тело без `Content-Length` (chunked) |
| 413 | `payload_too_large` | Тело больше 64 КБ |
| 422 | `validation_error` | Неверные данные; `field` указывает поле |
| 429 | `rate_limited` | Превышен лимит запросов или потоков событий |
| 500 | `internal_error` | Ошибка сервера (подробности — в журнале по `X-Request-ID`) |
| 503 | `overloaded` | Сервер перегружен (нет свободных соединений с БД); заголовок `Retry-After` |

### Лимиты запросов

| Группа | Эндпоинты | Лимит (по умолчанию) | Ключ |
|---|---|---|---|
| invite | `GET /invites/{code}`, `POST /invites/{code}/join` | 20 в минуту | IP |
| signup | `POST /families`, `POST /demo` | 10 в минуту | IP |
| write | все POST/PUT/DELETE с токеном | 120 в минуту | участник |
| read | все GET с токеном, включая подключение к `/events` | 600 в минуту | участник |
| streams | одновременно открытых `GET /events` | 5 | участник |

Окно скользящее. Перед backend nginx дополнительно ограничивает 20 запросов/с (всплеск 40) и 50 соединений
с одного IP — см. [SECURITY.md](SECURITY.md). Объём данных: до 10 участников в семье, до 20 000 расходов
и 20 000 платежей.

### Служебные заголовки

- `X-Request-ID` — в каждом ответе. Можно передать свой (8–64 символа `A-Za-z0-9._-`), иначе сервер создаст.
  По нему запрос ищется в журнале.
- Изменяющий запрос (POST/PUT/DELETE с ответом < 400, кроме проверки покупки и смены участника демо)
  рассылает участникам семьи событие `changed` — см. [`GET /events`](#get-apievents).

### Роли и что изменилось в существующих ответах

С ролями ([FEATURES.md §1](FEATURES.md#1-роли-в-семье)) часть эндпоинтов доступна только взрослым: бюджет,
платежи, сводка, проверка покупки, смена кода приглашения — ребёнок получает `403`
«Это доступно только взрослым участникам семьи». Новые поля в уже существующих ответах:

| Где | Поле | Смысл |
|---|---|---|
| участник в `family.members` | `role` | `parent` или `child` |
| `family` | `inviteCode` | `null` для ребёнка (по коду семьи входят взрослые) |
| `GET /invites/{code}` | `role` | с какой ролью войдёт приглашённый |
| расход | `paidBy`, `requestId` | кто платил; из какого одобренного запроса создан |
| платёж | `recurring`, `seriesId` | повторяющийся ли, к какой серии относится |
| `GET /state` | `allowances`, `unreadNotifications` | карманные деньги; непрочитанные уведомления |
| сводка месяца | `savedThisMonth` | взносы в цели за месяц (в формулы не входят) |

### Эндпоинты второй очереди

Правила, тела запросов и ответов — в [FEATURES.md](FEATURES.md).

| Группа | Эндпоинты | Раздел |
|---|---|---|
| Участники | `POST /family/child-invites`, `PUT/DELETE /family/members/{id}` | [§1](FEATURES.md#1-роли-в-семье) |
| Карманные деньги | `GET /allowances`, `PUT/DELETE /family/members/{id}/allowance` | [§2](FEATURES.md#2-карманные-деньги) |
| Запросы на покупку | `GET/POST /purchase-requests`, `POST /purchase-requests/{id}/approve\|reject\|cancel` | [§3](FEATURES.md#3-запросы-на-покупку) |
| Цели | `GET/POST /goals`, `PUT/DELETE /goals/{id}`, `POST /goals/{id}/archive`, `GET/POST /goals/{id}/contributions`, `DELETE /goals/{id}/contributions/{cid}` | [§4](FEATURES.md#4-цели-копилки) |
| Прогноз | `GET /months/{month}/forecast` | [§5](FEATURES.md#5-прогноз-на-конец-месяца) |
| Повторяющиеся платежи | поле `recurring` в `POST/PUT /payments` | [§6](FEATURES.md#6-повторяющиеся-платежи) |
| Кто кому должен | `GET /months/{month}/settlement`, `POST /months/{month}/settlements`, `DELETE /months/{month}/settlements/{id}` | [§7](FEATURES.md#7-кто-кому-должен) |
| Чек | `POST /receipts/parse`, поле `receipt` в `POST /expenses` | [§8](FEATURES.md#8-qr-код-чека) |
| Уведомления и профиль | `GET /notifications`, `POST /notifications/{id}/read`, `POST /notifications/read-all`, `GET /me`, `PUT/DELETE /me/email`, `POST /me/email/verify`, `PUT /me/notifications` | [§9](FEATURES.md#9-уведомления) |
| Импорт выписки | `GET/POST /imports`, `GET/DELETE /imports/{id}`, `POST /imports/{id}/confirm` | [§10](FEATURES.md#10-импорт-выписки) |
| ВТБ ID | `GET /auth/oidc/config`, `POST /auth/oidc/start`, `POST /auth/oidc/callback`, `DELETE /me/oidc` | [§11](FEATURES.md#11-вход-через-втб-id) |

---

## Семья

### `POST /api/families` — создать семью

Публичный, **идемпотентный**, лимит `signup`.

```json
// запрос
{"familyName": "Ивановы", "userName": "Анна"}
// 201
{
  "token": "x2Jc…",
  "currentUserId": "0b9c…",
  "family": {
    "id": "5f1e…", "name": "Ивановы", "inviteCode": "K7M2PX", "isDemo": false,
    "members": [{"id": "0b9c…", "name": "Анна", "color": "#1F5BD8"}]
  }
}
```

| Поле | Правило | Ошибка |
|---|---|---|
| `familyName` | 1–80 символов после обрезки пробелов | «Укажите название семьи» |
| `userName` | 1–60 символов | «Укажите ваше имя» |

Тесты: `test_family.py::test_create_family*`.

### `GET /api/invites/{code}` — семья по коду приглашения

Публичный, лимит `invite`. Код нечувствителен к регистру.

```json
// 200
{"code": "K7M2PX", "familyName": "Ивановы", "membersCount": 1}
```

Ошибки: `422` (`field: code`) — не 6 латинских букв/цифр; `404` (`field: code`) — нет такой семьи.

### `POST /api/invites/{code}/join` — присоединиться

Публичный, **идемпотентный**, лимит `invite`. Тело `{"userName": "Борис"}`, ответ `201` — как у создания семьи.
Остальные участники получают событие `changed`.

Ошибки: `422 userName`, `422/404 code`, `409` «В семье уже 10 участников».

### `POST /api/demo` — демо-семья

Публичный, лимит `signup`, без тела. Создаёт для посетителя отдельную копию «Семьи Смирновых»
(взрослые Алексей и Мария, ребёнок Соня с карманными деньгами и запросом на покупку; бюджеты на этот
и прошлый месяц, 13 расходов, 7 платежей) и входит как «Алексей». Полный состав — [TEST_DATA.md](TEST_DATA.md).
Демо-семьи удаляются через 24 часа (`DEMO_TTL_HOURS`). Ответ `201` — как у создания семьи, `isDemo: true`.

### `GET /api/family` — моя семья

```json
// 200
{"id": "5f1e…", "name": "Ивановы", "inviteCode": "K7M2PX", "isDemo": false, "members": [ … ]}
```

В `members` только текущие участники в порядке вступления.

### `POST /api/family/leave` — выйти из семьи

Ответ `204`. Участник исчезает из списка, все его сессии закрываются, его расходы остаются семье
с прежним автором. Если вышел последний участник, семья удаляется со всеми данными.

### `POST /api/family/invite-code` — сменить код приглашения

Без тела. Ответ `200` — семья с новым `inviteCode`. Старый код и все ссылки с ним перестают работать;
участники остаются, остальные получают событие `changed`. Нужен, если ссылка попала не тому человеку.

### `POST /api/family/switch-user` — демо: войти как другой участник

Только для демо-семьи. Тело `{"userId": "…"}`, ответ `200` — новая сессия (`token`, `currentUserId`, `family`).
Ошибки: `403` — семья не демо; `404` — нет такого участника в этой семье.

### `GET /api/state` — всё для старта приложения

```json
// 200
{
  "family": { … },
  "currentUserId": "0b9c…",
  "budgets":  [Budget, …],     // по возрастанию месяца
  "expenses": [Expense, …],    // новые сверху
  "payments": [Payment, …]     // по сроку
}
```

Тесты: `test_family.py::test_get_family_and_state`.

---

## Бюджет

```ts
Budget = {
  familyId: string; monthKey: "YYYY-MM"; totalAmount: number;
  categoryPlans: {food, housing, transport, kids, other: number};   // всегда все 5, 0 = лимита нет
  updatedAt: number
}
```

### `GET /api/budgets` — все бюджеты семьи

`200` — массив `Budget` по возрастанию месяца.

### `GET /api/budgets/{month}` — бюджет месяца

`200` — `Budget`; `404` — «Бюджет на этот месяц ещё не настроен»; `422 monthKey` — неверный месяц.

### `PUT /api/budgets/{month}` — создать или изменить

**Идемпотентный.** Изменять может любой участник.

```json
{"totalAmount": 140000, "categoryPlans": {"food": 45000, "housing": 46000}}
```

| Правило | Ошибка (`field`) |
|---|---|
| `totalAmount` > 0, ≤ 2 знаков, ≤ 100 млн | `total` |
| Лимит категории ≥ 0 | имя категории |
| Только известные категории | имя категории: «Неизвестная категория» |
| Σ лимитов ≤ `totalAmount` | `total`: «Сумма лимитов больше общего бюджета» |

Неуказанные категории получают 0. Тесты: `test_budgets.py`.

---

## Расходы

```ts
Expense = {
  id: string; familyId: string; title: string; amount: number; category: Category;
  date: "YYYY-MM-DD"; authorId: string | null; authorName: string | null;
  paymentId: string | null;     // расход создан отметкой платежа
  createdAt: number
}
```

### `GET /api/expenses?month=YYYY-MM`

Без `month` — все расходы семьи. Сортировка: дата по убыванию, при равной дате — новые записи выше.

### `POST /api/expenses` — добавить

**Идемпотентный.** Автор — текущий участник.

```json
{"title": "Продукты", "amount": 1250.5, "category": "food", "date": "2026-10-21"}
```

| Поле | Правило | Ошибка |
|---|---|---|
| `title` | 1–120 символов после обрезки | «Укажите название» / «Название длиннее 120 символов» |
| `amount` | > 0, ≤ 2 знаков после запятой, ≤ 100 млн | «Сумма должна быть больше нуля» и др. |
| `category` | одна из 5 | «Выберите категорию» |
| `date` | существующая дата `YYYY-MM-DD` | «Укажите дату» |

### `PUT /api/expenses/{id}` — изменить свой

**Идемпотентный.** Тело как у создания. `403` — расход другого участника; `404` — нет такого расхода.

### `DELETE /api/expenses/{id}` — удалить свой

`204`, в том числе если расхода уже нет. `403` — чужой расход. Если расход создан отметкой платежа,
платёж возвращается в «Предстоит».

Тесты: `test_expenses.py`.

---

## Обязательные платежи

```ts
Payment = {
  id: string; familyId: string; title: string; amount: number; category: Category;
  dueDate: "YYYY-MM-DD"; status: "upcoming" | "paid";
  expenseId: string | null;     // расход, созданный при оплате
  authorId: string | null; createdAt: number
}
```

### `GET /api/payments?month=YYYY-MM`

Сортировка по сроку, при равном сроке — по времени создания.

### `POST /api/payments` — добавить

**Идемпотентный.** `{"title": "Аренда", "amount": 38000, "category": "housing", "dueDate": "2026-11-01"}`.
Правила полей как у расхода, дата — в поле `dueDate`.

### `PUT /api/payments/{id}` — изменить

**Идемпотентный.** Любой участник. `422` — платёж уже оплачен («Сначала верните его в предстоящие»); `404` — нет платежа.

### `DELETE /api/payments/{id}`

`204`. `422` — платёж оплачен.

### `POST /api/payments/{id}/paid` — оплачен / не оплачен

```json
// запрос
{"paid": true}
// 200
{"payment": Payment, "expense": Expense | null}
```

- `paid: true`: создаётся расход на сумму платежа (автор — кто отметил; дата — сегодня, если платёж
  этого месяца, иначе — дата платежа), статус `paid`. Сумма уходит из «Зарезервировано» в «Потрачено».
- `paid: false`: связанный расход удаляется, статус `upcoming`, сумма снова в резерве.
- Платёж уже в нужном статусе — ничего не меняется, `expense: null`.

### `POST /api/payments/copy-previous-month` — перенести из прошлого месяца

**Идемпотентный.** `{"monthKey": "2026-11"}` → `{"added": 2, "payments": [Payment, …]}`.
Копирует платежи прошлого месяца как предстоящие, кроме тех, чьё название уже есть в целевом месяце.
День сохраняется; 31-е в коротком месяце становится последним днём.

Тесты: `test_payments.py`.

---

## Сводка и проверка покупки

### `GET /api/months/{month}/summary`

```json
{
  "monthKey": "2026-10", "hasBudget": true,
  "plan": 140000, "spent": 67889.9, "reserved": 21000,
  "leftByPlan": 72110.1, "freeByPlan": 51110.1, "unallocated": 0,
  "categories": [
    {"key": "food", "plan": 45000, "spent": 12120.4, "reserved": 0, "left": 32879.6,
     "status": "ok", "overByExpenses": false}
  ],
  "upcomingPayments": [Payment], "paidPayments": [Payment], "expenses": [Expense]
}
```

`left` категории = лимит − потрачено − зарезервировано (отрицательный — лимит превышен).
`overByExpenses` — превышен уже фактическими расходами, а не только резервом. Формулы — в [ARCHITECTURE.md](ARCHITECTURE.md#1-что-делает-продукт).

### `POST /api/months/{month}/purchase-check`

Ничего не меняет и не рассылает событий.

```json
// запрос: category необязательна
{"amount": 15000, "category": "other"}
// 200
{
  "verdict": "category-over",
  "amount": 15000, "freeBefore": 51110.1, "freeAfter": 36110.1,
  "category": {CategorySummary}, "categoryLeftAfter": -9469.5,
  "reservedPayments": [Payment]
}
```

| `verdict` | Условие (проверяется по порядку) |
|---|---|
| `not-enough` | `freeAfter` < 0 |
| `category-over` | у категории есть лимит и `categoryLeftAfter` < 0 |
| `tight` | `freeAfter` < 5% плана |
| `ok` | иначе |

Тесты: `test_summary.py`.

---

## Служебные

### `GET /health`, `GET /api/health`

Процесс жив: `{"status": "ok", "service": "backend"}`. Для liveness-проверок; `/health` доступен только
внутри сети контейнеров.

### `GET /api/ready`

Готовность принимать трафик: `200 {"status": "ok", "checks": {"database": "ok", "redis": "ok"}}`
или `503 {"status": "degraded", …}`. Для readiness-проверок балансировщика.

### `GET /api/events`

Поток Server-Sent Events (`text/event-stream`), требуется токен. `EventSource` не умеет передавать
`Authorization`, поэтому фронтенд читает поток через `fetch` (`subscribeToChanges` в `frontend/src/api/client.ts`).

```
event: ready
data: {"memberId": "0b9c…"}

event: changed
data: {"type": "changed", "by": "7d1a…"}

: ping
```

| Сообщение | Что делать клиенту |
|---|---|
| `ready` | Подключились. После переподключения — перечитать `/state` (могли пропустить события) |
| `changed` | Кто-то в семье изменил данные — перечитать `/state` |
| `: ping` | Комментарий раз в 15 секунд, держит соединение через прокси; игнорировать |

Тесты: `test_realtime.py`.
