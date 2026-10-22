from . import models  # noqa: F401  Trendをメタデータに登録するため
from . import trend_system_type_seeder
from .db import Base, SessionLocal, engine


def main():
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        trend_system_type_seeder.reset(db)


if __name__ == "__main__":
    main()
