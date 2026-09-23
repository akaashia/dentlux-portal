# DentLux — Тармақтар мен тапсырмаларды атау келісімі

## Негізгі веткалар

| Ветка | Мақсаты | Тікелей push |
|---|---|---|
| `main` | Production-ready код | ❌ Тыйым салынған |
| `develop` | Интеграция ветка | ❌ Тек PR арқылы |

## Жұмыс веткалары

**Формат:** `{тип}/dent-{issue-нөмір}-{қысқа-сипаттама}`

| Тип | Формат | Мысал |
|---|---|---|
| Жаңа функция | `feature/dent-{N}-{slug}` | `feature/dent-12-auth-page` |
| Баг түзету | `fix/dent-{N}-{slug}` | `fix/dent-45-calendar-bug` |
| Шұғыл түзету | `hotfix/dent-{N}-{slug}` | `hotfix/dent-67-double-booking` |
| Релиз | `release/v{X}.{Y}` | `release/v1.0` |
| Рефакторинг | `refactor/dent-{N}-{slug}` | `refactor/dent-23-slot-service` |

## Ережелер

- Тек кіші әріп, дефис арқылы бөлінеді
- Issue нөмірі міндетті (`dent-12`)
- Slug — қысқа, мағыналы, ағылшынша (3 сөзден аспайды)
- `main` ветқасына тікелей push — **Branch Protection Rule** арқылы блокталған

## Commit форматы (Conventional Commits)

```
feat(booking): add slot reservation endpoint
fix(calendar): prevent double booking on same slot
docs(adr): add ADR-001 delivery model decision
refactor(auth): extract token validation to middleware
test(booking): add unit tests for slot availability check
```

**Типтер:** `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `style`
