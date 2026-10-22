# REST API

Все ответы JSON, префикс `/api`. Неуспех: `{ "error": "SLOT_UNAVAILABLE" }` и HTTP статус. Даты YYYY-MM-DD, время HH:mm, слот 30 минут, timezone Asia/Almaty (UTC+5). Бронирование и расписание доступны на 60 дней вперёд. `POST/PUT/PATCH/DELETE` требуют Content-Type application/json и Origin, совпадающий с APP_ORIGIN. Браузер использует HttpOnly/SameSite=Strict cookie dentlux_session, в production Secure. PII-ответы имеют Cache-Control: no-store.

| Метод и путь | Доступ | Назначение |
|---|---|---|
| GET /health | public | Readiness с проверкой БД |
| GET /catalog | public | Услуги, врачи, филиал и режим демо |
| GET /slots?doctorId=aida&date=2026-11-02 | public | Рабочий день и слоты, без данных пациентов |
| POST /auth/request | public | `{phone}` → challengeId, expiresIn; demoCode только в демо |
| POST /auth/verify | public | `{phone,challengeId,code}` → user и session cookie |
| POST /auth/logout | session | `{}`; удаляет текущую сессию |
| GET /me | public | user или null; role назначается сервером |
| POST /bookings | patient | Бронирование, HTTP 201; конфликт 409 |
| GET /bookings/:id | owner patient | Собственное подтверждение; чужой ID → 404 |
| PATCH /bookings/:id/notifications | owner patient | `{enabled:false}` — opt-out |
| POST /telegram/link | patient | `{}` → available, одноразовый url; начать чат за 5 минут |
| DELETE /telegram/link | patient | `{}`; отключение, отмена Telegram outbox |
| GET /staff/bookings?date=... | receptionist/doctor | Врач видит только свои приёмы |
| PATCH /staff/bookings/:id | receptionist | Статус или перенос; обязательна expectedUpdatedAt |
| PUT /staff/schedules | receptionist | Отдельный день врача; проверяет существующие записи |
| GET /staff/statistics?date=... | receptionist | Статусы, стоимость завершённых приёмов, загрузка |
| GET /staff/notifications | receptionist/admin | Последние 200 уведомлений и ошибки |
| GET /staff/audit?before=...&action=... | lawyer/admin | До 200 записей; before — ISO timestamp, action — точное имя |

Метрики доступны отдельно по GET /metrics с `Authorization: Bearer METRICS_TOKEN`. Nginx закрывает этот путь снаружи. WebSocket `/ws` передаёт только `{"type":"availability.changed"}`, без PII; клиент повторно получает слоты. Есть резервная ревалидация раз в 30 секунд.

Создание записи:

```json
{
  "doctorId": "aida",
  "serviceId": "consultation",
  "date": "2026-11-02",
  "time": "10:00",
  "name": "Демо Пациент",
  "consent": true,
  "notify": true
}
```

Телефон берётся только из подтверждённого аккаунта. Цена и доступность услуги берутся на сервере. Ответ включает id, reference, doctorId, serviceId, date, time, price, status. Повторная отправка на занятый слот возвращает 409 и не создаёт вторую запись.

Изменение: `{ "status":"arrived", "expectedUpdatedAt":"2026-10-22T10:00:00.000Z" }`. Перенос: `{ "date":"2026-11-03", "time":"11:00", "expectedUpdatedAt":"..." }`. Получайте updatedAt из последнего ответа; устаревшая версия возвращает STALE_BOOKING/409. Статусы: scheduled, arrived, completed, no_show, cancelled. При отмене слот освобождается; восстановление отмены повторно проверяет слот.

Расписание: `{ "doctorId":"aida", "date":"2026-11-03", "start":"09:00", "end":"18:00", "dayOff":false }`. Разрешены получасовые границы 08:00–20:00; 13:00–14:00 всегда исключается. Нельзя закрыть день или обрезать интервал с активными записями.

Основные коды: VALIDATION_ERROR/400, INVALID_OTP/400, UNAUTHENTICATED/401, FORBIDDEN/403, INVALID_ORIGIN/403, BOOKING_NOT_FOUND/404, SLOT_UNAVAILABLE/409, STALE_BOOKING/409, SCHEDULE_HAS_BOOKINGS/409, RATE_LIMITED/429, SMS_UNAVAILABLE/503. Ошибки не раскрывают персональные данные или текст ответов провайдеров.
