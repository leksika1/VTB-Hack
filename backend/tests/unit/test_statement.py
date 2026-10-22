"""Разбор CSV-выписки и подсказка категории — чистые функции."""
from datetime import date

import pytest

from app.statement import StatementError, clean_text, fingerprints, normalize, parse_statement, suggest_category


def test_parses_semicolon_statement_with_income_and_errors():
    csv = (
        "﻿Дата операции;Сумма операции;Описание операции;MCC\n"
        "21.10.2026;-1 250,50;ПЯТЕРОЧКА 1234 Москва;5411\n"
        "21.10.2026;+50000,00;Зарплата;\n"
        "кривая дата;-10;Магазин;\n"
        "20.10.2026;abc;Кафе;5812\n"
        ";;;\n"
    )
    parsed = parse_statement(csv)
    assert (parsed.total_rows, parsed.skipped_income) == (4, 1)
    ok, bad_date, bad_amount = parsed.rows
    assert (ok.date, ok.amount_kop, ok.mcc, ok.error) == (date(2026, 10, 21), 125050, "5411", None)
    assert bad_date.error == "Не удалось прочитать дату"
    assert bad_amount.error == "Не удалось прочитать сумму"


def test_comma_delimiter_iso_dates_and_quotes():
    parsed = parse_statement('date,amount,description\n2026-10-01,-99.9,"Taxi, ride"\n')
    row = parsed.rows[0]
    assert (row.date, row.amount_kop, row.description) == (date(2026, 10, 1), 9990, "Taxi, ride")


def test_rejects_unusable_files():
    with pytest.raises(StatementError):
        parse_statement("")
    with pytest.raises(StatementError):
        parse_statement("колонка;другая\n1;2\n")
    with pytest.raises(StatementError):
        parse_statement("Дата;Сумма\n" + "01.01.2026;-1\n" * 1001)
    with pytest.raises(StatementError):
        parse_statement("Дата;Сумма\n" + "x" * 1_100_000)


def test_fingerprints_distinguish_identical_purchases():
    parsed = parse_statement("Дата;Сумма;Описание\n01.10.2026;-100;Кофе\n01.10.2026;-100;Кофе\n")
    first, second = fingerprints(parsed.rows)
    assert first and second and first != second
    again = fingerprints(parse_statement("Дата;Сумма;Описание\n01.10.2026;-100;Кофе\n").rows)
    assert again[0] == first  # повторный импорт той же строки узнаётся


def test_category_suggestions():
    assert suggest_category("ПЯТЕРОЧКА 1234", None, {}) == "food"
    assert suggest_category("Неизвестно", "5541", {}) == "transport"
    assert suggest_category("Мосэнергосбыт оплата", None, {}) == "housing"
    assert suggest_category("Детский мир", None, {}) == "kids"
    assert suggest_category("Что-то странное", None, {}) == "other"
    # Правило семьи важнее MCC и ключевых слов
    assert suggest_category("Пятерочка 999", "5411", {normalize("Пятерочка 1"): "other"}) == "other"


def test_text_is_sanitized():
    assert clean_text("  Кафе\x00\t\n«Ромашка»‮ ") == "Кафе «Ромашка»"
    assert len(clean_text("я" * 500)) == 120
