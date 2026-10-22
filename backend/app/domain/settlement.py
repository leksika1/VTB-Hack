"""
Кто кому должен за месяц (docs/FEATURES.md §7). Чистые функции, всё в копейках.

Общие траты — расходы, оплаченные взрослыми; делятся поровну между участниками расчёта.
Баланс = заплатил − доля + переведено − получено; > 0 — ему должны.
"""
from dataclasses import dataclass


@dataclass
class Balance:
    member_id: str
    paid: int
    share: int
    sent: int
    received: int

    @property
    def balance(self) -> int:
        return self.paid - self.share + self.sent - self.received


def split_evenly(total: int, member_ids: list[str]) -> dict[str, int]:
    """Поровну до копейки; остаток по одной копейке первым по порядку — сумма долей равна total."""
    if not member_ids:
        return {}
    base, remainder = divmod(total, len(member_ids))
    return {m: base + (1 if i < remainder else 0) for i, m in enumerate(member_ids)}


def compute_balances(
    participants: list[str], paid: dict[str, int], recorded: list[tuple[str, str, int]]
) -> list[Balance]:
    """participants — по порядку вступления; recorded — (from, to, amount) отмеченные переводы."""
    shares = split_evenly(sum(paid.get(m, 0) for m in participants), participants)
    sent = dict.fromkeys(participants, 0)
    received = dict.fromkeys(participants, 0)
    for from_id, to_id, amount in recorded:
        if from_id in sent:
            sent[from_id] += amount
        if to_id in received:
            received[to_id] += amount
    return [Balance(m, paid.get(m, 0), shares[m], sent[m], received[m]) for m in participants]


def transfers(balances: list[Balance]) -> list[tuple[str, str, int]]:
    """Жадно: наибольший должник платит наибольшему кредитору. Не больше n−1 перевода."""
    debtors = sorted(((-b.balance, b.member_id) for b in balances if b.balance < 0), reverse=True)
    creditors = sorted(((b.balance, b.member_id) for b in balances if b.balance > 0), reverse=True)
    result, i, j = [], 0, 0
    debtors = [list(x) for x in debtors]
    creditors = [list(x) for x in creditors]
    while i < len(debtors) and j < len(creditors):
        amount = min(debtors[i][0], creditors[j][0])
        result.append((debtors[i][1], creditors[j][1], amount))
        debtors[i][0] -= amount
        creditors[j][0] -= amount
        if debtors[i][0] == 0:
            i += 1
        if creditors[j][0] == 0:
            j += 1
    return result
