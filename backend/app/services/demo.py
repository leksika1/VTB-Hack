"""
Демо-семья на сервере. У каждого посетителя своя копия, поэтому демо можно ломать как угодно;
копии старше DEMO_TTL_HOURS удаляет фоновая очистка (maintenance.py).
"""
import calendar
from datetime import date

from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..models import Budget, Expense, Family, Member, Payment, now_ms
from ..schemas import SessionOut
from ..security import MEMBER_COLORS
from ..validation import shift_month
from . import families

HOUR_MS = 3_600_000


def _kop(rub: float) -> int:
    return round(rub * 100)


async def create_demo_family(db: AsyncSession) -> SessionOut:
    now = now_ms()

    today = clock.today()
    month = today.strftime("%Y-%m")
    prev = shift_month(month, -1)
    last_day = calendar.monthrange(today.year, today.month)[1]

    def day(offset: int) -> date:
        """День текущего месяца со сдвигом от сегодня, не выходящий за границы месяца."""
        return today.replace(day=min(max(today.day + offset, 1), last_day))

    def d(month_key: str, dd: int) -> date:
        return date.fromisoformat(f"{month_key}-{dd:02d}")

    family = Family(name="Семья Смирновых", invite_code=await families.unique_invite_code(db), is_demo=True)
    alex = Member(family=family, name="Алексей", color=MEMBER_COLORS[0], joined_at=now - 1000 * HOUR_MS)
    maria = Member(family=family, name="Мария", color=MEMBER_COLORS[1], joined_at=now - 999 * HOUR_MS)
    db.add_all([family, alex, maria])
    await db.flush()

    db.add_all(
        [
            Budget(
                family_id=family.id,
                month_key=month,
                total_kop=_kop(140000),
                category_plans_kop={k: _kop(v) for k, v in
                                    {"food": 45000, "housing": 46000, "transport": 15000, "kids": 20000, "other": 9000}.items()},
                updated_by=alex.id,
            ),
            Budget(
                family_id=family.id,
                month_key=prev,
                total_kop=_kop(135000),
                category_plans_kop={k: _kop(v) for k, v in
                                    {"food": 45000, "housing": 44000, "transport": 15000, "kids": 18000, "other": 8000}.items()},
                updated_by=alex.id,
                updated_at=now - 30 * 24 * HOUR_MS,
            ),
        ]
    )

    def payment(title, amount, category, due, author, status="upcoming") -> Payment:
        return Payment(family_id=family.id, title=title, amount_kop=_kop(amount), category=category,
                       due_date=due, status=status, author_id=author.id, created_at=now - 500 * HOUR_MS)

    pay_rent = payment("Аренда квартиры", 38000, "housing", d(month, 1), alex, "paid")
    pay_prev_rent = payment("Аренда квартиры", 38000, "housing", d(prev, 1), alex, "paid")
    pay_prev_util = payment("Коммунальные услуги", 6400, "housing", d(prev, 25), maria, "paid")
    db.add_all(
        [
            pay_rent,
            payment("Коммунальные услуги", 6500, "housing", day(4), maria),
            payment("Интернет и связь", 1800, "other", day(2), alex),
            payment("Детский сад", 7500, "kids", day(6), maria),
            payment("ОСАГО", 5200, "transport", day(9), alex),
            pay_prev_rent,
            pay_prev_util,
        ]
    )
    await db.flush()

    def expense(title, amount, category, on, author, age_hours, paid_from=None) -> Expense:
        return Expense(family_id=family.id, title=title, amount_kop=_kop(amount), category=category, date=on,
                       author_id=author.id, payment_id=paid_from.id if paid_from else None,
                       created_at=now - age_hours * HOUR_MS)

    db.add_all(
        [
            expense("Аренда квартиры", 38000, "housing", d(month, 1), alex, 400, pay_rent),
            expense("Онлайн-кинотеатр", 399, "other", d(month, 2), alex, 380),
            expense("Секция плавания, абонемент", 8500, "kids", day(-12), maria, 290),
            expense("Учебники и канцтовары", 4200, "kids", day(-10), maria, 240),
            expense("Заправка", 3400, "transport", day(-8), alex, 190),
            expense("Продукты на неделю", 6850.4, "food", day(-6), alex, 140),
            expense("Фрукты и сыр на рынке", 2150, "food", day(-3), maria, 70),
            expense("Аптека", 1270.5, "other", day(-1), maria, 20),
            expense("Супермаркет у дома", 3120, "food", day(0), alex, 2),
            # прошлый месяц — для «как в прошлом месяце» в форме бюджета
            expense("Продукты на месяц", 39800, "food", d(prev, 10), alex, 900),
            expense("Аренда квартиры", 38000, "housing", d(prev, 1), alex, 1100, pay_prev_rent),
            expense("Коммунальные услуги", 6400, "housing", d(prev, 25), maria, 700, pay_prev_util),
        ]
    )
    await db.commit()
    return await families.issue_session(db, alex.id)


