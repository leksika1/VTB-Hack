from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import clock
from ..models import AccountContribution, Member
from ..validation import amount_to_kop
from .finance import check_capacity


async def list_contributions(db: AsyncSession, family_id: str) -> list[AccountContribution]:
    return list(await db.scalars(
        select(AccountContribution).where(AccountContribution.family_id == family_id)
        .order_by(AccountContribution.created_at.desc(), AccountContribution.id)
    ))


async def add_contribution(db: AsyncSession, member: Member, amount: float) -> AccountContribution:
    await check_capacity(db, AccountContribution, member.family_id)
    contribution = AccountContribution(
        family_id=member.family_id, member_id=member.id,
        amount_kop=amount_to_kop(amount), date=clock.today(),
    )
    db.add(contribution)
    await db.flush()
    return contribution
