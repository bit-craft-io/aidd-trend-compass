from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import trend_price_service
from ..db import get_db
from ..schemas import TrendPriceOut, TrendPriceUpdateRequest

router = APIRouter(prefix="/trend-prices", tags=["trend-prices"])


@router.patch("/{code}", response_model=TrendPriceOut)
def update_trend_price(
    code: str, body: TrendPriceUpdateRequest, db: Session = Depends(get_db)
):
    return trend_price_service.upsert_price(
        db,
        code,
        trend_group_id=body.trend_group_id,
        buy_category=body.buy_category,
        buy_price=body.buy_price,
        buy_quantity=body.buy_quantity,
        sale_price_target=body.sale_price_target,
    )
