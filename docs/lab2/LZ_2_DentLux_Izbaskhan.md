# Зертханалық жұмыс №2
## Жеткізу моделін таңдау, ADR және жұмыс кеңістігін баптау
### Жоба: DentLux — Стоматологиялық клиниканың веб-сайты мен онлайн жазылу жүйесі

**Орындаған:** Ізбасхан Әселхан  
**Рөл:** Project Manager + Frontend & QA  
**Серіктес:** Жандос Арлан (Backend & DB Architecture)  
**Күні:** 2026-09-23  
**Пән:** IT-жобаларды басқару  
**Репозиторий:** https://github.com/akaashia/dentlux-portal

---

## 1-БӨЛІМ. Үш кейс үшін жеткізу моделін таңдау

### 1.1 Кейстердің сипаттамасы

**Кейс А: Тендер бойынша мемлекеттік органда электрондық құжат айналымы АЖ-ны (СЭД) енгізу**

Мемлекеттік тапсырыс беруші тендер арқылы жеңімпаз анықтап, Техникалық Тапсырманы (ТЗ) заңнама негізінде алдын ала толық бекіткен. Жүйе: ЭЦҚ интеграциясы, архив, маршруттау, рөлдер, мемлекеттік стандарттарға сәйкестік (ҚР ГОСТ). Deliverable — бекітілген ТЗ-ға толық сәйкес жүйе + пайдалануға беру акті + аудит хаттамалары.

**Кейс Ә: Тексерілмеген гипотезасы бар стартаптың жаңа мобильді өнімі**

Стартап команда нарықта ұқсас өнім сұранысы бар деп болжайды, бірақ пайдаланушылардың нақты қажеттіліктері тексерілмеген. MVP арқылы гипотезаны растау немесе жоққа шығару — бастапқы мақсат. Алдын ала толық SRS жасаудың мәні жоқ — кез келген спринттен кейін өнімнің бағыты өзгеруі мүмкін (pivot).

**Кейс Б: Банк монолитін бұлтқа (cloud) көшіру**

Ірі банктің жұмыс істеп тұрған core banking жүйесін AWS/Azure бұлтына migrate ету. Регулятор (ҚР Ұлттық Банкі, АРРФР) талаптары: 99.95% SLA, деректер локализациясы, аудит логтары, Rollback Plan міндетті. Техникалық тәуекел критикалық: production жүйесі миграция кезінде тоқтамауы тиіс. Бірнеше команда паралельді жұмыс істейді.

---

### 1.2 Таңдалған модельдер

| Кейс | Таңдалған модель | Қысқаша негіздеме |
|---|---|---|
| Кейс А: Мем. СЭД | **Predictive (Waterfall)** | ТЗ заңды бекітілген, аудит үшін толық құжаттама міндетті |
| Кейс Ә: Стартап | **Adaptive (Lean Startup + Continuous Discovery)** | Гипотеза тексерілмеген, pivot жиі, алдын ала SRS мүмкін емес |
| Кейс Б: Банк миграциясы | **Hybrid (Predictive фазалар + Agile итерациялар)** | Регулятор жоспары — Predictive; миграция техникасы — Adaptive |

---

### 1.3 Алты өлшем бойынша салыстыру кестесі

| Өлшем | Кейс А: Мем. СЭД (Predictive) | Кейс Ә: Стартап (Adaptive) | Кейс Б: Банк миграциясы (Hybrid) |
|---|---|---|---|
| **1. Талаптардың тұрақтылығы** | Өте жоғары — ТЗ тендерге дейін заңды бекітілген; өзгерту Change Request + комиссия мақұлдауы арқылы | Өте төмен — гипотезалар user interview, A/B тесттер нәтижесінде спринт сайын қайта қаралады; pivot мүмкіндігі жоғары | Орташа — регулятор талаптары тұрақты (Migration Plan, Rollback Plan), бірақ cloud-архитектура шешімдері итеративті нақтыланады |
| **2. Жеткізу жиілігі** | Сирек — Phase Gate milestone-дары бойынша (3–6 айда бір рет); финалдық deliverable жобаның соңында | Өте жиі — 1–2 аптадан sprint; апта сайын тестілеуге жаңа build; «ship early, learn fast» принципі | Орташа — миграция толқындары (migration wave) квартал сайын; ішкі итерациялар 2 апта |
| **3. Тәуекел профилі** | Орта-жоғары: тестілеу тек финалда → кеш табылған қате қымбат; регулятор рискі — ТЗ-дан ауытқу → келісімшарт бұзылуы | Жоғары бизнес-риск: өнім сатылмауы мүмкін; техникалық риск төмен (MVP кішігірім, rollback оңай) | Критикалық операциялық риск: production тоқтаса — тікелей қаржылық шығын + регулятор санкциясы; Rollback Plan міндетті |
| **4. Тапсырыс берушімен өзара әрекет** | Формалды, кезеңді — kick-off, milestone review, UAT, сдача-приёмка актілері; күнделікті байланыс жоқ | Тығыз, үздіксіз — Product Owner командада, user interview апта сайын, sprint демо сайын | Аралық — Steering Committee ай сайын; техникалық Working Group апта сайын; операциялық команда онлайн |
| **5. Команда құрылымы мен масштабы** | Иерархиялық: PM, аналитик, архитектор, девелоперлер, тестер, юрист — рөлдер қатаң бөлінген, RACI матрицасы | Кішігірім, кросс-функционалды: 3–8 адам; T-shaped компетенциялар; барлығы «everything» жасай алады | Бірнеше команда: Platform team, Migration team, Testing team, Security team — координация SAFe/LeSS арқылы |
| **6. Сәттілік өлшемі** | Scope × Time × Cost «темір үшбұрышы»; ТЗ-дан ауытқу = контракт бұзылуы; аудитте қолданылатын артефактілер | Validated learning: гипотеза расталды ма? Retention, conversion, NPS метрикалары; pivot немесе persevere шешімі | Нөлдік downtime миграция; SLA ≥ 99.95% сақталуы; регулятор аудитінен өту; TCO азаюы |

---

### 1.4 Таңдаулардың негіздемесі

**Кейс А → Predictive:**
Мемлекеттік тендер жобасында барлық талаптар заңды күші бар ТЗ-да бекітілген. Deliverable-дар — актілер, хаттамалар, тест есептері — аудит үшін міндетті. Agile итерациялары бұл контексте заңды рәсімге сәйкес келмейді: тапсырыс беруші «жұмыс жасалып жатқан бағдарламалық жасақтама» емес, бекітілген milestone-дарды күтеді.

**Кейс Ә → Adaptive:**
Тексерілмеген гипотеза — бұл жобаның өзегі. Lean Startup циклі: Build → Measure → Learn. Алдын ала SRS жасаудың мәні жоқ — 3-спринттен кейін өнімнің бағыты өзгеруі мүмкін. Adaptive модель белгісіздікті артықшылыққа айналдырады: команда жылдам оқып, жылдам бейімделеді.

**Кейс Б → Hybrid:**
Регулятор Migration Plan, Rollback Plan, Risk Register-ді алдын ала бекітуді талап етеді — бұл Predictive. Бірақ нақты cloud-архитектура шешімдері (қай сервисті бірінші migrate ету, қандай pattern қолдану) тек нақты тестілеу нәтижесінде анықталады — бұл Adaptive. Hybrid осы екі полюсті үйлестіреді.

---

## 2-БӨЛІМ. ADR-001: DentLux жобасы үшін жеткізу моделін таңдау

> **Толық файл:** [`docs/adr/ADR-001-delivery-model.md`](./adr/ADR-001-delivery-model.md)

### ADR-001 қысқаша мазмұны

**Таңдалған модель: Гибридті (Predictive + Adaptive)**

| Компонент | Модель | Жауапты |
|---|---|---|
| PostgreSQL схемасы + миграциялар | Predictive | Жандос Арлан |
| Docker + GitHub Actions CI/CD | Predictive | Жандос Арлан |
| REST API контрактілер (OpenAPI) | Predictive | Жандос Арлан |
| Frontend UI/UX (React) | Adaptive | Ізбасхан Әселхан |
| Telegram-бот ағыны | Adaptive | Ізбасхан Әселхан |
| Онлайн жазылу модулі | Adaptive | Ізбасхан Әселхан |

**Қабылданбаған нұсқалар:**
- Нұсқа 1: Таза Predictive — UX белгісіздігін жасырады, соңғы кезеңде қате табылса өте қымбат
- Нұсқа 2: Таза Adaptive (Pure Scrum) — DB схемасын спринт сайын өзгерту migration шығынын арттырады

**Негізгі ұтылыс (не жоғалтамыз):**
API контракт өзгерсе — Predictive мен Adaptive бөліктер арасында координация қажет; жоспарлау күрделірек.

---

## 3-БӨЛІМ. GitHub Projects жұмыс кеңістігі мен тапсырмаларды ұйымдастыру

### 3.1 Kanban тақтасының құрылымы

GitHub Projects → **"DentLux — Sprint Board"** тақтасы:

| Баған | Мақсаты | WIP Limit | Ауысу шарты |
|---|---|---|---|
| **📋 Backlog** | Барлық жоспарланған тапсырмалар, приоритет бойынша реттелген | Шектеусіз | PM (Әселхан) қосады |
| **🔍 Ready for Dev** | Sprint Planning-де таңдалған, DoR тексерілген | Макс. 6 | Sprint Planning кезінде |
| **⚙️ In Progress** | Белсенді жұмыс жасалып жатқан | Макс. 3 (1 адамнан макс. 2) | Орындаушы өзі жылжытады |
| **👁️ Code Review / QA** | PR ашылған, review немесе QA тестілеу | Макс. 4 | PR ашылғанда автоматты |
| **✅ Done** | DoD толық орындалған, merge болған | Шектеусіз | PR merge + DoD чек-лист |

**Кастом өрістер (Custom Fields):**

| Өріс | Тип | Мәндер |
|---|---|---|
| `Sprint` | Iteration | Sprint 1, Sprint 2, Sprint 3… |
| `Story Points` | Number | 1, 2, 3, 5, 8, 13 |
| `Priority` | Single select | P0: Blocker, P1: High, P2: Medium, P3: Low |
| `Component` | Single select | frontend, backend, database, devops, integration, qa |
| `Delivery Model` | Single select | Predictive, Adaptive |

---

### 3.2 GitHub Issues Labels жүйесі

#### Тапсырма түрлері

| Label | Түс (HEX) | Мысал |
|---|---|---|
| `type: feature` | `#0E8A16` | Онлайн жазылу формасын жасау |
| `type: bug` | `#D73A4A` | Бір слотқа 2 жазылу болып кетеді |
| `type: task` | `#0075CA` | GitHub Actions CI pipeline баптау |
| `type: documentation` | `#FBCA04` | ADR-001 жазу, README жаңарту |
| `type: infrastructure` | `#E4E669` | PostgreSQL Docker контейнерін баптау |

#### Приоритеттер

| Label | Іс-қимыл мерзімі | Мысал |
|---|---|---|
| `P0: blocker` | Дереу — 24 сағат ішінде | Жазылу жүйесі мүлде жұмыс істемейді |
| `P1: high` | Ағымдағы спринтте міндетті | Слот брондау API қатесі |
| `P2: medium` | Келесі 1–2 спринтте | Дәрігер профиль беті |
| `P3: low` | Backlog-та сақталады | Жарияланым / FAQ беті |

#### Компоненттер

| Label | Жауапты | Delivery Model |
|---|---|---|
| `component: frontend` | Ізбасхан Әселхан | Adaptive |
| `component: backend` | Жандос Арлан | Predictive (API) |
| `component: database` | Жандос Арлан | Predictive |
| `component: devops` | Жандос Арлан | Predictive |
| `component: integration` | Екеуі бірге | Adaptive |
| `component: qa` | Ізбасхан Әселхан | Adaptive |

---

### 3.3 Branching Strategy (GitFlow)

#### Негізгі веткалар

| Ветка | Мақсаты | Тікелей push |
|---|---|---|
| `main` | Production-ready код | ❌ Branch Protection Rule |
| `develop` | Интеграция ветка | ❌ Тек PR арқылы |

#### Жұмыс веткалары

| Тип | Формат | Мысал |
|---|---|---|
| Feature | `feature/dent-{N}-{slug}` | `feature/dent-12-auth-page` |
| Bug Fix | `fix/dent-{N}-{slug}` | `fix/dent-45-calendar-bug` |
| Hot Fix | `hotfix/dent-{N}-{slug}` | `hotfix/dent-67-double-booking` |
| Release | `release/v{X}.{Y}` | `release/v1.0` |
| Refactor | `refactor/dent-{N}-{slug}` | `refactor/dent-23-slot-service` |

#### Commit форматы (Conventional Commits)

```
feat(booking): add slot reservation endpoint
fix(calendar): prevent double booking on same slot
docs(adr): add ADR-001 delivery model decision
refactor(auth): extract token validation to middleware
chore(ci): add GitHub Actions lint workflow
```

---

### 3.4 Репозиторий құрылымы

```
dentlux-portal/
├── .github/
│   ├── workflows/
│   │   └── ci.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── feature_request.md
│   │   ├── bug_report.md
│   │   └── config.yml
│   └── pull_request_template.md
├── docs/
│   ├── adr/
│   │   ├── ADR-001-delivery-model.md   ✅ Осы ЛЗ-да жасалды
│   │   └── ADR-002-backend-stack.md    (Жандос, күтілуде)
│   ├── wiki/
│   │   ├── project-overview.md
│   │   ├── branching-convention.md
│   │   └── definition-of-done.md
│   └── LZ_2_DentLux_Izbaskhan.md       ✅ Осы файл
├── frontend/                            (күтілуде)
├── backend/                             (күтілуде)
└── README.md
```

**Командаға шақыру:**

| Мүше | GitHub рөлі |
|---|---|
| Ізбасхан Әселхан | Maintainer |
| Жандос Арлан | Maintainer |
| Оқытушы | Read / Triage |

---

## Қорытынды

| Артефакт | Файл / Орын | Мәртебе |
|---|---|---|
| 3 кейс, 6 өлшем кестесі | `docs/LZ_2_DentLux_Izbaskhan.md` | ✅ |
| ADR-001 (MADR, Гибридті модель) | `docs/adr/ADR-001-delivery-model.md` | ✅ Accepted |
| PR шаблоны + DoD | `.github/pull_request_template.md` | ✅ |
| Feature Issue шаблоны | `.github/ISSUE_TEMPLATE/feature_request.md` | ✅ |
| Bug Issue шаблоны | `.github/ISSUE_TEMPLATE/bug_report.md` | ✅ |
| GitHub Projects тақта схемасы | Осы файл — 3-бөлім | ✅ |
| Labels жүйесі (тип/приоритет/компонент) | Осы файл — 3.2 | ✅ |
| Branching Strategy + Commit формат | `docs/wiki/branching-convention.md` | ✅ |
| DoD чек-листі | `docs/wiki/definition-of-done.md` | ✅ |

**Таңдалған жеткізу моделі:** Гибридті (Predictive: DB/инфрақұрылым + Adaptive: Frontend/Telegram-бот)
