"""Standalone data contracts; run with pytest --noconftest.

Structural and morphological checks complement editorial whole-passage review;
they do not prove that each answer is the only grammatical interpretation.
"""
import json
import re
from collections import Counter
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BANK = json.loads((ROOT / 'data/passage_fill_questions.json').read_text(encoding='utf-8'))
MARKER = re.compile(r'\((\d+)\)____')
WORD = re.compile(r'[a-z]+', re.I)
FIELDS = {'id', 'type', 'grade', 'difficulty', 'title', 'passage', 'blanks',
          'source_file', 'source_title', 'adaptation_note', 'knowledge_points', 'word_bank'}
# Common irregular forms and derivations cannot be checked by suffix rules.
IRREGULAR = {
    'i': {'me', 'my', 'mine', 'myself'},
    'he': {'him', 'his', 'himself'}, 'she': {'her', 'hers', 'herself'},
    'we': {'us', 'our', 'ours', 'ourselves'},
    'they': {'them', 'their', 'theirs', 'themselves'},
    'you': {'your', 'yours', 'yourself', 'yourselves'},
    'teach': {'taught'}, 'find': {'found'}, 'begin': {'began', 'begun'},
    'bring': {'brought'}, 'light': {'lit', 'lighted'},
    'walk': {'walked', 'walking', 'walks'},
    'choose': {'chose', 'chosen'}, 'stick': {'stuck'}, 'build': {'built'},
    'leaf': {'leaves'}, 'come': {'came'}, 'dig': {'dug'},
    'grow': {'grew', 'grown'}, 'child': {'children'},
    'write': {'wrote', 'written'}, 'keep': {'kept'}, 'spend': {'spent'},
    'good': {'better', 'best'}, 'well': {'better', 'best'},
    'patient': {'patience'}, 'different': {'difference'},
    'high': {'height'}, 'wise': {'wisdom'},
}


def is_related_form(base, answer):
    """Conservative English inflection/derivation rules, not a semantic judge."""
    base, answer = base.lower(), answer.lower()
    # Normalise common British/American spelling variants before suffix checks.
    answer = answer.replace('centimeter', 'centimetre').replace('realiz', 'realis')
    forms = {base, *IRREGULAR.get(base, set())}
    for stem in {base, base[:-1] if base.endswith('e') else base,
                 base[:-1] + 'i' if base.endswith('y') else base,
                 base + base[-1]}:
        forms.update(stem + suffix for suffix in
                     ('s', 'es', 'ed', 'd', 'ing', 'er', 'est', 'ly',
                      'ness', 'ment', 'ments', 'ful', 'ion', 'ions'))
    if base.endswith('le'):
        forms.add(base[:-1] + 'y')
    return answer in forms


def test_inventory_and_coverage():
    assert len(BANK) == 15
    assert [q['id'] for q in BANK] == [f'pf_{n:03}' for n in range(1, 16)]
    assert Counter(q['difficulty'] for q in BANK) == {'easy': 5, 'medium': 5, 'hard': 5}
    assert len({q['passage'] for q in BANK}) == 15
    assert len({(q['source_file'], q['source_title']) for q in BANK}) == 15
    assert sum(len(q['blanks']) for q in BANK) == 150


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_schema_and_source(q):
    assert set(q) == FIELDS
    assert q['type'] == 'passage-fill'
    assert q['source_file'] in {
        'data/drill_bank_cloze_2026_10.json', 'data/drill_bank_cloze_2026_11.json'}
    sources = json.loads((ROOT / q['source_file']).read_text(encoding='utf-8'))
    matches = [s for s in sources if s['title'] == q['source_title']]
    assert len(matches) == 1
    assert q['grade'] == matches[0]['grade'] == 'L2'
    assert q['title'] == q['source_title']
    assert isinstance(q['adaptation_note'], str) and q['adaptation_note'].strip()
    assert '短文填空' in q['knowledge_points']
    assert len(q['knowledge_points']) == len(set(q['knowledge_points']))


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_word_bank_bijection_and_changes(q):
    words = q['word_bank']
    assert isinstance(words, list) and len(words) == 10
    assert all(isinstance(w, str) and re.fullmatch(r'(?:[a-z]+|I)', w) for w in words)
    assert len(set(words)) == 10
    blank_words = [b['word'] for b in q['blanks']]
    assert Counter(blank_words) == Counter(words)
    accepted = [a.lower() for b in q['blanks'] for a in [b['answer'], *b['accepted_answers']]]
    assert len(accepted) == len(set(accepted))  # One written form must not consume two candidates.
    assert words != blank_words  # The bank must not reveal the answer order.
    assert sum(b['word'] != b['answer'].lower() for b in q['blanks']) >= 4
    # Rich lexical content prevents a return to ten trivial function-word gaps.
    function_words = {'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for',
                      'and', 'but', 'so', 'as', 'if', 'that', 'who', 'with'}
    assert sum(w not in function_words for w in words) >= 8


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_numbering_and_complete_unprompted_passage(q):
    passage = q['passage']
    assert MARKER.findall(passage) == [str(n) for n in range(1, 11)]
    assert len(q['blanks']) == 10
    assert [b['n'] for b in q['blanks']] == list(range(1, 11))
    plain = MARKER.sub('', passage)
    assert '___' not in plain
    assert len(passage.split()) >= 80
    assert passage.rstrip().endswith(('.', '!', '?'))
    assert not re.search(r'[\u4e00-\u9fff]|\[[^]]*\]|\([^)]*\)', plain)
    assert not re.search(r'\b(?:options|word bank|hint|choose from)\b', passage, re.I)
    assert not re.search(r'[A-Za-z]\(\d+\)____|\(\d+\)____[A-Za-z]', passage)


@pytest.mark.parametrize('q', BANK, ids=lambda q: q['id'])
def test_answers_hints_and_reconstruction(q):
    for b in q['blanks']:
        assert set(b) == {'n', 'word', 'answer', 'accepted_answers', 'hint'}
        assert type(b['n']) is int
        assert isinstance(b['accepted_answers'], list)
        answers = [b['answer'], *b['accepted_answers']]
        assert all(isinstance(a, str) and WORD.fullmatch(a) for a in answers)
        assert len({a.lower() for a in answers}) == len(answers)
        assert all(is_related_form(b['word'], a) for a in answers)
        assert isinstance(b['hint'], str) and re.search(r'[\u4e00-\u9fff]', b['hint'])
        assert b['word'] in b['hint'] and b['answer'] in b['hint']
    full = MARKER.sub(lambda m: q['blanks'][int(m[1]) - 1]['answer'], q['passage'])
    assert '___' not in full
    assert len(full.split()) == len(q['passage'].split())
    assert not re.search(r'\b(?:a|an|the)\s+(?:a|an|the)\b', full, re.I)


def test_morphology_guard_rejects_unrelated_alternatives():
    assert not is_related_form('since', 'as')
    assert not is_related_form('walk', 'bring')
    assert not is_related_form('story', 'books')
    assert not is_related_form('wise', 'wisely done')


def test_bank_covers_multiple_transformation_families():
    pairs = [(b['word'], b['answer']) for q in BANK for b in q['blanks']]
    assert sum(a.endswith('ed') and a != w for w, a in pairs) >= 15
    assert sum(a.endswith('ly') and a != w for w, a in pairs) >= 10
    assert sum(a.endswith('s') and a != w for w, a in pairs) >= 15
    assert sum(a.endswith('er') and a != w for w, a in pairs) >= 10
    assert sum(w in {'i', 'he', 'she', 'we', 'they', 'you'} and a != w
               for w, a in pairs) >= 10
