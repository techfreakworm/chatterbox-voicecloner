import pytest

from server.dialog import DialogParseError, DialogTurn, parse_dialog


def test_simple_a_b_alternation():
    text = "SPEAKER A: hi\nSPEAKER B: hello"
    turns = parse_dialog(text)
    assert turns == [
        DialogTurn(speaker="A", text="hi"),
        DialogTurn(speaker="B", text="hello"),
    ]


def test_multi_line_turn():
    text = "SPEAKER A: line one\nstill A\nSPEAKER B: end."
    turns = parse_dialog(text)
    assert turns[0].speaker == "A"
    assert turns[0].text == "line one\nstill A"
    assert turns[1].speaker == "B"
    assert turns[1].text == "end."


def test_leading_whitespace_tolerated():
    text = "   SPEAKER A: hi\n   SPEAKER B: hello"
    turns = parse_dialog(text)
    assert [t.speaker for t in turns] == ["A", "B"]


def test_missing_prefix_raises():
    with pytest.raises(DialogParseError):
        parse_dialog("plain text with no speakers")


def test_unknown_letter_is_ignored_so_no_match_raises():
    # "SPEAKER E: ..." doesn't match the regex -> treated as no tags.
    with pytest.raises(DialogParseError):
        parse_dialog("SPEAKER E: nope")


def test_three_consecutive_a_turns():
    text = "SPEAKER A: one\nSPEAKER A: two\nSPEAKER A: three"
    turns = parse_dialog(text)
    assert [t.text for t in turns] == ["one", "two", "three"]


def test_empty_turn_is_dropped():
    text = "SPEAKER A: hi\nSPEAKER B:\nSPEAKER C: bye"
    turns = parse_dialog(text)
    assert [t.speaker for t in turns] == ["A", "C"]
