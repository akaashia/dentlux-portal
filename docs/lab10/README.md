# 10 ЗЖ Инженерлік тиімділік

## Пайплайн

`.github/workflows/ci.yml`: ESLint, Prettier, PostgreSQL тесттері, Vite build,
Playwright, npm audit, Gitleaks, Trivy және SBOM. `publish` job барлық міндетті
тексерулерден кейін SHA-мен байланыстырылған runtime пакетін және SHA256SUMS жариялайды.
Release job сол пакетті қайта құрастырмай пайдаланады. Тег main тарихында болуы тиіс.

`v*` тегі GitHub Release жасайды; ол production deployment болып саналмайды.
Production серверіне жаю осы workflow арқылы автоматтандырылмаған.

## DORA деректері

```sh
python -m pip install matplotlib
python scripts/collect_dora.py --repo akaashia/dentlux-portal
python scripts/collect_dora.py --offline
```

Нәтиже: `data/github-raw.json`, `data/metrics.json`, `data/dora-dashboard.png`.
`.github/workflows/dora.yml` осы есепті апта сайын және қолмен іске қосады.
GitHub API міндетті дереккөзі; желілік қате git-проксиге үнсіз ауыстырылмайды.
Token `GITHUB_TOKEN` орта айнымалысымен беріледі, файлға жазылмайды.

Төрт метрика тек production deployment пен нақты инциденттерден есептеледі.
Lead time: екі кезекті successful production SHA арасындағы жаңа commits үшін
committer timestamp-тен deploy success-ке дейінгі уақыт медианасы. Бірінші deployment,
rollback және толық емес compare жауабы есепке кірмейді. Бұл үлгінің шектеуі көрсетіледі.
CFR инцидент журналы толық болғанын команда растағанда ғана `--incidents-complete`
арқылы есептеледі. CI failure және `fix:` commit production инциденті емес.

Production инциденті issue-де `production-incident` белгісімен және body ішіндегі
JSON блогымен тіркеледі: `deployment_id`, `started_at`, `restored_at`.
Уақыттар UTC ISO 8601 форматында беріледі; әлі қалпына келмесе restored_at=null.
Дерек жоқ болса N/A көрсетіледі. Коммит саны мен PR merge уақыты қосымша ағын
көрсеткіштері бола алады, бірақ DORA деңгейін олардан анықтауға болмайды.

## Main қорғауы

`protection.json`: 1 approve, соңғы push-ты өзге адам бекітуі, ескі approve-ды жою,
security/test/publish міндетті checks, strict update және жабылған талқылаулар.
Force push пен deletion өшірулі, ережелер admin-ге де қолданылады.
PR авторы өз PR-ын approve ете алмайды. Автордан басқа write құқығы бар команда
мүшесі review беруі қажет.

## Клод ұсынған нұсқадан түзетулер

- Release саны production жаю жиілігі ретінде алынбады.
- 48 сағат ішіндегі `fix:` commit production ақауы не қалпына келу дәлелі ретінде алынбады.
- GitHub API енді нақты шақырылады, беттеу және бастапқы snapshot сақталады.
- Runtime пакет security, тесттер және E2E өткеннен кейін publish арқылы жарияланады.
- Тег үшін жаңа build жасалмайды, тексерілген сол пакет қолданылады.
- Main-ге body-parser түзетуі және Prettier форматтары енгізуге дайындалды.
