"""session summary_sent_at

Revision ID: b7c1d2e3f4a5
Revises: 3a62e5e1bdef
Create Date: 2026-10-23 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'b7c1d2e3f4a5'
down_revision: Union[str, Sequence[str], None] = '3a62e5e1bdef'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('sessions', sa.Column('summary_sent_at', sa.DateTime(timezone=True), nullable=True))
    # sessões antigas não recebem resumo retroativo
    op.execute("UPDATE sessions SET summary_sent_at = now()")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('sessions', 'summary_sent_at')
