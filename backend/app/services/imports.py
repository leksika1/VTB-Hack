"""Импорт банковской выписки (docs/FEATURES.md §10): загрузить → проверить категории → подтвердить."""
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from ..errors import Conflict, NotFound, ValidationFailed
from ..models import CategoryRule, Expense, ImportRow, Member, StatementImport, now_ms
from ..schemas import ImportConfirmIn, ImportIn
from ..statement import StatementError, clean_text, fingerprints, normalize, parse_statement, suggest_category
from ..validation import CATEGORIES
from . import finance

MAX_PENDING_IMPORTS = 5
PENDING_TTL_MS = 7 * 86_400_000


async def _rules(db: AsyncSession, family_id: str) -> dict[str, str]:
    rows = await db.execute(select(CategoryRule.pattern, CategoryRule.category).where(CategoryRule.family_id == family_id))
    return dict(rows.all())


async def create(db: AsyncSession, member: Member, body: ImportIn) -> StatementImport:
    pending = await db.scalar(select(func.count()).select_from(StatementImport).where(
        StatementImport.family_id == member.family_id, StatementImport.status == "pending"))
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


async def _get(db: AsyncSession, member: Member, import_id: str, lock: bool = False) -> StatementImport:
    batch = await db.get(StatementImport, import_id, with_for_update=lock, populate_existing=lock)
    if batch is None or batch.family_id != member.family_id:
        raise NotFound("Импорт не найден")
    return batch


async def list_imports(db: AsyncSession, member: Member) -> list[StatementImport]:
    return list(await db.scalars(select(StatementImport).where(StatementImport.family_id == member.family_id)
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
        to_import.append((row, category))
    await finance.check_capacity(db, Expense, member.family_id, adding=len(to_import))

    rules: dict[str, str] = {}
    for row, category in to_import:
        expense = Expense(
            family_id=member.family_id, title=row.description or "Операция по карте", amount_kop=row.amount_kop,
            category=category, date=row.date, author_id=member.id, paid_by=member.id,
            import_fingerprint=row.fingerprint,
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
    return batch


async def discard(db: AsyncSession, member: Member, import_id: str) -> None:
    batch = await _get(db, member, import_id, lock=True)
    if batch.status != "pending":
        raise Conflict("Подтверждённый импорт удалить нельзя — удалите лишние расходы")
    await db.delete(batch)
    await db.flush()
