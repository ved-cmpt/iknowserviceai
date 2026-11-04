"""Create the app_user role on CI's PostgreSQL service, which has no init scripts.

The password comes from TEST_APP_DATABASE_URL. It exists only for this throwaway service.
"""

import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

password = make_url(os.environ["TEST_APP_DATABASE_URL"]).password
quoted = password.replace("'", "''")
engine = create_engine(os.environ["TEST_DATABASE_URL"], isolation_level="AUTOCOMMIT")
with engine.connect() as connection:
    connection.execute(
        text(
            "CREATE ROLE app_user LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT "
            f"PASSWORD '{quoted}'"  # noqa: S608 - a throwaway CI value; CREATE ROLE takes no binds
        )
    )
print("Created role app_user.")
