import json
from collections import Counter
from pathlib import Path

BANK = Path(__file__).resolve().parents[1] / 'data' / 'reading_comprehension.json'


def test_reading_bank_has_balanced_grade_pools_and_valid_options():
    questions = json.loads(BANK.read_text(encoding='utf-8'))
    assert Counter(q['grade'] for q in questions) == {'L1': 20, 'L2': 20, 'L3': 20}
    assert len({q['id'] for q in questions}) == len(questions)
    assert len({q['question'].lower() for q in questions}) == len(questions)
    for q in questions:
        assert q['answer'] in q['options']
        assert len(q['options']) == len(set(q['options'])) == 3
        assert q['hint'] and q['topic']
    for grade in ('L1', 'L2', 'L3'):
        assert sum('从句' in q['topic'] for q in questions if q['grade'] == grade) >= 5
