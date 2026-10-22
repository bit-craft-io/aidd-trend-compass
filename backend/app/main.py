from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import trend_direction
from .routers import screening, trend_groups, trend_prices, trends

app = FastAPI(title="トレンド羅針盤 API")
trend_direction.settings()  # 不正な設定値は、起動時に失敗させる

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(trends.router)
app.include_router(trend_groups.router)
app.include_router(trend_prices.router)
app.include_router(screening.router)


@app.get("/health")
def health():
    return {"status": "ok"}
