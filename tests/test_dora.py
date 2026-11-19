import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('dora', Path(__file__).parents[1] / 'scripts/collect_dora.py')
dora = importlib.util.module_from_spec(spec)
spec.loader.exec_module(dora)


class DoraEvidenceTests(unittest.TestCase):
    def data(self):
        return {'collected_at': '2026-11-05T00:00:00Z', 'deployments': [],
                'issues': [], 'runs': [], 'commits': [{'subject': 'fix: something'}],
                'pulls': [], 'releases': []}

    def test_no_deployments_is_not_zero_failure_or_recovery(self):
        result = dora.calculate(self.data())
        self.assertEqual(result['successful_production_deployments'], 0)
        self.assertIsNone(result['change_failure_rate_percent'])
        self.assertIsNone(result['recovery_time_hours'])
        self.assertIsNone(result['lead_time_hours'])

    def test_production_incident_requires_explicit_coverage_for_cfr(self):
        data = self.data()
        data['deployments'] = [{'id': 7, 'environment': 'production', 'statuses': [
            {'state': 'success', 'created_at': '2026-11-01T00:00:00Z'}]}]
        data['lead_time_samples'] = [{'hours': 2, 'deployed_at': '2026-11-01T00:00:00Z'}]
        data['issues'] = [{'labels': [{'name': 'production-incident'}], 'body':
            '```json\n{"deployment_id":7,"started_at":"2026-11-01T01:00:00Z",'
            '"restored_at":"2026-11-01T02:30:00Z"}\n```'}]
        self.assertIsNone(dora.calculate(data)['change_failure_rate_percent'])
        result = dora.calculate(data, incidents_complete=True)
        self.assertEqual(result['change_failure_rate_percent'], 100)
        self.assertEqual(result['recovery_time_hours'], 1.5)
        self.assertEqual(result['lead_time_hours'], 2)

    def test_staging_and_old_production_are_excluded(self):
        data = self.data()
        data['deployments'] = [
            {'id': 1, 'environment': 'staging', 'statuses': [{'state': 'success', 'created_at': '2026-11-01T00:00:00Z'}]},
            {'id': 2, 'environment': 'production', 'statuses': [{'state': 'success', 'created_at': '2026-09-01T00:00:00Z'}]}]
        self.assertEqual(dora.calculate(data)['successful_production_deployments'], 0)


if __name__ == '__main__':
    unittest.main()
