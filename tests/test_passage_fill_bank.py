"""Standalone editorial contract checks; no Flask/build/deployment dependencies.

Run: python3 -m pytest --noconftest tests/test_passage_fill_bank.py -q
The flag bypasses the repository conftest, which imports the Flask application.

These checks cannot prove grammatical uniqueness. Human review must reconstruct
whole passages and consider alternatives, not just compare canonical answers.
"""
import itertools
import json
import re
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BANK = json.loads((ROOT / 'data/passage_fill_questions.json').read_text(encoding='utf-8'))
MARKER = re.compile(r'\((\d+)\)____')
FIELDS = {'id', 'type', 'grade', 'difficulty', 'title', 'passage', 'blanks',
          'source_file', 'source_title', 'adaptation_note', 'knowledge_points'}


def test_inventory_and_coverage():
    assert isinstance(BANK, list) and len(BANK) >= 15
    ids = [q['id'] for q in BANK]
    assert len(ids) == len(set(ids))
    assert all(re.fullmatch(r'pf_\d{3}', x) for x in ids)
    counts = Counter(q['difficulty'] for q in BANK)
    assert set(counts) == {'easy', 'medium', 'hard'}
    assert all(n >= 3 for n in counts.values())
    assert len({q['passage'] for q in BANK}) == len(BANK)
    assert len({(q['source_file'], q['source_title']) for q in BANK}) >= 15


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_schema_and_source(q):
    assert set(q) == FIELDS  # no options, initial-letter cues or word banks
    assert q['type'] == 'passage-fill'
    assert q['source_file'] in {
        'data/drill_bank_cloze_2026_10.json', 'data/drill_bank_cloze_2026_11.json'}
    sources = json.loads((ROOT / q['source_file']).read_text(encoding='utf-8'))
    matches = [s for s in sources if s['title'] == q['source_title']]
    assert len(matches) == 1
    assert q['grade'] == matches[0]['grade']  # never invent grade coverage
    for key in ('title', 'adaptation_note'):
        assert isinstance(q[key], str) and q[key].strip()
    assert isinstance(q['knowledge_points'], list)
    assert '短文填空' in q['knowledge_points']
    assert len(q['knowledge_points']) == len(set(q['knowledge_points']))
    assert all(isinstance(x, str) and x.strip() for x in q['knowledge_points'])


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_numbered_blanks_and_unprompted_passage(q):
    passage = q['passage']
    assert MARKER.findall(passage) == [str(n) for n in range(1, 11)]
    assert '___' not in MARKER.sub('', passage)  # catches extra malformed blanks
    assert len(q['blanks']) == 10
    assert [b['n'] for b in q['blanks']] == list(range(1, 11))
    assert len(passage.split()) >= 80
    assert not re.search(r'[\u4e00-\u9fff]|\[[^]]*\]|\([^)]*\)', MARKER.sub('', passage))
    assert not re.search(r'\b(?:options|word bank|hint|choose from)\b', passage, re.I)
    # Letters immediately attached to a marker would reveal initial/final cues.
    assert not re.search(r'[A-Za-z]\(\d+\)____|\(\d+\)____[A-Za-z]', passage)


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_single_word_answers_and_reconstruction(q):
    choices = []
    for b in q['blanks']:
        assert set(b) == {'n', 'answer', 'accepted_answers', 'hint'}
        assert isinstance(b['n'], int) and not isinstance(b['n'], bool)
        assert isinstance(b['accepted_answers'], list)
        words = [b['answer'], *b['accepted_answers']]
        assert all(isinstance(w, str) and re.fullmatch(r'[A-Za-z]+', w) for w in words)
        assert len({w.casefold() for w in words}) == len(words)
        assert isinstance(b['hint'], str) and re.search(r'[\u4e00-\u9fff]', b['hint'])
        choices.append(words)
    # Exercise combinations too: each substitution must preserve all ten slots
    # and token boundaries, not merely the canonical answer rendering.
    for combination in itertools.product(*choices):
        reconstructed = q['passage']
        for n, word in enumerate(combination, 1):
            reconstructed = reconstructed.replace(f'({n})____', word)
        assert not MARKER.search(reconstructed)
        assert '___' not in reconstructed
        assert len(reconstructed.split()) == len(q['passage'].split())
        assert not re.search(r'\b(?:a|an|the)\s+(?:a|an|the)\b', reconstructed, re.I)
        assert not re.search(r'\b(?:to to|of of|for for|has have|did went)\b', reconstructed, re.I)
