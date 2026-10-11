
import os

import importlib

# Load the driver dynamically so static analyzers do not require it to be
# installed in the editor's currently selected environment.
oracledb = importlib.import_module("oracledb")
from dotenv import load_dotenv

load_dotenv()

connection = None

try:
    connection = oracledb.connect(
        user=os.getenv("ORACLE_USER"),
        password=os.getenv("ORACLE_PASSWORD"),
        dsn=os.getenv("ORACLE_DSN"),
    )

    print("Successfully connected to Oracle Database!")

    with connection.cursor() as cursor:
        cursor.execute("SELECT * FROM DUAL")
        for result in cursor:
            print(result)

except oracledb.Error as error:
    print("Oracle connection failed:", error)

finally:
    if connection is not None:
        connection.close()
