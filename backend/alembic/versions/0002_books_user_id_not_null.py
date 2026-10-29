"""books.user_id not null

Production's books.user_id predates auth and was created nullable; the model has
always declared it NOT NULL. Verified no ownerless books exist before applying.

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-29 18:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('books', 'user_id', existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column('books', 'user_id', existing_type=sa.Integer(), nullable=True)
