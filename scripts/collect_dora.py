"""GitHub REST API деректері және төрт DORA метрикасы. Python 3.10+."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import statistics
import sys
import urllib.request

UTC = dt.timezone.utc

def date(value):
    return dt.datetime.fromisoformat(value.replace('Z', '+00:00'))

def collect(repo, output):
    base = 'https://api.github.com/repos/' + repo
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'DentLux-Lab10',
               'X-GitHub-Api-Version': '2022-11-28'}
    if os.getenv('GITHUB_TOKEN'):
        headers['Authorization'] = 'Bearer ' + os.environ['GITHUB_TOKEN']
    sources = []
    def get(path, paginated=True, key=None):
        records, page = [], 1
        while True:
            url = base + path
            if paginated:
                url += ('&' if '?' in path else '?') + f'per_page=100&page={page}'
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as r:
                body = json.load(r)
            sources.append(url)
            if not paginated:
                return body
            batch = body[key] if key else body
            records.extend(batch)
            if len(batch) < 100:
                return records
            page += 1
    data = {'repository': get('', False), 'commits': get('/commits'),
            'pulls': get('/pulls?state=all'), 'releases': get('/releases'),
            'deployments': get('/deployments'), 'runs': get('/actions/runs', key='workflow_runs'),
            'issues': get('/issues?state=all')}
    for deployment in data['deployments']:
        deployment['statuses'] = get(f"/deployments/{deployment['id']}/statuses")
    prod = []
    for deployment in data['deployments']:
        ok = [s for s in deployment['statuses'] if s['state'] == 'success']
        if deployment.get('environment', '').lower() == 'production' and ok:
            prod.append((deployment, min(date(s['created_at']) for s in ok)))
    prod.sort(key=lambda item: item[1])
    data['lead_time_samples'] = []
    for (previous, _), (current, finished) in zip(prod, prod[1:]):
        if previous['sha'] == current['sha']:
            continue
        comparison = get(f"/compare/{previous['sha']}...{current['sha']}", False)
        commits = comparison.get('commits', [])
        if comparison.get('status') != 'ahead' or len(commits) != comparison.get('total_commits'):
            continue
        for commit in commits:
            seconds = (finished-date(commit['commit']['committer']['date'])).total_seconds()
            if seconds >= 0:
                data['lead_time_samples'].append({'commit_sha':commit['sha'],
                    'deployment_id':current['id'], 'deployed_at':finished.isoformat(),
                    'hours':seconds/3600})
    data['collected_at'] = dt.datetime.now(UTC).isoformat()
    data['sources'] = sources
    output.mkdir(parents=True, exist_ok=True)
    (output / 'github-raw.json').write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    return data

def calculate(data, days=30, incidents_complete=False):
    end = date(data['collected_at'])
    start = end - dt.timedelta(days=days)
    production = [d for d in data['deployments'] if d.get('environment','').lower() == 'production'
                  and not d.get('transient_environment')]
    deployed = []
    for d in production:
        successes = [s for s in d['statuses'] if s['state'] == 'success']
        if successes:
            first = min(date(s['created_at']) for s in successes)
            if start <= first <= end:
                deployed.append((d, first))
    # Production инциденттері issue body-де deployment_id және нақты уақыттармен тіркеледі.
    # Жай CI failure production ақауы болып саналмайды.
    incidents = []
    invalid_incidents = 0
    for issue in data['issues']:
        if 'pull_request' in issue or 'production-incident' not in [x['name'] for x in issue['labels']]:
            continue
        try:
            payload = json.loads((issue.get('body') or '').split('```json')[1].split('```')[0])
            date(payload['started_at'])
            if payload.get('restored_at'):
                assert date(payload['restored_at']) >= date(payload['started_at'])
            int(payload['deployment_id'])
            incidents.append(payload)
        except (ValueError, IndexError, KeyError, AssertionError, TypeError):
            invalid_incidents += 1
    ids = {d['id'] for d, _ in deployed}
    linked = [i for i in incidents if int(i['deployment_id']) in ids]
    recovered = [(date(i['restored_at']) - date(i['started_at'])).total_seconds()/3600
                 for i in linked if i.get('restored_at')]
    lead = [v['hours'] for v in data.get('lead_time_samples', [])
            if start <= date(v['deployed_at']) <= end]
    # Бірінші deploy үшін baseline жоқ. Кейінгі deploy-лар үшін ancestry diff қажет.
    # Сондықтан SHA timestamp-ін бүкіл өзгерістердің lead time-ына теңестірмейміз.
    runs = [r for r in data['runs'] if start <= date(r['created_at']) <= end]
    completed = [r for r in runs if r['status'] == 'completed']
    successful = [r for r in completed if r['conclusion'] == 'success']
    return {'window_start': start.isoformat(), 'window_end': end.isoformat(), 'days': days,
            'successful_production_deployments': len(deployed),
            'deployment_frequency_per_day': len(deployed)/days,
            'lead_time_hours': statistics.median(lead) if lead else None,
            'lead_time_sample_count': len(lead),
            'lead_time_note': 'Бірінші deploy және rollback ancestry baseline ретінде өлшенбейді',
            'change_failure_rate_percent': (100*len({int(i['deployment_id']) for i in linked})/len(ids)
                                           if ids and not invalid_incidents and incidents_complete else None),
            'recovery_time_hours': statistics.median(recovered) if recovered else None,
            'incident_records': len(incidents), 'invalid_incident_records': invalid_incidents,
            'incident_note': 'Инцидент журналының толықтығы расталмаса CFR алдын ала бақылау ғана',
            'commits_total': len(data['commits']), 'pull_requests_total': len(data['pulls']),
            'merged_pull_requests': sum(bool(p.get('merged_at')) for p in data['pulls']),
            'releases_total': len(data['releases']), 'deployment_records_total': len(data['deployments']),
            'ci_runs_in_window': len(runs), 'ci_completed': len(completed), 'ci_success': len(successful),
            'ci_success_percent': 100*len(successful)/len(completed) if completed else None,
            'ci_note': 'CI көрсеткіштері DORA production метрикаларына алмастырылмайды'}

def render(metrics, output):
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    plt.rcParams['font.family'] = 'DejaVu Sans'
    fig, axes = plt.subplots(2, 2, figsize=(12, 7))
    values = [f"{metrics['successful_production_deployments']} deploy / {metrics['days']} күн",
              'Дерек жеткіліксіз' if metrics['lead_time_hours'] is None else str(metrics['lead_time_hours']),
              'Есептелмейді' if metrics['change_failure_rate_percent'] is None else f"{metrics['change_failure_rate_percent']:.1f}%",
              'Дерек жеткіліксіз' if metrics['recovery_time_hours'] is None else f"{metrics['recovery_time_hours']:.1f} сағ"]
    names = ['Жаю жиілігі', 'Коммиттен production-ға дейін', 'Сәтсіз өзгерістер үлесі', 'Қалпына келу уақыты']
    notes = ['GitHub Production Deployments API', 'Жаю оқиғасы мен commit baseline қажет',
             'Production инциденті / production deploy', 'Инцидент басталуы мен қалпына келуі']
    for ax, name, value, note in zip(axes.flat, names, values, notes):
        ax.axis('off')
        ax.text(.04,.85,name,fontsize=15,weight='bold',transform=ax.transAxes)
        ax.text(.04,.48,value,fontsize=21,color='#126578',transform=ax.transAxes)
        ax.text(.04,.19,note,fontsize=10,transform=ax.transAxes)
    fig.suptitle('DentLux Portal   DORA бақылауы', fontsize=23, weight='bold')
    fig.text(.05,.03, f"Нақты GitHub API деректері | {metrics['window_start'][:10]} – {metrics['window_end'][:10]} UTC\n"
             '0 deploy — API-де тіркелген оқиға жоқ. Бұл сыртқы серверде жаю болмағанын дәлелдемейді.',fontsize=10)
    fig.tight_layout(rect=(0,.11,1,.92))
    fig.savefig(output/'dora-dashboard.png', dpi=160)
    plt.close(fig)

if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser()
    parser.add_argument('--repo', default='akaashia/dentlux-portal')
    parser.add_argument('--output', type=Path, default=Path('docs/lab10/data'))
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--days', type=int, default=30)
    parser.add_argument('--incidents-complete', action='store_true',
                        help='Инцидент журналының толықтығын команда растағанда ғана')
    args = parser.parse_args()
    if args.days <= 0:
        parser.error('--days must be positive')
    data = json.loads((args.output/'github-raw.json').read_text(encoding='utf-8')) if args.offline else collect(args.repo,args.output)
    result = calculate(data,args.days,args.incidents_complete)
    (args.output/'metrics.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    render(result,args.output)
    print(json.dumps(result,ensure_ascii=False,indent=2))
