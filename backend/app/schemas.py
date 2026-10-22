from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TrendCreateRequest(BaseModel):
    code: str


class PerspectivesOut(BaseModel):
    buy: str
    sell: str
    keep: str
    created_at: datetime


class TrendOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    code: str
    name: str
    opinion: str
    price_at_fetch: float
    created_at: datetime
    trend_group_id: int | None = None
    buy_category: int = 0
    buy_price: float | None = None
    buy_quantity: int | None = None
    sale_price_target: float | None = None
    type_daily_trend: str = Field(default="none", validation_alias="type_daily_trend_name")
    perspectives: PerspectivesOut | None = None


class TrendDetailOut(TrendOut):
    detail: dict


class RefreshRequest(BaseModel):
    codes: list[str]
    interval_minutes: int


class DeleteResponse(BaseModel):
    deleted: bool


class NameUpdateRequest(BaseModel):
    name: str = Field(max_length=255)


class TrendGroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class TrendGroupOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class TrendPriceUpdateRequest(BaseModel):
    trend_group_id: int | None = None
    buy_category: int = Field(default=0, ge=0, le=3)
    buy_price: float | None = None
    buy_quantity: int | None = Field(default=None, ge=0)
    sale_price_target: float | None = None


class TrendPriceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    code: str
    trend_group_id: int | None
    buy_category: int
    buy_price: float | None
    buy_quantity: int | None
    sale_price_target: float | None


class ScreeningScanResponse(BaseModel):
    started: bool


class ScreeningStatusOut(BaseModel):
    api_key_configured: bool
    cooldown_active: bool
    remaining_cooldown_seconds: int
    rate_limit_per_64s: int
    max_stocks: int
    is_free_mode: bool
    last_run_at: str | None = None


class ScreeningSearchRequest(BaseModel):
    enabled_signals: list[str]


class ScreeningSearchResponse(BaseModel):
    condition_id: int
    condition_name: str
    matched_count: int


class ScreeningConditionOut(BaseModel):
    id: int
    name: str
    enabled_signals: list[str]


class ScreeningConditionRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class ScreeningResultItemOut(BaseModel):
    code: str
    name: str
    price: float | None
    matched_signals: list[str]
    type_daily_trend: str = "none"


class ScreeningResultsOut(BaseModel):
    condition_id: int
    total: int
    items: list[ScreeningResultItemOut]


class ScreeningCandleOut(BaseModel):
    time: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class ScreeningSmaPointOut(BaseModel):
    time: str
    value: float


class ScreeningCandlesOut(BaseModel):
    code: str
    name: str
    candles: list[ScreeningCandleOut]
    sma5: list[ScreeningSmaPointOut]


class ScreeningRegisterRequest(BaseModel):
    codes: list[str]


class ScreeningRegisterResponse(BaseModel):
    registered: list[str]
    skipped_count: int
    failed: list[str] = []
