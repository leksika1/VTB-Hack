"""Демо-данные v2: три равных участника, ожидающая заявка и разные способы оплаты."""
import calendar
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..models import AccountContribution, Budget, Expense, Family, Goal, GoalContribution, Member, Payment, now_ms
from ..security import MEMBER_COLORS
from ..validation import shift_month
from . import families, notifications, recurring

HOUR_MS = 3_600_000


def _kop(rub: float) -> int:
    return round(rub * 100)


async def build_sample_family(db: AsyncSession, *, name: str, is_demo: bool,
                              family_id: str | None = None,
                              oidc_subs: dict[str, str] | None = None) -> Member:
    now, subs = now_ms(), oidc_subs or {}
    today = clock.today()
    month, prev, prev2 = today.strftime("%Y-%m"), shift_month(today.strftime("%Y-%m"), -1), \
        shift_month(today.strftime("%Y-%m"), -2)
    last_day = calendar.monthrange(today.year, today.month)[1]

    def day(offset: int) -> date:
        return today.replace(day=min(max(today.day + offset, 1), last_day))

    def d(key: str, number: int) -> date:
        year, mon = map(int, key.split("-"))
        return date(year, mon, min(number, calendar.monthrange(year, mon)[1]))

    family = Family(name=name, invite_code=await families.unique_invite_code(db), is_demo=is_demo)
    if family_id:
        family.id = family_id
    petya = Member(family=family, name="Петя", color=MEMBER_COLORS[0], role="member",
                   joined_at=now - 1000 * HOUR_MS, oidc_sub=subs.get("Петя"))
    masha = Member(family=family, name="Маша", color=MEMBER_COLORS[1], role="member",
                   joined_at=now - 999 * HOUR_MS, oidc_sub=subs.get("Маша"))
    nina = Member(family=family, name="Нина", color=MEMBER_COLORS[2], role="member",
                  joined_at=now - 998 * HOUR_MS, oidc_sub=subs.get("Нина") or subs.get("Соня"))
    pending = Member(family=family, name="Даша", color=MEMBER_COLORS[3], role="member", status="pending",
                     joined_at=now - 2 * HOUR_MS)
    db.add_all([family, petya, masha, nina, pending])
    await db.flush()
    family.owner_id = petya.id
    for member in (petya, masha, nina, pending):
        await families._assign_login_id(db, member)
    await db.flush()

    plans = {"food": 45_000, "housing": 46_000, "transport": 15_000, "kids": 20_000, "other": 9_000}
    db.add_all([
        Budget(family_id=family.id, month_key=month, total_kop=_kop(140_000),
               category_plans_kop={key: _kop(value) for key, value in plans.items()}, updated_by=petya.id),
        Budget(family_id=family.id, month_key=prev, total_kop=_kop(135_000),
               category_plans_kop={key: _kop(value) for key, value in plans.items()}, updated_by=masha.id),
    ])

    members = [petya.id, masha.id, nina.id]
    payments = [
        Payment(family_id=family.id, title="ЖКУ", amount_kop=_kop(6_500), category="housing", due_date=day(4),
                author_id=petya.id, account_mode="shared_split", source="shared", split_mode="equal",
                split_members=members, amount_mode="invoice", payment_method="autopay", autopay_type="by_invoice",
                provider_category="housing", provider_name="МосОблЕИРЦ", provider_identifier="1234567890",
                limit_amount_kop=_kop(8_000)),
        Payment(family_id=family.id, title="Интернет", amount_kop=_kop(1_800), category="other", due_date=day(2),
                author_id=masha.id, account_mode="shared_common", source="shared", split_mode="none",
                amount_mode="fixed", payment_method="autopay", autopay_type="by_date",
                provider_category="internet", provider_name="Домашняя сеть", provider_identifier="D-77881"),
        Payment(family_id=family.id, title="Детский сад", amount_kop=_kop(7_500), category="kids", due_date=day(6),
                author_id=nina.id, account_mode="shared_split", source="shared", split_mode="equal",
                split_members=members, payment_method="manual", payment_details={
                    "recipient": "Детский сад № 14", "method": "uin", "uin": "18810177260010000001",
                    "purpose": "Оплата за текущий месяц"}),
        Payment(family_id=family.id, title="ОСАГО", amount_kop=_kop(5_200), category="transport", due_date=day(9),
                author_id=petya.id, account_mode="shared_common", source="shared", split_mode="none",
                payment_method="manual", payment_details={
                    "recipient": "Страховая компания", "method": "bank_account", "account": "40702810900000000001",
                    "bic": "044525225", "inn": "7700000000", "purpose": "Полис ОСАГО"}),
        Payment(family_id=family.id, title="Годовая подписка", amount_kop=_kop(2_990), category="other", due_date=day(12),
                author_id=masha.id, account_mode="shared_split", source="shared", split_mode="equal",
                split_members=members, payment_method="manual", payment_details={
                    "recipient": "Онлайн-сервис", "method": "card", "cardNumber": "4276000012345678",
                    "purpose": "Годовая подписка"}),
    ]
    db.add_all(payments)
    await db.flush()
    await recurring.start_series(db, payments[1], {"frequency": "monthly", "interval": 1, "endMode": "never"})
    await recurring.start_series(db, payments[4], {"frequency": "yearly", "interval": 1, "endMode": "never"})

    def expense(title: str, amount: float, category: str, on: date, author: Member, *,
                source: str = "shared", split: str = "none") -> Expense:
        return Expense(family_id=family.id, title=title, amount_kop=_kop(amount), category=category, date=on,
                       author_id=author.id, paid_by=author.id,
                       account_mode=("personal_split" if source == "personal" else "shared_split")
                       if split != "none" else ("outside" if source == "personal" else "shared_common"),
                       source=source, split_mode=split, split_members=members if split == "equal" else None,
                       created_at=now - HOUR_MS)

    db.add_all([
        expense("Продукты на неделю", 6_850.40, "food", day(-6), petya, split="equal"),
        expense("Фрукты и сыр", 2_150, "food", day(-3), masha, source="personal", split="equal"),
        expense("Аптека", 1_270.50, "other", day(-1), nina),
        expense("Заправка", 3_400, "transport", day(-8), petya),
        expense("Продукты прошлого месяца", 39_800, "food", d(prev, 10), masha),
    ])
    db.add_all([
        # Петя остаётся должен по своей доле: демо сразу показывает напоминание и сценарий пополнения.
        AccountContribution(family_id=family.id, member_id=petya.id, amount_kop=_kop(1_000), date=d(month, 1)),
        AccountContribution(family_id=family.id, member_id=masha.id, amount_kop=_kop(18_000), date=d(month, 1)),
        AccountContribution(family_id=family.id, member_id=nina.id, amount_kop=_kop(12_000), date=d(month, 2)),
        AccountContribution(family_id=family.id, member_id=masha.id, amount_kop=_kop(90_000), date=d(prev, 1)),
    ])

    next_month = shift_month(month, 1)
    washer = Goal(family_id=family.id, title="Новая стиральная машина", target_kop=_kop(60_000),
                  deadline=d(next_month, 31), created_by=petya.id, created_at=now - 1500 * HOUR_MS)
    db.add(washer)
    await db.flush()
    db.add_all([
        GoalContribution(goal_id=washer.id, family_id=family.id, member_id=who.id, amount_kop=_kop(10_000),
                         date=on, created_at=now - age * HOUR_MS)
        for who, on, age in ((petya, d(prev2, 5), 1400), (masha, d(prev, 5), 700), (nina, day(-1), 20))
    ])
    await db.commit()
    await notifications.debt_reminders(db, family.id)
    await db.commit()
    return petya
