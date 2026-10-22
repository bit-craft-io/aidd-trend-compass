import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import trend_code_name_service, trend_service, trend_type_service
from ..db import get_db
from ..schemas import (
    DeleteResponse,
    NameUpdateRequest,
    PerspectivesOut,
    RefreshRequest,
    TrendCreateRequest,
    TrendDetailOut,
    TrendOut,
)
from ..yfinance_client import InvalidCodeError

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/trends", tags=["trends"])


@router.get("", response_model=list[TrendOut])
def list_trends(db: Session = Depends(get_db)):
    return trend_service.list_watchlist(db)


@router.get("/{code}", response_model=TrendDetailOut)
def get_trend_detail(
    code: str,
    interval: str = "1d",
    indicators: str = "",
    db: Session = Depends(get_db),
):
    trend = trend_service.get_active_trend(db, code)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")

    indicator_list = [i for i in indicators.split(",") if i]
    try:
        detail = trend_service.build_detail_view(trend.detail, interval, indicator_list)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    trend_type_service.attach_daily_trend_names(db, [trend])
    names = trend_code_name_service.get_names(db, [trend.code])
    return TrendDetailOut(
        id=trend.id,
        code=trend.code,
        name=names.get(trend.code, ""),
        opinion=trend.opinion,
        price_at_fetch=trend.price_at_fetch,
        created_at=trend.created_at,
        type_daily_trend=trend.type_daily_trend_name,
        detail=detail,
    )


@router.post("", response_model=TrendOut, status_code=201)
def add_trend(body: TrendCreateRequest, db: Session = Depends(get_db)):
    try:
        return trend_service.create_trend(db, body.code)
    except InvalidCodeError:
        raise HTTPException(
            status_code=404,
            detail=f"銘柄コード {body.code} のデータを取得できませんでした",
        )


@router.post("/refresh", response_model=list[TrendOut])
def refresh_trends(body: RefreshRequest, db: Session = Depends(get_db)):
    try:
        return trend_service.refresh_trends(db, body.codes, body.interval_minutes)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))


@router.delete("/{code}", response_model=DeleteResponse)
def delete_trend(code: str, db: Session = Depends(get_db)):
    deleted = trend_service.delete_trend(db, code)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return DeleteResponse(deleted=True)


@router.patch("/{code}/name", response_model=TrendOut)
def update_trend_name(code: str, body: NameUpdateRequest, db: Session = Depends(get_db)):
    trend = trend_service.update_name(db, code, body.name)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    return trend


@router.post("/{code}/perspectives", response_model=PerspectivesOut)
def create_perspectives(code: str, db: Session = Depends(get_db)):
    trend = trend_service.get_active_trend(db, code)
    if trend is None:
        raise HTTPException(status_code=404, detail=f"銘柄コード {code} は見つかりません")
    try:
        perspectives = trend_service.get_or_create_perspectives(db, trend)
    except Exception:
        logger.warning("failed to build perspectives for %s", code, exc_info=True)
        raise HTTPException(status_code=502, detail="AIの読み方は今のところ取得できていません")
    if perspectives is None:
        raise HTTPException(
            status_code=422, detail="日足のデータが足りないため、AIの読み方を作れません"
        )
    return perspectives
