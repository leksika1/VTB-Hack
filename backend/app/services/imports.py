"""Импорт банковской выписки (docs/FEATURES.md §10): загрузить → проверить категории → подтвердить."""
import hashlib
import random
from calendar import monthrange
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..errors import Conflict, NotFound, ValidationFailed
from ..models import CategoryRule, Expense, ImportRow, Member, StatementImport, now_ms
from ..schemas import ImportConfirmIn, ImportIn
from ..statement import StatementError, clean_text, fingerprints, normalize, parse_statement, suggest_category
from ..validation import CATEGORIES
from . import finance, notifications

MAX_PENDING_IMPORTS = 5
PENDING_TTL_MS = 7 * 86_400_000
CARD_FILENAME_PREFIX = "ВТБ-карта"

_CARD_MERCHANTS = (
    ("Пятёрочка", "5411", (450, 4200)),
    ("ВкусВилл", "5411", (600, 5200)),
    ("Аптека Ригла", "5912", (280, 2600)),
    ("Яндекс Go", "4121", (240, 1800)),
    ("Кофейня Даблби", "5814", (190, 950)),
    ("Ozon", "5399", (650, 7500)),
    ("Wildberries", "5399", (500, 6800)),
    ("АЗС Лукойл", "5541", (1300, 4800)),
    ("МТС", "4814", (350, 1500)),
    ("Мосметро", "4111", (60, 1200)),
    ("Детский мир", "5641", (450, 5200)),
    ("Перекрёсток", "5411", (500, 4800)),
    ("Бургерная", "5812", (350, 1800)),
)


async def _rules(db: AsyncSession, family_id: str) -> dict[str, str]:
    rows = await db.execute(select(CategoryRule.pattern, CategoryRule.category).where(CategoryRule.family_id == family_id))
    return dict(rows.all())


async def create(db: AsyncSession, member: Member, body: ImportIn) -> StatementImport:
    pending = await db.scalar(select(func.count()).select_from(StatementImport).where(
        StatementImport.family_id == member.family_id, StatementImport.created_by == member.id,
        StatementImport.status == "pending"))
    if pending >= MAX_PENDING_IMPORTS:
        raise Conflict(f"Уже {MAX_PENDING_IMPORTS} неподтверждённых импортов. Подтвердите или удалите их.")
    try:
        parsed = parse_statement(body.content)
    except StatementError as e:
        raise ValidationFailed(str(e), "content") from None

    prints = fingerprints(parsed.rows)
    known = set()
    candidates = [p for p in prints if p]
    if candidates:
        known = set(await db.scalars(select(Expense.import_fingerprint).where(
            Expense.family_id == member.family_id, Expense.import_fingerprint.in_(candidates))))
    rules = await _rules(db, member.family_id)

    batch = StatementImport(family_id=member.family_id, created_by=member.id,
                            filename=clean_text(body.filename or "выписка.csv") or "выписка.csv",
                            total_rows=parsed.total_rows, skipped_income=parsed.skipped_income)
    db.add(batch)
    await db.flush()
    for row, fp in zip(parsed.rows, prints, strict=True):
        db.add(ImportRow(
            import_id=batch.id, row_no=row.row_no, date=row.date, amount_kop=row.amount_kop,
            description=row.description, mcc=row.mcc, error=row.error, fingerprint=fp,
            duplicate=fp in known,
            suggested_category=suggest_category(row.description, row.mcc, rules),
        ))
    await db.flush()
    await db.refresh(batch, ["rows"])
    return batch


def _card_filename(month_key: str) -> str:
    return f"{CARD_FILENAME_PREFIX}-{month_key}.csv"


def _card_statement(member_id: str, month_key: str) -> str:
    """Стабильная для участника и месяца эмуляция операций личной карты."""
    today = clock.today()
    year, month = map(int, month_key.split("-"))
    last_day = min(monthrange(year, month)[1], today.day if month_key == today.strftime("%Y-%m") else 31)
    seed = int.from_bytes(hashlib.sha256(f"{member_id}:{month_key}".encode()).digest()[:8], "big")
    rng = random.Random(seed)
    count = rng.randint(8, 13)
    merchants = list(_CARD_MERCHANTS)
    rng.shuffle(merchants)
    rows = ["Дата;Сумма;Описание;MCC"]
    for index in range(count):
        title, mcc, bounds = merchants[index % len(merchants)]
        on = date(year, month, rng.randint(1, last_day))
        amount_kop = rng.randint(bounds[0] * 100, bounds[1] * 100)
        rows.append(f"{on.isoformat()};-{amount_kop // 100}.{amount_kop % 100:02d};{title};{mcc}")
    return "\n".join(rows) + "\n"


async def create_card(db: AsyncSession, member: Member, month_key: str) -> StatementImport:
    if not 2000 <= int(month_key[:4]) <= 2100:
        raise ValidationFailed("Год должен быть от 2000 до 2100", "month")
    if month_key > clock.current_month_key():
        raise ValidationFailed("Нельзя получить покупки за будущий месяц", "month")
    # Два одновременных открытия вкладки для одного участника не должны создать два черновика.
    await db.scalar(select(Member.id).where(Member.id == member.id).with_for_update())
    filename = _card_filename(month_key)
    latest = await db.scalar(select(StatementImport).where(
        StatementImport.family_id == member.family_id,
        StatementImport.created_by == member.id,
        StatementImport.filename == filename,
    ).order_by(StatementImport.created_at.desc()).limit(1))
    if latest is not None:
        await db.refresh(latest, ["rows"])
        if latest.status == "pending" or all(row.duplicate or row.expense_id for row in latest.rows):
            return latest
    batch = await create(db, member, ImportIn(filename=filename, content=_card_statement(member.id, month_key)))
    if all(row.duplicate for row in batch.rows):
        batch.status = "confirmed"
        await db.flush()
    return batch


async def _get(db: AsyncSession, member: Member, import_id: str, lock: bool = False) -> StatementImport:
    batch = await db.get(StatementImport, import_id, with_for_update=lock, populate_existing=lock)
    if batch is None or batch.family_id != member.family_id or batch.created_by != member.id:
        raise NotFound("Импорт не найден")
    return batch


async def list_imports(db: AsyncSession, member: Member) -> list[StatementImport]:
    return list(await db.scalars(select(StatementImport).where(StatementImport.family_id == member.family_id,
                                                        StatementImport.created_by == member.id)
                                 .order_by(StatementImport.created_at.desc()).limit(50)))


async def get(db: AsyncSession, member: Member, import_id: str) -> StatementImport:
    return await _get(db, member, import_id)


async def confirm(db: AsyncSession, member: Member, import_id: str, body: ImportConfirmIn) -> StatementImport:
    # Блокировка: повторное подтверждение (двойной клик, вторая вкладка) не создаст расходы дважды
    batch = await _get(db, member, import_id, lock=True)
    if batch.status != "pending":
        raise Conflict("Импорт уже подтверждён")
    await db.refresh(batch, ["rows"])
    choices = {c.id: c for c in body.rows}
    rows_by_id = {r.id: r for r in batch.rows}
    unknown = set(choices) - set(rows_by_id)
    if unknown:
        raise ValidationFailed("Строка не из этого импорта", "rows")

    to_import = []
    for row in batch.rows:
        choice = choices.get(row.id)
        if row.error or row.duplicate or (choice and not choice.include):
            continue
        category = (choice.category if choice and choice.category else row.suggested_category)
        if category not in CATEGORIES:
            raise ValidationFailed("Выберите категорию", "rows")
        to_import.append((row, category, choice.account_mode if choice else None))
    await finance.check_capacity(db, Expense, member.family_id, adding=len(to_import))

    rules: dict[str, str] = {}
    split_members = await finance.split_members(db, member.family_id, "personal_split")
    for row, category, mode in to_import:
        expense = Expense(
            family_id=member.family_id, title=row.description or "Операция по карте", amount_kop=row.amount_kop,
            category=category, date=row.date, author_id=member.id, paid_by=member.id,
            import_fingerprint=row.fingerprint, account_mode=mode,
            source="personal", split_mode="equal" if mode == "personal_split" else "none",
            split_members=split_members if mode == "personal_split" else None,
        )
        db.add(expense)
        await db.flush()
        row.expense_id = expense.id
        # Исправленная категория запоминается для похожих описаний
        key = normalize(row.description)
        if key and category != row.suggested_category:
            rules[key] = category
    for pattern, category in rules.items():
        await db.execute(insert(CategoryRule).values(
            family_id=member.family_id, pattern=pattern, category=category, updated_at=now_ms(),
        ).on_conflict_do_update(index_elements=["family_id", "pattern"],
                                set_={"category": category, "updated_at": now_ms()}))
    batch.status = "confirmed"
    batch.imported = len(to_import)
    await db.flush()
    await notifications.debt_reminders(db, member.family_id)
    return batch


async def discard(db: AsyncSession, member: Member, import_id: str) -> None:
    batch = await _get(db, member, import_id, lock=True)
    if batch.status != "pending":
        raise Conflict("Подтверждённый импорт удалить нельзя — удалите лишние расходы")
    await db.delete(batch)
    await db.flush()
