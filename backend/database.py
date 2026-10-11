
import os
from contextlib import contextmanager

# import oracledb
import importlib

# Load the driver dynamically so static analyzers do not require it to be
# installed in the editor's currently selected environment.
oracledb = importlib.import_module("oracledb")
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    """Open a connection to the configured Oracle database."""
    user = os.getenv("ORACLE_USER")
    password = os.getenv("ORACLE_PASSWORD")
    dsn = os.getenv("ORACLE_DSN")

    missing = [
        name
        for name, value in {
            "ORACLE_USER": user,
            "ORACLE_PASSWORD": password,
            "ORACLE_DSN": dsn,
        }.items()
        if not value
    ]

    if missing:
        raise RuntimeError(
            f"Missing environment variables: {', '.join(missing)}"
        )

    return oracledb.connect(
        user=user,
        password=password,
        dsn=dsn,
    )


@contextmanager
def get_db_cursor():
    """
    Provide a cursor and connection.
    Commit on success, rollback on failure, always close.
    """
    connection = get_connection()

    try:
        with connection.cursor() as cursor:
            yield cursor
        connection.commit()

    except Exception:
        connection.rollback()
        raise

    finally:
        connection.close()
