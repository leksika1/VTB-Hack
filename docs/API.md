# API v2

Базовый путь — `/api`, JSON в UTF-8, поля в `camelCase`, деньги — рубли с не более чем двумя
знаками после запятой. Даты: `YYYY-MM-DD`, месяцы: `YYYY-MM`. Swagger доступен на `/api/docs`.

Авторизация: `Authorization: Bearer <token>`. Изменяющие запросы принимают `Idempotency-Key`
(16–100 символов). Ошибки имеют форму
`{"error":{"code":"...","message":"...","field":null}}`.

## Участники и вход

- У всех подтверждённых участников `role: "member"`; `isOwner` отмечает владельца.
- `POST /families` создаёт семью, владельца и личный `loginId`.
- `POST /auth/login {loginId}` выдаёт сессию. На запрос действует signup rate limit; неизвестный и
  неверный ID дают одинаковую ошибку. Вход ВТБ ID/OIDC работает независимо и не изменён.
- `GET /me` возвращает личный `loginId` только владельцу текущей сессии. Для прототипа ID хранится
  открыто для повторного показа и дополнительно как SHA-256 для поиска; после подключения ВТБ ID поле удаляется.
- `GET /invites/{code}`, `POST /invites/{code}/join` работают для кода и 16-символьной ссылки.
  Оба способа всегда создают участника со статусом `pending` без доступа к бюджету.
- `POST /family/members/{id}/approve|reject`, `DELETE /family/members/{id}` и
  `POST /family/members/{id}/make-owner` доступны только владельцу.
  Все подтверждённые участники видят имя и время заявки. Владелец не может выйти, пока владение не передано.
  После отказа заявитель остаётся в изолированном режиме, может прочитать `member_rejected` и выйти;
  бюджет и состав семьи ему не выдаются.

Удалены и отвечают 404: детские приглашения, `/allowances`, `/purchase-requests` и связанные действия.

## Покупки

`POST/PUT /expenses` принимает `source: shared|personal`, `splitMode: none|equal|shares`,
`splitMembers` и `splitShares` (базисные пункты, сумма 10 000), `paidBy`. Для ручного создания
`source=personal` запрещён (422); личный источник создаёт только подтверждение импорта. Старые поля
`accountMode` и `splitPercentages` временно поддерживаются и помечены устаревшими.

## Обязательные платежи

`POST/PUT /payments` поддерживает:

- `amountMode: fixed|invoice`;
- `recurrence: once|weekly|monthly|quarterly|yearly|custom`, `interval`, `intervalUnit`,
  `endMode: never|date|count`, `endDate`, `occurrences`;
- деление `none|equal|shares`;
- `paymentMethod: autopay|manual`.

Для автоплатежа обязательны `autopayType`, `providerCategory`, `providerName`,
`providerIdentifier`; лимит задаётся `limitAmount`. Разрешённые комбинации возвращает
`GET /payments/autopay-catalog`. Для ручной оплаты `paymentDetails` содержит получателя, способ
`sbp_phone|card|bank_account|uin`, реквизиты и назначение. В списках карта маскируется, полный номер
возвращает только `GET /payments/{id}`.

- `POST /payments/{id}/pay` — оплатить с общего счёта; при нехватке 409 с суммой дефицита.
- `POST /payments/{id}/paid` — совместимый маршрут «записать оплату»/«вернуть».
- `POST /payments/{id}/invoice {amount}` — эмуляция выставленного счёта.
- Следующее вхождение серии создаётся идемпотентно. Фоновый автоплатёж использует блокировки строк,
  поэтому две реплики не создают двойного расхода.

## Общий счёт и отчёты

- `POST /account/contributions` — пополнение.
- `GET /account/summary?month=YYYY-MM` — остаток, план, остаток после плана, взносы и по каждому
  участнику: доля, личная оплата, `due`, `overpaid`, проценты, статус и `topUpSuggestion`.
- `GET /analytics?month=YYYY-MM&months=6` — месячные ряды, категории, топ, взносы/доли и платежи.
- `GET /calendar?month=YYYY-MM` — расходы, платежи и фактический/плановый остаток по дням.
- `GET/PATCH /me/preferences` — `debtReminderThreshold` (по умолчанию 1 000 ₽),
  `defaultSplit: equal|none|ask`, `calendarEnabled`. Тема остаётся на клиенте.

Уведомление о долге получает только сам участник, не чаще одного раза за месяц.

## Совместимость

`GET /state`, бюджеты, цели, импорт, чеки, уведомления, OIDC, SSE `/events`, health/readiness и
старые месячные сводки сохранены. `POST /demo` пока работает, но устарел и будет удалён после перехода
фронта на полностью локальное демо.
